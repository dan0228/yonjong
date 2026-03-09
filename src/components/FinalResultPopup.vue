<template>
  <transition name="popup">
    <div
      v-if="show"
      class="popup-overlay"
    >
      <div
        ref="popupContentRef"
        class="popup-content"
      >
        <h2>{{ t('finalResultPopup.title') }}</h2>
        <div class="final-results-list">
          <div
            v-for="player in finalResultDetails.rankedPlayers"
            :key="player.id"
            class="player-item"
            :class="{ 'is-winner': player.rank === 1 }"
          >
            <!-- 順位表示 -->
            <div class="rank-container">
              <template v-if="player.rank === 1">
                <img
                  src="/assets/images/info/No1.png"
                  alt="No1"
                  class="rank-image no1-image"
                >
              </template>
              <template v-else>
                <img
                  src="/assets/images/info/hand.png"
                  alt="Hand"
                  class="rank-image hand-image"
                >
                <span class="rank-number">{{ player.rank }}</span>
              </template>
            </div>
            <div class="player-info">
              <span class="player-name">{{ getTranslatedPlayerName(player) }}</span>
              <div class="player-details">
                <img
                  v-if="getPlayerIcon(player.id)"
                  :src="getPlayerIcon(player.id)"
                  alt="Player Icon"
                  class="player-icon"
                  crossorigin="anonymous"
                >
                <span class="score">{{ t('finalResultPopup.score', { score: player.score }) }}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="rewards-container">
          <!-- 猫コインの表示 -->
          <div
            v-if="gameStore.lastCoinGain !== 0"
            class="coin-gain"
          >
            <div class="coin-change-display">
              <img
                src="/assets/images/info/cat_coin.png"
                alt="Cat Coin"
                class="cat-coin-icon"
                crossorigin="anonymous"
              >
              <span :class="{ 'positive-gain': gameStore.lastCoinGain > 0, 'negative-gain': gameStore.lastCoinGain < 0 }">
                {{ gameStore.lastCoinGain > 0 ? '+' : '' }}{{ gameStore.lastCoinGain }}
              </span>
            </div>
            <div class="coin-total-display">
              <span class="positive-gain total-cat-coins-value">{{ t('finalResultPopup.totalCatCoins') }} {{ displayCatCoins }}</span>
            </div>
          </div>

          <!-- レートの表示 (オンライン対戦かつ友人対戦でない場合) -->
          <div
            v-if="gameStore.isGameOnline && !gameStore.passcode"
            class="rating-gain"
          >
            <div class="rating-change-display">
              <img
                :src="finalClassImage"
                alt="Rank Class"
                :class="['rank-class-icon', { 'is-slamming': showClassAnimation }]"
                crossorigin="anonymous"
              >
              <span :class="{ 'positive-gain': playerRatingChange > 0, 'negative-gain': playerRatingChange < 0 }">
                {{ playerRatingChange > 0 ? '+' : '' }}{{ playerRatingChange }}
              </span>
            </div>
            <div class="rating-total-display">
              <span class="total-rating-value">Rating {{ displayRating }}</span>
            </div>
          </div>
        </div>

        <div class="actions">
          <button
            v-if="!gameStore.isGameOnline"
            class="action-button"
            @click="startNewGame"
          >
            <span>{{ t('finalResultPopup.newGame') }}</span>
          </button>
          <button
            class="action-button back-to-title-button"
            @click="backToTitle"
          />
        </div>
        <!-- X共有ボタンは削除 -->
        <div class="timestamp">
          {{ formattedTimestamp }}
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { defineProps, defineEmits, computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useGameStore } from '@/stores/gameStore';
import { useUserStore } from '@/stores/userStore'; // userStoreをインポート
import { useZoomLock } from '@/composables/useZoomLock';


/**
 * 最終結果表示用ポップアップコンポーネント。
 * ゲーム終了時にプレイヤーのスコアなどを表示します。
 * 新しいゲームの開始、タイトルへの復帰を提供します。
 */

const { t, locale } = useI18n();
const emit = defineEmits(['start-new-game', 'back-to-title']);
const gameStore = useGameStore();
const userStore = useUserStore(); // userStoreのインスタンスを取得

// ズーム防止機能を有効化
useZoomLock();

// ポップアップのコンテンツ部分への参照
const popupContentRef = ref(null);



const props = defineProps({
  /**
   * ポップアップの表示状態を制御します。
   */
  show: {
    type: Boolean,
    required: true,
  },
  /**
   * 表示する最終結果の詳細情報。
   * gameStore.finalResultDetailsが渡されることを想定しています。
   * 形式: { rankedPlayers: [{ id, rank, name, score }]}
   */
  finalResultDetails: {
    type: Object,
    default: () => ({ rankedPlayers: [] }),
  },
});

// アニメーション用の猫コインとレートの現在値
const currentAnimatedCatCoins = ref(0);
const currentAnimatedRating = ref(0);
const showClassAnimation = ref(false);

// 表示用の値（適度な範囲に制限）
const displayCatCoins = computed(() => {
  return Math.max(0, Math.min(currentAnimatedCatCoins.value, 999999));
});
const displayRating = computed(() => {
  return Math.max(0, currentAnimatedRating.value);
});

// 自分自身のレート変動値を取得
const playerRatingChange = computed(() => {
  if (!userStore.profile) return 0;
  const myResult = props.finalResultDetails.rankedPlayers.find(p => p.id === userStore.profile.id);
  return myResult ? myResult.rating_change || 0 : 0;
});

// 最終的なレートに基づくクラスの画像を取得 (トリガーと同じ昇降格ロジックを適用)
const finalClassImage = computed(() => {
  if (!userStore.profile) return locale.value === 'en' ? '/assets/images/info/kitten_en.png' : '/assets/images/info/kitten.png';

  const oldClass = userStore.profile.class || 1;
  const finalRating = displayRating.value;
  let newClass = oldClass;

  if (oldClass === 1) { // 子猫級
    if (finalRating >= 2000) newClass = 2; // 野良猫級へ昇格
  } else if (oldClass === 2) { // 野良猫級
    if (finalRating >= 5000) {
      newClass = 3; // ボス猫級へ昇格
    } else if (finalRating <= 1799) {
      newClass = 1; // 子猫級へ降格
    }
  } else if (oldClass === 3) { // ボス猫級
    if (finalRating <= 4799) newClass = 2; // 野良猫級へ降格
  }

  let className = 'kitten';
  if (newClass === 3) className = 'boss';
  else if (newClass === 2) className = 'alley';
  
  return locale.value === 'en' 
    ? `/assets/images/info/${className}_en.png` 
    : `/assets/images/info/${className}.png`;
});

// ポップアップが表示されたときにアニメーションを開始
watch(() => props.show, (newValue) => {
  if (newValue && userStore.profile) {
    showClassAnimation.value = false; // 初期化

    // 猫コインのアニメーション開始値と終了値
    const initialCoins = userStore.profile.cat_coins;
    const finalCoins = initialCoins + gameStore.lastCoinGain;
    currentAnimatedCatCoins.value = initialCoins;
    animateValue(currentAnimatedCatCoins, initialCoins, finalCoins);

    // レートのアニメーション開始値と終了値
    if (gameStore.isGameOnline && !gameStore.passcode) {
      const initialRating = userStore.profile.rating || 1500;
      const finalRating = initialRating + playerRatingChange.value;
      currentAnimatedRating.value = initialRating;
      // レートのアニメーションが終わったらクラスアイコンのアニメーションを開始
      animateValue(currentAnimatedRating, initialRating, finalRating, () => {
        showClassAnimation.value = true;
      });
    }
  }
}, { immediate: true }); // 初期表示時にも実行

function animateValue(refTarget, startValue, endValue, onComplete = null) {
  const duration = 1000; // 1秒
  const startTime = performance.now();

  const step = (currentTime) => {
    const elapsedTime = currentTime - startTime;
    const progress = Math.min(elapsedTime / duration, 1); // 0から1の範囲に正規化

    refTarget.value = Math.floor(startValue + (endValue - startValue) * progress);

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      refTarget.value = endValue; // 最終値を保証
      if (onComplete) onComplete();
    }
  };

  requestAnimationFrame(step);
}

/**
 * プレイヤーオブジェクトから翻訳された名前を取得します。
 * @param {Object} player - プレイヤー情報を含むオブジェクト。
 * @returns {string} 翻訳されたプレイヤー名。
 */
function getTranslatedPlayerName(player) {
  if (!player) return '';
  // AIプレイヤーの場合、i18nから名前を取得
  const aiPlayer = gameStore.players.find(p => p.id === player.id);
  if (aiPlayer && aiPlayer.originalId) {
    return t(`aiNames.${aiPlayer.originalId}`);
  }
  return player.name; // フォールバック
}





/**
 * 現在の日時をフォーマットした文字列を返します。
 * YYYY-MM-DD HH:MM:SS 形式
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
 * 'start-new-game'イベントを発行して新しいゲームを開始します。
 */
function startNewGame() {
  emit('start-new-game');
}

/**
 * 'back-to-title'イベントを発行してタイトル画面に戻ります。
 */
function backToTitle() {
  emit('back-to-title');
}

/**
 * プレイヤーIDに対応するアイコンのパスを返します。
 * @param {string} playerId - プレイヤーID。
 * @returns {string|null} アイコン画像のパス。見つからない場合はnull。
 */
function getPlayerIcon(playerId) {
  const player = gameStore.players.find(p => p.id === playerId);
  if (!player) return '/assets/images/info/hito_icon_1.png';

  // 1. プレイヤーがアバターIDを持っていればそれを使用（オンライン対戦の他プレイヤーや自分）
  if (player.avatar_id) {
    return `/assets/images/icon_preset/icon${player.avatar_id}.png`;
  }
  
  // 2. プレイヤーが自分自身（player1）で、かつストアにアバターIDがあればそれを使用
  if (player.id === 'player1' && userStore.profile?.avatar_id) {
    return `/assets/images/icon_preset/icon${userStore.profile.avatar_id}.png`;
  }

  // 3. AIプレイヤーのアイコン判定
  if (player.originalId === 'kuro') return '/assets/images/info/cat_icon_3.png'; // くろ
  if (player.originalId === 'tama') return '/assets/images/info/cat_icon_2.png'; // たま
  if (player.originalId === 'tora') return '/assets/images/info/cat_icon_1.png'; // とら
  if (player.originalId === 'janneko') return '/assets/images/info/cat_icon_4.png'; // 雀猫様

  // 4. 上記以外（アバター未設定の人間プレイヤーなど）はデフォルトアイコン
  return '/assets/images/info/hito_icon_1.png';
}




</script>

<style scoped>
.popup-overlay {
  position: absolute; /* fixedからabsoluteに変更 */
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1050; /* 他の要素より手前に表示 */
}
.popup-content {
  background-image: url('/assets/images/back/start_back.png');
  background-size: 117% 109%; /* ResultPopup.vue と同じ */
  background-position: center;
  margin-left: -7px; /* ResultPopup.vue と同じ */
  font-family: 'Yuji Syuku', serif;
  color: rgb(43, 6, 6);
  padding: 35px 15px; /* ResultPopup.vue と同じ */
  border-radius: 8px; /* ResultPopup.vue と同じ */
  width: 100%;
  text-align: center;
  box-shadow: 0 4px 15px rgba(0,0,0,0.2); /* ResultPopup.vue と同じ */
  max-height: 600px; /* ResultPopup.vue と同じ */
  overflow-y: auto; /* ResultPopup.vue と同じ */
  /* スクロールバーのスタイル */
  scrollbar-width: thin; /* ResultPopup.vue と同じ */
  scrollbar-color: rgba(43, 6, 6, 0.4) transparent; /* ResultPopup.vue と同じ */
}

/* Transition styles */
.popup-enter-active, .popup-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.popup-enter-from, .popup-leave-to {
  opacity: 0;
  transform: scale(0.7);
}
.popup-content h2 {
  margin-top: -30px;
  margin-bottom: 10px;
  color: #333;
  font-size: 1.9em;
}
.final-results-list {
  margin-bottom: 0px;
  margin-top: -5px;
  display: flex;
  flex-direction: column;
  gap: 0px;
  border-top: 1px solid rgba(43, 6, 6, 0.3); /* 上部に区切り線を追加 */
  padding-top: 0px;
}
.player-item {
  display: flex;
  align-items: center;
  padding: 2px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(43, 6, 6, 0.3); /* 区切り線 */
}
.player-item:last-child {
  margin-bottom: 0;
}
.player-item.is-winner {
  background-color: transparent; /* 白いカードを消すため */
  /* border: none; */ /* この行を削除 */
}

/* 順位表示のコンテナ */
.rank-container {
  position: relative;
  width: 72px; /* No1.png と hand.png のサイズに合わせる */
  height: 72px; /* No1.png と hand.png のサイズに合わせる */
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-left: 10px;
  margin-right: 5px;
  margin-top: -18px; /* east-wind-icon と同じ */
  transform: scale(1.1); /* east-wind-icon と同じ */
}

.rank-image {
  position: absolute;
  margin-top: 20px;
  object-fit: contain;
}

.no1-image {
  margin-top: 20px;
  width: 110%; /* No1.png は親要素のサイズに合わせる */
  height: 110%;
}

.hand-image {
  width: 60px; /* hand.png を小さくする */
  height: 60px;
}

.rank-number {
  position: absolute;
  font-family: 'Yuji Syuku', serif; /* 和風フォント */
  font-size: 1.5em; /* 数字のサイズ */
  font-weight: bold;
  color: rgb(43, 6, 6); /* 文字色 */
  /* hand.png の中央に配置するための微調整 */
  top: 57%;
  left: 50%;
  transform: translate(-50%, -50%);
  margin-top: 10px;
}

/* .player-icon のスタイルを ParentDecisionPopup.vue に合わせる */
.player-icon {
  width: 60px;
  height: 60px;
  margin-right: 20px; /* ParentDecisionPopup.vue と同じ */
  border-radius: 6px;
  border: 1px solid #200101;
}

/* .player-info のスタイルを ParentDecisionPopup.vue に合わせる */
.player-info {
  display: flex;
  flex-direction: column;
  align-items: center; /* ParentDecisionPopup.vue と同じ */
  flex-grow: 1;
  overflow: hidden;
}

/* .player-details のスタイルを ParentDecisionPopup.vue に合わせる */
.player-details {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 2px; /* ParentDecisionPopup.vue と同じ */
}

/* .player-name のスタイルを ParentDecisionPopup.vue に合わせる */
.player-name {
  font-weight: 600;
  font-size: 1.3em;
  font-family: 'Yuji Syuku', serif; /* ParentDecisionPopup.vue と同じ */
  width: 230px; /* ParentDecisionPopup.vue と同じ */
  max-width: 100%;
  overflow: hidden;
  text-overflow: clip;
  white-space: nowrap;
  padding-bottom: 0px; /* ParentDecisionPopup.vue と同じ */
  border-bottom: 1px solid rgba(43, 6, 6, 0.15); /* ParentDecisionPopup.vue と同じ */
}

/* .score のスタイルを ParentDecisionPopup.vue に合わせる */
.score {
  font-size: 1.4em;
  font-family: 'Yuji Syuku', serif; /* ParentDecisionPopup.vue と同じ */
}

.rewards-container {
  display: flex;
  justify-content: center;
  gap: 30px;
  margin-top: 10px;
  margin-bottom: 20px;
}

.coin-gain, .rating-gain {
  font-size: 1.5em;
  font-weight: bold;
  display: flex;
  flex-direction: column; /* 縦並びにする */
  align-items: center; /* 中央揃え */
  justify-content: center;
}

.coin-change-display, .rating-change-display {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 5px; /* 増減値と合計値の間に少しスペース */
}

.rating-label {
  font-family: 'Darumadrop One', cursive;
  margin-right: 8px;
  color: #4a2c12;
  font-size: 1.2em;
}

.coin-total-display, .rating-total-display {
  display: flex;
  align-items: center;
  justify-content: center;
}

.total-cat-coins-value, .total-rating-value {
  font-size: 1.0em; /* 増減値と同じくらいか少し大きく */
  color: #9b0f0f; /* positive-gainと同じ色 */
  margin-bottom: 0px;
  margin-top: -18px;
}

.positive-gain, .negative-gain {
  color: #9b0f0f;
}

.cat-coin-icon {
  width: 70px;
  height: 70px;
  margin-left: 0px;
  margin-top: -10px;
}

.rank-class-icon {
  height: 70px;
  object-fit: contain;
  margin-right: 10px;
  margin-top: -10px;
  opacity: 0; /* 初期状態は非表示 */
}

.rank-class-icon.is-slamming {
  animation: slam-down 0.5s ease-in-out forwards;
}

@keyframes slam-down {
  0% {
    transform: scale(3) translateY(-50px) rotate(-10deg);
    opacity: 0;
  }
  60% {
    transform: scale(1) translateY(0) rotate(5deg);
    opacity: 1;
  }
  80% {
    transform: scale(1.1) rotate(-2deg);
  }
  100% {
    transform: scale(1) rotate(0);
    opacity: 1;
  }
}
.actions {
  display: flex;
  justify-content: center; /* 中央寄せに変更 */
  gap: 35px; /* ボタン間の間隔を調整 */
  margin-left: 20px;
  margin-top: -15px;
}
.action-button { /* actions button から action-button にクラス名を変更 */
  background-image: url('/assets/images/button/board_hand.png');
  background-color: transparent; /* 透明にする */
  background-size: 100% 100%;
  background-repeat: no-repeat;
  border: none;
  cursor: pointer;
  width: 140px; /* ResultPopup.vue のボタンより少し大きく */
  height: 50px; /* ResultPopup.vue のボタンより少し大きく */
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgb(43, 6, 6);
  font-family: 'Yuji Syuku', serif;
  font-size: 1.2em;
  transition: transform 0.2s ease;
}
.action-button:hover {
  transform: scale(1.03);
}
.action-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none; /* ホバー効果を無効化 */
}

.back-to-title-button {
  position: absolute;
  right: 10px;
  bottom: 20px;;
  background-image: url('/assets/images/button/buckToTitle.png');
  width: 60px; /* 例: 画像のサイズに合わせて調整 */
  height: 45px; /* 例: 画像のサイズに合わせて調整 */
  margin-top: -20px;
  margin-left: 20px;
  filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.5)); /* 影を調整 */;
}

.timestamp {
  font-size: 0.7em;
  color: #7d6b6b;
  margin-top: 10px;
  margin-bottom: -11px;
}
</style>