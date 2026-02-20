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

  <!-- ★修正: isInitialAssetsLoading を使用して初期ロードスピナーを制御 -->
  <LoadingIndicator v-if="gameStore.isInitialAssetsLoading" />

  <!-- ペナルティポップアップ -->
  <PenaltyPopup />
</template>

<script setup>
// このコンポーネントは、アプリケーションのルートです。
// アセットのプリロード、ローディング画面、起動シーケンス、
// そしてメインコンテンツのルーティングを管理します。
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAudioStore } from '@/stores/audioStore';
import { useUserStore } from '@/stores/userStore';
import { useGameStore } from '@/stores/gameStore';
import { preloadImages } from '@/utils/imageLoader';
import WakeUpCatScreen from '@/components/WakeUpCatScreen.vue';
import LoadingIndicator from '@/components/LoadingIndicator.vue';
import PenaltyPopup from '@/components/PenaltyPopup.vue';

// --- リアクティブな状態 ---
const isEmailConfirmedPage = window.location.hash.startsWith('#/email-confirmed');
const isTransitioning = ref(false);
const showWakeUpScreen = ref(!isEmailConfirmedPage); // メール確認ページでなければ表示

// --- ストアの利用 ---
const audioStore = useAudioStore();
const userStore = useUserStore();
const gameStore = useGameStore();
const router = useRouter();

// --- ライフサイクル フック ---
onMounted(async () => {
  window.addEventListener('beforeunload', handleBeforeUnload);

  if (isEmailConfirmedPage) {
    gameStore.isInitialAssetsLoading = false;
    gameStore.isAppReady = true;
    return;
  }

  document.addEventListener('visibilitychange', audioStore.handleVisibilityChange);

  // --- ステージ1: 初期アセットのプリロード ---
  const initialImagePaths = [
    '/assets/images/back/sleeping.gif',
    '/assets/images/back/wakeup.gif',
  ];
  const initialAudioPaths = [
    '/assets/sounds/Xylophone04-05(Fast-Long-3-Up).mp3',
    '/assets/sounds/NES-JP-A01-2(Title-Loop115).mp3',
    '/assets/sounds/NoBGM4sec.mp3',
  ];

  try {
    await Promise.all([
      preloadImages(initialImagePaths),
      audioStore.preloadAudio(initialAudioPaths),
      // ユーザー情報取得も並行して行う
      (async () => {
        await userStore.fetchUserProfile({ showLoading: false });
        if (!userStore.profile) {
          await userStore.registerAsGuest();
        }
      })()
    ]);
  } catch (error) {
    console.error('初期アセットの読み込みに失敗しました:', error);
  } finally {
    // 初期アセットの読み込みが完了したらスピナーを非表示
    gameStore.isInitialAssetsLoading = false;
  }
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', audioStore.handleVisibilityChange);
  window.removeEventListener('beforeunload', handleBeforeUnload);
});

// --- メソッド ---

const handleBeforeUnload = () => {
  if (gameStore.isGameOnline) {
    gameStore.disconnectOnlineGame();
  }
};

const onWakeUpFinished = () => {
  isTransitioning.value = true;
  setTimeout(() => {
    showWakeUpScreen.value = false;
    router.push({ name: 'Title' });
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
  overflow: hidden;
  height: 100%;
  width: 100%;
  position: fixed;
}

#app {
  height: 100%;
  width: 100%;
}

/* --- 遷移アニメーション --- */
.transition-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: white;
  opacity: 0;
  z-index: 10000;
  pointer-events: none;
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
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
