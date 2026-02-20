<template>
  <!-- メインコンテンツ -->
  <router-view
    v-if="!showWakeUpScreen"
    v-slot="{ Component }"
  >
    <transition
      name="fade"
      mode="out-in"
    >
      <component :is="Component" />
    </transition>
  </router-view>

  <!-- 猫を起こす画面 -->
  <WakeUpCatScreen
    v-if="showWakeUpScreen"
    @finished="onWakeUpFinished"
  />

  <!-- 遷移用オーバーレイ -->
  <div
    class="transition-overlay"
    :class="{ active: isTransitioning }"
  />

  <!-- 通信中ローディングインジケーター -->
  <LoadingIndicator v-if="userStore.loading" />

  <!-- ペナルティポップアップ -->
  <PenaltyPopup />
</template>

<script setup>
// このコンポーネントは、アプリケーションのルートです。
// アセットのプリロード、ローディング画面、起動シーケンス、
// そしてメインコンテンツのルーティングを管理します。
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router'; // useRouter をインポート
import { useAudioStore } from '@/stores/audioStore';
import { useUserStore } from '@/stores/userStore';
import { useGameStore } from '@/stores/gameStore'; // gameStore をインポート
import { preloadImages } from '@/utils/imageLoader';
import WakeUpCatScreen from '@/components/WakeUpCatScreen.vue';
import LoadingIndicator from '@/components/LoadingIndicator.vue';
import PenaltyPopup from '@/components/PenaltyPopup.vue';

// --- リアクティブな状態 ---
const isEmailConfirmedPage = window.location.hash.startsWith('#/email-confirmed');
const isTransitioning = ref(false);
const showWakeUpScreen = ref(true); // 初期値を true に変更

// --- ストアの利用 ---
const audioStore = useAudioStore();
const userStore = useUserStore();
const gameStore = useGameStore(); // gameStore を使用
const router = useRouter(); // useRouter を使用

// --- ライフサイクル フック ---
onMounted(async () => {
  // ★追加: ページ離脱時の処理を登録
  window.addEventListener('beforeunload', handleBeforeUnload);

  if (isEmailConfirmedPage) {
    gameStore.setAppReady(true); // メール確認ページではすぐにアプリ準備完了とする
    return;
  }

  document.addEventListener('visibilitychange', audioStore.handleVisibilityChange);

  // --- アセットのプリロード定義 ---
  const imagePaths = [
    '/assets/images/back/sleeping.gif',
    '/assets/images/back/wakeup.gif',
    '/assets/images/back/back_out_shrine.png',
    '/assets/images/back/back_out.png',
    '/assets/images/back/mat.png',
    '/assets/images/back/ranking.png',
    '/assets/images/back/title_logo.png',
    '/assets/images/back/title_logo_en.png',
    '/assets/images/back/title_back.png',
    '/assets/images/back/stock_frame.png',
    '/assets/images/back/omikuji_board.png',
    '/assets/images/back/omikuji_back.png',
    '/assets/images/back/fude.png',
    '/assets/images/back/mode_back.png',
    '/assets/images/back/start_back.png',
    '/assets/images/back/rule.png',
    '/assets/images/back/mode_back.png',
    '/assets/images/back/matching.png',
    '/assets/images/back/smoke.png',
    '/assets/images/button/buckToTitle.png',
    '/assets/images/button/kan_button.png',
    '/assets/images/button/pon_button.png',
    '/assets/images/button/riichi_button.png',
    '/assets/images/button/ron_button.png',
    '/assets/images/button/rule_button.png',
    '/assets/images/button/skip_button.png',
    '/assets/images/button/tsumo_button.png',
    '/assets/images/button/yaku_button.png',
    '/assets/images/button/stock_button.png',
    '/assets/images/button/kan_button_en.png',
    '/assets/images/button/pon_button_en.png',
    '/assets/images/button/riichi_button_en.png',
    '/assets/images/button/ron_button_en.png',
    '/assets/images/button/rule_button_en.png',
    '/assets/images/button/skip_button_en.png',
    '/assets/images/button/tsumo_button_en.png',
    '/assets/images/button/yaku_button_en.png',
    '/assets/images/button/stock_button_en.png',
    '/assets/images/button/setting_button.png',
    '/assets/images/button/title_cat_AI_match.png',
    '/assets/images/button/title_cat_AI_match_en.png',
    '/assets/images/button/title_online_match.png',
    '/assets/images/button/title_online_match_en.png',
    '/assets/images/button/title_janeko_shrine.png',
    '/assets/images/button/title_janeko_shrine_en.png',
    '/assets/images/button/title_leader_board.png',
    '/assets/images/button/title_leader_board_en.png',
    '/assets/images/button/title_howtoplay.png',
    '/assets/images/button/title_howtoplay_en.png',
    '/assets/images/button/title_rule.png',
    '/assets/images/button/title_rule_en.png',
    '/assets/images/button/title_yakulist.png',
    '/assets/images/button/title_yakulist_en.png',
    '/assets/images/button/BGM_ON.png',
    '/assets/images/button/BGM_OFF.png',
    '/assets/images/button/omikuji_button.png',
    '/assets/images/button/wall_drow.png',
    '/assets/images/button/stock_in.png',
    '/assets/images/button/board_hand.png',
    '/assets/images/button/board_ori.png',
    '/assets/images/button/board_cancel.png',
    '/assets/images/info/cat_coin.png',
    '/assets/images/info/cat_icon_1.png',
    '/assets/images/info/cat_icon_2.png',
    '/assets/images/info/cat_icon_3.png',
    '/assets/images/info/cat_icon_4.png',
    '/assets/images/info/hito_icon_1.png',
    '/assets/images/info/info_bottom.png',
    '/assets/images/info/info_left.png',
    '/assets/images/info/info_right.png',
    '/assets/images/info/info_top.png',
    '/assets/images/info/info_bottom_en.png',
    '/assets/images/info/info_left_en.png',
    '/assets/images/info/info_right_en.png',
    '/assets/images/info/info_top_en.png',
    '/assets/images/info/ton1.png',
    '/assets/images/info/ton2.png',
    '/assets/images/info/ton3.png',
    '/assets/images/info/ton4.png',
    '/assets/images/info/ton1_en.png',
    '/assets/images/info/ton2_en.png',
    '/assets/images/info/ton3_en.png',
    '/assets/images/info/ton4_en.png',
    '/assets/images/info/zan_1000.png',
    '/assets/images/info/logo-black.png',
    '/assets/images/info/board.png',
    '/assets/images/info/board_en.png',
    '/assets/images/info/OGP.png',
    '/assets/images/info/X_tag.png',
    '/assets/images/info/ton_icon.png',
    '/assets/images/info/minami_icon.png',
    '/assets/images/info/nishi_icon.png',
    '/assets/images/info/kita_icon.png',
    '/assets/images/info/ton_icon_en.png',
    '/assets/images/info/minami_icon_en.png',
    '/assets/images/info/nishi_icon_en.png',
    '/assets/images/info/kita_icon_en.png',
    '/assets/images/info/No1.png',
    '/assets/images/info/No2.png',
    '/assets/images/info/No3.png',
    '/assets/images/info/hand.png',
    '/assets/images/info/kitten.png',
    '/assets/images/info/kitten_en.png',
    '/assets/images/info/alley.png',
    '/assets/images/info/alley_en.png',
    '/assets/images/info/boss.png',
    '/assets/images/info/boss_en.png',
    '/assets/images/number/-.png',
    '/assets/images/number/0.png',
    '/assets/images/number/1.png',
    '/assets/images/number/2.png',
    '/assets/images/number/3.png',
    '/assets/images/number/4.png',
    '/assets/images/number/5.png',
    '/assets/images/number/6.png',
    '/assets/images/number/7.png',
    '/assets/images/number/8.png',
    '/assets/images/number/9.png',
    '/assets/images/number/0b.png',
    '/assets/images/number/1b.png',
    '/assets/images/number/2b.png',
    '/assets/images/number/3b.png',
    '/assets/images/number/4b.png',
    '/assets/images/number/5b.png',
    '/assets/images/number/6b.png',
    '/assets/images/number/7b.png',
    '/assets/images/number/8b.png',
    '/assets/images/number/9b.png',
    '/assets/images/status/furiten.png',
    '/assets/images/status/kan.png',
    '/assets/images/status/pon.png',
    '/assets/images/status/riichi.png',
    '/assets/images/status/ron.png',
    '/assets/images/status/tenpai.png',
    '/assets/images/status/tsumo.png',
    '/assets/images/status/stock.png',
    '/assets/images/status/furiten_en.png',
    '/assets/images/status/kan_en.png',
    '/assets/images/status/pon_en.png',
    '/assets/images/status/riichi_en.png',
    '/assets/images/status/ron_en.png',
    '/assets/images/status/tenpai_en.png',
    '/assets/images/status/tsumo_en.png',
    '/assets/images/status/stock_en.png',
    '/assets/images/tenbo/tenbou100.png',
    '/assets/images/tenbo/tenbou1000.png',
    '/assets/images/tenbo/tenbou10000.png',
    '/assets/images/tenbo/tenbou5000.png',
    '/assets/images/tiles/m1.png',
    '/assets/images/tiles/m2.png',
    '/assets/images/tiles/m3.png',
    '/assets/images/tiles/m4.png',
    '/assets/images/tiles/m5.png',
    '/assets/images/tiles/m6.png',
    '/assets/images/tiles/m7.png',
    '/assets/images/tiles/m8.png',
    '/assets/images/tiles/m9.png',
    '/assets/images/tiles/p1.png',
    '/assets/images/tiles/p2.png',
    '/assets/images/tiles/p3.png',
    '/assets/images/tiles/p4.png',
    '/assets/images/tiles/p5.png',
    '/assets/images/tiles/p6.png',
    '/assets/images/tiles/p7.png',
    '/assets/images/tiles/p8.png',
    '/assets/images/tiles/p9.png',
    '/assets/images/tiles/s1.png',
    '/assets/images/tiles/s2.png',
    '/assets/images/tiles/s3.png',
    '/assets/images/tiles/s4.png',
    '/assets/images/tiles/s5.png',
    '/assets/images/tiles/s6.png',
    '/assets/images/tiles/s7.png',
    '/assets/images/tiles/s8.png',
    '/assets/images/tiles/s9.png',
    '/assets/images/tiles/ura.png',
    '/assets/images/tiles/z1.png',
    '/assets/images/tiles/z2.png',
    '/assets/images/tiles/z3.png',
    '/assets/images/tiles/z4.png',
    '/assets/images/tiles/z5.png',
    '/assets/images/tiles/z6.png',
    '/assets/images/tiles/z7.png',
  ];
  const audioPaths = [
    '/assets/sounds/Kagura_Suzu01-7.mp3',
    '/assets/sounds/NES-JP-A03-2(Stage2-Loop140).mp3',
    '/assets/sounds/GB-JP-A02-2(Menu-Loop105).mp3',
    '/assets/sounds/NES-JP-A01-2(Title-Loop115).mp3',
    '/assets/sounds/dahai.mp3',
    '/assets/sounds/NES-JP-A04-2(Stage3-Loop125).mp3',
    '/assets/sounds/Percussive_Accent03-1(Dry).mp3',
    '/assets/sounds/Hyoshigi01-1.mp3',
    '/assets/sounds/Multi_Accent01-3(Dry).mp3',
    '/assets/sounds/Single_Accent17-2(Dry).mp3',
    '/assets/sounds/Kagura_Suzu03-1.mp3',
    '/assets/sounds/Percussive_Accent04-3(High).mp3',
    '/assets/sounds/Flyer02-1(Take).mp3',
    '/assets/sounds/Hit-Slap01-3(Dry).mp3',
    '/assets/sounds/Xylophone04-05(Fast-Long-3-Up).mp3',
    '/assets/sounds/NoBGM4sec.mp3',
    '/assets/sounds/takibi.mp3',
    '/assets/sounds/NES-JP-A02-2(Stage1-Loop110).mp3',
  ];

  // --- 並列処理の定義 ---

  // 1. アセット読み込み処理
  const assetLoadingPromise = Promise.all([
    preloadImages(imagePaths), // プログレスバー更新関数は不要になったため削除
    audioStore.preloadAudio(audioPaths), // プログレスバー更新関数は不要になったため削除
  ]);

  // 2. ユーザー情報取得・登録処理
  const userSetupPromise = (async () => {
    await userStore.fetchUserProfile({ showLoading: false });
    if (!userStore.profile) {
      await userStore.registerAsGuest();
    }
  })();

  // --- 並列処理の実行と完了待機 ---
  try {
    await Promise.all([assetLoadingPromise, userSetupPromise]);
  } catch (error) {
    console.error('初期読み込み処理でエラーが発生しました:', error);
  } finally {
    gameStore.setAppReady(true); // 全ての読み込みが完了したら isAppReady を true に設定
  }
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', audioStore.handleVisibilityChange);
  // ★追加: コンポーネント破棄時にイベントリスナーを削除
  window.removeEventListener('beforeunload', handleBeforeUnload);
});

// --- メソッド ---

// ★追加: ページ離脱/リロード直前に実行される関数
const handleBeforeUnload = () => {
  // isGameOnline は Pinia ストアの状態なので、直接参照する
  if (gameStore.isGameOnline) {
    // オンラインゲーム中であれば、サーバーから切断する
    gameStore.disconnectOnlineGame();
  }
};

const onWakeUpFinished = () => {
  isTransitioning.value = true;
  
  // ★削除: BGM再生許可はWakeUpCatScreenに移動したため不要

  setTimeout(() => {
    showWakeUpScreen.value = false;
    router.push({ name: 'Title' }); // タイトル画面へ遷移
  }, 750);
  setTimeout(() => {
    isTransitioning.value = false;
  }, 1500);
};
</script>

<style>
/* --- グローバルスタイル --- */
html,
body {
  margin: 0;
  padding: 0;
  overflow: hidden; /* ルート要素でのスクロールを防止 */
  height: 100%;
  width: 100%;
  position: fixed; /* ビューポートをウィンドウサイズに固定 */
}

#app {
  height: 100%;
  width: 100%;
}



/* --- ★追加: 遷移アニメーション --- */
.transition-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: white;
  opacity: 0;
  z-index: 10000; /* 全ての要素の最前面 */
  pointer-events: none; /* クリックイベントを透過させる */
}

.transition-overlay.active {
  animation: glow-and-fade 1.8s ease-in-out forwards;
}

@keyframes glow-and-fade {
  0% {
    opacity: 0;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}


/* --- ルートトランジション --- */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease; /* フェードアウト時間を長く */
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
