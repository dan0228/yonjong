<template>
  <div class="wake-up-screen-overlay">
    <div
      class="content-container"
      :class="{ 'clickable-area': canWakeUp }"
      @click="wakeUp"
    >
      <img
        :src="currentGifSrc"
        alt="Cat"
        class="cat-gif"
        @load="onImageLoad"
      >
      
      <span 
        v-if="isSleeping && canWakeUp" 
        class="wake-up-text"
      >
        {{ $t('wakeUpCat.button') }}
      </span>
      <span 
        v-if="isSleeping" 
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
import { useGameStore } from '@/stores/gameStore';

const emit = defineEmits(['finished']);

const audioStore = useAudioStore();
const gameStore = useGameStore();

const isSleeping = ref(true);
const wakeupTimestamp = ref(null);
const isImageLoaded = ref(false);

const canWakeUp = computed(() => isImageLoaded.value && !gameStore.isInitialAssetsLoading);

const currentGifSrc = computed(() => {
  if (isSleeping.value) {
    return '/assets/images/back/sleeping.gif';
  }
  if (wakeupTimestamp.value) {
    return `/assets/images/back/wakeup.gif?t=${wakeupTimestamp.value}`;
  }
  return '';
});

const onImageLoad = () => {
  isImageLoaded.value = true;
};

const wakeUp = () => {
  if (!canWakeUp.value || !isSleeping.value) {
    return;
  }

  // Stage 2: Start loading core assets in the background
  gameStore.loadCoreAssets();

  audioStore.setBgmPlaybackAllowed(true);
  audioStore.prepareDelayedBgm('NES-JP-A01-2(Title-Loop115).mp3');

  isSleeping.value = false;
  wakeupTimestamp.value = Date.now();
  
  audioStore.playSound('Xylophone04-05(Fast-Long-3-Up).mp3');

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
  z-index: 9998;
}

.content-container {
  position: relative;
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

.wake-up-text {
  position: absolute;
  bottom: 58%;
  right: 17%;
  color: #F5F5DC;
  font-size: 2.6em;
  font-family: "Yomogi", cursive;
  text-shadow: 
    0 0 5px rgba(255, 255, 255, 0.5),
    1px 1px 0 #4a2c12, -1px -1px 0 #4a2c12, 1px -1px 0 #4a2c12, -1px 1px 0 #4a2c12;
  transition: opacity 0.3s ease-out;
  transform: rotate(-5deg);
  transform-origin: bottom center;
  animation: slow-blink 3s infinite alternate, breathe-vertical 4s infinite ease-in-out;
  pointer-events: none;
}

@keyframes slow-blink {
  0% { opacity: 0.3; }
  50% { opacity: 1; }
  100% { opacity: 0.3; }
}

@keyframes breathe-vertical {
  0% { transform: translateY(0) rotate(-5deg); }
  50% { transform: translateY(-5px) rotate(-5deg); }
  100% { transform: translateY(0) rotate(-5deg); }
}

.loading-text {
  position: absolute;
  bottom: 8px;
  right: 10px;
  color: #F5F5DC;
  font-size: 1.3em;
  font-family: "Yomogi", cursive;
  text-shadow: 
    0 0 3px rgba(255, 255, 255, 0.3),
    1px 1px 0 #4a2c12;
  pointer-events: none;
  animation: slow-blink 3s infinite alternate;
}
</style>
