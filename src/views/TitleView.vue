<template>
  <div
    class="title-view-container"
    :style="{ height: viewportHeight }"
  >
    <!-- ★修正: isAppReadyがfalseの間、スピナーを表示 -->
    <LoadingIndicator v-if="!gameStore.isAppReady" />

    <!-- 背景スクロールコンテナ(imgタグは不要) -->
    <div class="scrolling-background-container" />

    <div
      v-if="gameStore.isAppReady"
      class="title-screen"
      :style="scalerStyle"
    >
      <!-- 背景 -->
      <div class="title-background-container">
        <div class="title-background-image" />
      </div>

      <!-- ヘッダー -->
      <header class="title-header">
        <!-- ユーザー情報 -->
        <div class="user-stats">
          <img
            :src="boardImageSrc"
            alt="Board"
            class="board-image"
          >
          <span class="rating-number-on-board">{{ userStore.profile?.rating ?? 1500 }}</span>
          <img
            v-if="ratingBadgeSrc"
            :src="ratingBadgeSrc"
            alt="Rating Badge"
            class="rating-badge-image"
          >
          <span class="cat-coins-number-on-board">{{ userStore.profile?.cat_coins || 0 }}</span>
        </div>
        <!-- 上部コントロール -->
        <div class="top-controls-wrapper">
          <div class="top-controls">
            <div class="top-controls-group">
              <div class="language-selector">
                <div
                  class="language-flag language-flag-ja"
                  :class="{ selected: locale === 'ja' }"
                  @click="locale = 'ja'"
                />
                <div
                  class="language-flag language-flag-en"
                  :class="{ selected: locale === 'en' }"
                  @click="locale = 'en'"
                />
              </div>
              <button
                class="settings-button"
                @click="showSettingsPopup = true"
              >
                <img
                  src="/assets/images/button/setting_button.png"
                  alt="Settings"
                  class="settings-button-image"
                >
              </button>
            </div>
          </div>
          <div class="volume-slider-container">
            <input
              v-if="!isMobileDevice"
              type="range"
              min="0"
              max="1"
              step="0.01"
              :value="audioStore.volume"
              class="volume-slider"
              @input="handleVolumeChange"
              @change="handleVolumeChange"
            >
            <button
              class="audio-button"
              @click.stop="audioStore.toggleAudio()"
            >
              <img
                :src="audioIconSrc"
                alt="Audio"
                class="audio-button-image"
              >
            </button>
          </div>
        </div>
      </header>

      <!-- メインコンテンツ -->
      <main class="title-main-content">
        <img
          :src="titleLogoSrc"
          :alt="$t('titleView.altLogo')"
          class="title-logo"
        >
        <div class="title-buttons-container">
          <!-- メインボタン -->
          <div class="button-group main-group">
            <button
              v-for="button in mainButtons"
              :key="button.id"
              :class="['menu-button', button.cssClass, { 'image-button': button.imgSrc }]"
              @click="button.action"
            >
              <img
                :src="button.imgSrc"
                :alt="button.alt"
              >
              <span
                v-if="button.isUnderConstruction"
                class="construction-badge"
              >Under Construction</span>
              <div
                v-if="button.showStockText"
                class="stock-text"
              >
                STOCK
              </div>
            </button>
          </div>
          <!-- サブ・情報ボタン -->
          <div class="combined-button-group">
            <div class="sub-group">
              <button
                v-for="button in subButtons"
                :key="button.id"
                :class="['menu-button', button.cssClass, { 'image-button': button.imgSrc }]"
                @click="button.action"
              >
                <img
                  :src="button.imgSrc"
                  :alt="button.alt"
                >
              </button>
            </div>
            <div class="info-group">
              <button
                v-for="button in infoButtons"
                :key="button.id"
                :class="['menu-button', button.cssClass, { 'image-button': button.imgSrc }]"
                @click="button.action"
              >
                <img
                  :src="button.imgSrc"
                  :alt="button.alt"
                >
              </button>
            </div>
          </div>
        </div>
      </main>

      <!-- フッター -->
      <footer class="footer-info">
        <div class="credit">
          BGM by OtoLogic(CC BY 4.0)
        </div>
        <div class="x-account">
          <a
            href="https://x.com/danAllGreen"
            target="_blank"
            rel="noopener noreferrer"
          >{{ $t('titleView.officialX') }}</a>
        </div>
        <div class="version-info">
          v1.7.11 | 2026.1.26
        </div>
      </footer>

      <!-- ポップアップ -->
      <RulePopup
        :show="showRulesPopup"
        @close="showRulesPopup = false"
      />
      <YakuListPopup
        :show="showYakuListPopup"
        @close="showYakuListPopup = false"
      />
      <HowToPlayPopup
        :show="showHowToPlayPopup"
        @close="showHowToPlayPopup = false"
      />
      <SettingsPopup
        :show="showSettingsPopup"
        @close="showSettingsPopup = false"
      />
      <GameModeSelectionPopup
        v-if="popupProps"
        :show="activePopup !== null"
        :background-image="popupProps.backgroundImage"
        :buttons="popupProps.buttons"
        @close="activePopup = null"
        @select="handlePopupSelect"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useGameStore } from '@/stores/gameStore';
import { useAudioStore } from '@/stores/audioStore';
import { useUserStore } from '@/stores/userStore';
import RulePopup from '@/components/RulePopup.vue';
import YakuListPopup from '@/components/YakuListPopup.vue';
import HowToPlayPopup from '@/components/HowToPlayPopup.vue';
import SettingsPopup from '@/components/SettingsPopup.vue';
import GameModeSelectionPopup from '@/components/GameModeSelectionPopup.vue';
import LoadingIndicator from '@/components/LoadingIndicator.vue';
import { useViewportHeight } from '@/composables/useViewportHeight';

// --- デバイス判定 ---
const isMobileDevice = ref(false);

// --- リアクティブな状態とストア ---
const { t, locale } = useI18n();
const { viewportHeight } = useViewportHeight();
const router = useRouter();
const gameStore = useGameStore();
const audioStore = useAudioStore();
const userStore = useUserStore();

const showRulesPopup = ref(false);
const showYakuListPopup = ref(false);
const showHowToPlayPopup = ref(false);
const showSettingsPopup = ref(false);

// --- ポップアップ管理 ---
const activePopup = ref(null); // 'ai' または 'online' または null

const popupProps = computed(() => {
  if (activePopup.value === 'ai') {
    return {
      backgroundImage: '/assets/images/back/mode_back.png',
      buttons: [
        { id: 'classic', title: t('gameModeSelection.classic'), description: t('gameModeSelection.classicDescription'), customClass: 'mode-left', isForm: false },
        { id: 'stock', title: t('gameModeSelection.stock'), description: t('gameModeSelection.stockDescription'), customClass: 'mode-right', isForm: false }
      ]
    };
  }
  if (activePopup.value === 'online') {
    return {
      backgroundImage: '/assets/images/back/online_back.png', // ユーザー指定の画像
      buttons: [
        { id: 'friend', title: t('gameModeSelection.friendMatch'), description: '', customClass: 'mode-left', isForm: true },
        { id: 'ranked', title: t('gameModeSelection.rankedMatch'), description: t('gameModeSelection.rankedMatchDescription'), customClass: 'mode-right online-ranked-button', isForm: false }
      ]
    };
  }
  return null;
});

const handlePopupSelect = (payload) => {
  const { action, passcode } = payload;
  const popupType = activePopup.value;
  activePopup.value = null;

  if (popupType === 'ai') {
    gameStore.setRuleMode(action);
    const gameMode = 'vsCPU';
    gameStore.setGameMode(gameMode);
    gameStore.resetGameForNewSession();
    gameStore.initializeGame();
    gameStore.showDealerDeterminationPopup = true;
    router.push('/game');
  } else if (popupType === 'online') {
    if (action === 'enter_room') {
      // TODO: 友人対戦（入室）のマッチメイキング処理
      console.log(`Entering friend match with passcode: ${passcode}`);
      router.push('/matchmaking'); // 仮で同じ画面へ
    } else if (action === 'create_room') {
      // TODO: 友人対戦（部屋立て）のマッチメイキング処理
      console.log(`Creating friend match with passcode: ${passcode}`);
      router.push('/matchmaking'); // 仮で同じ画面へ
    } else if (action === 'ranked') {
      // TODO: 全国対戦のマッチメイキング画面へ遷移
      console.log('Ranked match selected, navigating to matchmaking...');
      gameStore.setGameMode('online'); // ゲームモードをオンラインに設定
      gameStore.requestMatchmaking(); // マッチング要求を送信
      router.push('/matchmaking');
    }
  }
};


// --- ナビゲーションとアクション ---
const navigateTo = (path) => {
  router.push(path);
};

// --- ボタンデータ ---
const mainButtons = computed(() => [
  {
    id: 'ai-match',
    alt: t('titleView.menu.catAiMatch'),
    action: () => {
      audioStore.playSound('Hit-Slap01-3(Dry).mp3');
      activePopup.value = 'ai';
    },
    cssClass: 'main-button',
    imgSrc: locale.value === 'en' ? '/assets/images/button/title_cat_AI_match_en.png' : '/assets/images/button/title_cat_AI_match.png',
  },
  {
    id: 'online-match',
    alt: t('titleView.menu.onlineMatch'),
    action: () => {
      audioStore.playSound('Hit-Slap01-3(Dry).mp3');
      activePopup.value = 'online';
    },
    cssClass: 'main-button',
    imgSrc: locale.value === 'en' ? '/assets/images/button/title_online_match_en.png' : '/assets/images/button/title_online_match.png',
    showStockText: true,
  },
]);

const subButtons = computed(() => [
  {
    id: 'shrine',
    alt: t('titleView.menu.shrine'),
    action: () => navigateTo('/shrine'),
    cssClass: 'sub-button',
    imgSrc: locale.value === 'en' ? '/assets/images/button/title_janeko_shrine_en.png' : '/assets/images/button/title_janeko_shrine.png',
  },
  {
    id: 'leaderboard',
    alt: t('titleView.menu.leaderboard'),
    action: () => navigateTo('/leaderboard'),
    cssClass: 'sub-button',
    imgSrc: locale.value === 'en' ? '/assets/images/button/title_leader_board_en.png' : '/assets/images/button/title_leader_board.png',
  },
]);

const infoButtons = computed(() => [
  {
    id: 'how-to-play',
    alt: t('titleView.menu.howToPlay'),
    action: () => { showHowToPlayPopup.value = true; },
    cssClass: 'info-button',
    imgSrc: locale.value === 'en' ? '/assets/images/button/title_howtoplay_en.png' : '/assets/images/button/title_howtoplay.png',
  },
  {
    id: 'rules',
    alt: t('titleView.menu.rules'),
    action: () => { showRulesPopup.value = true; },
    cssClass: 'info-button',
    imgSrc: locale.value === 'en' ? '/assets/images/button/title_rule_en.png' : '/assets/images/button/title_rule.png',
  },
  {
    id: 'yaku-list',
    alt: t('titleView.menu.handList'),
    action: () => { showYakuListPopup.value = true; },
    cssClass: 'info-button',
    imgSrc: locale.value === 'en' ? '/assets/images/button/title_yakulist_en.png' : '/assets/images/button/title_yakulist.png',
  },
]);


const titleLogoSrc = computed(() =>
  locale.value === 'en'
    ? '/assets/images/back/title_logo_en.png'
    : '/assets/images/back/title_logo.png'
);

const audioIconSrc = computed(() =>
  audioStore.isAudioEnabled
    ? '/assets/images/button/BGM_ON.png'
    : '/assets/images/button/BGM_OFF.png'
);

const boardImageSrc = computed(() =>
  locale.value === 'en'
    ? '/assets/images/info/board_en.png'
    : '/assets/images/info/board.png'
);

const ratingBadgeSrc = computed(() => {
  const rank = userStore.profile?.user_rank_class;
  if (!rank) {
    return null;
  }

  const langSuffix = locale.value === 'en' ? '_en' : '';
  
  switch (rank) {
    case 1:
      return `/assets/images/info/kitten${langSuffix}.png`;
    case 2:
      return `/assets/images/info/alley${langSuffix}.png`;
    case 3:
      return `/assets/images/info/boss${langSuffix}.png`;
    default:
      return null;
  }
});

const handleVolumeChange = (event) => {
  audioStore.setVolume(parseFloat(event.target.value));
};


// --- 画面のスケーリング処理 ---
const DESIGN_WIDTH = 360;
const DESIGN_HEIGHT = 640;

const calculateScaleFactor = () => {
  if (typeof window === 'undefined') return 1;
  const currentWidth = window.innerWidth;
  const currentHeight = window.innerHeight;
  const scaleX = currentWidth / DESIGN_WIDTH;
  const scaleY = currentHeight / DESIGN_HEIGHT;
  return Math.min(scaleX, scaleY);
};

const scaleFactor = ref(calculateScaleFactor());

const scalerStyle = computed(() => ({
  transform: `translate(-50%, -50%) scale(${scaleFactor.value})`,
}));

const updateScaleFactor = () => {
  scaleFactor.value = calculateScaleFactor();
};

// --- ライフサイクルフック ---
onMounted(async () => {
  isMobileDevice.value = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  
  await userStore.fetchUserProfile({ showLoading: false });

  if (!userStore.profile) {
    await userStore.registerAsGuest();
  }

  window.addEventListener('resize', updateScaleFactor);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateScaleFactor);
});
</script>

<style scoped>
/* 基本コンテナ設定 */
.title-view-container {
  position: relative;
  width: 100vw;
  overflow: hidden;
  background-color: #000; /* 白い帯が見える代わりの背景色 */
}

/* 背景スクロール(background-image版) */
.scrolling-background-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: url('/assets/images/back/back_out.png');
  background-repeat: repeat-x;
  background-size: auto 100%; /* 高さをビューポートに合わせ、幅はアスペクト比を維持 */
  animation: scroll-background 80s linear infinite;
  will-change: background-position;
  z-index: 0;
}

@keyframes scroll-background {
  from {
    background-position-x: 0;
  }
  to {
    /* 画像の実際の幅に関係なく、大きな値を指定して移動させる */
    /* 2560pxは一般的な高解像度モニターをカバーするのに十分な値 */
    background-position-x: -2560px;
  }
}

.title-screen {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 360px;
  height: 640px;
  font-family: 'M PLUS Rounded 1c', 'Helvetica Neue', Arial, sans-serif;
  touch-action: none !important;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
  z-index: 1; /* 背景の上に表示 */
  background: transparent; /* 背景を透明にする */
}

.title-screen::before {
  content: '';
  position: absolute;
  top: 60%;
  left: 0;
  right: 0;
  bottom: 0%;
  background-repeat: no-repeat;
  background-position: center center;
  background-size: auto 100%;
  opacity: 0.9;
  z-index: -1;
}

/* 背景とロゴ */
.title-background-container {
  width: 250px;
  height: auto;
  aspect-ratio: 400 / 260;
  position: absolute;
  z-index: 1;
}

.title-background-image {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-size: 100% auto;
  background-repeat: no-repeat;
  background-position: center;
  background-image: url('/assets/images/back/title_back.png');
  margin-top: 30px;
}

/* レイアウトブロック */
.title-header {
  width: 100%;
  padding: 15px;
  box-sizing: border-box;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  position: relative;
  z-index: 10;
}

.title-main-content {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  position: relative;
  z-index: 2;
}

.footer-info {
  width: 100%;
  padding-bottom: 10px;
  box-sizing: border-box;
  text-align: center;
  font-size: 0.7em;
  color: rgba(0, 0, 0, 0.4);
  position: relative;
  z-index: 1;
}

/* メインコンテンツ内の要素 */
.title-logo {
  width: 100%;
  max-width: 340px;
  height: auto;
  margin-top: 50px;
}

.title-buttons-container {
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin-top: -55px;
}

.button-group {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 15px;
}

.main-group {
  margin-top: 70px;
  margin-bottom: 5px;
}

/* 新しい複合レイアウト */
.combined-button-group {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 27px;
}

.sub-group {
  display: flex;
  gap: 10px;
}

.info-group {
  display: flex;
  flex-direction: column;
  gap: 0px;
}


/* 個別のボタン設定 */
.menu-button {
  position: relative; /* バッジの位置の基準にする */
  padding: 0;
  cursor: pointer;
  transition: transform 0.15s ease-out;
  background: none;
  border: none;
}

.construction-badge {
  position: absolute;
  top: -5px;
  right: -15px;
  background-color: #ffd700;
  color: #ff0000;
  padding: 3px 8px;
  font-size: 10px;
  font-weight: bold;
  border-radius: 5px;
  transform: rotate(15deg);
  box-shadow: 1px 1px 3px rgba(0,0,0,0.3);
  pointer-events: none; /* バッジがクリックイベントを妨げないようにする */
}

.menu-button.image-button {
  transition: transform 0.15s ease-out;
}

.menu-button:hover {
  transform: translateY(-4px);
}

.menu-button:active {
  transform: translateY(4px);
}

/* ボタンサイズとエフェクト */
.main-button img {
  width: 160px;
  filter: drop-shadow(3px 5px 4px rgba(0, 0, 0, 0.7));
}
.sub-button img {
  width: 95px;
  height: 165px;
  filter: drop-shadow(2px 4px 3px rgba(0, 0, 0, 0.7));
}
.info-button img {
  width: 104px;
  filter: drop-shadow(2px 3px 2px rgba(0, 0, 0, 0.7));
}

.stock-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(70%, 130%);
  font-family: 'Yuji Syuku', serif;
  font-size: 0.9em; /* 適切なサイズに調整 */
  font-weight: bold;
  color: #0f0202;
  text-shadow: 1px 1px 3px rgb(255, 255, 255);
  z-index: 10; /* ボタン画像の上に表示 */
  pointer-events: none; /* クリックイベントを透過させる */
}


/* ヘッダー内の要素 */
.user-stats {
  position: relative; /* 猫コインの数値を重ねるための基準 */
  display: flex;
  flex-direction: column;
  align-items: flex-start; /* 左寄せにする */
  gap: 2px;
}


.top-controls {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
}

.top-controls-group {
  display: flex;
  align-items: center;
  gap: 10px;
}



.language-selector {
  display: flex;
  gap: 8px;
}

.language-flag {
  width: 22px;
  height: 20px;
  padding-bottom: 2px;
  cursor: pointer;
  border-radius: 4px;
  transition: opacity 0.2s ease-in-out;
  background-size: cover;
}
.language-flag-ja { background-image: url('https://twemoji.maxcdn.com/v/latest/svg/1f1ef-1f1f5.svg'); }
.language-flag-en { background-image: url('https://twemoji.maxcdn.com/v/latest/svg/1f1fa-1f1f8.svg'); }
.language-flag:not(.selected) { opacity: 0.5; }
.language-flag.selected { opacity: 1; }

.settings-button {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}
.settings-button-image {
  width: 18px;
  height: 18px;
}

/* フッター内の要素 */
.x-account a {
  color: #126fa8;
  text-decoration: none;
}
.x-account a:hover { text-decoration: underline; }
.version-info { margin-top: 2px; }



.audio-button {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}
.audio-button-image {
  width: 16px;
  height: 16px;
  padding-right: 1px;
}

.top-controls-wrapper {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.volume-slider-container {
  margin-top: 8px;
  width: 80px;
  display: flex;
  align-items: center;
  gap: 5px;
  touch-action: auto; /* スマホでのスライダー操作を有効にする */
  justify-content: flex-end; /* スマホ表示時にボタンを右寄せにする */
}
.volume-slider {
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  height: 5px;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 5px;
  outline: none;
  opacity: 0.9;
  transition: opacity .2s;
}
.volume-slider:hover {
  opacity: 1;
}
.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  background: #ffffff;
  border: 1px solid #ccc;
  border-radius: 50%;
  cursor: pointer;
}
.volume-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 50%;
  cursor: pointer;
}

.board-image {
  width: 90px;
  height: auto;
}

.rating-badge-image {
  position: absolute;
  width: 55px;
  height: auto;
  top: 2px;
  right: -52px;
}

.rating-number-on-board {
  position: absolute;
  top: 6px; /* 猫コインより上に配置 */
  right: 12px;
  font-family: 'Yuji Syuku', serif;
  font-size: 13px;
  color: rgb(255, 255, 255);
  text-shadow: 3px 3px 3px #5a3b22;
}

.cat-coins-number-on-board {
  position: absolute;
  top: 37px;
  right: 12px;
  font-family: 'Yuji Syuku', serif;
  font-size: 13px;
  color: rgb(255, 255, 255);
  text-shadow: 3px 3px 3px #5a3b22;
}
</style>