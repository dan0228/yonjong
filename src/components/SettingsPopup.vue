<template>
  <div
    v-if="show"
    class="popup-overlay"
    @click.self="closePopup"
  >
    <div class="popup-content">
      <!-- ログインフォーム -->
      <div
        v-if="!userStore.profile || showLoginForm"
        class="form-container"
      >
        <div>
          <h2 class="popup-title">
            {{ $t('login.title') }}
          </h2>
          <img
            src="/assets/images/back/fude.png"
            alt="fude"
            class="fude-image"
          >
        </div>
        <form
          class="form-content-container"
          @submit.prevent="userStore.otpSent ? loginWithOtp() : sendOtp()"
        >
          <p class="form-description">
            {{ $t('login.description') }}
          </p>
          <div class="form-group">
            <label for="email">{{ $t('login.emailLabel') }}</label>
            <input
              id="email"
              v-model="email"
              type="email"
              :placeholder="$t('login.emailPlaceholder')"
              :disabled="userStore.otpSent"
            >
          </div>

          <div
            v-if="userStore.otpSent"
            class="form-group"
          >
            <label for="otp">{{ $t('login.otpLabel') }}</label>
            <input
              id="otp"
              v-model="otp"
              type="text"
              :placeholder="$t('login.otpPlaceholder')"
            >
          </div>

          <div
            v-if="loginError"
            class="error-message"
          >
            {{ loginError }}
          </div>

          <button
            type="submit"
            class="custom-button login-submit-button"
            :disabled="userStore.loading || isSendingOtp || isVerifyingOtp"
          >
            <span>{{ userStore.otpSent ? $t('login.loginButton') : $t('login.sendOtpButton') }}</span>
          </button>
        </form>
        <button
          type="button"
          class="custom-button cancel-button"
          @click="cancelLogin"
        >
          {{ $t('settingsPopup.cancelButton') }}
        </button>
      </div>

      <!-- プロフィール編集フォーム -->
      <div
        v-else
        class="form-container"
      >
        <div>
          <h2 class="popup-title">
            {{ $t('settingsPopup.title') }}
          </h2>
          <img
            src="/assets/images/back/fude.png"
            alt="fude"
            class="fude-image"
          >
        </div>
        <form
          class="form-content-container"
          @submit.prevent="saveProfile"
        >
          <div class="form-group">
            <label for="username-settings">{{ $t('usernameRegistration.usernameLabel') }}</label>
            <input
              id="username-settings"
              v-model="username"
              type="text"
              :placeholder="$t('usernameRegistration.usernamePlaceholder')"
            >
            <div
              v-if="username.length > 0 && !isUsernameLengthValid"
              class="error-message"
            >
              {{ $t('usernameRegistration.errors.usernameTooLong') }}
            </div>
            <div
              v-if="isUsernameProfane"
              class="error-message"
            >
              {{ $t('usernameRegistration.errors.usernameProfane') }}
            </div>
          </div>

          <div class="form-group avatar-group">
            <label>{{ $t('usernameRegistration.avatarLabel') }}</label>
            <div class="avatar-upload-container">
              <label for="avatar-upload-settings">
                <img
                  :src="previewUrl || userStore.profile?.avatar_url || '/assets/images/info/hito_icon_1.png'"
                  alt="Avatar Preview"
                  class="avatar-preview"
                >
              </label>
              <input
                id="avatar-upload-settings"
                ref="fileInput"
                type="file"
                accept="image/png, image/jpeg"
                style="display: none;"
                @change="onFileChange"
              >
              <div class="x-input-and-buttons">
                <div class="button-stack">
                  <button
                    type="button"
                    class="custom-button x-avatar-button"
                    :disabled="isLoadingXAvatar"
                    @click="onXAvatarClick"
                  >
                    <LoadingIndicator v-if="isLoadingXAvatar" />
                    <span v-else>{{ $t('avatarSection.getXIconButton') }}</span>
                  </button>
                </div>
                <input
                  id="x-handle-input-settings"
                  v-model="xHandleInput"
                  type="text"
                  :placeholder="$t('avatarSection.xAccountPlaceholder')"
                  class="x-handle-input"
                >
                <div
                  v-if="xHandleError"
                  class="error-message"
                >
                  {{ xHandleError }}
                </div>
              </div>
            </div>
          </div>

          <div class="avatar-notes">
            <p>{{ $t('avatarSection.uploadNote') }}</p>
            <p>{{ $t('avatarSection.xAccountNote') }}</p>
            <p>{{ $t('avatarSection.rightsNote') }}</p>
          </div>

          <div class="email-edit-section">
            <label class="email-label-small">{{ $t('settingsPopup.emailSection.label') }}</label>
            <div v-if="!isEditingEmail">
              <p class="email-text-small">
                {{ pendingEmail || userStore.profile?.email || $t('settingsPopup.emailSection.notSet') }}
              </p>
              <button
                type="button"
                class="custom-button edit-email-button"
                @click="startEditEmail"
              >
                {{ $t('settingsPopup.emailSection.editEmailButton') }}
              </button>
            </div>
            <form
              v-else
              @submit.prevent="requestEmailUpdate"
            >
              <div class="form-group">
                <label
                  for="email-settings"
                  class="email-label-small"
                >{{ $t('settingsPopup.emailSection.newEmailLabel') }}</label>
                <input
                  id="email-settings"
                  v-model="emailInput"
                  type="email"
                  :placeholder="$t('settingsPopup.emailSection.newEmailPlaceholder')"
                >
              </div>
              <div
                v-if="emailError"
                class="error-message"
              >
                {{ emailError }}
              </div>
              <div
                v-if="!emailUpdateMessage"
                class="button-group"
              >
                <button
                  type="button"
                  class="custom-button cancel-button"
                  @click="cancelEditEmail"
                >
                  {{ $t('settingsPopup.cancelButton') }}
                </button>
                <button
                  type="submit"
                  class="custom-button"
                  :disabled="isUpdatingEmail"
                >
                  {{ $t('settingsPopup.emailSection.sendUpdateRequestButton') }}
                </button>
              </div>
            </form>
            <div
              v-if="emailUpdateMessage"
              class="success-message"
            >
              {{ emailUpdateMessage }}
            </div>
          </div>

          <div
            v-if="!isEditingEmail"
            class="button-group"
          >
            <button
              type="button"
              class="custom-button cancel-button"
              :disabled="isEditingEmail && !emailUpdateMessage"
              :class="{'disabled-button-style': isEditingEmail && !emailUpdateMessage}"
              @click="closePopup"
            >
              {{ $t('settingsPopup.cancelButton') }}
            </button>
            <button
              type="submit"
              class="custom-button"
              :disabled="!isFormValid"
            >
              {{ $t('settingsPopup.saveButton') }}
            </button>
          </div>
        </form>

        <div class="account-actions-container">
          <button
            class="secondary-action-button"
            @click="showLoginForm = true"
          >
            {{ $t('settingsPopup.switchAccountButton') }}
          </button>
          <button
            class="delete-button"
            @click="handleDeleteAccount"
          >
            {{ $t('settingsPopup.deleteAccountSection.button') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, defineProps, defineEmits } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUserStore } from '@/stores/userStore';
import { containsProfanity } from '@/utils/validationUtils';
import { compressImage } from '@/utils/imageUtils';
import LoadingIndicator from '@/components/LoadingIndicator.vue';
import { useAudioStore } from '@/stores/audioStore'; // Import audio store

const props = defineProps({ show: Boolean });
const emit = defineEmits(['close']);
const { t } = useI18n();
const userStore = useUserStore();
const audioStore = useAudioStore(); // Get audio store instance

// --- 状態管理 ---
const showLoginForm = ref(false);

// --- ログイン関連の状態 ---
const email = ref('');
const otp = ref('');
const loginError = ref('');
const isSendingOtp = ref(false);
const isVerifyingOtp = ref(false);

// --- プロフィール編集関連の状態 ---
const username = ref('');
const selectedFile = ref(null);
const previewUrl = ref(null);
const xHandleInput = ref('');
const xHandleError = ref('');
const isLoadingXAvatar = ref(false);

// --- メールアドレス編集関連の状態 ---
const emailInput = ref('');
const emailError = ref('');
const isEditingEmail = ref(false);
const isUpdatingEmail = ref(false);
const emailUpdateMessage = ref('');
const pendingEmail = ref(null);

watch(xHandleInput, () => {
  xHandleError.value = '';
});

// ポップアップ表示時の処理
watch(() => props.show, (newValue) => {
  if (newValue) {
    showLoginForm.value = false; // アカウント切替フォームを非表示に
    // ログイン状態に応じてフォームを初期化
    if (userStore.profile) {
      initializeProfileForm();
    } else {
      initializeLoginForm();
    }
    audioStore.playSound('Hit-Slap01-3(Dry).mp3'); // Play sound when popup opens
  }
});

const initializeProfileForm = () => {
  username.value = userStore.profile.username || '';
  previewUrl.value = userStore.profile.avatar_url || null;
  selectedFile.value = null;
  xHandleInput.value = '';
  xHandleError.value = '';
  emailInput.value = userStore.profile.email || '';
  isEditingEmail.value = false;
  emailError.value = '';
  emailUpdateMessage.value = '';
  pendingEmail.value = null;
};

const initializeLoginForm = () => {
  email.value = '';
  otp.value = '';
  loginError.value = '';
  userStore.otpSent = false;
  userStore.loginEmail = '';
};

// --- ログイン関連のメソッド ---
const sendOtp = async () => {
  loginError.value = '';
  if (!email.value) {
    loginError.value = t('login.errors.emailRequired');
    return;
  }
  isSendingOtp.value = true;
  const result = await userStore.signInWithEmailOtp(email.value, t);
  if (!result.success) {
    loginError.value = result.error || t('login.errors.sendOtpFailed');
  }
  isSendingOtp.value = false;
};

const loginWithOtp = async () => {
  loginError.value = '';
  if (!email.value || !otp.value) {
    loginError.value = t('login.errors.emailOtpRequired');
    return;
  }
  isVerifyingOtp.value = true;
  const result = await userStore.verifyEmailOtp(email.value, otp.value, t);
  if (result.success) {
    showLoginForm.value = false; // ログイン成功でプロフィール画面に戻る
    initializeProfileForm(); // 新しいプロフィールでフォームを初期化
  } else {
    loginError.value = result.error || t('login.errors.verifyOtpFailed');
  }
  isVerifyingOtp.value = false;
};

const cancelLogin = () => {
  if (userStore.profile) {
    showLoginForm.value = false; // プロフィール編集画面に戻る
  } else {
    closePopup(); // 未ログイン状態ならポップアップを閉じる
  }
};

// --- メールアドレス編集関連のメソッド ---
const startEditEmail = () => {
  isEditingEmail.value = true;
  emailError.value = '';
  emailUpdateMessage.value = '';
};

const cancelEditEmail = () => {
  isEditingEmail.value = false;
  emailInput.value = userStore.profile?.email || '';
  emailError.value = '';
  emailUpdateMessage.value = '';
};

const requestEmailUpdate = async () => {
  emailError.value = '';
  emailUpdateMessage.value = '';
  if (!emailInput.value || !emailInput.value.includes('@')) {
    emailError.value = t('settingsPopup.emailSection.errors.invalidEmail');
    return;
  }

  isUpdatingEmail.value = true;
  const result = await userStore.updateUserEmail(emailInput.value, t);
  if (result.success) {
    emailUpdateMessage.value = t('settingsPopup.emailSection.updateRequestSent');
    pendingEmail.value = emailInput.value;
    isEditingEmail.value = false; // Set immediately to false
  } else {
    emailError.value = result.error || t('settingsPopup.emailSection.errors.updateFailed');
  }
  isUpdatingEmail.value = false;
};

// --- ファイル選択ハンドラ ---
const onFileChange = async (e) => {
  xHandleError.value = '';
  const file = e.target.files[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png'].includes(file.type)) {
    alert(t('usernameRegistration.errors.imageFormat'));
    return;
  }
  try {
    const compressedBlob = await compressImage(file, 200, 200);
    selectedFile.value = new File([compressedBlob], file.name, { type: 'image/png' });
    previewUrl.value = URL.createObjectURL(selectedFile.value);
  } catch (error) {
    console.error('画像の圧縮に失敗しました:', error);
    selectedFile.value = file;
    previewUrl.value = URL.createObjectURL(file);
  }
};

// --- Xアバター取得ハンドラ ---
const onXAvatarClick = async () => {
  isLoadingXAvatar.value = true;
  xHandleError.value = '';
  const xHandle = xHandleInput.value;
  if (!xHandle) {
    xHandleError.value = t('avatarSection.xAccountValidation.empty');
    isLoadingXAvatar.value = false;
    return;
  }

  let cleanHandle = xHandle.startsWith('@') ? xHandle.substring(1) : xHandle;

  const alphanumericRegex = /^[a-zA-Z0-9_]+$/;
  if (!alphanumericRegex.test(cleanHandle)) {
    xHandleError.value = t('avatarSection.xAccountValidation.invalidChars');
    isLoadingXAvatar.value = false;
    return;
  }

  try {
    const unavatarUrl = `https://unavatar.io/twitter/${cleanHandle}`;
    const xAvatarUrl = `https://images.weserv.nl/?url=${encodeURIComponent(unavatarUrl)}`;
    
    const response = await fetch(xAvatarUrl, { mode: 'cors', credentials: 'omit' });

    if (!response.ok) {
      console.error(`Failed to fetch X avatar from unavatar.io: ${response.status} ${response.statusText}`);
      xHandleError.value = t('avatarSection.xAccountValidation.fetchFailed');
      isLoadingXAvatar.value = false;
      return;
    }

    const contentType = response.headers.get('Content-Type');
    if (!contentType || !contentType.startsWith('image/')) {
      console.error('Received non-image content from unavatar.io:', contentType);
      xHandleError.value = t('avatarSection.xAccountValidation.invalidContent');
      isLoadingXAvatar.value = false;
      return;
    }

    const blob = await response.blob();

    selectedFile.value = new File([blob], `x_avatar_${cleanHandle}.png`, { type: blob.type });
    previewUrl.value = URL.createObjectURL(selectedFile.value);

  } catch (error) {
    console.error('Xアバターの取得中にエラーが発生しました:', error);
    xHandleError.value = t('avatarSection.xAccountValidation.networkError');
  } finally {
    isLoadingXAvatar.value = false;
  }
};

// --- バリデーション ---
const getCharacterWidth = (str) => {
  let width = 0;
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    if ((charCode >= 0x0020 && charCode <= 0x007e) || (charCode >= 0xff61 && charCode <= 0xff9f)) { width += 1; } else { width += 2; }
  }
  return width;
};
const isUsernameNotEmpty = computed(() => username.value.trim().length > 0);
const isUsernameLengthValid = computed(() => getCharacterWidth(username.value) <= 16);
const isUsernameProfane = computed(() => containsProfanity(username.value));
const isFormValid = computed(() => isUsernameNotEmpty.value && isUsernameLengthValid.value && !isUsernameProfane.value);



// --- 保存処理 ---
const saveProfile = async () => {
  if (!isFormValid.value) return;

  try {
    await userStore.updateUserProfile({ username: username.value });
    if (selectedFile.value) {
      await userStore.uploadAvatar(selectedFile.value);
    }
    await userStore.fetchUserProfile();
    emit('close');
  } catch (error) {
    console.error('プロフィールの更新中にエラーが発生しました:', error);
    alert('更新に失敗しました。もう一度お試しください。');
  }
};

const closePopup = () => {
  emit('close');
  emailUpdateMessage.value = ''; // Clear message on close
  emailError.value = ''; // Clear error on close
  pendingEmail.value = null;
};

const handleDeleteAccount = () => {
  if (window.confirm(t('settingsPopup.deleteAccountSection.confirm'))) {
    userStore.deleteUserData();
    emit('close');
  }
};
</script>

<style scoped>
/* 基本的なオーバレイとコンテンツのスタイル */
.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1050;
}
.popup-content {
  background-image: url('/assets/images/back/start_back.png');
  background-size: cover;
  background-position: center;
  padding: 10px;
  margin-right: 5px;
  border-radius: 10px;
  width: 400px;
  max-width: 95vw;
  height: 600px;
  max-height: 90vh;
  text-align: center;
  box-shadow: 0 5px 20px rgba(0,0,0,0.25);
  display: flex;
  flex-direction: column;
  color: rgb(43, 6, 6);
  font-family: 'Yuji Syuku', serif;
  animation: slap-in 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes slap-in {
  0% {
    opacity: 0;
    transform: scale(1.5); /* 手前にある状態 */
  }
  60% {
    opacity: 1;
    transform: scale(0.95); /* 勢い余って少し行き過ぎる（机にめり込むイメージ） */
  }
  80% {
    transform: scale(1.02); /* 反動で少し浮く */
  }
  100% {
    transform: scale(1);    /* 定位置 */
  }
}

/* フォームコンテナ */
.form-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

/* フォームコンテンツのスクロール設定 */
.form-content-container {
  padding: 0 10px;
  margin: 0 -10px;
  flex-grow: 1;
}

/* タイトルと筆画像 */
.popup-title {
  margin-top: 15px;
  margin-bottom: 0;
  font-size: 2em;
  font-weight: bold;
}
.fude-image {
  width: 220px;
  height: 15px;
  max-width: 80%;
  margin-top: -5px;
  margin-bottom: 5px;
}

/* ログインフォームの説明文 */
.form-description {
  font-size: 0.8em; /* 文言のサイズを小さく */
  padding: 0 15px;
  margin-bottom: 10px;
}

/* フォーム要素 */
.form-group {
  width: 85%;
  margin-left: 28px;
  margin-bottom: 8px;
  text-align: left;
}
.form-group label {
  display: block;
  margin-bottom: 3px;
  font-weight: bold;
  font-size: 0.9em;
}
.form-group input {
  width: 100%;
  height: 25px;
  padding: 6px 2px;
  border: none;
  border-bottom: 1px solid rgba(43, 6, 6, 0.5);
  border-radius: 0;
  box-sizing: border-box;
  background-color: transparent;
  color: rgb(43, 6, 6);
  font-family: 'Yuji Syuku', serif;
  outline: none;
  transition: border-bottom-color 0.3s;
}
.form-group input:focus {
  border-bottom-color: rgb(43, 6, 6);
}
.form-group input::placeholder {
  color: rgba(43, 6, 6, 0.6);
}

/* エラーメッセージ */
.error-message {
  color: #e53935;
  font-size: 0.6em;
  margin-top: 3px;
}

/* カスタムボタン */
.custom-button {
  background-color: #8B4513; /* SaddleBrown */
  color: #FFF8DC; /* Cornsilk */
  padding: 6px 12px;
  border: 2px solid #D2B48C; /* Tan */
  border-radius: 8px;
  cursor: pointer;
  font-size: 1em;
  font-family: 'Yuji Syuku', serif;
  text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
  transition: all 0.2s ease;
  margin-top: 5px;
  width: 100%;
  box-sizing: border-box;
}
.custom-button:hover {
  background-color: #A0522D; /* Sienna */
  border-color: #DEB887; /* BurlyWood */
}
.custom-button:disabled {
  background-color: #A9A9A9; /* DarkGray */
  color: #D3D3D3; /* LightGray */
  cursor: not-allowed;
  border-color: #696969;
}

/* アバター関連 */
.avatar-group { margin-top: 10px; }
.avatar-upload-container { display: flex; align-items: center; gap: 10px; }
.avatar-upload-container > label {
  cursor: pointer;
}
.avatar-preview {
  width: 70px; height: 70px;
  border: 2px solid #D2B48C;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
  transition: opacity 0.2s;
}
.avatar-preview:hover {
  opacity: 0.8;
}
.x-input-and-buttons { display: flex; flex-direction: column; gap: 5px; flex-grow: 1; }
.button-stack { display: flex; flex-direction: column; gap: 5px; }
.x-handle-input { font-size: 0.8em; }

/* 画像ボタンの共通スタイル */
.x-avatar-button,
.edit-email-button,
.email-edit-section form .button-group .custom-button:not(.cancel-button),
.form-content-container > .button-group .custom-button:not(.cancel-button),
.custom-button.cancel-button,
.login-submit-button {
  background-size: 100% 100%;
  background-color: transparent;
  border: none;
  color: #4a2c12;
  font-weight: bold;
  text-shadow: none;
  filter: drop-shadow(2px 2px 3px rgba(0, 0, 0, 0.4));
  transition: all 0.1s ease-out;
}

.x-avatar-button:hover,
.edit-email-button:hover,
.email-edit-section form .button-group .custom-button:not(.cancel-button):hover,
.form-content-container > .button-group .custom-button:not(.cancel-button):hover,
.custom-button.cancel-button:hover,
.login-submit-button:hover:not(:disabled) {
  background-color: transparent;
  border: none;
  filter: drop-shadow(2px 2px 3px rgba(0, 0, 0, 0.4)) brightness(1.1);
}

.x-avatar-button:active,
.edit-email-button:active,
.email-edit-section form .button-group .custom-button:not(.cancel-button):active,
.form-content-container > .button-group .custom-button:not(.cancel-button):active,
.custom-button.cancel-button:active,
.login-submit-button:active:not(:disabled) {
  transform: translateY(1px);
  filter: drop-shadow(1px 1px 2px rgba(0, 0, 0, 0.5));
}

/* 個別の画像ボタンのスタイル */
.x-avatar-button {
  background-image: url('/assets/images/button/board_ori.png');
  font-size: 0.8em;
  padding: 5px 8px;
  width: auto;
  margin-top: 0;
}

.edit-email-button,
.email-edit-section form .button-group .custom-button:not(.cancel-button) {
  background-image: url('/assets/images/button/board_ori.png');
}

.form-content-container > .button-group .custom-button:not(.cancel-button) {
  background-image: url('/assets/images/button/board_hand.png');
}

.custom-button.cancel-button {
  background-image: url('/assets/images/button/board_cancel.png');
}

.login-submit-button {
  background-image: url('/assets/images/button/board_ori.png');
  width: 80%;
  display: block;
  margin-left: auto;
  margin-right: auto;
}

.login-submit-button:disabled {
  background-image: url('/assets/images/button/board_ori.png');
  background-color: transparent; /* Ensure background is transparent */
  border: none; /* Ensure no border */
  color: #4a2c12; /* disabledでも文字色は維持 */
  filter: drop-shadow(2px 2px 3px rgba(0, 0, 0, 0.4)) grayscale(0.7);
  opacity: 0.7;
  cursor: not-allowed;
}

.avatar-notes {
  width: 85%;
  font-size: 0.6em;
  margin-top: 8px;
  margin-left: 28px;
  text-align: left;
  border-top: 1px solid rgba(139, 69, 19, 0.2);
  padding-top: 0px;
}
.avatar-notes p { margin: 0 0 3px 0; }

/* メール編集セクション */
.email-edit-section {
  width: 85%;
  margin-left: 28px;;
  margin-top: 10px; padding-top: 10px;
  border-top: 1px solid rgba(139, 69, 19, 0.2);
  text-align: left;
}
.email-label-small { font-size: 0.9em; font-weight: bold; }
.email-text-small { font-size: 0.8em; margin-bottom: 5px; }
.edit-email-button {
  font-size: 0.8em;
  padding: 5px 10px;
  width: auto;
  align-self: flex-start;
  margin-top: 0;
}
.success-message { color: #2E8B57; font-size: 0.8em; margin-top: 5px; }

/* メール編集フォーム内の特定要素を小さくする */
.email-edit-section form .email-label-small {
  font-size: 0.8em;
}
.email-edit-section form input {
  height: 22px;
  font-size: 0.7em;
  padding: 4px 2px;
}
.email-edit-section form .button-group {
  margin-top: 5px;
}
.email-edit-section form .button-group .custom-button {
  padding: 4px 10px;
  font-size: 0.8em;
}


/* ボタン群 */
.button-group {
  display: flex;
  gap: 10px;
  justify-content: space-between;
  margin-top: 10px;
  margin-left: 28px;
  margin-right: 28px;
}

.button-group .custom-button { width: 40%; }

/* アカウントアクション */
.account-actions-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
  margin-left: 24px;
  padding-top: 10px;
  width: 88%;
  border-top: 1px solid rgba(139, 69, 19, 0.2);
}
.secondary-action-button, .delete-button {
  background: none; border: none;
  text-decoration: underline;
  cursor: pointer;
  font-size: 0.8em;
  padding: 10px 0px;
  margin-left: 10px;
  margin-right: 20px;
  margin-bottom: 30px;
  font-family: 'Yuji Syuku', serif;
  transition: color 0.2s;
}
.secondary-action-button { color: #556B2F; } /* DarkOliveGreen (抹茶色) */
.secondary-action-button:hover { color: #3A4F21; }
.delete-button { color: #9F353A; } /* 臙脂色 */
.delete-button:hover { color: #7C2A2E; }

.disabled-button-style { opacity: 0.6; cursor: not-allowed; }

/* ログインフォームのキャンセルボタンの隙間調整 */
.form-container > .cancel-button {
  margin-bottom: 300px; /* ボタン間の隙間を小さく */
  width: 80%;
  display: block;
  margin-left: auto;
  margin-right: auto;
}
</style>

