import { defineStore } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/supabaseClient';

// ヘルパー関数: ランダムなゲストIDを生成
function generateGuestId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Supabaseのエラーメッセージをi18nキーにマッピングするヘルパー関数
function mapSupabaseErrorMessage(errorMessage, t) {
  if (!errorMessage) return t('supabaseErrors.unknown');

  if (errorMessage.includes('User already registered')) {
    return t('supabaseErrors.userAlreadyRegistered');
  } else if (errorMessage.includes('Invalid or expired OTP')) {
    return t('supabaseErrors.invalidOtp');
  } else if (errorMessage.includes('Email rate limit exceeded')) {
    return t('supabaseErrors.emailRateLimit');
  } else if (errorMessage.includes('Email not confirmed')) {
    return t('supabaseErrors.emailNotConfirmed');
  } else if (errorMessage.includes('Email link is invalid or has expired')) {
    return t('supabaseErrors.emailLinkInvalidOrExpired');
  } else if (errorMessage.includes('Email already registered')) {
    return t('supabaseErrors.emailAlreadyRegistered');
  } else if (errorMessage.includes('Email not registered')) {
    return t('supabaseErrors.emailNotRegistered');
  } else if (errorMessage.includes('User not found')) {
    return t('supabaseErrors.userNotFound');
  } else if (errorMessage.includes('Invalid login credentials')) {
    return t('supabaseErrors.invalidLoginCredentials');
  } else if (errorMessage.includes('A user with this email address is already registered')) {
    return t('supabaseErrors.userAlreadyRegistered'); // updateUserEmail用
  }
  // その他のエラーメッセージはそのまま返すか、汎用的なメッセージを返す
  return t('supabaseErrors.unknown');
}

export const useUserStore = defineStore('user', () => {
  // ... 既存のstate ...
  const profile = ref(null); // ユーザープロフィール情報を保持
  const loading = ref(false); // データ読み込み中のフラグ
  const newlyAchievedYaku = ref({}); // 今回のゲームで新たに達成した役を一時的に保持
  const showPenaltyPopup = ref(false); // ペナルティポップアップの表示状態
  const penaltyMessage = ref(''); // ★ ペナルティポップアップに表示するメッセージ

  // --- Actions ---

  /**
   * ペナルティポップアップを表示し、メッセージを設定します。
   * @param {string} message - 表示するメッセージ。
   * @param {number|null} duration - ポップアップを自動で閉じるまでの時間(ミリ秒)。nullの場合は自動で閉じない。
   */
  function setPenalty(message, duration = null) {
    penaltyMessage.value = message;
    showPenaltyPopup.value = true;
    if (duration) {
      setTimeout(() => {
        showPenaltyPopup.value = false;
      }, duration);
    }
  }

  /**
   * ペナルティポップアップの表示状態を設定します。
   * @param {boolean} status - 表示する場合はtrue、非表示にする場合はfalse。
   */
  function setShowPenaltyPopup(status) {
    showPenaltyPopup.value = status;
  }

  // --- Actions ---

  /**
   * Supabaseから現在のユーザーのプロフィール情報を取得します。
   */
  async function fetchUserProfile(options = { showLoading: true }) {
    try {
      if (options.showLoading) loading.value = true;
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data, error, status } = await supabase
          .from('users')
          .select(`*, user_rank_class:class, highest_rating, highest_class, first_place_count, second_place_count, third_place_count, fourth_place_count`) // ★修正: 新しいカラムを追加
          .eq('id', user.id)
          .single();

        if (error && status !== 406) throw error;

        if (data) {
          profile.value = { ...data, email: user.email }; // user.emailをprofileにマージ
        }
      } else {
        // ユーザーがいない場合はプロフィールをnullに設定
        profile.value = null;
      }
    } catch (error) {
      console.error('プロフィールの取得エラー:', error.message);
    } finally {
      if (options.showLoading) loading.value = false;
    }
  }

  /**
   * ユーザーのプロフィール情報を更新します。
   * @param {Object} updates - 更新するデータのオブジェクト。例: { username: '新しい名前' }
   * @param {Object} options - { showLoading: boolean } ローディング表示を制御するオプション
   */
  async function updateUserProfile(updates, options = { showLoading: true }) {
    if (!profile.value) return;

    try {
      if (options.showLoading) loading.value = true;
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from('users').update(updates).eq('id', user.id);
      if (error) throw error;

      // ローカルのstateも更新
      Object.assign(profile.value, updates);

      // avatar_urlが更新された場合、画像をプリロードする
      if (updates.avatar_url && profile.value.avatar_url) {
        const img = new Image();
        img.src = profile.value.avatar_url;
      }

    } catch (error) {
      console.error('プロフィール更新エラー:', error.message);
    } finally {
      if (options.showLoading) loading.value = false;
    }
  }

  /**
   * アバター画像をアップロードし、ユーザーのプロフィールを更新します。
   * @param {File} file - アップロードする画像ファイル。
   */
  async function uploadAvatar(file) {
    if (!file) {
      console.error('アップロードするファイルがありません。');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('ユーザーが見つかりません。');
      return;
    }

    try {
      loading.value = true;
      const fileExt = file.name.split('.').pop();
      const filePath = `public/${user.id}/avatar.${fileExt}`;

      // Supabase Storageにファイルをアップロード
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true, // 存在する場合は上書き
        });

      if (uploadError) throw uploadError;

      // アップロードしたファイルの公開URLを取得
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);
      
      if (!urlData) {
        throw new Error('URLの取得に失敗しました。');
      }
      
      // キャッシュを無効化するためにタイムスタンプを追加
      const publicUrl = `${urlData.publicUrl}?timestamp=${new Date().getTime()}`;

      // usersテーブルのavatar_urlを更新
      await updateUserProfile({ avatar_url: publicUrl }, { showLoading: false });

    } catch (error) {
      console.error('アバターのアップロードに失敗しました:', error.message);
    } finally {
      loading.value = false;
    }
  }

  

  /**
   * 役の達成状況を一時的に記録します。
   * @param {string} yakuKey - 達成した役のキー
   */
  function updateYakuAchievement(yakuKey) {
    if (!profile.value) return;
    // 既存の達成状況と、今回新しく達成した役の両方に含まれていない場合のみ追加
    if (!profile.value.yaku_achievements?.[yakuKey] && !newlyAchievedYaku.value[yakuKey]) {
      newlyAchievedYaku.value[yakuKey] = true;
    }
  }

  /**
   * おみくじの解放状況を更新します。
   * @param {string} sayingId - 解放したおみくじのID
   * @param {Object} options - { showLoading: boolean } ローディング表示を制御するオプション
   */
  async function updateRevealedSaying(sayingId, options = { showLoading: true }) {
    if (!profile.value) return;
    const revealed = { ...(profile.value.revealed_sayings || {}) };
    if (!revealed[sayingId]) {
      revealed[sayingId] = true;
      await updateUserProfile({ revealed_sayings: revealed }, options);
    }
  }

  /**
   * 猫コインを更新します。
   * @param {number} amount - 更新する猫コインの量（加算または減算）
   * @param {Object} options - { showLoading: boolean } ローディング表示を制御するオプション
   */
  async function updateCatCoins(amount, options = { showLoading: true }) {
    if (!profile.value) return;

    let newCatCoins = (profile.value.cat_coins || 0) + amount;
    newCatCoins = Math.max(0, newCatCoins); // 0未満にならないように
    newCatCoins = Math.min(999999, newCatCoins); // 999999を超えないように制限を追加

    await updateUserProfile({ cat_coins: newCatCoins }, options);
  }

  /**
   * ゲーム中に達成した役をまとめてSupabaseに保存します。
   * @param {Object} options - { showLoading: boolean } ローディング表示を制御するオプション
   */
  async function saveAchievedYaku(options = { showLoading: true }) {
    if (Object.keys(newlyAchievedYaku.value).length === 0) {
      return; // 新しく達成した役がなければ何もしない
    }

    if (!profile.value) return;

    const currentAchievements = profile.value.yaku_achievements || {};
    const updatedAchievements = { ...currentAchievements, ...newlyAchievedYaku.value };

    try {
      if (options.showLoading) loading.value = true;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("ユーザーが見つかりません");

      const { error } = await supabase.from('users').update({ yaku_achievements: updatedAchievements }).eq('id', user.id);
      if (error) throw error;

      // ローカルのstateも更新
      profile.value.yaku_achievements = updatedAchievements;
      // 保存が完了したら一時リストをクリア
      newlyAchievedYaku.value = {};

    } catch (error) {
      console.error('役達成状況の一括保存エラー:', error.message);
    } finally {
      if (options.showLoading) loading.value = false;
    }
  }

  /**
   * 新しいゲームセッションのために一時データをリセットします。
   */
  function resetTemporaryData() {
    newlyAchievedYaku.value = {};
  }

  /**
   * ゲームが進行中であるかどうかのフラグを設定し、Supabaseに保存します。
   * @param {boolean} status - ゲームが進行中であればtrue、そうでなければfalse。
   */
  async function setGameInProgress(status) {
    if (!profile.value) return;
    await updateUserProfile({ is_game_in_progress: status }, { showLoading: false }); // スピナーなしで更新
  }

  async function checkAndResetOmikujiCount() {
    if (!profile.value) return;

    const today = new Date().toISOString().slice(0, 10);
    // last_omikuji_draw_date が今日の日付と異なる場合のみ更新
    if (profile.value.last_omikuji_draw_date !== today) {
      await updateUserProfile({
        daily_free_omikuji_count: 3,
        last_omikuji_draw_date: today
      }, { showLoading: false });
    }
  }

  async function updateOmikujiDrawInfo(updates, options = { showLoading: true }) {
    if (!profile.value) return;
    await updateUserProfile(updates, options);
  }

  /**
   * ユーザーアカウントに関連する全てのデータを削除します。
   * (アバター削除もバックエンドのRPC関数内で処理されます)
   */
  async function deleteUserData() {
    try {
      loading.value = true;
      // RPC関数は成功時はアバターURL、ストレージ削除失敗時はエラーメッセージを返す
      const { data: rpc_response, error: rpcError } = await supabase.rpc('delete_user_data');

      if (rpcError) {
        throw rpcError;
      }

      // RPCからストレージ削除エラーが返されたかチェック
      if (rpc_response && typeof rpc_response === 'string' && rpc_response.startsWith('STORAGE_DELETE_ERROR:')) {
        // エラーをスローしてcatchブロックで処理させる
        throw new Error(rpc_response);
      }

      // ここまで来たら、バックエンド処理は全て成功している
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        console.error('ログアウトエラー:', signOutError.message);
      }

      localStorage.clear();
      location.reload();

    } catch (error) {
      console.error('ユーザーデータの削除中にエラーが発生しました:', error.message);
      // アラートにバックエンドからの具体的なエラーメッセージが表示される
      alert(`アカウントの削除中にエラーが発生しました: ${error.message}`);
    } finally {
      loading.value = false;
    }
  }

  // --- OTPログイン用の新しいState ---
  const otpSent = ref(false); // OTPが送信されたかどうか
  const loginEmail = ref(''); // ログインに使用するメールアドレス

  // --- Actions ---

  /**
   * メールアドレスにOTPを送信してログインプロセスを開始します。
   * @param {string} email - OTPを送信するメールアドレス。
   */
  async function signInWithEmailOtp(email, t) {
    loading.value = true;
    try {
      // 1. メールアドレスがpublic.usersテーブルに存在するかチェック (RPCを使用)
      const { data: emailExists, error: rpcError } = await supabase.rpc('check_email_exists', { email_address: email });

      if (rpcError) {
        console.error('RPCエラー (check_email_exists):', rpcError);
        throw rpcError;
      }

      if (!emailExists) {
        return { success: false, error: mapSupabaseErrorMessage('Email not registered', t) };
      }

      // 2. 存在すればOTPを送信
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
      otpSent.value = true;
      loginEmail.value = email; // 送信したメールアドレスを保存
      console.log('OTPがメールアドレスに送信されました。');
      return { success: true };
    } catch (error) {
      console.error('OTP送信エラー:', error.message);
      // エラーメッセージをi18nキーにマッピング
      return { success: false, error: mapSupabaseErrorMessage(error.message, t) };
    } finally {
      loading.value = false;
    }
  }

  /**
   * OTPを検証してユーザーをログインさせます。
   * @param {string} email - OTPを送信したメールアドレス。
   * @param {string} token - ユーザーが入力したOTP。
   */
  async function verifyEmailOtp(email, token, t) {
    loading.value = true;
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
      if (error) throw error;
      
      // ログイン成功後、ユーザープロフィールをフェッチ
      await fetchUserProfile();
      otpSent.value = false; // OTP送信状態をリセット
      loginEmail.value = ''; // メールアドレスをリセット
      console.log('ログイン成功:', data.user);
      return { success: true };
    } catch (error) {
      console.error('OTP検証エラー:', error.message);
      // エラーメッセージをi18nキーにマッピング
      return { success: false, error: mapSupabaseErrorMessage(error.message, t) };
    } finally {
      loading.value = false;
    }
  }

  /**
   * ユーザーのメールアドレスを更新します。
   * @param {string} newEmail - 新しいメールアドレス。
   */
  async function updateUserEmail(newEmail, t) {
    loading.value = true;
    try {
      // 確認後のリダイレクト先を明示的に指定
      const redirectTo = `${window.location.origin}/#/email-confirmed`;

      // 事前チェックを削除し、Supabaseの組み込みエラー処理に一本化
      const { data, error } = await supabase.auth.updateUser(
        { email: newEmail },
        { emailRedirectTo: redirectTo } // オプションを追加
      );
      if (error) throw error; // 重複メールなどのエラーはここでキャッチされる

      console.log('メールアドレス更新リクエスト成功:', data);
      // メールアドレス変更の場合、確認メールが送信されるため、
      // ユーザーはメール内のリンクをクリックして変更を確定する必要がある。
      // そのため、ここではprofile.value.emailは直接更新しない。
      // ユーザーが確認後、fetchUserProfileで最新の状態を取得する。
      return { success: true };
    } catch (error) {
      console.error('メールアドレス更新エラー:', error.message);
      // Supabaseからのエラーをマッピングして返す
      return { success: false, error: mapSupabaseErrorMessage(error.message, t) };
    } finally {
      loading.value = false;
    }
  }

  /**
   * 初回アクセス時にゲストとして自動登録します。
   */
  async function registerAsGuest() {
    loading.value = true;
    try {
      const guestUsername = `Guest#${generateGuestId()}`;

      // 1. 匿名ユーザーとしてサインイン
      const { data: { user }, error: authError } = await supabase.auth.signInAnonymously();
      if (authError) throw authError;

      if (user) {
        // 2. usersテーブルにプロフィールを作成
        const { error: insertError } = await supabase
          .from('users')
          .insert({ id: user.id, username: guestUsername, cat_coins: 2000 });
        if (insertError) throw insertError;

        // 3. 作成したプロフィールをストアに読み込む
        await fetchUserProfile({ showLoading: false });

        // 4. localStorageにも保存（既存のロジックを踏襲）
        localStorage.setItem('mahjongUsername', guestUsername);
      }
    } catch (error) {
      console.error('ゲストとしての自動登録中にエラーが発生しました:', error.message);
    } finally {
      loading.value = false;
    }
  }

  return {
    profile,
    loading,
    otpSent,
    loginEmail,
    fetchUserProfile,
    updateUserProfile,
    uploadAvatar,
    signInWithEmailOtp,
    verifyEmailOtp,
    updateUserEmail, // 新しいアクションを公開
    updateYakuAchievement,
    updateRevealedSaying,
    updateCatCoins,
    saveAchievedYaku,
    resetTemporaryData,
    setGameInProgress,
    checkAndResetOmikujiCount, // 追加
    updateOmikujiDrawInfo,
    deleteUserData,
    showPenaltyPopup,
    penaltyMessage, // ★公開
    setPenalty, // ★公開
    setShowPenaltyPopup,
    registerAsGuest, // 新しいアクションを公開
  };
});
