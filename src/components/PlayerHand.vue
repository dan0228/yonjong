<template>
  <div :class="['player-hand-container', `position-${position}`, { 'my-turn-active': isMyHand && canDiscard }]">
    <!-- プレイヤー情報は PlayerArea に移動済みと仮定 -->
    <div
      class="hand-tiles-area player-hand"
    >
      <div
        v-for="tile in playerDisplayHand"
        :key="tile.id"
        :class="[getTileClasses(tile, false), { 'is-in-hand': tile?.isStockedTile }]"
        @click="selectTile(tile, false)"
      >
        <img
          :src="getTileImageUrl(isMyHand || tile.isPublic || shouldShowAllTiles ? tile : null)"
          :alt="isMyHand || shouldShowAllTiles ? tileToString(tile) : '裏向きの牌'"
        >
      </div>
    </div>
    <div
      v-if="drawnTileDisplay"
      class="drawn-tile-area player-hand"
    >
      <div
        :class="getTileClasses(drawnTileDisplay, true)"
        @click="selectTile(drawnTileDisplay, true)"
      >
        <img
          :src="getTileImageUrl(isMyHand || drawnTileDisplay.isPublic || shouldShowAllTiles ? drawnTileDisplay : null)"
          :alt="isMyHand || shouldShowAllTiles ? tileToString(drawnTileDisplay) : '裏向きの牌'"
        >
      </div>
      <!-- ターンカウントダウン表示 -->
      <div v-if="gameStore.turnTimerId !== null && !gameStore.isActionPending && gameStore.isGameOnline && isMyHand" class="turn-countdown-in-hand">
        <img :src="countdownImageSrc" :alt="Math.ceil(gameStore.turnCountdown)" class="countdown-image">
      </div>
    </div>
    <!-- ストック牌の表示エリアは PlayerArea.vue に移動しました -->
  </div>
</template>

<script setup>
  import { defineProps, defineEmits, computed } from 'vue';
  import { useGameStore } from '@/stores/gameStore'; // gameStore をインポート
  import { GAME_PHASES } from '@/stores/gameStore'; // GAME_PHASES をインポート
  import { getTileImageUrl, tileToString } from '@/utils/tileUtils'; // 共通ユーティリティをインポート

  /**
   * プレイヤーの手牌とツモ牌を表示するコンポーネント。
   * 牌の選択可否や表示向きを制御します。
   */
  const props = defineProps({
    player: {
      type: Object,
      required: true
    },
    isMyHand: {
      type: Boolean,
      default: false
    },
    drawnTileDisplay: {
      type: Object,
      default: null
    },
    // 打牌可能な状態か (自分のターンで、ツモ後など)
    canDiscard: {
      type: Boolean,
      default: false
    },
    position: {
      type: String,
      default: 'bottom'
    }
  });

  const emit = defineEmits(['tile-selected', 'tile-to-stock-selected']); // 'tile-selected'イベントを定義
  const gameStore = useGameStore(); // gameStore を使用

  /**
   * プレイヤーの手牌を取得する算出プロパティ。
   * @returns {Array<Object>} プレイヤーの手牌の配列。
   */
  const playerDisplayHand = computed(() => {
    return props.player?.hand || [];
  });

  const countdownImageSrc = computed(() => {
    const countdownValue = Math.ceil(gameStore.turnCountdown);
    if (countdownValue >= 1 && countdownValue <= 5) {
      return `/assets/images/number/${countdownValue}b.png`;
    }
    return ''; // またはデフォルト画像
  });

  /**
   * 手牌を公開すべきかどうかを判定する算出プロパティ。
   * 流局時（ROUND_END）で、かつそのプレイヤーがテンパイしている場合にtrueとなります。
   */
  const shouldShowAllTiles = computed(() => {
    if (!props.player) return false;
    // 流局時（ROUND_ENDフェーズかつ和了者がいない場合、またはisDrawがtrueの場合）にテンパイ者の手牌を公開
    const isRoundEnd = gameStore.gamePhase === GAME_PHASES.ROUND_END;
    const isDraw = gameStore.agariResultDetails?.isDraw;
    const isTenpai = gameStore.isTenpaiDisplay[props.player.id];
    
    return isRoundEnd && isDraw && isTenpai;
  });

  /**
   * 指定された牌が選択可能かどうかを判定します。
   * リーチ中のプレイヤーはツモ牌しか選択できません。
   * @param {Object} tile - 判定する牌オブジェクト。
   * @param {boolean} isFromDrawnTile - 牌がツモ牌かどうか。
   * @returns {boolean} 牌が選択可能であればtrue。
   */
  function canSelectTile(tile, isFromDrawnTile) {
    // ストックする牌の選択フェーズの場合、手牌とツモ牌の全てが選択可能
    if (gameStore.gamePhase === GAME_PHASES.AWAITING_STOCK_TILE_SELECTION) {
      return props.isMyHand && !!tile; // 自分の手牌で、かつ牌が存在すれば選択可能
    }

    // 自分の手牌でなく、打牌可能状態でもなく、牌がなければ選択不可
    if (!props.isMyHand || !props.canDiscard || !tile) return false;

    // リーチ宣言直後の打牌選択
    if (gameStore.gamePhase === 'awaitingRiichiDiscard') {
      return gameStore.riichiDiscardOptions.includes(tile.id);
    }
    // リーチ中の通常のツモ
    if (props.player.isRiichi || props.player.isDoubleRiichi) {
      // ツモやカンのアクションが可能な時以外は、牌を選択（手動でツモ切り等）できないようにする
      const eligibility = gameStore.playerActionEligibility[props.player.id];
      const hasAction = eligibility && (
        eligibility.canTsumoAgari || 
        (eligibility.canAnkan && eligibility.canAnkan.length > 0) || 
        (eligibility.canKakan && eligibility.canKakan.length > 0)
      );
      
      if (!hasAction) {
        return false;
      }
      
      // リーチ後はツモった牌しか捨てられない
      return isFromDrawnTile;
    }

    // リーチ中のプレイヤーは、ツモ牌以外は選択できない
    if ((props.player.isRiichi || props.player.isDoubleRiichi) && !isFromDrawnTile) {
      return false;
    }

    // 通常の打牌時は常に選択可能だが、サーバーからの応答待ち中は選択不可
    return !gameStore.isActionPending;
  }

  /**
   * 牌が選択された時にイベントを発行します。
   * 選択可能かどうかを `canSelectTile` で判定します。
   * @param {Object} tile - 選択された牌オブジェクト。
   * @param {boolean} isFromDrawnTile - 牌がツモ牌かどうか。
   */
  function selectTile(tile, isFromDrawnTile) {
    if (canSelectTile(tile, isFromDrawnTile)) { // canSelectTile で選択可否を判定
      if (gameStore.gamePhase === GAME_PHASES.AWAITING_STOCK_TILE_SELECTION) {
        emit('tile-to-stock-selected', { tile, isFromDrawnTile });
      } else {
        emit('tile-selected', { tile, isFromDrawnTile });
      }
    }
  }

    /**
   * 牌のCSSクラスを動的に生成するヘルパー関数。
   * 選択可能状態や無効化状態に応じてクラスを付与します。
   * @param {Object} tile - 牌オブジェクト。
   * @param {boolean} isDrawnTile - 牌がツモ牌かどうか。
   * @returns {Array<string|Object>} 適用するCSSクラスの配列。
   */
  function getTileClasses(tile, isDrawnTile) {
    const isSelectable = canSelectTile(tile, isDrawnTile);
    const isRiichiPhase = gameStore.gamePhase === 'awaitingRiichiDiscard';

    return [
      'tile',
      {
        'my-tile': props.isMyHand,
        'drawn-tile': isDrawnTile,
        'selectable': isSelectable,
        'is-stocked-tile': tile?.isStockedTile, // ストック牌の場合にクラスを追加
        'is-waiting': gameStore.isActionPending, // サーバー応答待ち
        // 自分の手番で、リーチ中で、かつ選択できない牌を無効化する
        'disabled': props.canDiscard && isRiichiPhase && !isSelectable,
      }
    ];
  }
</script>

<style scoped>
  .player-hand-container {
    display: flex;
    position: relative; /* ツモ牌の絶対配置の基準 */
    align-items: flex-start; /* 手牌とツモ牌の上端を揃える */
  }

  /* プレイヤーの位置に応じた手牌の向き調整 */
  .player-hand-container.position-bottom,
  .player-hand-container.position-top {
    align-items: flex-start; /* 手牌とツモ牌の上端を揃える */
  }
  .player-hand-container.position-bottom { flex-direction: row; }
  .player-hand-container.position-top {
    flex-direction: row-reverse; /* 対面はツモ牌が手牌の左(画面上)に来るように逆順 */
  }
  .player-hand-container.position-left {
    flex-direction: column; /* 左プレイヤーは手牌エリアとツモ牌エリアを縦に */
    width: fit-content;
    padding: 0;
    align-items: center;
  }
  .player-hand-container.position-right {
    flex-direction: column-reverse; /* 右プレイヤーはツモ牌が手牌の上(画面上)に来るように逆順 */
    width: fit-content; /* コンテナの幅を内容に合わせる */
    padding: 0; /* 左右プレイヤーのコンテナのpaddingを0に */
    align-items: center;
  }

  /* ホバー時の共通スタイル */
  .tile.my-tile.selectable:hover {
    cursor: pointer; /* selectable な牌にホバーしたらカーソル変更 */
  }

  /* 各ポジションごとのホバー時の動き */
  .player-hand-container.position-bottom .tile.my-tile.selectable:hover {
    transform: translateY(-5px); /* 上に動く */
  }
  .player-hand-container.position-right .tile.my-tile.selectable:hover {
    transform: translateX(-5px); /* 画面から見て左に動く */
  }
  .player-hand-container.position-top .tile.my-tile.selectable:hover {
    transform: translateY(5px); /* 画面から見て下に動く */
  }
  .player-hand-container.position-left .tile.my-tile.selectable:hover {
    transform: translateX(5px); /* 画面から見て右に動く */
  }

  .player-hand {
    display: flex;
    gap: 0px; /* 牌同士の間隔 */
    padding: 0; /* 牌自体の間隔はgapで制御するので、paddingは0に */
    min-height: 62px; /* 牌の高さ + paddingなど */
  }

  /* 左右プレイヤーの手牌は縦に並べる */
  .position-left .player-hand,
  .position-right .player-hand {
    flex-direction: column;
    min-height: auto;
  }

  .drawn-tile-area {
    display: flex; /* 内部の.tileを正しく配置するため */
    position: absolute; /* 手牌の位置に影響を与えないように絶対配置 */
    z-index: 30; /* すぐに引くボタンより手前に表示 */
  }
  .position-top .drawn-tile-area {
    right: 100%; /* 手牌エリアの左側に配置 */
    top: 0;
    margin-right: 7px; /* 手牌との間に右マージンを設定 */
  }
  .position-bottom .drawn-tile-area {
    left: 100%; /* 手牌エリアの右側に配置 */
    top: 0;
    margin-left: 10px; /* 自家は手牌の右にツモ牌 */
  }
  .position-left .drawn-tile-area {
    top: 100%; /* 手牌エリアの下に配置 */
    left: 0;
    margin-top: 7px; /* 手牌エリアの下にツモ牌エリアを配置するためのマージン */
  }
  .position-right .drawn-tile-area {
    bottom: 100%; /* 手牌エリアの上に配置 */
    left: 0;
    margin-bottom: 7px; /* 手牌エリアとの間に下マージンを設定 (column-reverseのため) */
  }

  .tile {
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative; /* ラベル表示のため */
    transition: transform 0.05s ease-out; /* ホバー時の動きを滑らかに */
  }

    /* 自家の牌サイズ */
  .player-hand-container.position-bottom .tile{
    width: 50px;  /* 牌の幅 */
    height: 70px; /* 牌の高さ (実際の画像アスペクト比に合わせて調整) */
  }
  /* 対面の牌サイズ */
  .player-hand-container.position-top .tile {
    width: 24px;  /* imgのwidthに合わせる */
    height: 35px; /* imgのheightに合わせる */
  }
  /* 左右プレイヤーの牌サイズ (90度回転するため幅と高さが逆転) */
  .player-hand-container.position-left .tile,
  .player-hand-container.position-right .tile {
    width: 35px;  /* 回転後の表示幅 (imgのheightに合わせる) */
    height: 24px; /* 回転後の表示高さ (imgのwidthに合わせる) */
  }

  /* 牌の画像の向き */
  .player-hand-container.position-top .tile img {
    transform: rotate(180deg);
  }
  .player-hand-container.position-left .tile img {
    transform: rotate(90deg);
  }
  .player-hand-container.position-right .tile img {
    transform: rotate(-90deg);
  }

  .drawn-tile-label {
    position: absolute;
    bottom: -15px; /* 牌の下に表示 */
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.7em;
    color: #333;
  }
  .position-left .drawn-tile-label,
  .position-right .drawn-tile-label {
    bottom: auto;
    top: 50%;
    left: -20px; /* 牌の左側に表示 */
    transform: translateY(-50%) rotate(-90deg);
  }
  .position-right .drawn-tile-label {
    left: auto; right: -20px; transform: translateY(-50%) rotate(90deg);
  }

  .tile img {
    object-fit: contain; /* アスペクト比は維持する */
    display: block; /* 画像下の余分なスペースを取り除く場合がある */
  }

    /* 自家の牌画像サイズ */
  .player-hand-container.position-bottom .tile img {
    width: 50px;
    height: 70px;
  }
  /* 左右と対面の牌画像サイズ */
  .player-hand-container.position-top .tile img,
  .player-hand-container.position-left .tile img,
  .player-hand-container.position-right .tile img {
    width: 24px;  /* 牌の回転前の幅を指定 (小さく) */
    height: 35px; /* 牌の回転前の高さを指定 (小さく) */
  }

  .tile.my-tile:not(.selectable) { /* isMyHand は true だが canDiscard が false の場合 */
    cursor: default; /* クリックできないことを示す */
  }

  .tile:not(.my-tile) { /* isMyHand が false の場合 (他家の手牌) */
    /* 裏向き表示などのスタイル */
    cursor: default;
  }
  .tile.disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .is-stocked-tile {
    border-radius: 20px;
    box-shadow: 0 0 10px 2px rgba(30, 144, 255, 0.8), 0 0 5px rgba(4, 21, 71, 0.6); /* 中央から光るような多層グロー */
  }

  .is-in-hand.is-stocked-tile {
    border-radius: 20px;
    box-shadow: 0 0 10px 2px rgba(30, 144, 255, 0.8), 0 0 5px rgba(4, 21, 71, 0.6); /* 中央から光るような多層グロー */
  }

  .is-waiting {
    pointer-events: none;
    opacity: 0.7;
  }

  .turn-countdown-in-hand {
    position: absolute;
    top: 50%;
    left: 100%; /* ツモ牌の右側に配置 */
    transform: translateY(-50%);
    margin-left: 10px; /* ツモ牌からの距離 */
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px; /* 画像の幅に合わせて調整 */
    height: 30px; /* 画像の高さに合わせて調整 */
    z-index: 31; /* ツモ牌より手前に表示 */
  }

  .turn-countdown-in-hand .countdown-image {
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 0 5px rgb(255, 255, 255));
  }

  /* 対面 (top) のツモ牌の左側に表示 */
  .position-top .turn-countdown-in-hand {
    left: auto;
    right: 100%; /* ツモ牌の左側に配置 */
    margin-right: 10px;
    margin-left: 0;
  }

  /* 左家 (left) のツモ牌の下側に表示 */
  .position-left .turn-countdown-in-hand {
    top: 100%; /* ツモ牌の下側に配置 */
    left: 50%;
    transform: translateX(-50%);
    margin-top: 10px;
    margin-left: 0;
  }

  /* 右家 (right) のツモ牌の上側に表示 */
  .position-right .turn-countdown-in-hand {
    top: auto;
    bottom: 100%; /* ツモ牌の上側に配置 */
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 10px;
    margin-left: 0;
  }
</style>