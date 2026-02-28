<template>
  <transition name="popup">
    <div
      v-if="show"
      class="popup-overlay"
    >
      <div class="popup-content">
        <div>
          <h2 class="popup-title">
            {{ $t('parentDecisionPopup.title') }}
          </h2>
          <img
            src="/assets/images/back/fude.png"
            alt="fude"
            class="fude-image"
          >
        </div>
        <div class="dealer-determination-list">
          <div
            v-for="player in dealerDeterminationResults"
            :key="player.id"
            class="player-item"
            :class="{ 'is-dealer': player.isDealer }"
          >
            <img
              :src="getWindIcon(player)"
              alt="Seat Wind"
              :class="['seat-wind-icon', { 'east-wind-icon': player.seatWind === '東' }]"
            >
            <div class="player-info">
              <span class="player-name">{{ player.originalId ? $t(`aiNames.${player.originalId}`) : player.name }}</span>
              <div class="player-details">
                <img
                  v-if="getPlayerIcon(player)"
                  :src="getPlayerIcon(player)"
                  alt="Player Icon"
                  class="player-icon"
                >
                <span class="score">{{ $t('parentDecisionPopup.score', { score: player.score }) }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="bottom-info">
          <p class="countdown-text">
            {{ $t('parentDecisionPopup.countdown', { n: countdown }) }}
          </p>
          <div class="timestamp">
            {{ formattedTimestamp }}
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { defineProps, defineEmits, computed, onMounted, watch, ref, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useZoomLock } from '@/composables/useZoomLock';
import { useUserStore } from '@/stores/userStore'; // userStoreをインポート

const { locale } = useI18n(); // i18nのロケールを取得

// ズーム防止機能を有効化
useZoomLock();

/**
 * コンポーネントのプロパティを定義。
 * @property {boolean} show - ポップアップの表示/非表示を制御します。
 * @property {Array<Object>} dealerDeterminationResults - 親決め結果のプレイヤーリスト。
 */
const props = defineProps({
  show: {
    type: Boolean,
    required: true,
  },
  dealerDeterminationResults: {
    type: Array,
    default: () => [],
  },
});

/**
 * コンポーネントが発行するイベントを定義。
 * @event close - ポップアップを閉じる際に発行されます。
 */
const emit = defineEmits(['close']);

const countdown = ref(3); // ポップアップが自動で閉じるまでのカウントダウンの初期値
let interval = null; // setIntervalのタイマーID

const userStore = useUserStore(); // userStoreのインスタンスを取得

const windImagesJa = {
  '東': '/assets/images/info/ton_icon.png',
  '南': '/assets/images/info/minami_icon.png',
  '西': '/assets/images/info/nishi_icon.png',
  '北': '/assets/images/info/kita_icon.png',
};

const windImagesEn = {
  '東': '/assets/images/info/ton_icon_en.png',
  '南': '/assets/images/info/minami_icon_en.png',
  '西': '/assets/images/info/nishi_icon_en.png',
  '北': '/assets/images/info/kita_icon_en.png',
};

function getWindIcon(player) {
  if (!player || !player.seatWind) return '';
  const imageMap = locale.value === 'en' ? windImagesEn : windImagesJa;
  return imageMap[player.seatWind] || '';
}

/**
 * `show` プロパティの変更を監視し、ポップアップが表示されたときにタイマーを開始します。
 */
watch(() => props.show, (newVal) => {
  if (newVal) {
    countdown.value = 3; // ポップアップ表示時にカウントダウンをリセット
    startCountdownInterval(); // カウントダウン表示のインターバルを開始
  } else {
    clearInterval(interval); // カウントダウン表示のインターバルをクリア
  }
});

// コンポーネントがマウントされた時に実行
onMounted(() => {
  if (props.show) {
    startCountdownInterval(); // カウントダウン表示のインターバルを開始
  }
});

// コンポーネントがアンマウントされる時に実行
onUnmounted(() => {
  clearInterval(interval); // インターバルをクリア
});

/**
 * カウントダウン表示を1秒ごとに更新するインターバルを開始します。
 */
const startCountdownInterval = () => {
  clearInterval(interval); // 既存のインターバルがあればクリア
  interval = setInterval(() => {
    if (countdown.value > 1) {
      countdown.value--; // カウントダウンを減らす
    } else {
      clearInterval(interval); // カウントダウンが0になったらインターバルをクリア
      emit('close'); // カウントダウンが0になったらポップアップを閉じる
    }
  }, 1000); // 1秒ごとに実行
};

/**
 * 現在のタイムスタンプをフォーマットして返します。
 */
const formattedTimestamp = computed(() => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
});

/**
 * プレイヤーのアイコン画像URLを返します。
 * @param {Object} player - プレイヤーオブジェクト。
 * @returns {string|null} プレイヤーアイコンのURL、またはnull。
 */
function getPlayerIcon(player) {
  if (!player) return null;
  // 1. プレイヤーオブジェクト自身のavatar_urlを最優先（オンライン対戦用）
  if (player.avatar_url) {
    return player.avatar_url;
  }
  // 2. オフライン時の自分（player1）のアバターフォールバック
  if (player.id === 'player1') {
    return userStore.profile?.avatar_url || '/assets/images/info/hito_icon_1.png';
  }
  // 3. オフライン時のAIプレイヤーのフォールバック
  if (player.originalId === 'kuro') return '/assets/images/info/cat_icon_3.png';
  if (player.originalId === 'tama') return '/assets/images/info/cat_icon_2.png';
  if (player.originalId === 'tora') return '/assets/images/info/cat_icon_1.png';
  if (player.originalId === 'janneko') return '/assets/images/info/cat_icon_4.png';
  
  // 4. 最終フォールバック
  return '/assets/images/info/hito_icon_1.png';
}
</script>

<style scoped>
.popup-overlay {
  position: absolute;
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
  padding: 20px;
  border-radius: 10px;
  width: 400px; /* Adjust width as needed */
  height: 600px; /* Adjust height as needed */
  text-align: center;
  box-shadow: 0 5px 20px rgba(0,0,0,0.25);
  display: flex;
  flex-direction: column;
  color: rgb(43, 6, 6);
}

/* Transition styles */
.popup-enter-active, .popup-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.popup-enter-from, .popup-leave-to {
  opacity: 0;
  transform: scale(0.7);
}
.popup-title {
  margin-top: 20px;
  margin-bottom: 0;
  font-family: 'Yuji Syuku', serif;
  font-size: 2.2em;
  font-weight: bold;
}
.fude-image {
  width: 250px;
  height: 20px;
  max-width: 300px;
  margin-top: 0px;
  margin-bottom: 10px;
}
.dealer-determination-list {
  margin-top: -5px; /* 上の要素との隙間 */
  display: flex;
  flex-direction: column;
  gap: 0px; /* プレイヤー間の間隔を狭くする */
  border-top: 1px solid rgba(43, 6, 6, 0.0); /* 上部の区切り線 */
  padding-top: 0px; /* 上部区切り線と最初の要素のスペース */
}
.player-item {
  display: flex;
  align-items: center;
  padding: 2px;
  padding-bottom: 1px; /* 下部のスペース */
  border-bottom: 1px solid rgba(43, 6, 6, 0.3); /* 区切り線 */
}

.seat-wind-icon {
  width: 60px;
  height: 60px;
  margin-left: 10px;
  margin-right: 5px;
  transition: transform 0.3s ease;
}

.east-wind-icon {
  width: 72px; /* 他より大きく */
  height: 72px;
  margin-right: -5px;
  margin-top: -18px;
  transform: scale(1.1); /* 少しだけ拡大 */
}

.player-icon {
  width: 60px;
  height: 60px;
  margin-right: 20px; /* アイコンと点数の間のスペース */
  border-radius: 6px;
  border: 1px solid #ccc;
}
.player-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-grow: 1;
  overflow: hidden;
}
.player-details {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 2px; /* 区切り線とのスペース */
}
.player-name {
  font-weight: 600;
  font-size: 1.2em;
  font-family: 'Yuji Syuku', serif;
  width: 230px; /* 幅を固定 */
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-bottom: 0px; /* 区切り線のためのスペース */
  border-bottom: 1px solid rgba(43, 6, 6, 0.15); /* 内部の区切り線 */
}
.score {
  font-size: 1.4em;
  font-family: 'Yuji Syuku', serif;
}

.bottom-info {
  margin-top: auto; /* 残りの空間をすべてマージンとして使い、この要素を一番下に押しやる */
}

.countdown-text {
  font-size: 1.2em;
  font-family: 'Yuji Syuku', serif;
  font-weight: bold;
  color: #94000f;
  margin-top: -90px;
}

.timestamp {
  margin-top: -5px;
  font-size: 0.7em;
  font-family: 'Yuji Syuku', serif;
  color: #7d6b6b;
}

</style>