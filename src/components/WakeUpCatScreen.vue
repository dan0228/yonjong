<template>
  <div class="wake-up-screen-overlay">
    <div
      class="content-container"
      :class="{ 'clickable-area': isSleeping }"
      @click="wakeUp"
    >
      <img
        :src="currentGifSrc"
        alt="Cat"
        class="cat-gif"
        @load="onImageLoad"
      >
      
      <span 
        v-if="isSleeping && isImageLoaded" 
        :class="{ invisible: !isSleeping }" 
        class="wake-up-text"
      >
        {{ $t('wakeUpCat.button') }}
      </span>
      <span 
        v-if="isSleeping && isImageLoaded" 
        class="loading-text"
      >
        Loading...
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, defineEmits } from 'vue';

import { useAudioStore } from '@/stores/audioStore';



const emit = defineEmits(['finished']);

const audioStore = useAudioStore();

const isSleeping = ref(true);
const wakeupTimestamp = ref(null);
const isImageLoaded = ref(false); // 画像の読み込みが完了したかどうかを追跡

const currentGifSrc = computed(() => {
  if (isSleeping.value) {
    return '/assets/images/back/sleeping.gif';
  }
  if (wakeupTimestamp.value) {
    return `/assets/images/back/wakeup.gif?t=${wakeupTimestamp.value}`;
  }
  return ''; // Should not happen
});

// 画像が読み込まれたときに呼び出される
const onImageLoad = () => {
  isImageLoaded.value = true;
};

const wakeUp = () => {
  // すでに猫が起きている（isSleepingがfalse）場合は、何もしない
  if (!isSleeping.value) {
    return;
  }

  // ★変更: BGMの再生を許可し、遅延再生を準備する
  audioStore.setBgmPlaybackAllowed(true);
  audioStore.prepareDelayedBgm('NES-JP-A01-2(Title-Loop115).mp3');

  isSleeping.value = false;
  wakeupTimestamp.value = Date.now();
  
  // 効果音を再生
  audioStore.playSound('Xylophone04-05(Fast-Long-3-Up).mp3');

  // GIFの再生時間後に 'finished' イベントを発行
  setTimeout(() => {
    emit('finished');
  }, 3100);
};
</script>

<style scoped>
.wake-up-screen-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: #000;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9998; /* ローディング画面の直下 */
}

.content-container {
  position: relative; /* テキストの絶対配置の基準 */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.content-container.clickable-area {
  cursor: pointer;
}

.cat-gif {
  max-width: 90vw;
  max-height: 70vh;
  border-radius: 10px;
}

.wake-up-text { /* ボタンからテキスト表示に変更 */
  position: absolute; /* 画像の右下に配置 */
  bottom: 58%; /* 調整可能 */
  right: 17%; /* 調整可能 */
  color: #F5F5DC; /* 薄いベージュ色 */
  font-size: 2.6em; /* 大きめのフォントサイズ */
  font-family: "Yomogi", cursive;
  text-shadow: 
    0 0 5px rgba(255, 255, 255, 0.5), /* Soft glow */
    1px 1px 0 #4a2c12, -1px -1px 0 #4a2c12, 1px -1px 0 #4a2c12, -1px 1px 0 #4a2c12;
  transition: opacity 0.3s ease-out; /* フェードアウト用 */
  transform: rotate(-5deg); /* 弧を描くような効果 */
  transform-origin: bottom center; /* 回転の中心 */
  animation: slow-blink 3s infinite alternate, breathe-vertical 4s infinite ease-in-out; /* 点滅と上下移動アニメーション */
  pointer-events: none; /* クリックイベントは親コンテナで処理 */
}

.wake-up-text.invisible {
  opacity: 0;
  pointer-events: none;
}

@keyframes slow-blink {
  0% { opacity: 0.3; } /* ほとんど透明から開始 */
  50% { opacity: 1; }  /* 完全に見える状態 */
  100% { opacity: 0.3; } /* ほとんど透明に戻る */
}

@keyframes breathe-vertical {
  0% { transform: translateY(0) rotate(-5deg); } /* 開始位置 */
  50% { transform: translateY(-5px) rotate(-5deg); } /* 上にわずかに移動 */
  100% { transform: translateY(0) rotate(-5deg); } /* 開始位置に戻る */
}

.loading-text {
  position: absolute;
  bottom: 8px; /* 画面下からの距離 */
  right: 10px; /* 画面右からの距離 */
  color: #F5F5DC; /* 薄いベージュ色 */
  font-size: 1.3em; /* 小さめのフォントサイズ */
  font-family: "Yomogi", cursive;
  text-shadow: 
    0 0 3px rgba(255, 255, 255, 0.3), /* Soft glow */
    1px 1px 0 #4a2c12; /* 影 */
  pointer-events: none; /* クリックイベントを無効化 */
  animation: slow-blink 3s infinite alternate; /* 点滅アニメーション */
}
</style>