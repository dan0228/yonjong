<template>
  <transition name="popup">
    <div
      v-if="show"
      class="popup-overlay"
    >
      <div class="popup-content">
        <div class="popup-inner-content">
          <div
            class="result-section round-info"
            style="text-align: center; margin-bottom: 15px;"
          >
            <p class="round-main-info">
              {{ t('resultPopup.roundInfo', { wind: roundWindDisplay, round: resultDetails.roundNumber, honba: resultDetails.honba }) }}
            </p>
          </div>
          <div
            v-if="!isDrawResult"
            class="winner-title-container"
          >
            <img
              v-if="winnerIconSrc"
              :src="winnerIconSrc"
              alt="Winner Icon"
              class="winner-icon"
            >
            <h2>{{ resultTitle }}</h2>
          </div>
          <div
            v-if="!isDrawResult && !isChomboResult"
            class="result-section round-info-details"
          >
            <!-- 和了時のみ表示 -->
            <div class="dora-display">
              <span class="dora-label">{{ t('resultPopup.dora') }}</span>
              <div class="dora-tiles">
                <!-- 表示するドラ -->
                <img
                  v-for="(tile, index) in resultDetails.doraIndicators"
                  :key="'dora-'+tile.id + '-' + index"
                  :src="getTileImageUrl(tile)"
                  :alt="tileToString(tile)"
                  class="tile-image-small"
                >
                <!-- ドラの残りを裏向きで表示 (最大4つまで) -->
                <img
                  v-for="n in Math.max(0, 4 - (resultDetails.doraIndicators?.length || 0))"
                  :key="'dora-hidden-' + n"
                  :src="getTileImageUrl({type: 'ura'})"
                  :alt="t('resultPopup.doraHidden')"
                  class="tile-image-small"
                >
              </div>
            </div>
            <div class="dora-display">
              <span class="dora-label">{{ t('resultPopup.uraDora') }}</span>
              <div class="dora-tiles">
                <template v-if="isRiichiAgari">
                  <!-- リーチ和了時は、表ドラの数だけ裏ドラを表示（めくれている分＋裏向き） -->
                  <img
                    v-for="(tile, index) in resultDetails.uraDoraIndicators"
                    :key="'ura-revealed-'+tile.id + '-' + index"
                    :src="getTileImageUrl(tile)"
                    :alt="tileToString(tile)"
                    class="tile-image-small"
                  >
                  <img
                    v-for="n in Math.max(0, 4 - (resultDetails.uraDoraIndicators?.length || 0))"
                    :key="'ura-hidden-riichi-' + n"
                    :src="getTileImageUrl({type: 'ura'})"
                    :alt="t('resultPopup.uraDoraHidden')"
                    class="tile-image-small"
                  >
                </template>
                <template v-else>
                  <!-- リーチなし和了や流局時は、4牌分を裏向きで表示 -->
                  <img
                    v-for="n in 4"
                    :key="'ura-hidden-no-riichi-' + n"
                    :src="getTileImageUrl({type: 'ura'})"
                    :alt="t('resultPopup.uraDoraHidden')"
                    class="tile-image-small"
                  >
                </template>
              </div>
            </div>
          </div>

          <div
            v-if="!isDrawResult && !isChomboResult"
            class="result-section winning-hand-info"
          >
            <!-- 和了時のみ表示 -->
            <h3>{{ t('resultPopup.winningHand') }}</h3>
            <div class="hand-display">
              <!-- 元々持っていた4牌 -->
              <span
                v-for="(tile, index) in originalHandWithoutAgariTile"
                :key="'original-' + tile.id + '-' + index"
                class="tile-image-medium"
              >
                <img
                  :src="getTileImageUrl(tile)"
                  :alt="tileToString(tile)"
                >
              </span>
              <!-- 和了牌 (少し間を開ける) -->
              <span
                v-if="resultDetails.agariTile"
                class="tile-image-medium agari-tile-display"
              >
                <img
                  :src="getTileImageUrl(resultDetails.agariTile)"
                  :alt="tileToString(resultDetails.agariTile)"
                >
              </span>
              <!-- 鳴いた牌 -->
              <template v-if="resultDetails.melds && resultDetails.melds.length > 0">
                <div
                  v-for="(meld, meldIndex) in resultDetails.melds"
                  :key="'meld-' + meldIndex"
                  class="meld-display"
                >
                  <span
                    v-for="(tile, tileIndex) in meld.tiles"
                    :key="'meld-' + meldIndex + '-tile-' + tileIndex"
                    class="tile-image-medium"
                    :class="getMeldTileClass(meld, tileIndex)"
                  >
                    <img
                      :src="meld.type === 'ankan' && (tileIndex === 1 || tileIndex === 2) ? '/assets/images/tiles/ura.png' : getTileImageUrl(tile)"
                      :alt="tileToString(tile)"
                    >
                  </span>
                </div>
              </template>
            </div>
          </div>

          <div
            v-if="isChomboResult"
            class="result-section winning-hand-info"
          >
            <!-- チョンボ時のみ表示 -->
            <h3>{{ t('resultPopup.chomboHand') }}</h3>
            <div class="hand-display">
              <span
                v-for="(tile, index) in resultDetails.winningHand"
                :key="'chombo-hand-' + tile.id + '-' + index"
                class="tile-image-medium"
              >
                <img
                  :src="getTileImageUrl(tile)"
                  :alt="tileToString(tile)"
                >
              </span>
            </div>
          </div>

          <div
            v-if="!isDrawResult && !isChomboResult"
            class="result-section yaku-info"
          >
            <!-- 和了時のみ表示 -->
            <h3>{{ t('resultPopup.yakuList') }}</h3>
            <div :class="['yaku-list-container', yakuListColumnCountClass]">
              <ul>
                <li
                  v-for="(yaku, index) in resultDetails.yakuList"
                  :key="index"
                >
                  {{ t(`yaku.${yaku.key}.name`) }}
                  <span v-if="yaku.power !== undefined"> <!-- 役満の場合 -->
                    ({{ yaku.power === 1 ? t('resultPopup.yakuman') : t('resultPopup.multipleYakuman', { count: yaku.power }) }})
                  </span>
                  <span v-else-if="yaku.fans !== undefined"> ({{ t('resultPopup.han', { count: yaku.fans }) }})</span>
                </li>
              </ul>
            </div>
            <p class="total-score">
              <span v-if="isYakumanResult">
                {{ translatedScoreName }}
              </span>
              <span v-else-if="resultDetails.totalFans > 0">
                {{ t('resultPopup.totalFans', { count: resultDetails.totalFans }) }} {{ translatedScoreName }}
              </span>
              {{ resultDetails.score ? t('resultPopup.points', { score: resultDetails.score }) : '' }}
            </p>
          </div>
          <div
            v-if="isDrawResult"
            class="result-section draw-info"
          >
            <!-- 流局時のみ表示 -->
            <h2>{{ t('resultPopup.draw') }}</h2>
            <p>{{ message }}</p>
            <!-- 必要に応じてノーテン罰符などの情報を表示 -->
          </div>
          <div class="result-section score-changes">
            <!-- 点数変動は常に表示 -->
            <h3>{{ t('resultPopup.scoreChanges') }}</h3>
            <table class="score-change-table">
              <tbody>
                <tr
                  v-for="player in gameStore.players"
                  :key="player.id"
                >
                  <td class="player-name-cell">
                    {{ getTranslatedPlayerName(player) }}
                  </td>
                  <td class="score-cell">
                    {{ (gameStore.getPlayerById(player.id)?.score ?? 0) + (resultDetails.pointChanges[player.id] ?? 0) }}{{ ' ' + t('resultPopup.points', { score: '' }).trim() }}
                  </td>
                  <td class="change-cell">
                    <span :class="getPointChangeClass(resultDetails.pointChanges[player.id])">
                      ({{ formatPointChange(resultDetails.pointChanges[player.id]) }})
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <button
            :disabled="isLocalPlayerReady"
            @click="signalReady"
          >
            {{ isLocalPlayerReady ? t('resultPopup.waiting') : t('resultPopup.next') }}
          </button>
        </div> <!-- Close popup-inner-content -->
      </div>
    </div>
  </transition>
</template>

<script setup>
import { useGameStore } from '@/stores/gameStore';
import { useI18n } from 'vue-i18n';  
import { useUserStore } from '@/stores/userStore';
import { getTileImageUrl, tileToString } from '@/utils/tileUtils';
import { computed } from 'vue';

/**
 * 局の結果を表示するポップアップコンポーネント。
 * 和了、流局、チョンボの情報を表示し、次の局への進行を促します。
 */
const { t } = useI18n();

const props = defineProps({
  show: {
    type: Boolean,
    required: true,
  },
  message: {
    type: String,
    default: '結果はありません。',
  },
  resultDetails: {
    type: Object,
    default: () => ({ pointChanges: {} })
  },
});

const gameStore = useGameStore();
const userStore = useUserStore();

// 現在のプレイヤーが「次へ」ボタンを押したかどうかを判定する
const isLocalPlayerReady = computed(() => {
  // オフラインモードでは常にfalseを返し、待機状態にしない
  if (!gameStore.isGameOnline) {
    return false;
  }
  const localPlayerId = gameStore.localPlayerId;
  // localPlayerId がまだセットされていない場合も考慮
  if (!localPlayerId) {
    return false;
  }
  return gameStore.playersReadyForNextRound.includes(localPlayerId);
});

// 「次へ」ボタンがクリックされたときの処理
function signalReady() {
  gameStore.signalReadyForNextRound();
}

const translatedScoreName = computed(() => {
  const scoreName = props.resultDetails.scoreName;
  if (!scoreName) return '';

  const scoreNameMap = {
    '満貫': 'mangan',
    '跳満': 'haneman',
    '倍満': 'baiman',
    '三倍満': 'sanbaiman',
    '役満': 'yakuman',
    '数え役満': 'kazoeYakuman',
  };

  const key = scoreNameMap[scoreName];
  if (key) {
    return t(`resultPopup.scoreNames.${key}`);
  }

  return scoreName; // fallback
});

/**
 * プレイヤーIDに基づいて翻訳されたプレイヤー名を返します。
 * @param {Object} player - プレイヤーオブジェクト。
 * @returns {string} 翻訳されたプレイヤー名。
 */
function getTranslatedPlayerName(player) {
  if (!player) return '';
  if (player.originalId) {
    return t(`aiNames.${player.originalId}`);
  }
  return player.name; // Fallback
}

/**
 * 結果が流局かどうかを判定します。
 */
const isDrawResult = computed(() => {
  return props.resultDetails?.isDraw;
});

/**
 * 結果がチョンボかどうかを判定します。
 */
const isChomboResult = computed(() => {
  return props.resultDetails?.isChombo;
});
/**
 * ポップアップのタイトルテキストを計算して返します。
 * チョンボ、流局、和了の状況に応じて動的に変化します。
 */
const resultTitle = computed(() => {
  // 1. チョンボの場合
  if (isChomboResult.value && props.resultDetails.chomboPlayerId) {
    const chomboPlayer = gameStore.getPlayerById(props.resultDetails.chomboPlayerId);
    if (chomboPlayer) return t('resultPopup.titleChombo', { playerName: getTranslatedPlayerName(chomboPlayer) });
  }

  // 2. 流局の場合
  if (isDrawResult.value) return t('resultPopup.draw');

  // 3. 和了の場合 (winnerId を使用)
  if (props.resultDetails.winnerId) {
    const winner = gameStore.getPlayerById(props.resultDetails.winnerId);
    if (winner) {
      return t('resultPopup.titleWin', { playerName: getTranslatedPlayerName(winner) });
    }
  }

  // 4. フォールバック (古いデータ構造や予期せぬエラー用)
  const winnerIdFromPoints = Object.keys(props.resultDetails.pointChanges || {}).find(
    playerId => (props.resultDetails.pointChanges[playerId] || 0) > 0
  );
  if (winnerIdFromPoints) {
    const winner = gameStore.getPlayerById(winnerIdFromPoints);
    if (winner) return t('resultPopup.titleWin', { playerName: getTranslatedPlayerName(winner) });
  }
  
  // 5. 上記で見つからない場合の最終フォールバック
  return t('resultPopup.titleResult');
});

/**
 * 和了がリーチによるものかどうかを判定します。
 */
const isRiichiAgari = computed(() => {
  const winnerId = Object.keys(props.resultDetails.pointChanges || {}).find(playerId => props.resultDetails.pointChanges[playerId] > 0);
  if (!winnerId) return false;
  const winner = gameStore.getPlayerById(winnerId);
  return winner?.isRiichi || winner?.isDoubleRiichi;
});

/**
 * 和了者またはチョンボ者のアイコン画像URLを返します。
 */
const winnerIconSrc = computed(() => {
  if (isDrawResult.value) return null;

  let targetPlayerId = null;
  if (props.resultDetails.isChombo && props.resultDetails.chomboPlayerId) {
    targetPlayerId = props.resultDetails.chomboPlayerId;
  } else {
    targetPlayerId = Object.keys(props.resultDetails.pointChanges || {}).find(playerId => props.resultDetails.pointChanges[playerId] > 0);
  }

  if (!targetPlayerId) return null;

  const player = gameStore.players.find(p => p.id === targetPlayerId);
  if (!player) return null;

  // player1 (あなた) の場合はアバターURLがあればそれを使用
  if (player.id === 'player1' && userStore.profile?.avatar_url) {
    return userStore.profile.avatar_url;
  }
  // それ以外は既存のロジック
  if (player.id === 'player1') return '/assets/images/info/hito_icon_1.png'; // あなた
  if (player.originalId === 'kuro') return '/assets/images/info/cat_icon_3.png'; // くろ
  if (player.originalId === 'tama') return '/assets/images/info/cat_icon_2.png'; // たま
  if (player.originalId === 'tora') return '/assets/images/info/cat_icon_1.png'; // とら
  if (player.originalId === 'janneko') return '/assets/images/info/cat_icon_4.png'; // 雀猫様

  return null;
});

/**
 * 結果が役満かどうかを判定します。
 */
const isYakumanResult = computed(() => {
  return props.resultDetails.scoreName && props.resultDetails.scoreName.includes('役満');
});



/**
 * 役のリストの数に応じて、表示する列数を決定するCSSクラスを返します。
 */
const yakuListColumnCountClass = computed(() => {
  const yakuCount = props.resultDetails.yakuList.length;
  if (yakuCount > 10) {
    return 'three-columns';
  } else if (yakuCount > 5) {
    return 'two-columns';
  }
  return ''; // デフォルトは1列
});

/**
 * 和了牌を除いた元々の手牌を返します。
 */
const originalHandWithoutAgariTile = computed(() => {
  if (!props.resultDetails.winningHand || !props.resultDetails.agariTile) {
    return props.resultDetails.winningHand || [];
  }
  const agariTileId = props.resultDetails.agariTile.id;
  let foundAgariTile = false;
  return props.resultDetails.winningHand.filter(tile => {
    if (tile.id === agariTileId && !foundAgariTile) {
      foundAgariTile = true;
      return false; // 和了牌を除外
    }
    return true;
  });
});


/**
 * 現在の局の場風を翻訳して返します。
 */
const roundWindDisplay = computed(() => {
  if (props.resultDetails.roundWind === 'east') return t('resultPopup.windEast');
  if (props.resultDetails.roundWind === 'south') return t('resultPopup.windSouth');
  // 他の風も必要なら追加
  return '';
});

/**
 * 点数変動をフォーマットして返します。
 * プラスの場合は '+' を付与します。
 * @param {number} change - 点数変動の数値。
 * @returns {string} フォーマットされた点数変動文字列。
 */
function formatPointChange(change) {
  if (change == null) return '';
  return change > 0 ? `+${change}` : `${change}`;
}

/**
 * 点数変動に応じたCSSクラスを返します。
 * 点数増加なら 'point-increase'、減少なら 'point-decrease'。
 * @param {number} change - 点数変動の数値。
 * @returns {string} CSSクラス名。
 */
function getPointChangeClass(change) {
  if (change == null) return '';
  return change > 0 ? 'point-increase' : (change < 0 ? 'point-decrease' : '');
}

/**
 * 面子内の牌に適用するCSSクラスを返します。
 * 特に鳴き牌の向き（横向き）を制御します。
 * @param {Object} meld - 面子オブジェクト。
 * @param {number} tileIndex - 面子内の牌のインデックス。
 * @returns {string} CSSクラス名。
 */
function getMeldTileClass(meld, tileIndex) {
  if (!meld.takenTileRelativePosition) return '';
  
  // ポンの場合
  if (meld.type === 'pon') {
    if (meld.takenTileRelativePosition === 'left' && tileIndex === 0) return 'sideways';
    if (meld.takenTileRelativePosition === 'middle' && tileIndex === 1) return 'sideways';
    if (meld.takenTileRelativePosition === 'right' && tileIndex === 2) return 'sideways';
  }
  // 明槓の場合
  else if (meld.type === 'minkan') {
    if (meld.takenTileRelativePosition === 'left' && tileIndex === 0) return 'sideways';
    if (meld.takenTileRelativePosition === 'middle' && tileIndex === 1) return 'sideways';
    if (meld.takenTileRelativePosition === 'right' && tileIndex === 2) return 'sideways';
  }
  // 加槓の場合
  else if (meld.type === 'kakan') {
    // 加槓は元のポン牌の向きを維持するので、ポンと同じロジック
    if (meld.takenTileRelativePosition === 'left' && tileIndex === 0) return 'sideways';
    if (meld.takenTileRelativePosition === 'middle' && tileIndex === 1) return 'sideways';
    if (meld.takenTileRelativePosition === 'right' && tileIndex === 2) return 'sideways';
  }
  // 暗槓は常に縦向きなので、ここでは何も返さない
  else if (meld.type === 'ankan') {
    if (tileIndex === 1 || tileIndex === 2) return 'hidden-tile'; // 真ん中の2枚を裏向きに
  }
  return '';
}
</script>

<style scoped>
/* RulePopup.vue と同様のスタイルを使用できます */
.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.popup-content {
  background-image: url('/assets/images/back/start_back.png');
  background-size: 117% 109%; /* 縦横調整可能に */
  background-position: center;
  margin-left: -7px;
  font-family: 'Yuji Syuku', serif;
  color: rgb(43, 6, 6);
  padding: 15px;
  border-radius: 8px;
  width: 95%;
  max-width: 600px;
  text-align: center;
  box-shadow: 0 4px 15px rgba(0,0,0,0.2);
  max-height: 590px;
  overflow-y: auto;
  /* スクロールバーのスタイル */
  scrollbar-width: thin;
  scrollbar-color: rgba(43, 6, 6, 0.4) transparent;
}

.popup-content::-webkit-scrollbar {
  width: 5px;
}

.popup-content::-webkit-scrollbar-track {
  background: transparent;
}

.popup-content::-webkit-scrollbar-thumb {
  background-color: rgba(43, 6, 6, 0.4);
  border-radius: 10px;
}

/* Transition styles */
.popup-enter-active, .popup-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.popup-enter-from, .popup-leave-to {
  opacity: 0;
  transform: scale(0.7);
}

.winner-icon {
  width: 60px;
  height: 60px;
  margin-right: -6px;
  margin-bottom: 10px;
  background-color: white;
  border: 1px solid #460505;
  border-radius: 50%;
}

.winner-title-container {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  white-space: pre-line;
}
.round-info .round-main-info { margin: -8px 0 -16px 0; font-size: 1.7em; font-weight: bold; }
.popup-content h2 { margin-top: 0; margin-bottom: 5px; font-size: 1.4em; color: rgb(43, 6, 6); }
.popup-content h3 { margin-top: -8px; margin-bottom: 2px; color: rgb(43, 6, 6); border-top: 1px solid rgba(43, 6, 6, 0.2); padding-bottom: 4px; font-size: 1.2em;}
.result-section { margin-bottom: 10px; }
.dora-display {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-left: 70px;
  margin-bottom: 2px;
  width: fit-content;
}
.dora-label {
  margin-right: 8px;
  min-width: 60px;
  text-align: right;
  font-size: 0.9em;
}
.dora-tiles {
  display: flex;
}
.dora-display img.tile-image-small { width: 22px; height: auto; vertical-align: middle; }
.hand-display { display: flex; justify-content: center; gap: 0px; margin-bottom: 8px; }
.hand-display .tile-image-medium img { width: 32px; height: auto; border-radius: 3px; }
.agari-tile-display { margin-left: 8px; }
.meld-display {
  display: flex;
  margin-left: 8px;
}

.sideways {
  transform: rotate(90deg);
  transform-origin: left center;
  margin: 0 4px 0 0;
  margin-left: 3px;
  margin-top: -28px;
}

.hidden-tile img {
  content: url('/public/assets/images/tiles/ura.png');
}

.yaku-info ul {
  list-style: none;
  padding: 0;
  margin: 0 0 8px 0;
  display: block; /* Ensure it behaves like a block for column-count */
}

.yaku-list-container.two-columns ul {
  column-count: 2;
  column-gap: 10px;
}

.yaku-list-container.two-columns li {
  break-inside: avoid-column;
}

.yaku-list-container.three-columns ul {
  column-count: 3;
  column-gap: 10px;
}

.yaku-list-container.three-columns li {
  break-inside: avoid-column;
}

.yaku-info li { margin-bottom: 0px; font-size: 0.8em; }
.total-score {margin-top: -4px; margin-bottom: -4px; font-weight: bold; font-size: 1.2em;  color: rgb(184, 0, 0);}
.score-change-table {
  width: 100%;
  margin: 0 auto;
  border-collapse: collapse;
  font-size: 0.85em;
}
.score-change-table td {
  padding: 2px 0; /* 上下の余白を追加 */
  border-bottom: 1px solid rgba(93, 64, 55, 0.18);
}
.score-change-table tr:last-child td {
  border-bottom: none; /* 最後の行の線は削除 */
}
.player-name-cell {
  width: 9em; /* 全角9文字分の幅を確保 */
  text-align: center;
}
.score-cell {
  text-align: right;
}
.change-cell {
  text-align: right;
}
.point-increase { color: #00532E; } /* 抹茶色の深緑 */
.point-decrease { color: #8B0000; } /* えんじ色 (DarkRed) */

.popup-content button {
  background-image: url('/assets/images/button/board_hand.png');
  background-color: transparent;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  border: none;
  cursor: pointer;
  width: 80px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgb(43, 6, 6);
  font-family: 'Yuji Syuku', serif;
  font-size: 1.3em;
  transition: transform 0.2s ease;
  margin-top: -5px;
  margin-left: 130px;
}
.popup-content button:hover {
  transform: scale(1.03);
}
.popup-content button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none; /* ホバー効果を無効化 */
}
.popup-inner-content {
  margin-left: 10px; /* 背景画像以外の内容を右にずらす */
}
</style>
