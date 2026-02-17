<template>
  <div class="game-board">
    <!-- :styleで動的にtransformを適用 -->
    <div
      ref="gameBoardScalerRef"
      class="game-board-scaler"
      :style="scalerStyle"
    >
      <!-- ルール・役一覧ボタン -->
      <div class="game-board-top-left-buttons">
        <img
          :src="t('gameBoard.ruleButtonImg')"
          :alt="t('gameBoard.rules')"
          class="info-button-image"
          @click="showRulesPopup = true"
        >
        <img
          :src="t('gameBoard.yakuButtonImg')"
          :alt="t('gameBoard.yakuList')"
          class="info-button-image"
          @click="showYakuListPopup = true"
        >
      </div>
      <!-- タイトルへ戻るボタン -->
      <div
        v-if="showReturnButton"
        class="game-board-header"
      >
        <img 
          :src="t('gameBoard.backToTitleButtonImg')" 
          :alt="t('gameBoard.backToTitle')" 
          class="return-button-image"
          @click="returnToTitle"
        >
      </div>
      <!-- PlayerArea コンポーネントを動的に配置 -->
      <!-- DOMの記述順と表示順が column-reverse で逆になることに注意 -->

      <!-- 画面の一番下に表示 -->
      <div
        v-if="playerAtBottom"
        class="player-area-container bottom-player-container"
      >
        <img
          :src="playerIcon(playerAtBottom)"
          alt="Player Icon"
          class="cat-icon cat-icon-bottom"
          @click="openPlayerInfoPopup(playerAtBottom, $event)"
        >
        <!-- フリテン表示 -->
        <img
          v-if="isMyPlayerInFuriTen"
          :src="t('gameBoard.furitenImg')"
          :alt="t('gameBoard.furiten')"
          class="furiten-indicator bottom-furiten"
        >
        <!-- Debugging: Log values before accessing isTenpaiDisplay -->
        <template v-if="console.log('Debug: gameStore.isTenpaiDisplay', gameStore.isTenpaiDisplay, 'playerAtBottom.id', playerAtBottom?.id)" />
        <img
          v-if="gameStore.isTenpaiDisplay && gameStore.isTenpaiDisplay[playerAtBottom.id]"
          :src="t('gameBoard.tenpaiImg')"
          :alt="t('gameBoard.tenpai')"
          class="tenpai-indicator bottom-tenpai"
        >
        <PlayerArea
          :player="playerAtBottom"
          position="bottom"
          :is-my-hand="determineIsMyHand(playerAtBottom.id)"
          :drawn-tile-display="drawnTileForPlayer(playerAtBottom.id)"
          :can-discard="canPlayerDiscard(playerAtBottom.id)"
          @tile-selected="handleTileSelection"
          @action-declared="handlePlayerAction"
        />
      </div>

      <!-- 中央エリア (左右プレイヤーと中央テーブル) -->
      <div class="middle-row">
        <div
          v-if="playerAtLeft"
          class="player-area-container left-player-container"
        >
          <img
            :src="playerIcon(playerAtLeft)"
            :alt="t('gameBoard.leftPlayerIcon')"
            :class="{'cat-icon-left-flipped': isKuroAtLeft}"
            class="cat-icon cat-icon-left"
            @click="openPlayerInfoPopup(playerAtLeft, $event)"
          >
          <img
            v-if="isLeftPlayerInFuriTen"
            :src="t('gameBoard.furitenImg')"
            :alt="t('gameBoard.furiten')"
            class="furiten-indicator left-furiten"
          >
          <img
            v-if="gameStore.isTenpaiDisplay[playerAtLeft.id]"
            :src="t('gameBoard.tenpaiImg')"
            :alt="t('gameBoard.tenpai')"
            class="tenpai-indicator left-tenpai"
          >
          <PlayerArea
            :player="playerAtLeft"
            position="left"
            :is-my-hand="determineIsMyHand(playerAtLeft.id)"
            :drawn-tile-display="drawnTileForPlayer(playerAtLeft.id)"
            :can-discard="canPlayerDiscard(playerAtLeft.id)"
            @tile-selected="handleTileSelection"
            @action-declared="handlePlayerAction"
          />
        </div>
        <div class="center-table">
          <CenterTableInfo :ordered-players="orderedPlayersForDisplay" />
          <!-- 自家の捨て牌エリア (中央テーブルのすぐ下) -->
          <div class="bottom-discard-container">
            <DiscardPile
              v-if="playerAtBottom"
              :tiles="playerAtBottom.discards"
              position="bottom"
              :riichi-discarded-tile-id="gameStore.riichiDiscardedTileId[playerAtBottom.id]"
              :highlighted-tile-id="gameStore.highlightedDiscardTileId"
              class="discard-pile-bottom-player"
            />
          </div>
        </div>
        <div
          v-if="playerAtRight"
          class="player-area-container right-player-container"
        >
          <img
            :src="playerIcon(playerAtRight)"
            :alt="t('gameBoard.rightPlayerIcon')"
            :class="{'cat-icon-right-flipped': isToraAtRight}"
            class="cat-icon cat-icon-right"
            @click="openPlayerInfoPopup(playerAtRight, $event)"
          >
          <img
            v-if="isRightPlayerInFuriTen"
            :src="t('gameBoard.furitenImg')"
            :alt="t('gameBoard.furiten')"
            class="furiten-indicator right-furiten"
          >
          <img
            v-if="gameStore.isTenpaiDisplay[playerAtRight.id]"
            :src="t('gameBoard.tenpaiImg')"
            :alt="t('gameBoard.tenpai')"
            class="tenpai-indicator right-tenpai"
          >
          <PlayerArea
            :player="playerAtRight"
            position="right"
            :is-my-hand="determineIsMyHand(playerAtRight.id)"
            :drawn-tile-display="drawnTileForPlayer(playerAtRight.id)"
            :can-discard="canPlayerDiscard(playerAtRight.id)"
            @tile-selected="handleTileSelection"
            @action-declared="handlePlayerAction"
          />
        </div>
      </div>

      <!-- 画面の一番上に表示 -->
      <div
        v-if="playerAtTop"
        class="player-area-container top-player-container"
      >
        <img
          :src="playerIcon(playerAtTop)"
          :alt="t('gameBoard.topPlayerIcon')"
          class="cat-icon cat-icon-top"
          @click="openPlayerInfoPopup(playerAtTop, $event)"
        >
        <PlayerArea
          :player="playerAtTop"
          position="top"
          :is-my-hand="determineIsMyHand(playerAtTop.id)"
          :drawn-tile-display="drawnTileForPlayer(playerAtTop.id)"
          :can-discard="canPlayerDiscard(playerAtTop.id)"
          @tile-selected="handleTileSelection"
          @action-declared="handlePlayerAction"
        />
        <img
          v-if="isTopPlayerInFuriTen"
          :src="t('gameBoard.furitenImg')"
          :alt="t('gameBoard.furiten')"
          class="furiten-indicator top-furiten"
        >
        <img
          v-if="gameStore.isTenpaiDisplay[playerAtTop.id]"
          :src="t('gameBoard.tenpaiImg')"
          :alt="t('gameBoard.tenpai')"
          class="tenpai-indicator top-tenpai"
        >
        <!-- 対面の捨て牌エリア (対面手牌のすぐ下) -->
        <div class="top-discard-container">
          <DiscardPile
            v-if="playerAtTop"
            :tiles="playerAtTop.discards"
            position="top"
            :riichi-discarded-tile-id="gameStore.riichiDiscardedTileId[playerAtTop.id]"
            :highlighted-tile-id="gameStore.highlightedDiscardTileId"
            class="discard-pile-top-player"
          />
        </div>
      </div>
      
      <!-- 左の捨て牌エリア (絶対配置) -->
      <div class="left-discard-container">
        <DiscardPile
          v-if="playerAtLeft"
          :tiles="playerAtLeft.discards"
          position="left"
          :riichi-discarded-tile-id="gameStore.riichiDiscardedTileId[playerAtLeft.id]"
          :highlighted-tile-id="gameStore.highlightedDiscardTileId"
          class="discard-pile-left-player"
        />
      </div>

      <!-- 右の捨て牌エリア (絶対配置) -->
      <div class="right-discard-container">
        <DiscardPile
          v-if="playerAtRight"
          :tiles="playerAtRight.discards"
          position="right"
          :riichi-discarded-tile-id="gameStore.riichiDiscardedTileId[playerAtRight.id]"
          :highlighted-tile-id="gameStore.highlightedDiscardTileId"
          class="discard-pile-right-player"
        />
      </div>

      <ResultPopup
        :show="gameStore.showResultPopup"
        :message="gameStore.resultMessage"
        :result-details="gameStore.agariResultDetails"
        @close="handleCloseResultPopup"
      />
      
      <ParentDecisionPopup
        :show="gameStore.showDealerDeterminationPopup"
        :dealer-determination-results="sortedPlayersForPopup"
        @close="handleCloseDealerDeterminationPopup"
      />
      <FinalResultPopup
        :show="gameStore.showFinalResultPopup"
        :final-result-details="gameStore.finalResultDetails"
        @start-new-game="handleStartNewGameFromFinalResult"
        @back-to-title="handleBackToTitleFromFinalResult"
      />
      <!-- 最終結果へのフェードアウト用オーバーレイ -->
      <div
        class="fade-overlay"
        :class="{ 'is-fading': isFadingToFinalResult }"
      />

      <!-- ロン・ツモ・ポン・カンなどの宣言アニメーション -->
      <img
        v-if="animationDisplay && animationDisplay.type === 'ron'"
        :src="t('gameBoard.ronImg')"
        :class="['ron-indicator', `ron-indicator-${animationDisplay.position}`, 'ron-animation']"
        :alt="t('gameBoard.ron')"
      >
      <!-- 自家のリーチアニメーション -->
      <div
        v-if="animationDisplay && animationDisplay.type === 'riichi' && animationDisplay.position === 'bottom'"
        class="riichi-container riichi-slide-animation"
      >
        <img
          :src="t('gameBoard.riichiImg')"
          :alt="t('gameBoard.riichi')"
          class="riichi-image-scaled"
        >
      </div>

      <!-- 他家のリーチアニメーション -->
      <div
        v-if="animationDisplay && animationDisplay.type === 'riichi' && animationDisplay.position === 'top'"
        class="riichi-container-top riichi-slide-animation-top"
      >
        <img
          :src="t('gameBoard.riichiImg')"
          :alt="t('gameBoard.riichi')"
          class="riichi-image-scaled"
        >
      </div>
      <img
        v-if="animationDisplay && animationDisplay.type === 'riichi' && animationDisplay.position === 'right'"
        :src="t('gameBoard.riichiImg')"
        :alt="t('gameBoard.riichi')"
        class="riichi-image-right riichi-slide-animation-right"
      >
      <img
        v-if="animationDisplay && animationDisplay.type === 'riichi' && animationDisplay.position === 'left'"
        :src="t('gameBoard.riichiImg')"
        :alt="t('gameBoard.riichi')"
        class="riichi-image-left riichi-slide-animation-left"
      >
      <img
        v-if="animationDisplay && animationDisplay.type === 'tsumo'"
        :src="t('gameBoard.tsumoImg')"
        :class="['ron-indicator', `ron-indicator-${animationDisplay.position}`, 'tsumo-animation']"
        :alt="t('gameBoard.tsumo')"
      >
      <img
        v-if="animationDisplay && animationDisplay.type === 'pon'"
        :src="t('gameBoard.ponImg')"
        :class="['ron-indicator', `ron-indicator-${animationDisplay.position}`, 'pon-animation', 'pon-kan-size']"
        :alt="t('gameBoard.pon')"
      >
      <img
        v-if="animationDisplay && animationDisplay.type === 'kan'"
        :src="t('gameBoard.kanImg')"
        :class="['ron-indicator', `ron-indicator-${animationDisplay.position}`, 'pon-kan-size', 'kan-animation']"
        :alt="t('gameBoard.kan')"
      >
      
      <!-- ストックアニメーション -->
      <img
        v-if="stockAnimationDisplay"
        :src="t('gameBoard.stockImg')"
        :class="['stock-indicator', `stock-indicator-${stockAnimationDisplay.position}`]"
        :alt="t('gameBoard.stock')"
      >

      <!-- 各種ポップアップ -->
      <RulePopup
        :show="showRulesPopup"
        @close="showRulesPopup = false"
      />
      <YakuListPopup
        :show="showYakuListPopup"
        @close="showYakuListPopup = false"
      />
      <ParentDecisionPopup
        :show="gameStore.showDealerDeterminationPopup"
        :dealer-determination-results="sortedPlayersForPopup"
        @close="handleCloseDealerDeterminationPopup"
      />
      <!-- PlayerInfoPopup を game-board-scaler の内部に移動 -->
      <PlayerInfoPopup 
        :show="showPlayerInfoPopup" 
        :player="selectedPlayerForPopup" 
        @close="closePlayerInfoPopup"
      />
    </div> <!-- game-board-scaler の閉じタグ -->
  </div>
</template>
  
<script setup>
  import { computed, onMounted, ref, onBeforeUnmount, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  
  
  import { useGameStore } from '@/stores/gameStore';
  
  import { useUserStore } from '@/stores/userStore';
  import CenterTableInfo from './CenterTableInfo.vue';
  import DiscardPile from './DiscardPile.vue';
  import PlayerArea from './PlayerArea.vue';
  import ResultPopup from './ResultPopup.vue';
  import FinalResultPopup from './FinalResultPopup.vue';
  import ParentDecisionPopup from './ParentDecisionPopup.vue';
  import RulePopup from './RulePopup.vue';
  import YakuListPopup from './YakuListPopup.vue';
  import PlayerInfoPopup from './PlayerInfoPopup.vue'; // PlayerInfoPopupをインポート
  // import Wall from './Wall.vue'; // 将来的に使用
  
  import { GAME_PHASES } from '@/stores/gameStore'; // ゲームフェーズ定数

/**
 * ゲームボードコンポーネント。
 * 麻雀のゲーム画面全体を管理し、各プレイヤーエリア、中央テーブル、捨て牌、ポップアップなどを描画します。
 * ゲームの進行に合わせてUIを動的に更新し、プレイヤーのアクションをgameStoreに伝達します。
 */

  // --- リアクティブ変数とストアの初期化 ---
  const { t } = useI18n();
  const gameStore = useGameStore();
  
  const userStore = useUserStore();
  const router = useRouter();
  const showRulesPopup = ref(false); // ルールポップアップの表示状態
  const showYakuListPopup = ref(false); // 役一覧ポップアップの表示状態
  const gameBoardScalerRef = ref(null); // ゲームボードのスケーリング用divへの参照
  const isFadingToFinalResult = ref(false); // 最終結果へのフェードアウト用フラグ
  const showPlayerInfoPopup = ref(false); // プレイヤー情報ポップアップの表示状態
  const selectedPlayerForPopup = ref(null); // ポップアップに表示するプレイヤーデータ

  /**
   * プレイヤー情報に基づいてアイコン画像のパスを返します。
   * @param {object} player - プレイヤーオブジェクト
   * @returns {string|null} アイコン画像のパス。見つからない場合はnull。
   */
  const playerIcon = (player) => {
    if (!player) return '';

    // オンライン対戦の場合
    if (gameStore.isGameOnline) {
      if (player.avatar_url) {
        return player.avatar_url;
      }
      // デフォルトのオンラインプレイヤーアイコン
      return '/assets/images/info/hito_icon_1.png'; // 仮のデフォルトアイコン
    }

    // オフライン対戦の場合 (既存ロジック)
    if (player.id === 'player1' && userStore.profile?.avatar_url) {
      return userStore.profile.avatar_url;
    }
    if (player.id === 'player1') return '/assets/images/info/hito_icon_1.png'; // あなた
    if (player.originalId === 'kuro') return '/assets/images/info/cat_icon_3.png'; // くろ
    if (player.originalId === 'tama') return '/assets/images/info/cat_icon_2.png'; // たま
    if (player.originalId === 'tora') return '/assets/images/info/cat_icon_1.png'; // とら
    if (player.originalId === 'janneko') return '/assets/images/info/cat_icon_4.png'; // 雀猫様
    return null;
  };

  // --- 画面スケーリング関連のロジック ---
  const DESIGN_WIDTH = 360; // ベースとなるデザインの幅 (9:16のアスペクト比)
  const DESIGN_HEIGHT = 640; // ベースとなるデザインの高さ (9:16のアスペクト比)
  const scaleFactor = ref(1); // 拡大縮小率

  /**
   * ゲームボード全体のスケーリングスタイルを計算します。
   * ウィンドウサイズに合わせて、アスペクト比を維持しながら画面にフィットするように調整します。
   */
  const scalerStyle = computed(() => ({
    transform: `translate(-50%, -50%) scale(${scaleFactor.value})`
  }));

  /**
   * gameStoreのアニメーション状態から、画面表示用のアニメーション情報を生成します。
   * @returns {{type: string, position: string}|null} アニメーション種別と表示位置。アニメーションがない場合はnull。
   */
  const animationDisplay = computed(() => {
    const state = gameStore.animationState;
    if (!state.type || !state.playerId) {
      return null;
    }

    const playerIndex = orderedPlayersForDisplay.value.findIndex(p => p.id === state.playerId);
    let position = '';
    if (playerIndex === 0) position = 'bottom';
    else if (playerIndex === 1) position = 'right';
    else if (playerIndex === 2) position = 'top';
    else if (playerIndex === 3) position = 'left';

    return { type: state.type, position };
  });

  /**
   * 「タイトルへ戻る」ボタンの表示条件を決定します。
   */
  const showReturnButton = computed(() => {
    return (gameStore.gameMode === 'allManual' || gameStore.gameMode === 'vsCPU') &&
           !gameStore.showResultPopup &&
           !gameStore.showFinalResultPopup;
  });

  /**
   * 現在操作しているプレイヤーのIDを返します。
   * モードによって操作プレイヤーを決定します。
   */
  const myPlayerId = computed(() => {
    // オンライン対戦の場合、ストアに保持されたユーザー自身のIDを返す
    if (gameStore.isGameOnline) {
      return gameStore.localPlayerId;
    }
    // 全操作モードとCPU対戦モードでは、'player1'を操作プレイヤーと仮定
    if (gameStore.gameMode === 'allManual' || gameStore.gameMode === 'vsCPU') {
      return 'player1';
    }
    // Fallback (should not happen if gameMode is set correctly)
    return null;
  });

  /**
   * 画面表示用のプレイヤー順序を計算します。
   * 操作プレイヤー(myPlayerId)が常に画面下部に表示されるように順序を並べ替えます。
   * @returns {Array<Object>} [下家, 右家, 対面, 左家] の順にソートされたプレイヤー配列。
   */
  const orderedPlayersForDisplay = computed(() => {
    // ★ BUG FIX: プレイヤーが4人揃うまでは処理しない
    if (gameStore.players.length !== 4 || !myPlayerId.value) return [];

    // ★ BUG FIX: findIndexのコールバック内でプレイヤー(p)が未定義でないかチェック
    const myIndex = gameStore.players.findIndex(p => p && p.id === myPlayerId.value);
    if (myIndex === -1) return []; // 自分のプレイヤーが見つからない場合は空配列

    const players = [...gameStore.players];
    const bottomP = players[myIndex];
    const rightP = players[(myIndex + 1) % 4];
    const topP = players[(myIndex + 2) % 4];
    const leftP = players[(myIndex + 3) % 4];

    return [bottomP, rightP, topP, leftP];
  });

  // --- 各位置のプレイヤー情報を取得する算出プロパティ群 ---
  const playerAtBottom = computed(() => orderedPlayersForDisplay.value[0]);
  const playerAtRight = computed(() => orderedPlayersForDisplay.value[1]);
  const playerAtTop = computed(() => orderedPlayersForDisplay.value[2]);
  const playerAtLeft = computed(() => orderedPlayersForDisplay.value[3]);

  /**
   * 左側のプレイヤーが「くろ」であるか、また画像を反転させる必要があるかを判定します。
   */
  const isKuroAtLeft = computed(() => {
    return playerAtLeft.value && playerAtLeft.value.originalId === 'kuro';
  });

  /**
   * 右側のプレイヤーが「とら」であるか、また画像を反転させる必要があるかを判定します。
   */
  const isToraAtRight = computed(() => {
    return playerAtRight.value && playerAtRight.value.originalId === 'tora';
  });

  const stockAnimationDisplay = computed(() => {
    const playerId = gameStore.stockAnimationPlayerId;
    if (!playerId) {
      return null;
    }

    const playerIndex = orderedPlayersForDisplay.value.findIndex(p => p.id === playerId);
    let position = '';
    if (playerIndex === 0) position = 'bottom';
    else if (playerIndex === 1) position = 'right';
    else if (playerIndex === 2) position = 'top';
    else if (playerIndex === 3) position = 'left';

    return { position };
  });

  /**
   * 親決めポップアップ用に、プレイヤーを座風の順（東南西北）にソートします。
   */
  const sortedPlayersForPopup = computed(() => {
    const players = gameStore.dealerDeterminationResult.players;
    const windOrder = ['東', '南', '西', '北'];
    return [...players].sort((a, b) => {
      return windOrder.indexOf(a.seatWind) - windOrder.indexOf(b.seatWind);
    });
  });

  // --- フリテン状態を判定する算出プロパティ群 ---
  const isMyPlayerInFuriTen = computed(() => {
    if (!playerAtBottom.value) return false;
    const playerId = playerAtBottom.value.id;
    return !!(gameStore.isFuriTen[playerId] || gameStore.isDoujunFuriTen[playerId]);
  });

  const isTopPlayerInFuriTen = computed(() => {
    if (!playerAtTop.value) return false;
    const playerId = playerAtTop.value.id;
    return gameStore.gameMode === 'allManual' && !!(gameStore.isFuriTen[playerId] || gameStore.isDoujunFuriTen[playerId]);
  });

  const isLeftPlayerInFuriTen = computed(() => {
    if (!playerAtLeft.value) return false;
    const playerId = playerAtLeft.value.id;
    return gameStore.gameMode === 'allManual' && !!(gameStore.isFuriTen[playerId] || gameStore.isDoujunFuriTen[playerId]);
  });

  const isRightPlayerInFuriTen = computed(() => {
    if (!playerAtRight.value) return false;
    const playerId = playerAtRight.value.id;
    return gameStore.gameMode === 'allManual' && !!(gameStore.isFuriTen[playerId] || gameStore.isDoujunFuriTen[playerId]);
  });

  /**
   * 指定されたプレイヤーの手牌を表示するかどうかを決定します。
   * @param {string} playerId - 判定するプレイヤーのID。
   * @returns {boolean} 手牌を表示する場合はtrue。
   */
  function determineIsMyHand(playerId) {
    if (gameStore.gameMode === 'allManual') {
      return true; // 全操作モードでは全ての牌を表向きに
    }
    // 流局フェーズで、かつテンパイ表示が有効なプレイヤーの手牌を表向きにする
    if (gameStore.gamePhase === GAME_PHASES.ROUND_END && gameStore.isTenpaiDisplay[playerId]) {
      return true;
    }
    // CPU対戦モードやオンライン対戦モードの場合、自分のプレイヤーIDと一致する場合のみ手牌を表示
    return myPlayerId.value === playerId;
  }

  /**
   * 指定されたプレイヤーのツモ牌を取得します。
   * @param {string} playerId - プレイヤーID。
   * @returns {Object|null} ツモ牌オブジェクト。ツモ番でない場合はnull。
   */
  function drawnTileForPlayer(playerId) {
    const player = gameStore.players.find(p => p.id === playerId);
    if (gameStore.currentTurnPlayerId === playerId && gameStore.drawnTile) {
      // プレイヤーがストック牌を使用中でない場合、
      // サーバーから誤って付与された可能性のある isStockedTile フラグを無視するため、
      // クリーンな新しいオブジェクトを生成して返す。
      if (player && !player.isUsingStockedTile) {
        const cleanDrawnTile = { ...gameStore.drawnTile };
        delete cleanDrawnTile.isStockedTile;
        return cleanDrawnTile;
      }
      return gameStore.drawnTile;
    }
    return null;
  }

  /**
   * 指定されたプレイヤーが打牌可能かどうかを判定します。
   * @param {string} playerId - プレイヤーID。
   * @returns {boolean} 打牌可能な場合はtrue。
   */
  function canPlayerDiscard(playerId) {
    // 通常の打牌待ち、またはリーチ後の打牌選択待ちの場合に打牌可能
    return gameStore.currentTurnPlayerId === playerId && 
           (gameStore.gamePhase === GAME_PHASES.AWAITING_DISCARD || gameStore.gamePhase === GAME_PHASES.AWAITING_RIICHI_DISCARD);
  }

  /**
   * プレイヤーからの牌選択イベントを処理します。
   * @param {Object} payload - 選択された牌情報。{ tile: Object, isFromDrawnTile: Boolean }
   */
  function handleTileSelection(payload) {
    if (gameStore.currentTurnPlayerId && (gameStore.gamePhase === 'awaitingDiscard' || gameStore.gamePhase === 'awaitingRiichiDiscard')) {
      gameStore.discardTile(gameStore.currentTurnPlayerId, payload.tile.id, payload.isFromDrawnTile);
    } else {
      console.warn("現在のゲームフェーズでは牌を選択できません。");
    }
  }

  /**
   * PlayerAreaから発行されたアクションイベントを中央で処理します。
   * @param {Object} payload - アクション情報。{ playerId, actionType, tile }
   */
  function handlePlayerAction(payload) {
    const { playerId, actionType, tile } = payload;
    switch (actionType) {
      case 'skip':
        gameStore.playerSkipsCall(playerId);
        break;
      case 'tsumoAgari':
        gameStore.handleAgari(playerId, gameStore.drawnTile, true);
        break;
      case 'riichi':
        gameStore.declareRiichi(playerId);
        break;
      case 'ankan':
        if (tile) {
          gameStore.declareAnkan(playerId, tile);
        } else {
          console.error("暗槓する牌が選択されていません。");
        }
        break;
      case 'kakan':
        if (tile) {
          gameStore.declareKakan(playerId, tile);
        } else {
          console.error("加槓する牌が選択されていません。");
        }
        break;
      case 'ron':
        // UIの応答性を保つため、わずかに遅延させて実行
        setTimeout(() => {
          gameStore.playerDeclaresCall(playerId, 'ron', gameStore.lastDiscardedTile);
        }, 0);
        break;
      case 'pon':
        gameStore.playerDeclaresCall(playerId, 'pon', tile);
        break;
      case 'minkan':
        gameStore.playerDeclaresCall(playerId, 'minkan', tile);
        break;
    }
  }

  // --- プレイヤー情報ポップアップの制御 ---
  function openPlayerInfoPopup(player, event) {
    event.stopPropagation();
    selectedPlayerForPopup.value = player;
    showPlayerInfoPopup.value = true;
  }

  function closePlayerInfoPopup() {
    showPlayerInfoPopup.value = false;
  }

  /**
   * 和了結果ポップアップを閉じる際の処理。
   */
  function handleCloseResultPopup() {
    gameStore.showResultPopup = false;
  }

  /**
   * 親決めポップアップが閉じられた際の処理。
   */
  function handleCloseDealerDeterminationPopup() {
    gameStore.showDealerDeterminationPopup = false;
    gameStore.startGameFlow(); // ゲームフローを開始
  }

  /**
   * 最終結果ポップアップから新しいゲームを開始する処理。
   */
  async function handleStartNewGameFromFinalResult() {
    // 最新のユーザー情報を取得して、次のゲーム開始前にUIへ反映させる
    await userStore.fetchUserProfile();

    isFadingToFinalResult.value = false; // フェードをリセット
    gameStore.resetGameForNewSession({ keepStreak: true }); // 連勝数を維持
    gameStore.initializeGame();
    gameStore.showDealerDeterminationPopup = true; // 親決めポップアップを表示
  }

  /**
   * 最終結果ポップアップからタイトル画面に戻る処理。
   */
  function handleBackToTitleFromFinalResult() {
    isFadingToFinalResult.value = false; // フェードをリセット
    router.push('/');
    gameStore.resetGameForNewSession({ keepStreak: true }); // 連勝数を維持してリセット
  }

  /**
   * ゲームを中断してタイトル画面に戻る処理。
   */
  function returnToTitle() {
    router.push('/');
    gameStore.resetGameForNewSession();
  }

  /**
   * ウィンドウサイズに基づいてスケーリング係数を更新します。
   */
  const updateScaleFactor = () => {
    const currentWidth = window.innerWidth;
    const currentHeight = window.innerHeight;

    const scaleX = currentWidth / DESIGN_WIDTH;
    const scaleY = currentHeight / DESIGN_HEIGHT;

    // 幅と高さの両方に収まるように、小さい方のスケールファクターを選択
    scaleFactor.value = Math.min(scaleX, scaleY);
  };

  // --- ライフサイクルフック ---
  

  onMounted(() => {
    // オンラインゲームの初期化ロジックはGameView.vueに移動しました。
    
    // オフラインモードの場合、ゲームがまだ始まっていない場合に初期化処理を実行
    if (!gameStore.isGameOnline && gameStore.gamePhase === GAME_PHASES.WAITING_TO_START) {
      gameStore.initializeGame();
    }

    // スケーリングの初期化とリサイズイベントの監視
    updateScaleFactor();
    window.addEventListener('resize', updateScaleFactor);
  });

  // Debug: Log myPlayerId
  watch(myPlayerId, (newVal) => {
    console.log(`[GameBoard] myPlayerId changed to: ${newVal}`);
  });

  // Debug: Log orderedPlayersForDisplay
  watch(orderedPlayersForDisplay, (newVal) => {
    console.log(`[GameBoard] orderedPlayersForDisplay changed:`, newVal);
  });

  // ポップアップ外クリックで閉じる古いロジックは削除されました。
  // 新しいPlayerInfoPopupコンポーネントがオーバーレイでクリックを処理します。

  onBeforeUnmount(() => {
    // コンポーネントが破棄される際に、リサイズイベントのリスナーを解除
    window.removeEventListener('resize', updateScaleFactor);

    // オンラインゲームのチャンネル購読解除はgameStoreに集約されているため、ここでは不要

    // このコンポーネントに起因する可能性のある、保留中のタイマーをすべてクリアします。
    // 注意: この方法はページ上のすべてのsetTimeoutをクリアするため、他のコンポーネントに影響を与える可能性があります。
    let id = window.setTimeout(function() {}, 0);
    while (id--) {
      window.clearTimeout(id);
    }
  });

  // gameBoardScalerRef の監視を追加
  watch(gameBoardScalerRef, (newVal) => {
    if (newVal) {
      console.log("gameBoardScalerRef is now available:", newVal);
    }
  });

</script>
  
<style scoped>
.game-board {
  /* このdivはビューポートとして機能し、game-board-scalerを中央に配置します */
  position: relative; /* game-board-scaler の絶対配置の基準 */
  width: 100vw; /* ビューポートの幅全体を使用 */
  height: 100vh; /* ビューポートの高さ全体を使用 */
  overflow: hidden; /* スケーリングではみ出した部分を隠す */
  background-image: url('/assets/images/back/back_out.png'); /* 背景画像を敷き詰める */
  background-repeat: repeat; /* 画像を繰り返し表示 */
  box-sizing: border-box;
  border: 2px solid #333; /* 外側のボーダー */
}
.game-board-scaler {
  /* このdivがゲームコンテンツ全体を保持し、スケーリングされます */
  position: absolute; /* 親(.game-board)に対して絶対配置 */
  top: 50%; /* 親の中央に配置 */
  left: 50%; /* 親の中央に配置 */
  width: 360px; /* ベースとなるデザインの幅 */
  height: 640px; /* ベースとなるデザインの高さ */
  background-image: url('/assets/images/back/mat.png'); /* ゲームマットの背景画像 */
  background-size: cover;
  background-position: center;
  display: flex; /* 内部の flex レイアウトを維持 */
  flex-direction: column-reverse; /* 内部の flex レイアウトを維持 */
  border: 1px solid #740e017e; /* 赤茶色の枠線 */
  box-sizing: border-box; /* 枠線をwidth/heightに含める */
  overflow: hidden; /* はみ出したリーチ演出を隠す */
}
.ron-indicator {
  position: absolute;
  width: 200px; /* 画像サイズは適宜調整 */
  height: auto;
  z-index: 50; /* 他の要素より手前に表示 */
  pointer-events: none; /* 画像がクリックを妨げないように */
  /* 中央揃えのための基本transform */
  transform: translate(-50%, -50%);
  animation: ron-pop-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes ron-pop-in {
  from {
    transform: translate(-50%, -50%) scale(0.5);
    opacity: 0;
  }
  to {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
}

.ron-indicator.pon-animation {
  /* 他のインジケーターのアニメーションを上書き */
  animation: pon-bounce-effect 1.5s ease-in-out;
}

@keyframes pon-bounce-effect {
  0% {
    transform: translate(-50%, -50%) scale(1);
    filter: drop-shadow(0 0 0 transparent);
    opacity: 1;
  }
  10% {
    transform: translate(-50%, -50%) scale(1.3);
    filter: drop-shadow(0 0 80px rgba(255, 50, 50, 0.9)); /* 赤い光彩エフェクト */
    opacity: 1;
  }
  20% {
    transform: translate(-50%, -50%) scale(1);
    filter: drop-shadow(0 0 0 transparent);
    opacity: 1;
  }
  80% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

.pon-kan-size {
  width: 150px; /* デフォルトの200pxより少し小さく */
}

.ron-indicator.kan-animation {
  animation: kan-bounce-effect 1.7s ease-in-out;
}

@keyframes kan-bounce-effect {
  0% {
    transform: translate(-50%, -50%) scale(1);
    filter: drop-shadow(0 0 0 transparent);
    opacity: 1;
  }
  10% {
    transform: translate(-50%, -50%) scale(1.3);
    filter: drop-shadow(0 0 80px rgba(50, 50, 255, 0.9)); /* 青い光彩エフェクト */
    opacity: 1;
  }
  20% {
    transform: translate(-50%, -50%) scale(1);
    filter: drop-shadow(0 0 0 transparent);
    opacity: 1;
  }
  80% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

/* ロン宣言時のアニメーション (フェードアウトなし) */
.ron-indicator.ron-animation {
  animation: ron-bounce-effect 0.4s ease-in-out;
}

@keyframes ron-bounce-effect {
  0% {
    transform: translate(-50%, -50%) scale(1);
    filter: drop-shadow(0 0 0 transparent);
  }
  50% {
    transform: translate(-50%, -50%) scale(1.3);
    filter: drop-shadow(0 0 80px rgba(255, 50, 50, 0.9));
  }
  100% {
    transform: translate(-50%, -50%) scale(1);
    filter: drop-shadow(0 0 0 transparent);
  }
}

/* ツモ宣言時のアニメーション (フェードアウトなし) */
.ron-indicator.tsumo-animation {
  animation: tsumo-bounce-effect 0.4s ease-in-out;
}

@keyframes tsumo-bounce-effect {
  0% {
    transform: translate(-50%, -50%) scale(1);
    filter: drop-shadow(0 0 0 transparent);
  }
  50% {
    transform: translate(-50%, -50%) scale(1.3);
    filter: drop-shadow(0 0 80px rgba(50, 50, 255, 0.9));
  }
  100% {
    transform: translate(-50%, -50%) scale(1);
    filter: drop-shadow(0 0 0 transparent);
  }
}

/* リーチアニメーション */
.riichi-container {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 100%; /* Full width of the game board scaler */
  height: 243px; /* Height of the riichi bar */
  background-color: #000;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  z-index: 100; /* Make sure it's on top */
  transform: translate(-50%, 100%); /* Start off-screen */
}

.riichi-image-scaled {
  height: 100%; /* Fit height to container */
  width: auto;
  border: 6px solid gold;
  box-sizing: border-box; /* 枠線が画像のサイズに影響しないようにする */
}

.riichi-slide-animation {
  /* 変更: cubic-bezier を使用し、キーフレームを調整 */
  animation: riichi-slide 1.5s cubic-bezier(0.25, 1, 0.5, 1) forwards;
}

@keyframes riichi-slide {
  0% {
    transform: translate(-50%, 100%);
  }
  20% { /* 素早く登場して少し通り過ぎる */
    transform: translate(-50%, -3%);
  }
  25% { /* 軽く戻って静止 */
    transform: translate(-50%, 0);
  }
  80% { /* 静止状態を維持 */
    transform: translate(-50%, 0);
  }
  100% { /* 再び画面外へ */
    transform: translate(-50%, 100%);
  }
}

/* 対面のリーチアニメーション */
.riichi-container-top {
  position: absolute;
  top: 0;
  left: 50%;
  width: 100%;
  height: 243px; /* Match bottom container height */
  background-color: #000;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  z-index: 100;
  transform: translate(-50%, -100%); /* Start off-screen top */
}

.riichi-slide-animation-top {
  /* 変更: cubic-bezier を使用し、キーフレームを調整 */
  animation: riichi-slide-top 1.5s cubic-bezier(0.25, 1, 0.5, 1) forwards;
}

@keyframes riichi-slide-top {
  0% {
    transform: translate(-50%, -100%);
  }
  20% { /* 素早く登場して少し通り過ぎる */
    transform: translate(-50%, 3%);
  }
  25% { /* 軽く戻って静止 */
    transform: translate(-50%, 0);
  }
  80% { /* 静止状態を維持 */
    transform: translate(-50%, 0);
  }
  100% { /* 再び画面外へ */
    transform: translate(-50%, -100%);
  }
}

/* 右家のリーチアニメーション */
.riichi-image-right {
  position: absolute;
  top: 50%;
  right: 0;
  width: 100%;
  height: 243px;
  border: 6px solid gold;
  box-sizing: border-box;
  z-index: 100;
  transform: translate(100%, -50%); /* Start off-screen right */
}

.riichi-slide-animation-right {
  /* 変更: cubic-bezier を使用し、キーフレームを調整 */
  animation: riichi-slide-right 1.5s cubic-bezier(0.25, 1, 0.5, 1) forwards;
}

@keyframes riichi-slide-right {
  0% {
    transform: translate(100%, -50%);
  }
  20% { /* 素早く登場して少し通り過ぎる */
    transform: translate(-3%, -50%);
  }
  25% { /* 軽く戻って静止 */
    transform: translate(0, -50%);
  }
  80% { /* 静止状態を維持 */
    transform: translate(0, -50%);
  }
  100% { /* 再び画面外へ */
    transform: translate(100%, -50%);
  }
}

/* 左家のリーチアニメーション */
.riichi-image-left {
  position: absolute;
  top: 50%;
  left: 0;
  width: 100%;
  height: 243px;
  border: 6px solid gold;
  box-sizing: border-box;
  z-index: 100;
  transform: translate(-100%, -50%); /* Start off-screen left */
}

.riichi-slide-animation-left {
  /* 変更: cubic-bezier を使用し、キーフレームを調整 */
  animation: riichi-slide-left 1.5s cubic-bezier(0.25, 1, 0.5, 1) forwards;
}

@keyframes riichi-slide-left {
  0% {
    transform: translate(-100%, -50%);
  }
  20% { /* 素早く登場して少し通り過ぎる */
    transform: translate(3%, -50%);
  }
  25% { /* 軽く戻って静止 */
    transform: translate(0, -50%);
  }
  80% { /* 静止状態を維持 */
    transform: translate(0, -50%);
  }
  100% { /* 再び画面外へ */
    transform: translate(-100%, -50%);
  }
}

/* 各プレイヤーの位置に合わせた宣言画像の表示位置 */
.ron-indicator-bottom {
  top: 75%;
  left: 50%;
}
.ron-indicator-top {
  top: 35%;
  left: 50%;
}
.ron-indicator-left {
  top: 50%;
  left: 30%;
}
.ron-indicator-right {
  top: 53%;
  left: 70%;
}

.game-board-top-left-buttons {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 20;
  display: flex;
  align-items: center; /* Align items vertically */
  gap: 8px;
}


.info-button-image {
  width: 74px;
  height: auto;
  margin-left: -13px;
  margin-top: -7px;
  cursor: pointer;
  pointer-events: auto;
  transition: all 0.2s ease;
  filter: drop-shadow(0px 0px 3px rgba(0, 0, 0, 0.8));
}
.info-button-image:hover {
  transform: translateY(-4px);
  filter: drop-shadow(0px 0px 3px rgba(0, 0, 0, 0.8));
}

.game-board-header {
  position: absolute;
  top: 10px; /* 画面上部からの距離 (調整可能) */
  right: 10px; /* 画面右部からの距離 (調整可能) */
  z-index: 20; /* GameBoard内の他の要素より手前に表示 */
  pointer-events: auto !important; /* マウスイベントを強制的に有効化 */
}
.return-button-image {
  width: 55px; /* 画像の幅に合わせて調整してください */
  height: auto; /* 高さは自動調整 */
  margin-top: -7px;
  cursor: pointer;
  display: block; /* imgタグの余分なスペースを消すため */
  pointer-events: auto !important; /* マウスイベントを強制的に有効化 */
  transition: all 0.2s ease;
  filter: drop-shadow(0px 0px 3px rgba(0, 0, 0, 0.8));
}
.return-button-image:hover {
  transform: translateY(-4px);
  filter: drop-shadow(0px 0px 3px rgba(0, 0, 0, 0.8));
}

.cat-icon {
  position: absolute;
  width: 70px; /* アイコンのサイズ */
  height: 70px; /* アイコンのサイズ */
  object-fit: cover;
  z-index: 100; /* 他のUI要素より手前に表示 (値を大きくする) */
  background-color: white; /* 白背景 */
  border: 1px solid #380000;
  border-radius: 6px; /* 角を丸く */
  cursor: pointer; /* クリック可能であることを示す */
  pointer-events: auto; /* 明示的にクリックイベントを有効にする */
}

.furiten-indicator {
  position: absolute;
  width: 100px; /* 画像サイズに合わせて調整 */
  height: auto;
  z-index: 40; /* 手牌や他のUIより手前に */
  pointer-events: none; /* 画像がクリックを妨げないように */
}

.tenpai-indicator {
  position: absolute;
  width: 100px; /* 画像サイズに合わせて調整 */
  height: auto;
  z-index: 40; /* 手牌や他のUIより手前に */
  pointer-events: none; /* 画像がクリックを妨げないように */
}

.bottom-furiten {
  /* 手牌の前に表示されるように調整 */
  bottom: 140px; /* 手牌の高さや位置に応じて調整 */
  left: 58%;
  transform: translateX(-50%);
}

.bottom-tenpai {
  bottom: 90px;
  left: 58%;
  transform: translateX(-50%);
}

.top-furiten {
  /* 対面プレイヤーの手牌の上あたり */
  top: 90px; /* 手牌の上からの距離 */
  left: 25%;
}

.top-tenpai {
  top: 90px;
  left: 25%;
}

.left-furiten {
  /* 左プレイヤーの手牌の左あたり */
  top: 50%;
  left: 10px; /* 手牌の左からの距離 */
  transform: translateY(-50%) rotate(90deg); /* 90度回転 */
}

.left-tenpai {
  top: 50%;
  left: 10px;
  transform: translateY(-50%) rotate(90deg); /* 90度回転 */
}

.right-furiten {
  /* 右プレイヤーの手牌の右あたり */
  top: 50%;
  right: 10px; /* 手牌の右からの距離 */
  transform: translateY(-50%) rotate(-90deg); /* -90度回転 */
}

.right-tenpai {
  top: 50%;
  right: 10px;
  transform: translateY(-50%) rotate(-90deg); /* -90度回転 */
}

.cat-icon-left {
  top: -90px;
  left: 36px;
  transform: translate(-50%, -50%);
}

.cat-icon-left-flipped {
  transform: translate(-50%, -50%) scaleX(-1);
}

.cat-icon-top {
  top: -38px;
  left: 50%;
  transform: translate(-50%, -50%);
}

.cat-icon-right {
  top: -90px;
  right: -36px;
  transform: translate(-50%, -50%);
}

.cat-icon-right-flipped {
  transform: translate(-50%, -50%) scaleX(-1);
}
.cat-icon-bottom {
  top: -120px;
  right: -65px;
  transform: translate(-50%, -50%);
  scale: 1; /* 自分のアイコンは少し小さく */

}   

.player-area-container {
    /* 各プレイヤーエリアコンテナのスタイル (必要に応じて) */
    display: flex;
  /* 縦画面では各プレイヤーエリアが縦に積まれるため、個別の order は不要になることが多い */
  /* 必要に応じて flex-grow や min-height を設定 */
  position: relative; /* アイコンの絶対配置の基準 */
}
.top-player-container, .bottom-player-container {
  width: 100%; /* コンテナの幅を画面幅に合わせる */
}
.top-player-container {
  /* 対面プレイヤーのエリア */
  flex-grow: 0; /* 高さは内容に合わせる */
  margin-bottom: -140px; /* 上の要素（middle-row）との間隔を狭める */
  max-width: 200px; /* 対面エリアの最大幅 (手牌の数やサイズに応じて調整) */
  margin-left: auto; /* max-width時に中央寄せ */
  margin-right: auto; /* max-width時に中央寄せ */
  justify-content: center; /* PlayerAreaを中央に配置 */
  align-items: center; /* PlayerAreaを垂直中央に配置 */
  z-index: 10; /* 他の要素より手前に表示 */
}
.middle-row {
  /* 左右プレイヤーと中央テーブルを配置する行 */
  display: flex;
  justify-content: space-between; /* 要素間にスペースを均等に配置 */
  align-items: center; /* 中央揃え */
  flex-grow: 2;
  width: 100%; /* 親要素いっぱいに広がるように */
  max-height: 600px; /* middle-rowの最大高さを設定 (任意) */
  max-width: 500px; /* middle-row全体の最大幅を設定 (任意) */
  margin-left: auto; /* max-width時に中央寄せ */
  margin-right: auto; /* max-width時に中央寄せ */
}
.left-player-container, .right-player-container {
  /* 左右プレイヤーのエリア */
  width: 35px; /* 手牌の幅に合わせる */ 
  display: flex; 
  justify-content: center;
  z-index: 10; /* 他の要素より手前に表示 */
  flex-shrink: 0; /* コンテナが縮まないようにする */
}
.bottom-player-container {
  /* 自分プレイヤーのエリア */
  flex-grow: 1;
  max-height: 0px; 
  justify-content: center; /* PlayerAreaを水平中央に配置 */
  align-items: flex-end; /* PlayerAreaをコンテナの下端に配置 */
  max-width: 400px; /* 自家エリアの最大幅 */
  margin-left: auto; /* max-width時に中央寄せ */
  margin-right: auto; /* max-width時に中央寄せ */;
  z-index: 10; /* 他の要素より手前に表示 */
  padding-bottom: 0px; /* この値を調整して手牌の位置を上下に動かします。値を大きくすると上に、小さくすると下に移動します。 */
  left: -30px;
}

.center-table {
  padding: 0; /* paddingは内部のbottom-discard-containerで調整 */
  flex-grow: 1;
  margin: 0 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column; /* 内部要素を縦に並べる */
}
.bottom-discard-container {
  /* 自家の捨て牌エリア */
  display: flex;
  position: absolute;
  top: 415px; /* 上端を固定 (調整) */
  left: 50%;
  transform: translateX(-50%);
}
.top-discard-container {
  /* 対面の捨て牌エリア */
  display: flex;
  position: absolute; /* 親のtop-player-containerを基準に絶対配置 */
  bottom: -87px; /* 下端を固定 (調整) */
  left: 50%;
  transform: translateX(-50%);
}
.left-discard-container {
  display: flex;
  position: absolute;
  top: 42%;
  right: 110px; /* 右端を固定 (調整) */
  transform: rotate(90deg);
  transform-origin: top left;
}
.right-discard-container {
  display: flex;
  position: absolute;
  top: 42%;
  left: 110px; /* 左端を固定 (調整) */
  transform: rotate(-90deg);
  transform-origin: top right;
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
  z-index: 999; /* ポップアップより手前、ローディングスピナーよりは奥 */
}

.fade-overlay.is-fading {
  opacity: 1;
  visibility: visible;
}

.stock-indicator {
  position: absolute;
  width: 140px;
  height: auto;
  z-index: 50;
  pointer-events: none;
  transform: translate(-50%, -50%);
  animation: stock-fade-effect 0.6s ease-in-out;
}

.stock-indicator-bottom {
  top: 80%;
  left: 50%;
}
.stock-indicator-top {
  top: 30%;
  left: 50%;
}
.stock-indicator-left {
  top: 50%;
  left: 28%;
}
.stock-indicator-right {
  top: 50%;
  left: 72%;
}

@keyframes stock-fade-effect {
  0% {
    transform: translate(-50%, -50%) scale(0.8);
    opacity: 0;
  }
  20% {
    transform: translate(-50%, -50%) scale(1.1);
    opacity: 1;
  }
  40% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
  80% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1);
  }
}
</style>