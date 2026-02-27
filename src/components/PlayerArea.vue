<template>
  <div :class="['player-area', positionClass, { 'is-current-turn': isCurrentTurn }]">
    <div :class="['player-game-elements', positionClass + '-elements']">
      <PlayerHand
        :player="player"
        :is-my-hand="isMyHand"
        :drawn-tile-display="drawnTileDisplay"
        :can-discard="canDiscard"
        :position="position"
        @tile-selected="onTileSelected"
        @tile-to-stock-selected="onTileToStockSelected"
      />
    </div>
    <!-- ストック選択中にツモ牌の位置に表示されるクリック領域 -->
    <div
      v-if="shouldRenderDrawFromWallButton"
      :class="['draw-from-wall-area', { 'is-active': isDrawFromWallActive, 'has-melds': hasMelds, 'is-waiting': gameStore.isActionPending }]"
      @click="isDrawFromWallActive && drawFromWall()"
    >
      <img
        src="/assets/images/button/wall_drow.png"
        :alt="t('playerArea.drawFromWall')"
        class="draw-from-wall-image"
      >
    </div>
    <div
      v-if="player.melds && player.melds.length > 0"
      class="melds-area"
    >
      <div
        v-for="(meld, meldIndex) in player.melds"
        :key="meldIndex"
        class="meld"
      >
        <!-- 加槓の場合は、ベースとなるポン(3牌)を表示し、4枚目は重ねて表示する -->
        <span
          v-for="(tile, tileIndex) in (meld.type === 'kakan' ? meld.tiles.slice(0, 3) : meld.tiles)"
          :key="tile.id + '-' + tileIndex"
          :class="['meld-tile', getMeldTileRotationClass(meld, tileIndex)]"
        >

          <img
            :src="getMeldTileImage(meld, tile, tileIndex)"
            :alt="getMeldTileAlt(meld, tile, tileIndex)"
            class="meld-tile-image"
          >
          <!-- 加槓の場合、横向きの牌の上に4枚目を重ねる -->
          <img
            v-if="meld.type === 'kakan' && getMeldTileRotationClass(meld, tileIndex) === 'rotated-meld-tile'"
            :src="getTileImageUrl(meld.tiles[3])"
            :alt="tileToString(meld.tiles[3])"
            class="meld-tile-image kakan-added-tile"
          >
        </span>
      </div>
    </div>
    <!-- ストック牌の表示エリア -->
    <div
      v-if="gameStore.ruleMode === 'stock'" 
      :class="['stocked-tile-area', positionClass, { 'selected-stocked-tile': player.isStockedTileSelected, 'selectable': isStockTileSelectable, 'disabled': !isStockTileSelectable, 'pointer-events-none': !isStockTileSelectable }]"
      @click="onToggleStockedTileSelection(player.id)"
    >
      <img
        src="/assets/images/back/stock_frame.png"
        alt="Stock Frame"
        class="stock-frame-image"
      >
      <div
        v-if="player.stockedTile"
        class="stocked-tile-content"
      >
        <div :class="['tile', {'is-stocked-tile': player.stockedTile?.isStockedTile}]">
          <img
            :src="getTileImageUrl(player.stockedTile)"
            :alt="tileToString(player.stockedTile)"
          >
        </div>
      </div>
      <transition name="fade-gauge">
        <StockSelectionCountdown
          v-if="showStockCountdown"
          :show-countdown="showStockCountdown"
          :position="position"
        />
      </transition>
    </div>
    <!-- アクションボタンエリア -->
    <div
      v-if="isMyHand || gameStore.gameMode === 'allManual'"
      :class="['player-actions', `player-actions-${position}`]"
    >
      <!-- ツモ番のアクション -->
      <img
        v-if="canDeclareTsumoAgari"
        :src="t('playerArea.tsumoButtonImg')"
        :alt="t('playerArea.tsumo')"
        :class="['action-image-button', { 'disabled': gameStore.isActionPending }]"
        @click="emitAction('tsumoAgari')"
      >
      <img
        v-if="canDeclareRiichi && !player.isRiichi && !player.isDoubleRiichi"
        :src="t('playerArea.riichiButtonImg')"
        :alt="t('playerArea.riichi')"
        :class="['action-image-button', { 'disabled': gameStore.isActionPending }]"
        @click="emitAction('riichi')"
      >
      <img
        v-if="canDeclareAnkan"
        :src="t('playerArea.kanButtonImg')"
        :alt="t('playerArea.ankan')"
        :class="['action-image-button', { 'disabled': gameStore.isActionPending }]"
        @click="emitAction('ankan')"
      >
      <img
        v-if="canDeclareKakan && !player.isRiichi && !player.isDoubleRiichi"
        :src="t('playerArea.kanButtonImg')"
        :alt="t('playerArea.kakan')"
        :class="['action-image-button', { 'disabled': gameStore.isActionPending }]"
        @click="emitAction('kakan')"
      >
      <!-- ストックアクション -->
      <img
        v-if="canStockAction"
        :src="t('playerArea.stockButtonImg')"
        :alt="t('playerArea.stock')"
        :class="['action-image-button', 'stock-button', { 'disabled': gameStore.isActionPending }]"
        @click="emitAction('stock')"
      >
      <!-- 他家の打牌/加槓に対するアクション -->
      <img
        v-if="canDeclareRon"
        :src="t('playerArea.ronButtonImg')"
        :alt="t('playerArea.ron')"
        :class="['action-image-button', { 'disabled': gameStore.isActionPending }]"
        @click="emitAction('ron')"
      >
      <img
        v-if="canDeclarePon && !player.isRiichi && !player.isDoubleRiichi"
        :src="t('playerArea.ponButtonImg')"
        :alt="t('playerArea.pon')"
        :class="['action-image-button', { 'disabled': gameStore.isActionPending }]"
        @click="emitAction('pon')"
      >
      <img
        v-if="canDeclareMinkan && !player.isRiichi && !player.isDoubleRiichi"
        :src="t('playerArea.kanButtonImg')"
        :alt="t('playerArea.kan')"
        :class="['action-image-button', { 'disabled': gameStore.isActionPending }]"
        @click="emitAction('minkan')"
      >
      <!-- スキップボタン -->
      <img
        v-if="showSkipButton"
        :src="t('playerArea.skipButtonImg')"
        :alt="t('playerArea.skip')"
        :class="['action-image-button', 'skip-button', { 'disabled': gameStore.isActionPending }]"
        @click="emitAction('skip')"
      >
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits, computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import PlayerHand from './PlayerHand.vue';
import StockSelectionCountdown from './StockSelectionCountdown.vue';
import { useGameStore } from '@/stores/gameStore';
import { GAME_PHASES } from '@/stores/gameStore';
import { getTileImageUrl, tileToString } from '@/utils/tileUtils'; // 共通ユーティリティ

/**
 * 各プレイヤーの手牌、鳴き牌、およびアクションボタンを表示するコンポーネント。
 * プレイヤーの位置（下家、右家、対面、上家）に応じてレイアウトを調整します。
 */
const { t } = useI18n();

const props = defineProps({
  player: { type: Object, required: true },
  position: { type: String, required: true }, // 'bottom', 'right', 'top', 'left'
  isMyHand: { type: Boolean, default: false },
  drawnTileDisplay: { type: Object, default: null },
  canDiscard: { type: Boolean, default: false },
});

/**
 * コンポーネントが発行するイベントを定義。
 * @event tile-selected - 牌が選択された際に発行されます。
 * @event action-declared - アクション（ツモ、リーチ、ポンなど）が宣言された際に発行されます。
 */
const emit = defineEmits(['tile-selected', 'action-declared']);

const gameStore = useGameStore();

const actionInProgress = ref(false);

const positionClass = computed(() => `player-area-${props.position}`);
const isCurrentTurn = computed(() => gameStore.currentTurnPlayerId === props.player.id);

/**
 * PlayerHandコンポーネントから牌選択イベントを受け取り、親コンポーネントに再発行します。
 * @param {Object} payload - 選択された牌の情報を含むペイロード。
 */
function onTileSelected(payload) {
  emit('tile-selected', payload);
}

/**
 * PlayerHandコンポーネントからストックする牌選択イベントを受け取り、gameStoreのアクションを呼び出します。
 * @param {Object} payload - 選択された牌の情報を含むペイロード。
 */
function onTileToStockSelected(payload) {
  gameStore.executeStock(props.player.id, payload.tile.id, payload.isFromDrawnTile);
}

/**
 * ストック牌のクリックイベントを処理し、gameStoreのアクションを呼び出します。
 * @param {string} playerId - プレイヤーのID。
 */
function onToggleStockedTileSelection(playerId) {
  if (isStockTileSelectable.value) {
    gameStore.toggleStockedTileSelection(playerId);
  }
}

/**
 * プレースホルダーがクリックされたときに、山から牌を引くアクションを呼び出します。
 */
function drawFromWall() {
  gameStore.chooseToDrawFromWall(props.player.id);
}

const playerEligibility = computed(() => gameStore.playerActionEligibility[props.player.id] || {}); // プレイヤーのアクション資格

// プレイヤーのアクション資格が変更されたときに actionInProgress をリセット
watch(playerEligibility, () => {
  actionInProgress.value = false;
});

// Debug: Log player's eligibility and active action player
watch(() => gameStore.activeActionPlayerId, (newVal) => {
  console.log(`[PlayerArea ${props.player.id}] activeActionPlayerId changed to: ${newVal}`);
});
watch(() => gameStore.playerActionEligibility[props.player.id], (newVal) => {
  console.log(`[PlayerArea ${props.player.id}] playerActionEligibility changed:`, newVal);
}, { deep: true });

/**
 * 自分のターンで、かつ打牌前のアクション（ツモ和了、リーチ、カン）が可能なフェーズかどうかを判定します。
 */
const isMyTurnAndCanActBeforeDiscard = computed(() => {
  return gameStore.currentTurnPlayerId === props.player.id &&
         (gameStore.gamePhase === GAME_PHASES.AWAITING_DISCARD || gameStore.gamePhase === GAME_PHASES.AWAITING_RIICHI_DISCARD);
});

/**
 * ツモ和了が可能かどうかを判定します。
 */
const canDeclareTsumoAgari = computed(() => {
  const result = !actionInProgress.value && isMyTurnAndCanActBeforeDiscard.value && playerEligibility.value.canTsumoAgari;
  console.log(`[PlayerArea ${props.player.id}] canDeclareTsumoAgari: ${result}, isMyTurnAndCanActBeforeDiscard: ${isMyTurnAndCanActBeforeDiscard.value}, canTsumoAgari: ${playerEligibility.value.canTsumoAgari}`);
  return result;
});
/**
 * リーチが可能かどうかを判定します。
 */
const canDeclareRiichi = computed(() => {
  const result = !actionInProgress.value && isMyTurnAndCanActBeforeDiscard.value && playerEligibility.value.canRiichi;
  console.log(`[PlayerArea ${props.player.id}] canDeclareRiichi: ${result}, isMyTurnAndCanActBeforeDiscard: ${isMyTurnAndCanActBeforeDiscard.value}, canRiichi: ${playerEligibility.value.canRiichi}`);
  return result;
});
/**
 * 暗槓が可能かどうかを判定します。
 */
const canDeclareAnkan = computed(() => {
  if (actionInProgress.value || !isMyTurnAndCanActBeforeDiscard.value) return false;
  const ankanInfo = gameStore.canDeclareAnkan[props.player.id];
  const result = ankanInfo === true || (Array.isArray(ankanInfo) && ankanInfo.length > 0);
  console.log(`[PlayerArea ${props.player.id}] canDeclareAnkan: ${result}, isMyTurnAndCanActBeforeDiscard: ${isMyTurnAndCanActBeforeDiscard.value}, ankanInfo:`, ankanInfo);
  return result;
});
/**
 * 加槓が可能かどうかを判定します。
 */
const canDeclareKakan = computed(() => {
  if (actionInProgress.value || !isMyTurnAndCanActBeforeDiscard.value) return false;
  const kakanOptions = gameStore.canDeclareKakan[props.player.id];
  const result = Array.isArray(kakanOptions) && kakanOptions.length > 0;
  console.log(`[PlayerArea ${props.player.id}] canDeclareKakan: ${result}, isMyTurnAndCanActBeforeDiscard: ${isMyTurnAndCanActBeforeDiscard.value}, kakanOptions:`, kakanOptions);
  return result;
});

/**
 * ロンが可能かどうかを判定します。
 */
const canDeclareRon = computed(() => {
  const result = !actionInProgress.value && gameStore.activeActionPlayerId === props.player.id && playerEligibility.value.canRon;
  console.log(`[PlayerArea ${props.player.id}] canDeclareRon: ${result}, activeActionPlayerId: ${gameStore.activeActionPlayerId}, myId: ${props.player.id}, canRon: ${playerEligibility.value.canRon}`);
  return result;
});
/**
 * ポンが可能かどうかを判定します。
 */
const canDeclarePon = computed(() => {
  const result = !actionInProgress.value && gameStore.activeActionPlayerId === props.player.id && playerEligibility.value.canPon;
  console.log(`[PlayerArea ${props.player.id}] canDeclarePon: ${result}, activeActionPlayerId: ${gameStore.activeActionPlayerId}, myId: ${props.player.id}, canPon: ${playerEligibility.value.canPon}`);
  return result;
});
/**
 * 明槓が可能かどうかを判定します。
 */
const canDeclareMinkan = computed(() => {
  const result = !actionInProgress.value && gameStore.activeActionPlayerId === props.player.id && playerEligibility.value.canMinkan;
  console.log(`[PlayerArea ${props.player.id}] canDeclareMinkan: ${result}, activeActionPlayerId: ${gameStore.activeActionPlayerId}, myId: ${props.player.id}, canMinkan: ${playerEligibility.value.canMinkan}`);
  return result;
});

/**
 * スキップボタンを表示するかどうかを判定します。
 */
const showSkipButton = computed(() => {
  const result = !actionInProgress.value && gameStore.activeActionPlayerId === props.player.id && (canDeclareRon.value || canDeclarePon.value || canDeclareMinkan.value);
  console.log(`[PlayerArea ${props.player.id}] showSkipButton: ${result}, activeActionPlayerId: ${gameStore.activeActionPlayerId}, myId: ${props.player.id}, canRon: ${canDeclareRon.value}, canPon: ${canDeclarePon.value}, canMinkan: ${canDeclareMinkan.value}`);
  return result;
});

/**
 * ストックアクションが可能かどうかを判定します。
 */
const canStockAction = computed(() => {
  const player = props.player;
  return (
    gameStore.ruleMode === 'stock' && // ストックルールが有効
    props.isMyHand && // 自分の手番
    isCurrentTurn.value && // 自分のターンであること
    gameStore.gamePhase === GAME_PHASES.AWAITING_DISCARD && // 打牌待ちフェーズ
    !player.stockedTile && // ストック牌をまだ持っていない
    !player.isUsingStockedTile && // ストック牌使用直後ではない
    !player.isRiichi && // リーチ中でない
    !player.isDoubleRiichi && // ダブルリーチ中でない
    !actionInProgress.value // 他のアクションが進行中でない
  );
});

const showStockCountdown = computed(() => {
  const currentPlayer = gameStore.players.find(p => p.id === gameStore.currentTurnPlayerId);
  return gameStore.gamePhase === GAME_PHASES.AWAITING_STOCK_SELECTION_TIMER &&
         gameStore.currentTurnPlayerId === props.player.id &&
         currentPlayer && !currentPlayer.isRiichi && !currentPlayer.isDoubleRiichi;
});

const isDrawFromWallActive = computed(() => {
  // ボタンが押せる（アクティブな）条件
  return props.player.id === gameStore.currentTurnPlayerId &&
         gameStore.gamePhase === GAME_PHASES.AWAITING_STOCK_SELECTION_TIMER &&
         props.position === 'bottom';
});

const shouldRenderDrawFromWallButton = computed(() => {
  // ボタンが表示されるべき条件
  // 1. 画面下部のプレイヤーであること (props.position === 'bottom')
  // 2. 引いてきた牌がないこと (!props.drawnTileDisplay)
  // 3. 自分のアクション直後（ポンやカン、打牌など）でないこと
  // 4. ★追加: ストックルールが有効であること
  const isMyActionPhase = gameStore.gamePhase === GAME_PHASES.AWAITING_DISCARD && gameStore.lastActionPlayerId === props.player.id;

  return props.position === 'bottom' &&
         !props.drawnTileDisplay &&
         !isMyActionPhase &&
         gameStore.ruleMode === 'stock'; // ★追加
});

const isStockTileSelectable = computed(() => {
  return props.isMyHand &&
         gameStore.currentTurnPlayerId === props.player.id && // 自分のターンであること
         gameStore.ruleMode === 'stock' && // ストックルールが有効
         gameStore.gamePhase === GAME_PHASES.AWAITING_STOCK_SELECTION_TIMER &&
         !!props.player.stockedTile;
});

const hasMelds = computed(() => {
  return props.player.melds && props.player.melds.length > 0;
});

/**
 * プレイヤーがアクションを宣言した時にイベントを発行します。
 * @param {string} actionType - 宣言されたアクションのタイプ（例: 'tsumoAgari', 'riichi', 'pon'）。
 */
function emitAction(actionType) {
    // アクションが保留中の場合は何もしない
    if (gameStore.isActionPending) return;

    // ボタンが押されたら、オンライン時のみすぐにアクション保留状態にする（オフラインでは即時処理されるため不要）
    if (gameStore.isGameOnline) {
      gameStore.isActionPending = true;
    }

    let tileData = null;    if (actionType === 'pon') tileData = playerEligibility.value.canPon;
    else if (actionType === 'minkan') tileData = playerEligibility.value.canMinkan;
    // 暗槓・加槓の場合、UIで選択された牌を渡す必要がある。
    // ここでは仮に、ストアが単一の牌オブジェクトを返しているか、
    // GameBoard側で選択UIを呼び出す前のトリガーとして機能すると想定。
    // より具体的には、カンする牌を選択するUIを別途呼び出し、その結果を渡す。
    else if (actionType === 'ankan') {
        const ankanOptions = gameStore.canDeclareAnkan[props.player.id];
        if (Array.isArray(ankanOptions) && ankanOptions.length === 1) {
            // 選択肢が1つしかないので、それを自動的に選択
            tileData = ankanOptions[0];
        } else {
            // 選択肢が複数ある、またはUIでの選択が必要な場合
            // GameBoardに選択を促すイベントを投げる (tileDataはnullのまま)
        }
    } else if (actionType === 'kakan') {
        const kakanOptions = gameStore.canDeclareKakan[props.player.id];
        if (Array.isArray(kakanOptions) && kakanOptions.length === 1) {
            // 選択肢が1つしかないので、それを自動的に選択
            tileData = kakanOptions[0];
        } else {
            // 選択肢が複数ある場合はUIでの選択が必要
        }
    } else if (actionType === 'stock') {
        // ストックアクションの場合、牌の選択はPlayerHandで行うため、ここではフェーズ変更のみ
        gameStore.gamePhase = GAME_PHASES.AWAITING_STOCK_TILE_SELECTION;
        gameStore.isActionPending = false; // 牌選択フェーズに移行するので、ボタンは再度有効にする
        return; // emitActionは行わない
    }
    emit('action-declared', { playerId: props.player.id, actionType, tile: tileData });
}

/**
 * 面子内の牌に適用する回転クラスを決定します。
 * 鳴かれた牌は横向きに表示されます。
 * @param {Object} meld - 面子オブジェクト。
 * @param {number} tileIndex - 面子内の牌のインデックス。
 * @returns {string} 適用するCSSクラス名（'rotated-meld-tile'など）。
 */
function getMeldTileRotationClass(meld, tileIndex) {
  
  // ポンと明槓以外は対象外
  if (meld.type !== 'pon' && meld.type !== 'minkan' && meld.type !== 'kakan') return '';

  const players = gameStore.players;
  const myPlayerId = props.player.id;
  const fromPlayerId = meld.from;

  const myIndex = players.findIndex(p => p.id === myPlayerId);
  const fromIndex = players.findIndex(p => p.id === fromPlayerId);

  if (myIndex === -1 || fromIndex === -1) return '';

  // 鳴いた相手の相対位置を計算 (1:右(下家), 2:対面, 3:左(上家))
  const relativePosition = (fromIndex - myIndex + players.length) % players.length;

  let rotatedTileIndex = -1;
  if (meld.type === 'pon' || meld.type === 'kakan') {
    // ポン: プレイヤーの視点から見て、どの牌を横にするか
    if (relativePosition === 1) { // 右(下家)から
      rotatedTileIndex = 2; // 右端の牌
    } else if (relativePosition === 2) { // 対面から
      rotatedTileIndex = 1; // 真ん中の牌
    } else if (relativePosition === 3) { // 左(上家)から
      rotatedTileIndex = 0; // 左端の牌
    }
  } else if (meld.type === 'minkan') {
    // 明槓: プレイヤーの視点から見て、どの牌を横にするか
    if (relativePosition === 1) { // 右(下家)から
      rotatedTileIndex = 3; // 一番右の牌
    } else if (relativePosition === 2) { // 対面から
      rotatedTileIndex = 1; // 左から2番目の牌
    } else if (relativePosition === 3) { // 左(上家)から
      rotatedTileIndex = 0; // 一番左の牌
    }
  }

  // 対面プレイヤーの場合、牌の並びが視覚的に逆になるため、左右の解釈を入れ替える
  if (props.position === 'top') {
    // ポンと加槓は3牌、明槓は4牌を基準に反転させる
    const lastIndex = (meld.type === 'pon' || meld.type === 'kakan') ? 2 : 3;
    if (rotatedTileIndex === 0) {
      rotatedTileIndex = lastIndex;
    } else if (rotatedTileIndex === lastIndex) {
      rotatedTileIndex = 0;
    }
    // 中央の牌(index 1)は反転不要
  }

  // 右プレイヤーの場合のみ、牌の並びが視覚的に逆になるため、上下の解釈を入れ替える
  if (props.position === 'right') {
    if (meld.type === 'pon' || meld.type === 'kakan') {
      // ポンと加槓は3牌構成として反転 (0番目と2番目を入れ替える)
      if (rotatedTileIndex === 0) {
        rotatedTileIndex = 2;
      } else if (rotatedTileIndex === 2) {
        rotatedTileIndex = 0;
      }
    } else if (meld.type === 'minkan') {
      // 明槓は4牌構成として反転
      const lastIndex = 3; // 4牌なので最後のインデックスは3
      if (rotatedTileIndex === 0) {
        rotatedTileIndex = lastIndex;
      } else if (rotatedTileIndex === lastIndex) {
        rotatedTileIndex = 0;
      }
    }
  }

  // tileIndexが回転対象のインデックスと一致すればクラスを返す
  const resultClass = tileIndex === rotatedTileIndex ? 'rotated-meld-tile' : '';
  
  return resultClass;
}


/**
 * 面子内の牌の画像URLを決定します。
 * 暗槓の場合、真ん中の2枚は裏向きの画像になります。
 * @param {Object} meld - 面子オブジェクト。
 * @param {Object} tile - 牌オブジェクト。
 * @param {number} tileIndex - 面子内の牌のインデックス。
 * @returns {string} 牌の画像URL。
 */
function getMeldTileImage(meld, tile, tileIndex) {
  
  // 暗槓の場合、真ん中の2枚を裏向きにする
  if (meld.type === 'ankan' && (tileIndex === 1 || tileIndex === 2)) {
    return getTileImageUrl(null); // tileUtilsのgetTileImageUrlはnullで裏向き画像を返す
  }
  const imageUrl = getTileImageUrl(tile);
  
  return imageUrl;
}

/**
 * 面子内の牌のaltテキストを決定します。
 * 暗槓の場合、真ん中の2枚は裏向きであることを示します。
 * @param {Object} meld - 面子オブジェクト。
 * @param {Object} tile - 牌オブジェクト。
 * @param {number} tileIndex - 面子内の牌のインデックス。
 * @returns {string} 牌のaltテキスト。
 */
function getMeldTileAlt(meld, tile, tileIndex) {
  if (meld.type === 'ankan' && (tileIndex === 1 || tileIndex === 2)) {
    return t('playerArea.facedownTile');
  }
  return tileToString(tile);
}
</script>

<style scoped>
.player-area {
  padding: 5px;
  display: flex;
  flex-direction: column; /* 基本は縦積み */
  align-items: center;
  position: relative; /* アクションボタンの絶対配置の基準 */
}
.player-game-elements {
  display: flex;
  width: 100%;
  /* アクションボタンが絶対配置になるため、このエリアがボタンと重ならないようにマージン調整が必要な場合がある */
  /* アクションボタンの基準位置を安定させるため、手牌エリアに最小サイズを設定 */
}

.player-area-bottom > .player-game-elements {
  flex-direction: column;
  align-items: center;
  min-width: 200px; /* 手牌4枚分 (50px * 4) */
  min-height: 70px; /* 牌の高さ */
  filter: drop-shadow(0px 3px 2px rgba(0, 0, 0, 0.8));
}
.player-area-top > .player-game-elements {
  flex-direction: column-reverse;
  align-items: center;
  min-width: 96px; /* 手牌4枚分 (24px * 4) */
  min-height: 35px; /* 牌の高さ */
  filter: drop-shadow(0px -3px 2px rgba(0, 0, 0, 0.8));
}
.player-area-left > .player-game-elements {
  flex-direction: row-reverse;
  align-items: center;
  width: fit-content; /* このコンテナも内容に合わせる */
  min-width: 35px; /* 牌の幅 */
  min-height: 96px; /* 手牌4枚分 (24px * 4) */
  filter: drop-shadow(-3px 0px 2px rgba(0, 0, 0, 0.8));
}
.player-area-right > .player-game-elements {
  flex-direction: row;
  align-items: center;
  width: fit-content; /* このコンテナも内容に合わせる */
  min-width: 35px; /* 牌の幅 */
  min-height: 96px; /* 手牌4枚分 (24px * 4) */
  filter: drop-shadow(3px 0px 2px rgba(0, 0, 0, 0.8));
}

/* 左右プレイヤーのエリア全体の幅を内容に合わせる */
.player-area-left, .player-area-right {
  width: 100%; /* 親コンテナの幅に合わせる */
}


.player-info { font-size: 0.9em; margin-bottom: 5px; text-align: center; }
.melds-area {
  display: flex;
  gap: 10px; /* 面子間のスペース */
  position: absolute;
  z-index: 20;
}
.meld {
  display: flex;
  gap: 0px; /* 牌同士はくっつける */
  /* ポンとカンで表示位置がずれないように、コンテナのサイズをカン(4牌)に合わせる */
}
.player-area-bottom .meld,
.player-area-top .meld {
  min-width: 107px; /* (牌24px * 3) + (横向き牌35px) = 107px */
}
.player-area-bottom .meld {
  justify-content: flex-end; /* ポン(3牌)の場合に右に寄せる */
}
.player-area-top .meld {
  justify-content: flex-start; /* ポン(3牌)の場合に左に寄せる */
}
.player-area-left .meld {
  min-height: 107px; /* (牌24px * 3) + (横向き牌35px) = 107px */
}
.player-area-right .meld {
  min-height: 107px;
  justify-content: flex-end; /* ポン(3牌)の場合に下に寄せる */
}
.player-area-left .meld,
.player-area-right .meld {
  flex-direction: column;
}
.player-area-left .meld-tile,
.player-area-right .meld-tile {
  width: 28px;  /* 回転後の牌の幅 (画像の高さに合わせる) */
  height: 20px; /* 回転後の牌の高さ (画像の幅に合わせる) */
}
.player-area-bottom .meld-tile{
  width: 28px;  /* 回転後の牌の幅 (画像の高さに合わせる) */
  height: 20px; /* 回転後の牌の高さ (画像の幅に合わせる) */
}
.meld-tile {
  display: flex;
  justify-content: center;
  align-items: center;
}
/* 自家(手前)の鳴き牌コンテナは少し大きく */
.player-area-bottom .meld-tile {
  width: auto; /* 幅は画像に合わせる */
  height: 42px; /* 高さを指定 */
}
/* 各プレイヤーの面子エリアの位置と向き */
.player-area-bottom .melds-area {
  flex-direction: row-reverse; /* 右から左に面子を追加 */
  bottom: 0%;
  right: -100px;
  margin-bottom: 5px;
}
.player-area-top .melds-area {
  flex-direction: row; /* 左から右に面子を追加 */
  top: 0%;
  left:-100px;
  margin-top: 5px;
}
.player-area-left .melds-area {
  flex-direction: column; /* 上から下に面子を追加 */
  top: 120px;
  left: 7%; /* 手牌エリアの右側に配置 */
  margin-left: 5px; /* 手牌との間に少しスペースを空ける */
}
.player-area-right .melds-area {
  flex-direction: column-reverse; /* 下から上に面子を追加 */
  top: -240px; /* 垂直方向の中央に配置 */
  right: 20%; /* 手牌エリアの左側に配置 */
  margin-right: 5px; /* 手牌との間に少しスペースを空ける */
}

/* 牌の基本サイズと向き */
.meld-tile-image {
  width: 20px;
  height: 28px;
  display: block;
}
/* 自家(手前)の鳴き牌画像は大きく */
.player-area-bottom .meld-tile-image {
  width: 25px;
  height: 34px;
}
.player-area-top .meld-tile-image { transform: rotate(180deg); }
.player-area-left .meld-tile-image { transform: rotate(90deg); }
.player-area-right .meld-tile-image { transform: rotate(-90deg); }

/* ポンで横にする牌のスタイル */
.rotated-meld-tile {
  /* 横向きの牌は少しずらして重ねる */
  position: relative;
}
.player-area-bottom .rotated-meld-tile {
  /* 横向きの牌のコンテナは、牌の高さ分の幅を持つ */
  width: 34px; /* 新しい牌の高さに合わせる */
  bottom: -5px; /* 位置を微調整 */
}
.player-area-top .rotated-meld-tile {
  /* 横向きの牌のコンテナは、牌の高さ分の幅を持つ */
  width: 28px;
  bottom: 5px;
}
.player-area-bottom .rotated-meld-tile .meld-tile-image,
.player-area-top .rotated-meld-tile .meld-tile-image {
  transform: rotate(90deg);
}
.player-area-left .rotated-meld-tile{
  /* 縦向きの牌のコンテナは、牌の高さ分の高さを持つ */
  width: 20px;  /* 縦向きの牌の幅 */
  height: 28px; /* 縦向きの牌の高さ */
}
.player-area-right .rotated-meld-tile {
  /* 縦向きの牌のコンテナは、牌の高さ分の高さを持つ */
  width: 20px;  /* 縦向きの牌の幅 */
  height: 28px; /* 縦向きの牌の高さ */
  left: 8px;
}
.player-area-left .rotated-meld-tile .meld-tile-image,
.player-area-right .rotated-meld-tile .meld-tile-image {
  transform: none; /* 左右プレイヤーの場合は回転をリセットして縦置きにする */
}

.kakan-added-tile {
  position: absolute;
  z-index: 1; /* ベースの牌より手前に表示 */
}

/* --- 各プレイヤーの加槓した牌の位置調整 --- */

/* 自家(下)の加槓牌の位置 */
.player-area-bottom .kakan-added-tile {
  top: -22px;  /* 上にずらす量 (マイナス値を大きくすると、より上に) */
  left: 4px;  /* 右にずらす量 */
}

/* 対面(上)の加槓牌の位置 */
.player-area-top .kakan-added-tile {
  top: 20px;   /* 下にずらす量 */
  left: 4px; /* 左にずらす量 (マイナス値を大きくすると、より左に) */
}

/* 左家の加槓牌の位置 */
.player-area-left .kakan-added-tile{
  top: 0px;   /* 縦方向にずらす量 */
  left: 20px;  /* 横方向にずらす量 */

}

/* 右家の加槓牌の位置 */
.player-area-right .kakan-added-tile {
  top: 0px;   /* 縦方向にずらす量 */
  left: -20px;  /* 横方向にずらす量 */
}

.player-actions {
    margin-top: 5px;
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
    justify-content: center; /* ボタンを中央揃え */
    position: absolute; /* 他の要素のレイアウトフローから切り離す */
    z-index: 30; /* 他の要素より手前に表示 */
    padding: 5px;
    border-radius: 4px;
}

/* 各ポジションごとのアクションボタンの位置調整 */
.player-actions-bottom {
  /* 自家: 手牌の右上 */
  top: -95%; /* 親エリアの上端から少し内側など、調整が必要 */
  right: -10.5%; /* 親エリアの右端から少し内側など、調整が必要 */
  /* transform: translate(X, Y); で微調整も可能 */
  flex-direction: row; /* ボタンを横に並べる */
  justify-content: flex-end;
  align-items: flex-start;
}
.player-actions-top {
  /* 対面: 画面から見て手牌の左下 */
  bottom: -80%;
  left: 0%;
  flex-direction: row; /* ボタンを横に並べる */
  justify-content: flex-start;
  align-items: flex-end;
}

/* アクションボタンの向き調整 */
.player-actions-left, .player-actions-right {
  flex-direction: column; /* 左右プレイヤーのボタンは縦に並べる */
  gap: 3px;
}
.player-actions-left {
  /* 左側: 画面から見て手牌の右下 */
  bottom: 0%;
  right: -230%;
  /* transform: translate(X, Y); で微調整も可能 */
  align-items: flex-end; /* ボタンを右寄せ */
  justify-content: flex-end; /* ボタンを下寄せ */
}
.player-actions-right {
  /* 右側: 画面から見て手牌の左上 */
  top: 0%;
  left: -230%;
  align-items: flex-start; /* ボタンを左寄せ */
  justify-content: flex-start; /* ボタンを上寄せ */
}
.action-image-button {
  /* ボタン画像を適切なサイズに調整 */
  width: 100px; /* 例: 幅60px (調整可能) */
  height: auto; /* 高さは自動 */
  cursor: pointer;
  transition: transform 0.15s ease, filter 0.15s ease;
  pointer-events: auto; /* クリックイベントを確実に受け取るようにする */
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.25)); /* 初期状態で少し影をつける */
}
.action-image-button:hover {
  transform: translateY(-3px); /* 少し上に浮き上がる */
  filter: drop-shadow(0 5px 5px rgba(0, 0, 0, 0.35)); /* ホバー時により濃い影をつける */
}
.action-image-button:active {
  transform: translateY(-1px); /* クリック時に少し沈む */
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.2)); /* 影を少し弱める */
}

.stocked-tile-area {
  display: flex;
  position: absolute;
  z-index: 10;
  transition: transform 0.05s ease-out;
  scale: 1;
}
.stocked-tile-area.selectable {
  cursor: pointer;
}
.player-area-bottom.stocked-tile-area.selectable:hover {
  transform: translateX(-50%) translateY(-5px);
}
.player-area-top.stocked-tile-area.selectable:hover {
  transform: translateX(-50%) rotate(180deg) translateY(5px);
}
.player-area-left.stocked-tile-area.selectable:hover {
  transform: translateX(50%) rotate(90deg) translateY(5px);
}
.player-area-right.stocked-tile-area.selectable:hover {
  transform: translateY(-50%) rotate(-90deg) translateY(5px);
}
.player-area-bottom.stocked-tile-area {
  bottom: 75px;
  left: 90%;
  transform: translateX(-50%);
}
.player-area-top.stocked-tile-area {
  top: 40px;
  left: -20%;
  transform: translateX(-50%) rotate(180deg);
}
.player-area-left.stocked-tile-area {
  left: 30px;
  top: 120%;
  transform: translateX(50%) rotate(90deg);
}
.player-area-right.stocked-tile-area {
  right: 40px;
  top: -25%;
  transform: translateY(-50%) rotate(-90deg);
}

.stocked-tile-area .tile img {
  scale: 0.9;
}

.stocked-tile-area.disabled {
  cursor: not-allowed;
}

.pointer-events-none {
  pointer-events: none;
}

.selected-stocked-tile {
  border: 0px solid gold;
  box-shadow: 0 0 10px gold;
  border-radius: 20px;
}

/* ストック牌の回転とサイズ調整 */
.stocked-tile-area .tile img {
  width: 47px; /* 自家(bottom)のデフォルトサイズ */
  height: 62px;
}
.player-area-top.stocked-tile-area .tile img,
.player-area-left.stocked-tile-area .tile img,
.player-area-right.stocked-tile-area .tile img {
  width: 24px; /* 他家のサイズ */
  height: 32px;
}
.player-area-top.stocked-tile-area .tile img,
.player-area-left.stocked-tile-area .tile img,
.player-area-right.stocked-tile-area .tile img {
  transform: none;
}

.stock-frame-image {
  opacity: 1;
  filter: drop-shadow(0px 0px 2px rgba(0, 0, 0, 0.8));
}

.stocked-tile-content {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* フレーム画像のサイズと位置調整 */
.player-area-bottom .stock-frame-image {
  width: 60px;
  height: 72px;
  transform: translate(0px, -2px); /* ここで微調整 */
}

.player-area-top .stock-frame-image {
  width: 31px;
  height: 38px;
  transform: translate(0px, -2px); /* ここで微調整 */
}

.player-area-left .stock-frame-image {
  width: 31px;
  height: 38px;
  transform: translate(7px, -2px); /* ここで微調整 */
}

.player-area-right .stock-frame-image {
  width: 31px;
  height: 38px;
  transform: translate(7px, -2px); /* ここで微調整 */
}

.draw-from-wall-area {
  position: absolute;
  top: 12px; /* player-areaの上端からの距離 */
  left: 215px; /* player-areaの左端からの距離 (手牌4枚分+α) */
  width: 60px; /* 画像のサイズに合わせて調整 */
  height: 60px; /* 画像のサイズに合わせて調整 */
  background-color: transparent; /* 背景色を透明に */
  border: none; /* 枠線を削除 */
  border-radius: 0; /* 角丸を削除 */
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  z-index: 25; /* 手牌より手前、アクションボタンより奥 */
  transition: transform 0.2s ease; /* leftプロパティのトランジションを削除 */
}

.draw-from-wall-area.has-melds {
  left: 140px; /* ポンやカンがある場合は左にずらす */
}
.draw-from-wall-area:hover.is-active { /* アクティブな時だけホバー効果 */
  transform: translateY(-3px); /* ホバーで少し浮き上がる */
}

.draw-from-wall-area:not(.is-active) {
  opacity: 0.5; /* 非アクティブ時は半透明 */
  cursor: not-allowed; /* カーソルを禁止マークに */
  pointer-events: none; /* クリックイベントを無効化 */
}
.draw-from-wall-image {
  width: 100%; /* 親要素いっぱいに */
  height: 100%; /* 親要素いっぱいに */
  object-fit: contain; /* 画像全体が表示されるように */
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.3)); /* 影を追加 */
}
/* .draw-from-wall-text は削除されたので不要 */

.fade-gauge-enter-active,
.fade-gauge-leave-active {
  transition: opacity 0.2s ease;
}

.fade-gauge-enter-from,
.fade-gauge-leave-to {
  opacity: 0;
}

.is-waiting {
  pointer-events: none;
  opacity: 0.7;
}

.skip-button {
  width: 85px;
  margin-top: 2px;
  margin-right: 6px;
}

.stock-button {
  width: 65px;
  height: 35px;
  margin-right: 6px;
}

.stocked-tile-content .is-stocked-tile img {
  /* 牌の背後から光っているように見せるため、drop-shadowを使用 */
  filter: drop-shadow(0 0 5px rgb(14, 59, 194));
}
</style>