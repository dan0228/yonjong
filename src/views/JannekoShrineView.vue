<template>
  <div
    class="shrine-view-container"
    :style="{ height: viewportHeight }"
  >
    <div
      ref="sakuraContainer"
      class="sakura-container"
    >
      <img
        v-for="petal in petals"
        :key="petal.id"
        class="sakura-petal"
        :src="petal.src"
        :style="petal.style"
      >
    </div>
    <div
      class="shrine-screen"
      :style="scalerStyle"
    >
      <div class="user-stats">
        <img
          :src="boardImageSrc"
          alt="Board"
          class="board-image"
        >
        <span class="rating-number-on-board">{{ userStore.profile?.rating ?? 1500 }}</span>
        <span class="cat-coins-number-on-board">{{ userStore.profile?.cat_coins || 0 }}</span>
      </div>
      <div class="top-controls">
        <button
          class="back-button"
          @click="goToTitle"
        >
          <img
            src="/assets/images/button/buckToTitle.png"
            :alt="$t('shrineView.backToTitle')"
          >
        </button>
      </div>

      <button
        class="omikuji-button"
        @click="drawOmikuji"
      >
        {{ $t('shrineView.omikujiButton.line1') }}<br>
        <span class="coin-text">
          <template v-if="userStore.profile?.daily_free_omikuji_count > 0">
            {{ $t('shrineView.omikujiButton.freeDrawText', { count: userStore.profile.daily_free_omikuji_count }) }}
          </template>
          <template v-else>
            {{ $t('shrineView.omikujiButton.line2') }}
          </template>
        </span>
      </button>
      <div class="omikuji-board-wrapper">
        <div class="sayings-container">
          <table class="sayings-table">
            <tbody>
              <tr
                v-for="(saying, index) in sayings"
                :key="saying.id"
              >
                <td class="saying-no">
                  {{ $t('shrineView.sayingNo', { n: index + 1 }) }}
                </td>
                <td class="saying-text">
                  {{ revealedSayings[saying.id] ? saying.text : $t('shrineView.unknownSaying') }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <transition name="fade">
        <SayingPopup
          v-if="showPopup"
          :fortune="randomFortune"
          :saying="randomSaying"
          :saying-id="randomSayingId"
          :is-new="isNewSaying"
          @close="closePopup"
        />
      </transition>

      <div :class="{ 'fade-overlay': true, 'is-fading': isFading }" />

      <!-- 収集率カウンター -->
      <div class="collection-rate-counter">
        {{ collectionRateText }}
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * じゃん猫神社コンポーネント。
 * 猫コインを消費しておみくじを引き、ありがたいお言葉（名言）を集めることができます。
 * 引いたお言葉は解放され、一覧で確認できるようになります。
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAudioStore } from '../stores/audioStore';
import { useUserStore } from '@/stores/userStore';
import SayingPopup from '@/components/SayingPopup.vue';
import { useViewportHeight } from '@/composables/useViewportHeight';

// --- リアクティブな状態とストア ---
let petalId = 0;
const petals = ref([]);
let animationIntervalId = null;
const { t, tm, locale } = useI18n();
const { viewportHeight } = useViewportHeight();
const router = useRouter();
const audioStore = useAudioStore();
const userStore = useUserStore();

// ポップアップ関連の状態
const showPopup = ref(false);
const randomFortune = ref('');
const randomSaying = ref('');
const randomSayingId = ref(null);
const isNewSaying = ref(false);
const isFading = ref(false);


// --- 算出プロパティ ---
const revealedSayings = computed(() => userStore.profile?.revealed_sayings || {});
const sayings = computed(() => {
  const sayingMessages = tm('shrineView.sayings');
  return Object.keys(sayingMessages).map(key => ({ id: key, text: sayingMessages[key] }));
});
const fortunes = computed(() => tm('shrineView.fortunes'));
const boardImageSrc = computed(() =>
  locale.value === 'en'
    ? '/assets/images/info/board_en.png'
    : '/assets/images/info/board.png'
);

const totalSayingsCount = computed(() => {
  return sayings.value.length;
});

const collectedSayingsCount = computed(() => {
  return Object.keys(revealedSayings.value).length;
});

const collectionRateText = computed(() => {
  return `${collectedSayingsCount.value}/${totalSayingsCount.value}`;
});

// --- 桜アニメーションのロジック ---
const sakuraImages = [
  '/assets/images/back/sakura1.png', '/assets/images/back/sakura2.png',
  '/assets/images/back/sakura3.png', '/assets/images/back/sakura4.png',
  '/assets/images/back/sakura5.png', '/assets/images/back/sakura6.png',
  '/assets/images/back/sakura7.png'
];

function createSakuraPetal() {
  const id = petalId++;
  const fallDuration = Math.random() * 5 + 8; // 8〜13秒

  petals.value.push({
    id: id,
    src: sakuraImages[Math.floor(Math.random() * sakuraImages.length)],
    style: {
      left: Math.random() * 120 + 'vw',
      width: `${Math.random() * 10 + 15}px`,
      animationDuration: `${fallDuration}s`,
      '--drift': (Math.random() * 220 - 50) + 'px',
    }
  });

  // アニメーション時間後に配列から削除
  setTimeout(() => {
    const index = petals.value.findIndex(p => p.id === id);
    if (index !== -1) {
      petals.value.splice(index, 1);
    }
  }, fallDuration * 1000 + 1000); // 1秒のバッファ
}


// --- メソッド ---
const drawOmikuji = async () => {
  if (!userStore.profile) {
    await userStore.fetchUserProfile();
    if (!userStore.profile) {
      console.error('ユーザープロファイルが読み込めませんでした。');
      return;
    }
  }
  let isFreeDraw = userStore.profile.daily_free_omikuji_count > 0;
  let cost = 100;
  if (!isFreeDraw && userStore.profile.cat_coins < cost) {
    randomFortune.value = '';
    randomSaying.value = t('shrineView.errors.notEnoughCoins');
    randomSayingId.value = null;
    isNewSaying.value = false;
    showPopup.value = true;
    return;
  }
  // previousBgm.value = audioStore.currentBgm; // BGM停止処理を削除するため不要
  // audioStore.setBgm(null); // BGM停止処理を削除
  audioStore.playSound('Kagura_Suzu01-7.mp3'); // 効果音は再生
  isFading.value = true;
  try {
    let updatePromise = isFreeDraw
      ? userStore.updateOmikujiDrawInfo({
          daily_free_omikuji_count: userStore.profile.daily_free_omikuji_count - 1,
          last_omikuji_draw_date: new Date().toISOString().slice(0, 10)
        }, { showLoading: false })
      : userStore.updateCatCoins(-cost, { showLoading: false });
    await new Promise(resolve => setTimeout(resolve, 1500));
    await updatePromise;
    const fortuneValues = Object.values(fortunes.value);
    randomFortune.value = fortuneValues[Math.floor(Math.random() * fortuneValues.length)];
    const sayingsList = sayings.value;
    const randomIndex = Math.floor(Math.random() * sayingsList.length);
    const drawnSaying = sayingsList[randomIndex];
    randomSaying.value = drawnSaying.text;
    randomSayingId.value = drawnSaying.id;
    isNewSaying.value = !revealedSayings.value[drawnSaying.id];
    if (isNewSaying.value) {
      await userStore.updateRevealedSaying(drawnSaying.id, { showLoading: false });
    }
    showPopup.value = true;
    isFading.value = false;
  } catch (error) {
    console.error('おみくじ処理中にエラー:', error);
    randomFortune.value = '';
    randomSaying.value = t('shrineView.errors.failedToSpend');
    randomSayingId.value = null;
    isNewSaying.value = false;
    showPopup.value = true;
    isFading.value = false;
    // if (previousBgm.value) { // BGM停止処理を削除したため不要
    //   audioStore.setBgm(previousBgm.value);
    // }
  }
};
const closePopup = () => {
  showPopup.value = false;
  // if (previousBgm.value) { // BGM停止処理を削除したため不要
  //   audioStore.setBgm(previousBgm.value);
  //   previousBgm.value = null;
  // }
};
const goToTitle = () => {
  router.push({ name: 'Title' });
};

// --- 画面のスケーリング処理 ---
const DESIGN_WIDTH = 360;
const DESIGN_HEIGHT = 640;
const scaleFactor = ref(1);
const scalerStyle = computed(() => ({
  transform: `translate(-50%, -50%) scale(${scaleFactor.value})`
}));
const updateScaleFactor = () => {
  const currentWidth = window.innerWidth;
  const currentHeight = window.innerHeight;
  const scaleX = currentWidth / DESIGN_WIDTH;
  const scaleY = currentHeight / DESIGN_HEIGHT;
  scaleFactor.value = Math.min(scaleX, scaleY);
};

// --- ライフサイクルフック ---
onMounted(async () => {
  updateScaleFactor();
  window.addEventListener('resize', updateScaleFactor);
  if (!userStore.profile) {
    await userStore.fetchUserProfile();
  }
  await userStore.checkAndResetOmikujiCount();
  audioStore.setBgm('GB-JP-A02-2(Menu-Loop105).mp3');
  animationIntervalId = setInterval(createSakuraPetal, 2500); // 2.5秒ごとに花びらを生成
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', updateScaleFactor);
  audioStore.setBgm(null);
  if (animationIntervalId) {
    clearInterval(animationIntervalId);
  }
});
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Yuji+Syuku&display=swap');
@import url('https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;700&display=swap');

.shrine-view-container {
  position: relative;
  width: 100vw;
  /* height: 100vh; */ /* 動的な高さ指定に置き換え */
  background-image: url('/assets/images/back/back_out_shrine.png');
  background-size: auto 100%;
  background-position: center;
  background-repeat: no-repeat;
  transform-origin: center 85%; /* 回転の中心を下寄りに設定 */
}

.shrine-screen {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 360px;
  height: 640px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding-top: 80px;
  text-align: center;
  font-family: 'M PLUS Rounded 1c', 'Helvetica Neue', Arial, sans-serif;
  overflow: hidden;
  box-sizing: border-box;
  background: transparent;
}

.omikuji-button {
  background-image: url('/assets/images/button/omikuji_button.png');
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  background-color: transparent;
  border: none;
  box-shadow: none;
  width: 260px;
  height: 110px;
  padding-top: 6px;
  font-size: 1.3rem;
  font-family: 'Yuji Syuku', serif;
  text-shadow: 3px 3px 3px rgba(255, 255, 255, 0.9);
  line-height: 1;
  cursor: pointer;
  margin-top: 280px;
  margin-bottom: -305px;
  margin-right: 78px;
  transition: all 0.2s ease;
  z-index: 10;
  filter: drop-shadow(0 0 10px rgba(255, 255, 255, 1));
  color: #4a2c1a; /* 明示的に色を設定 */
}

.omikuji-button .coin-text {
  font-size: 0.7em;
}

.omikuji-button:hover {
  transform: translateY(-4px);
}

.omikuji-board-wrapper {
  position: relative;
  top: 10px;
  height: 220px;
  width: 100%;
  margin-top: auto;
  margin-bottom: -5px;
  background-image: url('/assets/images/back/omikuji_board.png');
  background-size: 100% 100%;
  background-repeat: no-repeat;
}

.sayings-container {
  position: absolute;
  top: 15%;
  left: 50%;
  transform: translateX(-50%);
  height: 65%;
  width: 90%;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 0 5px;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
}

.sayings-table {
  width: 278px;
  height: 100px;
  margin-left: 20px;
  border-collapse: collapse;
}

.sayings-table td {
  padding: 4px;
  border-bottom: 1px solid #7e0c0c;
}

.saying-no {
  width: 50px;
  font-size: 0.6rem;
  font-family: 'Yuji Syuku', serif;
  font-weight: bold;
  color: hsl(0, 0%, 0%);
  text-align: left;
  padding-right: 10px;
}

.saying-text {
  font-family: 'Yuji Syuku', serif;
  font-size: 0.7rem;
  font-weight: bold;
  text-align: left;
  color: hsl(0, 0%, 0%);
}

.user-stats {
  position: absolute;
  top: 5px;
  left: 0px;
  z-index: 10;
}

.board-image {
  width: 90px;
  height: auto;
  filter: drop-shadow(0 0 10px rgba(255, 255, 255, 1));
  opacity: 0.9;
}

.rating-number-on-board {
  position: absolute;
  top: 5px; /* 猫コインより上に配置 */
  right: 12px;
  font-family: 'Yuji Syuku', serif;
  font-size: 13px;
  color: rgb(255, 255, 255);
  text-shadow: 3px 3px 3px #000000;
}

.cat-coins-number-on-board {
  position: absolute;
  top: 37px;
  right: 12px;
  font-family: 'Yuji Syuku', serif;
  font-size: 13px;
  color: rgb(255, 255, 255);
  text-shadow: 3px 3px 3px #000000;
}

.top-controls {
  /* ボタンを独立して配置したため、このコンテナは現在空 */
  position: absolute;
  top: 10px;
  right: 15px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  z-index: 10;
  scale: 0.9;
  gap: 10px;
  margin-top: -14px; 
}

.back-button {
  position: absolute;
  bottom: -515px; /* 画面下からの位置 */
  right: -12px;  /* 画面右からの位置 */
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  z-index: 20;
}

.back-button img {
  width: 100px; /* サイズを調整 */
  height: auto;
  filter: drop-shadow(0 0 5px rgba(0, 0, 0, 0.5)); /* 影を調整 */
  transition: all 0.2s ease;
}

.back-button:hover img {
  transform: translateY(-4px);
}

.fade-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: white;
  opacity: 0;
  visibility: hidden;
  transition: opacity 1.5s ease-in-out, visibility 1.5s ease-in-out;
  z-index: 999;
}

.fade-overlay.is-fading {
  opacity: 1;
  visibility: visible;
}

.fade-leave-active {
  transition-duration: 0.2s;
}

.collection-rate-counter {
  position: absolute;
  bottom: -3px;
  right: 30px;
  font-family: 'Yuji Syuku', serif;
  font-size: 0.5em;
  color: #e0e0e0; /* Dark brown color */
  text-shadow: 1px 1px 2px rgba(54, 54, 54, 0.7);
  padding: 5px 10px;
  z-index: 10;
  pointer-events: none; /* クリックイベントを無効化 */
}

/* Webkit系ブラウザ用のスクロールバースタイル */
.sayings-container::-webkit-scrollbar {
  width: 5px;
}

.sayings-container::-webkit-scrollbar-track {
  background: transparent;
}

.sayings-container::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 10px;
}

/* 桜のアニメーション */
.sakura-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  /* overflow: hidden; を削除して、花びらが画面外にはみ出るのを許可 */
  pointer-events: none;
  z-index: 20; /* 他のUI(z-index: 10)より手前に設定 */
}

.sakura-petal {
  position: absolute;
  top: -5%;
  pointer-events: none;
  will-change: top, transform, opacity;
  animation-name: fall;
  animation-timing-function: linear;
  animation-iteration-count: 1;
  animation-fill-mode: forwards;
}

@keyframes fall {
  0% {
    transform: translateX(0px) rotateZ(0deg);
    opacity: 0;
  }
  10% {
    opacity: 1;
  }
  25% {
    transform: translateX(var(--drift)) rotateZ(90deg);
  }
  50% {
    transform: translateX(calc(var(--drift) * -0.2)) rotateZ(270deg);
  }
  75% {
    transform: translateX(calc(var(--drift) * 0.7)) rotateZ(450deg);
  }
  100% {
    transform: translateX(var(--drift)) rotateZ(720deg);
    top: 105%;
    opacity: 1;
  }
}
</style>