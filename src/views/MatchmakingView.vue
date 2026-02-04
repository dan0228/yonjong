<template>
  <div
    class="matchmaking-container"
    :style="{ height: viewportHeight }"
  >
    <!-- スケーリングされるコンテンツのラッパー -->
    <div
      class="scaler"
      :style="scalerStyle"
    >
      <!-- 透明なコンテンツラッパー -->
      <div class="content-wrapper">
        <!-- ユーザー情報 -->
        <div class="user-stats">
          <img
            :src="boardImageSrc"
            alt="Board"
            class="board-image"
          >
          <span class="rating-number-on-board">{{ userStore.profile?.rating ?? 1500 }}</span>
          <span class="cat-coins-number-on-board">{{ userStore.profile?.cat_coins || 0 }}</span>
        </div>

        <!-- タイトルへ戻るボタン -->
        <div class="top-controls">
          <button
            class="back-button"
            @click="goToTitle"
          >
            <img
              src="/assets/images/button/buckToTitle.png"
              alt="タイトルへ戻る"
            >
          </button>
        </div>

        <!-- 煙アニメーションのコンテナ -->
        <div class="smoke-container">
          <img
            v-for="i in 10"
            :key="i"
            src="/assets/images/back/smoke.png"
            class="smoke-particle"
            :style="{ '--i': i }"
          >
        </div>

        <!-- 火の粉アニメーションのコンテナ -->
        <div class="fire-container">
          <div
            v-for="i in 20"
            :key="i"
            class="fire-particle"
            :style="fireParticleStyles[i-1]"
          />
        </div>

        <div class="status-box">
          <h1 class="status-text">
            {{ statusText }}
            <span
              v-if="showCountdown"
              class="countdown-number"
            >{{ countdown }}</span>
          </h1>
        </div>
        
        <!-- プレイヤー表示エリア -->
        <div 
          v-for="(slot, index) in displaySlots"
          :key="slot.key"
          :class="['player-slot', `slot-${index + 1}`]"
        >
          <!-- プレイヤーがいる場合 -->
          <template v-if="!slot.isWaiting">
            <img 
              :src="slot.player.avatar_url || '/assets/images/info/hito_icon_1.png'" 
              alt="Player Avatar" 
              class="player-avatar"
              @click="openPlayerInfoPopup(slot.player)"
            >
            <span class="player-name">{{ slot.player.username }}</span>
          </template>
          <!-- 待機中の場合 -->
          <template v-else>
            <div class="waiting-indicator">
              ?
            </div>
          </template>
        </div>

        <!-- プレイヤー情報ポップアップ -->
        <PlayerInfoPopup 
          :show="showPlayerInfoPopup" 
          :player="selectedPlayer" 
          @close="closePlayerInfoPopup" 
        />

        <!-- ★修正: 吹き出しを絶対座標で配置 -->
        <div
          v-if="playerInSlot1 && gameStore.chatBubbles[playerInSlot1.id]"
          :key="gameStore.chatBubbles[playerInSlot1.id].key"
          class="chat-bubble bubble-slot-1"
          :style="{ zIndex: getBubbleZIndex(playerInSlot1.id) }"
        >
          {{ getChatMessageById(gameStore.chatBubbles[playerInSlot1.id].messageId) }}
        </div>
        <div
          v-if="playerInSlot2 && gameStore.chatBubbles[playerInSlot2.id]"
          :key="gameStore.chatBubbles[playerInSlot2.id].key"
          class="chat-bubble bubble-slot-2"
          :style="{ zIndex: getBubbleZIndex(playerInSlot2.id) }"
        >
          {{ getChatMessageById(gameStore.chatBubbles[playerInSlot2.id].messageId) }}
        </div>
        <div
          v-if="playerInSlot3 && gameStore.chatBubbles[playerInSlot3.id]"
          :key="gameStore.chatBubbles[playerInSlot3.id].key"
          class="chat-bubble bubble-slot-3"
          :style="{ zIndex: getBubbleZIndex(playerInSlot3.id) }"
        >
          {{ getChatMessageById(gameStore.chatBubbles[playerInSlot3.id].messageId) }}
        </div>
        <div
          v-if="playerInSlot4 && gameStore.chatBubbles[playerInSlot4.id]"
          :key="gameStore.chatBubbles[playerInSlot4.id].key"
          class="chat-bubble bubble-slot-4"
          :style="{ zIndex: getBubbleZIndex(playerInSlot4.id) }"
        >
          {{ getChatMessageById(gameStore.chatBubbles[playerInSlot4.id].messageId) }}
        </div>

        <!-- チャット入力エリア -->
        <div class="chat-plank-container">
          <div
            v-for="chat in chatMessages"
            :key="chat.id"
            class="chat-plank"
            @click="sendChat(chat.id)"
          >
            <span class="chat-text">{{ chat.text }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/stores/userStore';
import { useGameStore } from '@/stores/gameStore';
import { useAudioStore } from '@/stores/audioStore';
import { useViewportHeight } from '@/composables/useViewportHeight';

import PlayerInfoPopup from '@/components/PlayerInfoPopup.vue';

const { t, locale } = useI18n();
const userStore = useUserStore();
const gameStore = useGameStore();
const audioStore = useAudioStore();
const router = useRouter();
const { viewportHeight } = useViewportHeight();

// --- チャット機能関連の定義 ---
const chatMessages = computed(() => [
  { id: 1, text: t('chat.1') }, { id: 2, text: t('chat.2') }, { id: 3, text: t('chat.3') },
  { id: 4, text: t('chat.4') }, { id: 5, text: t('chat.5') }, { id: 6, text: t('chat.6') },
  { id: 7, text: t('chat.7') }, { id: 8, text: t('chat.8') }, { id: 9, text: t('chat.9') },
  { id: 10, text: t('chat.10') }, { id: 11, text: t('chat.11') }, { id: 12, text: t('chat.12') }
]);

const sendChat = (messageId) => {
  gameStore.sendChatMessage(messageId);
};

const getChatMessageById = (id) => {
  const message = chatMessages.value.find(m => m.id === id);
  return message ? message.text : '';
};

// ★z-indexを動的に計算するメソッド
const getBubbleZIndex = (playerId) => {
  return gameStore.lastChattedPlayerId === playerId ? 201 : 200;
};

// --- レスポンシブデザインのためのスケーリング ---
const scaleFactor = ref(1);
const scalerStyle = computed(() => ({
  transform: `translate(-50%, -50%) scale(${scaleFactor.value})`,
}));

const updateScaleFactor = () => {
  const viewportHeightValue = parseInt(viewportHeight.value, 10);
  const viewportWidth = window.innerWidth;
  const scaleHeight = viewportHeightValue / 640;
  const scaleWidth = viewportWidth / 360;
  scaleFactor.value = Math.min(scaleHeight, scaleWidth);
};


// --- ポップアップ関連 ---
const showPlayerInfoPopup = ref(false);
const selectedPlayer = ref(null);

const openPlayerInfoPopup = (player) => {
  if (!player) return;
  selectedPlayer.value = player;
  showPlayerInfoPopup.value = true;
};

const closePlayerInfoPopup = () => {
  showPlayerInfoPopup.value = false;
};

const goToTitle = () => {
  gameStore.disconnectOnlineGame(); // ゲームストアの切断処理を呼び出す
  router.push({ name: 'Title' });
};

// --- マッチングロジック ---
// 4つの表示スロットを管理するためのcomputed property
const displaySlots = computed(() => {
  const slots = [];
  const players = gameStore.players || [];
  const totalSlots = 4;

  for (let i = 0; i < totalSlots; i++) {
    if (i < players.length) {
      const player = players[i];
      slots.push({
        isWaiting: !player.avatar_url, // avatar_url がない場合は待機中とみなす
        player: player,
        key: player.id
      });
    } else {
      // 参加者がいない空きスロット
      slots.push({
        isWaiting: true,
        player: null,
        key: `waiting-${i}`
      });
    }
  }
  return slots;
});

// ★修正: 各スロットのプレイヤー情報を個別に取得するcomputedプロパティ
const playerInSlot1 = computed(() => displaySlots.value[0]?.player);
const playerInSlot2 = computed(() => displaySlots.value[1]?.player);
const playerInSlot3 = computed(() => displaySlots.value[2]?.player);
const playerInSlot4 = computed(() => displaySlots.value[3]?.player);


// statusKey のロジックを調整
const statusKey = computed(() => {
  if (gameStore.isGameReady) {
    return 'ready';
  }
  // gameStore.onlineGameId が設定されていればマッチング中
  if (gameStore.onlineGameId) {
    return 'searching';
  }
  return 'searching'; // 初期状態
});

const statusText = computed(() => {
    const baseText = t(`matchmaking.status.${statusKey.value}`);
    if (gameStore.onlineGameId && !gameStore.isGameReady) {
        const playerCount = gameStore.players?.length || 0;
        return `${baseText} (${playerCount} / 4)`;
    }
    return baseText;
});
const countdown = ref(3); // カウントダウンの初期値は3のまま
const showCountdown = ref(false);
let countdownInterval = null;

const startFinalSequence = () => {
  // 全員が揃ってから1秒待ってから「準備完了！」と表示し、カウントダウンを開始
  setTimeout(() => {
    // statusKey.value = 'ready'; // computed に変更したので不要
    showCountdown.value = true;

    countdownInterval = setInterval(() => {
      countdown.value--;
      if (countdown.value === 0) {
        clearInterval(countdownInterval);
        router.push('/game');
      }
    }, 1000);
  }, 1000); // 1秒の遅延
};

// ★修正: プレイヤー人数が増えたら効果音を鳴らす
watch(() => gameStore.players?.length, (newLength, oldLength) => {
  if (oldLength !== undefined && newLength > oldLength) {
    audioStore.playSound('Hyoshigi01-1.mp3');
  }
});

// gameStore.isGameReady の変更を監視
watch(() => gameStore.isGameReady, (newVal) => {
  if (newVal) {
    startFinalSequence();
  }
});

// --- UI関連の動的プロパティ ---
const boardImageSrc = computed(() =>
  locale.value === 'en'
    ? '/assets/images/info/board_en.png'
    : '/assets/images/info/board.png'
);

const fireParticleStyles = ref([]);
const generateFireParticleStyles = () => {
  fireParticleStyles.value = Array.from({ length: 20 }, () => ({
    left: `${Math.random() * 100}%`,
    animationDelay: `${Math.random() * 4}s`,
    animationDuration: `${2 + Math.random() * 3}s`,
  }));
};


onMounted(() => {
  updateScaleFactor();
  window.addEventListener('resize', updateScaleFactor);
  generateFireParticleStyles();
  // マッチング要求を開始
  gameStore.requestMatchmaking();
  // ★修正: 入室時に効果音を再生
  audioStore.playSound('Hyoshigi01-1.mp3');
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateScaleFactor);
  clearInterval(countdownInterval); // コンポーネント離脱時にタイマーをクリア
  // マッチング中に画面を離れた場合、サーバーにマッチングキャンセルを通知する処理が必要になる可能性あり
  // gameStore.cancelMatchmaking(); // 必要に応じて実装
});
</script>

<style scoped>
/* (Previous styles remain the same) */
.matchmaking-container {
  width: 100vw;
  /* height: 100vh; */ /* 削除 */
  background-image: url('/assets/images/back/matching.png');
  background-size: cover;
  background-position: center;
  position: relative;
  overflow: hidden;
  font-family: 'Yuji Syuku', serif;
}
.scaler {
  position: absolute;
  top: 47%; /* 50%から47%に変更 */
  left: 50%;
  width: 360px;
  height: 640px;
  transform-origin: center center;
}
.content-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  background: transparent; 
  overflow: hidden;
}
.user-stats {
  position: absolute;
  top: 20px; /* 10pxから20pxに変更 */
  left: 10px;
  z-index: 20;
}
.board-image {
  width: 90px;
  height: auto;
}
.rating-number-on-board {
  position: absolute;
  top: 6px;
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
.top-controls {
  position: absolute;
  top: 20px; /* 10pxから20pxに変更 */
  right: 10px;
  z-index: 20;
}

.back-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  z-index: 20;
}

.back-button img {
  width: 62px;
  height: auto;
  filter: drop-shadow(0 0 3px rgba(0, 0, 0, 0.8));
  transition: all 0.2s ease;
}

.back-button:hover img {
  transform: translateY(-4px);
}
.status-box {
  position: absolute;
  top: 190px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 40px;
  border-radius: 10px;
  z-index: 5;
  /* display: flex; */ /* 削除 */
  /* flex-direction: column; */ /* 削除 */
  align-items: center;
  /* gap: 5px; */ /* 削除 */
}
.status-text {
  color: white;
  font-size: 18px;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.9);
  white-space: nowrap;
  display: flex; /* 追加 */
  align-items: baseline; /* 追加 */
  gap: 5px; /* 追加 */
}
.countdown-number { /* 新しいクラスのスタイル */
  color: white;
  font-size: 24px; /* 少し大きくする */
  text-shadow: 1px 1px 3px rgba(0, 0, 0, 1);
  font-weight: bold;
}
.player-slot {
  position: absolute;
  z-index: 100; /* 他の要素より確実に手前に表示 */
  margin-left: -20px;
  margin-top: -30px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  animation: bounceIn 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
  opacity: 0;
}

@keyframes bounceIn {
  0% {
    opacity: 0;
    transform: scale(0.5);
  }
  70% {
    opacity: 1;
    transform: scale(1.1);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}
.player-slot::after {
  content: '';
  position: absolute;
  bottom: -5px;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  height: 18px;
  background-color: rgba(0, 0, 0, 0.95);
  border-radius: 50%;
  filter: blur(4px);
  z-index: -1;
}
.player-avatar {
  width: 100%;
  aspect-ratio: 1 / 1; /* アスペクト比を1:1に固定 */
  border-radius: 50%;
  border: 1px solid rgb(41, 2, 2);
  box-shadow: 0 0 15px rgba(255, 255, 255, 0.5);
  object-fit: cover;
  cursor: pointer;
  pointer-events: auto; /* クリックイベントを明示的に有効化 */
}
.player-name {
  font-size: 8.5px;
  text-shadow: none;
  white-space: nowrap;
  z-index: 1;
  /* ★背景画像をomikuji_button.pngに変更 */
  background-image: url('/assets/images/button/omikuji_button.png');
  background-size: 100% 100%;
  background-repeat: no-repeat;
  width: 102px; /* 画像の見た目に合わせてサイズを調整 */
  height: 25px; /* 画像の見た目に合わせてサイズを調整 */
  display: flex;
  justify-content: center;
  align-items: center;
  color: #5a3a22; /* テキスト色を濃い茶色に変更 */
  font-weight: bold;
  padding-bottom: 2px; /* 文字の縦位置を微調整 */
}
.waiting-indicator {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background-color: rgba(0, 0, 0, 0.3);
  display: flex;
  justify-content: center;
  align-items: center;
  color: rgba(255, 255, 255, 0.7);
  font-size: 24px;
  font-weight: bold;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 0.7;
  }
  50% {
    transform: scale(1.05);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 0.7;
  }
}

.slot-1 {
  top: 435px;
  left: 42px;
  width: 55px;
  height: 55px;
}
.slot-2 {
  top: 470px;
  left: 120px;
  width: 60px;
  height: 60px;
}
.slot-3 {
  top: 470px;
  left: 220px;
  width: 60px;
  height: 60px;
}
.slot-4 {
  top: 440px;
  left: 303px;
  width: 55px;
  height: 55px;
}
.smoke-container {
  position: absolute;
  bottom: 35%;
  left: 52%;
  width: 1px;
  height: 1px;
  pointer-events: none;
}
.smoke-particle {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 60px;
  height: auto;
  transform-origin: center bottom;
  animation-name: rise;
  animation-duration: 12s;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  opacity: 0;
  animation-delay: calc(var(--i) * 1.2s);
}
@keyframes rise {
  0% {
    transform: translate(-50%, 20px) scale(0.2);
    opacity: 0;
  }
  20% {
    opacity: 0.4;
  }
  100% {
    transform: translate(0px, -150px) scale(1.5) rotate(60deg);
    opacity: 0;
  }
}
.fire-container {
  position: absolute;
  top: 59%;
  left: 52%;
  width: 100px;
  height: 100px;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.fire-particle {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 1px;
  height: 1px;
  background: #ffc400;
  border-radius: 50%;
  box-shadow: 0 0 10px #ffc400, 0 0 20px #ffc400, 0 0 40px #ff8c00, 0 0 80px #ff8c00;
  animation: crackle 4.0s infinite;
  opacity: 0;
}
.fire-particle:nth-child(2n) {
  animation-name: crackle-2;
  width: 1px;
  height: 1px;
  animation-duration: 6.2s;
}
@keyframes crackle {
  0% {
    transform: translateY(-2px) translateX(3px);
    opacity: 1;
  }
  100% {
    transform: translateY(-25px) translateX(-10px);
    opacity: 0;
  }
}
@keyframes crackle-2 {
  0% {
    transform: translateY(0) translateX(7px);
    opacity: 1;
  }
  100% {
    transform: translateY(-25px) translateX(15px);
    opacity: 0;
  }
}

/* ★★★ チャット機能のスタイルを追加 ★★★ */
.chat-plank-container {
  position: absolute;
  bottom: 10px; /* 0から10pxに変更 */
  left: 0;
  width: 100%;
  height: 90px;
  padding: 10px 0px;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(3, 1fr);
  row-gap: 8px;
  column-gap: 9px;
  z-index: 100;
}

.chat-plank {
  background-image: url('/assets/images/button/board_ori.png');
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  transition: transform 0.1s ease-out;
  padding: 1px;
  box-sizing: border-box;
}

.chat-plank:active {
  transform: scale(0.95);
}

.chat-text {
  font-family: 'Yuji Syuku', serif;
  font-size: 9px; /* 文字サイズを縮小 */
  font-weight: bold;
  color: #4a2c1a;
  text-align: center;
  text-shadow: 1px 1px 1px rgba(255, 255, 255, 0.5);
}

.chat-bubble {
  position: absolute;
  /* left: 50%; を削除 */
  /* margin-left: -60px; を削除 */
  transform: translateX(-50%); /* 中央揃えのためにtransformは残す */
  background-color: #fdfaf2; /* 生成り色 */
  border-radius: 10px;
  padding: 5px 10px;
  font-family: 'Yuji Syuku', serif;
  font-size: 12px;
  color: #4a2c1a;
  max-width: 120px;
  text-align: center;
  filter: drop-shadow(0 2px 6px rgba(0,0,0,0.4));
  white-space: nowrap;
  animation: popup-bubble 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), fade-out-bubble 0.5s ease-out 3s forwards;
}

/* ★修正: 各スロットごとの吹き出し位置を絶対座標で指定 */
.bubble-slot-1 { top: 360px; left: 65px; }
.bubble-slot-2 { top: 385px; left: 135px; }
.bubble-slot-3 { top: 380px; left: 230px; }
.bubble-slot-4 { top: 360px; left: 295px; }

.chat-bubble::after {
  content: '';
  position: absolute;
  bottom: -8px;
  left: 50%;
  transform: translateX(-50%);
  width: 20px;
  height: 10px;
  background: #fdfaf2;
  clip-path: polygon(50% 100%, 0 0, 100% 0);
}

@keyframes popup-bubble {
  from {
    transform: translateX(-50%) scale(0.5);
    opacity: 0;
  }
  to {
    transform: translateX(-50%) scale(1);
    opacity: 1;
  }
}

@keyframes fade-out-bubble {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
</style>
