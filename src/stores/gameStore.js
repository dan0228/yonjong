import { useAudioStore } from './audioStore';
import { useUserStore } from './userStore';

// src/stores/gameStore.js
import { defineStore } from 'pinia';
import * as mahjongLogic from '@/services/mahjongLogic';
import { io } from 'socket.io-client'; // Socket.ioクライアントをインポート
import { supabase } from '@/supabaseClient';

// ゲームサーバーのURLを環境変数から取得
const GAME_SERVER_URL = import.meta.env.VITE_APP_GAME_SERVER_URL;
let socket = null; // Socket.ioクライアントインスタンス

// AIプレイヤーの候補リスト
const allAiPlayers = [
  { name: 'くろ', originalId: 'kuro' },
  { name: 'たま', originalId: 'tama' },
  { name: 'とら', originalId: 'tora' },
  { name: '雀猫様', originalId: 'janneko' }
];

export const GAME_PHASES = {
  WAITING_TO_START: 'waitingToStart',
  PLAYER_TURN: 'playerTurn', // ツモ待ち
  AWAITING_DISCARD: 'awaitingDiscard', // 打牌待ち
  AWAITING_ACTION_RESPONSE: 'awaitingActionResponse', // 他家の打牌に対するロン・ポン・カン待ち
  AWAITING_KAKAN_RESPONSE: 'awaitingKakanResponse', // 加槓に対する槍槓ロン待ち
  RIICHI_ANIMATION: 'riichiAnimation', // リーチアニメーション中
  AWAITING_RIICHI_DISCARD: 'awaitingRiichiDiscard', // リーチ宣言後の打牌選択待ち
  ROUND_END: 'roundEnd', // 局終了 (結果表示待ち)
  GAME_OVER: 'gameOver', // ゲーム終了
  AWAITING_STOCK_TILE_SELECTION: 'awaitingStockTileSelection', // ストックする牌の選択待ち
  AWAITING_STOCK_SELECTION_TIMER: 'awaitingStockSelectionTimer' // ストック牌選択のカウントダウン待ち
};

// 現在のプレイヤーをスコアでランク付けし、順位を付与する関数
function getRankedPlayers(players) {
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    const rankedPlayers = [];
    let currentRank = 1;
    for (let i = 0; i < sortedPlayers.length; i++) {
        if (i > 0 && sortedPlayers[i].score < sortedPlayers[i - 1].score) {
            currentRank = i + 1;
        }
        rankedPlayers.push({
            ...sortedPlayers[i],
            rank: currentRank
        });
    }
    return rankedPlayers;
}

function handleAiDiscardLogic(store, playerId) {
  const currentPlayer = store.players.find(p => p.id === playerId);
  if (!currentPlayer || currentPlayer.id === 'player1') return;

  const fullHand = [...currentPlayer.hand, store.drawnTile].filter(Boolean);

  let tileToDiscard = store.drawnTile;
  let isFromDrawnTile = true;

  let maxScore = -Infinity;
  let currentBestTileToDiscard = null;

  const lastMeld = currentPlayer.melds.length > 0 ? currentPlayer.melds[currentPlayer.melds.length - 1] : null;

  for (const tile of fullHand) {
    let score = 0;
    const tileKey = mahjongLogic.getTileKey(tile);
    const tileCountInHand = fullHand.filter(t => mahjongLogic.getTileKey(t) === tileKey).length;

    if (tileCountInHand >= 2) {
      score -= 100;
    }
    if (tileCountInHand >= 3) {
      score -= 150;
    }

    if (lastMeld && lastMeld.tiles.length > 0) {
      const calledTile = lastMeld.tiles[0];
      if (calledTile.suit === mahjongLogic.SUITS.JIHAI) {
        if (tile.suit === mahjongLogic.SUITS.JIHAI) {
          score -= 200;
        }
      } else {
        const isCalledTileTerminal = (calledTile.rank === 1 || calledTile.rank === 9);
        if (isCalledTileTerminal) {
          if (tile.suit !== mahjongLogic.SUITS.JIHAI && (tile.rank === 1 || tile.rank === 9)) {
            score -= 200;
          }
        } else {
          if (tile.suit === calledTile.suit) {
            score -= 200;
          }
        }
      }
    }

    if (tile.suit === mahjongLogic.SUITS.JIHAI) {
      const isWindTile = tile.rank >= mahjongLogic.JIHAI_TYPES.TON && tile.rank <= mahjongLogic.JIHAI_TYPES.PEI;
      const isSangenTile = tile.rank >= mahjongLogic.JIHAI_TYPES.HAKU && tile.rank <= mahjongLogic.JIHAI_TYPES.CHUN;

      if (isWindTile) {
        const otherWindTiles = fullHand.filter(t => t.suit === mahjongLogic.SUITS.JIHAI && t.rank >= mahjongLogic.JIHAI_TYPES.TON && t.rank <= mahjongLogic.JIHAI_TYPES.PEI && mahjongLogic.getTileKey(t) !== tileKey);
        if (otherWindTiles.length === 0) {
          score += 80;
        } else {
          score -= 20;
        }
      } else if (isSangenTile) {
        const otherSangenTiles = fullHand.filter(t => t.suit === mahjongLogic.SUITS.JIHAI && t.rank >= mahjongLogic.JIHAI_TYPES.HAKU && t.rank <= mahjongLogic.JIHAI_TYPES.CHUN && mahjongLogic.getTileKey(t) !== tileKey);
        if (otherSangenTiles.length === 0) {
          score += 80;
        } else {
          score -= 20;
        }
      } else {
        score += 100;
      }
    } else {
      const suitTiles = fullHand.filter(t => t.suit === tile.suit);
      const rank = tile.rank;

      if (suitTiles.length <= 2) {
        score += 80;
      } else if (suitTiles.length <= 4) {
        score += 40;
      }

      let connections = 0;
      for (let i = -2; i <= 2; i++) {
        if (i === 0) continue;
        if (suitTiles.some(t => t.rank === rank + i)) {
          connections++;
        }
      }
      score -= (connections * 10);

      if (rank === 1 && !suitTiles.some(t => t.rank === 2 || t.rank === 3)) {
        score += 25;
      }
      if (rank === 9 && !suitTiles.some(t => t.rank === 7 || t.rank === 8)) {
        score += 25;
      }
      if (rank > 1 && rank < 9 && connections === 0) {
          score += 30;
      }
    }

    if (score > maxScore) {
      maxScore = score;
      currentBestTileToDiscard = tile;
    }
  }

  if (!currentBestTileToDiscard) {
    currentBestTileToDiscard = store.drawnTile;
  }

  tileToDiscard = currentBestTileToDiscard;
  isFromDrawnTile = (currentBestTileToDiscard.id === store.drawnTile?.id);

  if (store.ruleMode === 'stock' && store.drawnTile && !currentPlayer.stockedTile && !currentPlayer.isUsingStockedTile && !currentPlayer.isRiichi && !currentPlayer.isDoubleRiichi) {
    const randomValue = Math.random();
    if (randomValue < 0.3) {
      store.executeStock(currentPlayer.id, tileToDiscard.id, isFromDrawnTile);
      return;
    }
  }

  store.discardTile(currentPlayer.id, tileToDiscard.id, isFromDrawnTile);
}

export const useGameStore = defineStore('game', {
  state: () => ({
    players: [
      { id: 'player1', name: localStorage.getItem('mahjongUsername') || 'あなた', hand: [], discards: [], melds: [], isDealer: false, score: 50000, seatWind: null, stockedTile: null, isUsingStockedTile: false, isStockedTileSelected: false, isAi: false }, // isAi: false を追加
    ],
    wall: [],
    deadWall: [],
    dealerIndex: null,
    doraIndicators: [],
    uraDoraIndicators: [],
    currentTurnPlayerId: null,
    gamePhase: GAME_PHASES.WAITING_TO_START,
    lastDiscardedTile: null,
    drawnTile: null,
    showResultPopup: false,
    resultMessage: '',
    showFinalResultPopup: false,
    finalResultDetails: {
      rankedPlayers: [],
      consecutiveWins: 0,
    },
    currentRound: { wind: 'east', number: 1 },
    honba: 0,
    riichiSticks: 0,
    turnCount: 0,
    playerTurnCount: {},
    isIppatsuChance: {},
    isChankanChance: false,
    chankanTile: null,
    rinshanKaihouChance: false,
    lastActionPlayerId: null,
    canDeclareRon: {},
    canDeclarePon: {},
    canDeclareMinkan: {},
    canDeclareAnkan: {},
    canDeclareKakan: {},
    playerActionEligibility: {},
    actionResponseQueue: [],
    waitingForPlayerResponses: [],
    playerResponses: {},
    isFuriTen: {},
    activeActionPlayerId: null,
    isDoujunFuriTen: {},
    riichiDiscardOptions: [],
    isDeclaringRiichi: {},
    agariResultDetails: {
      roundWind: null,
      roundNumber: null,
      honba: 0,
      doraIndicators: [],
      uraDoraIndicators: [],
      winningHand: [],
      agariTile: null,
      yakuList: [],
      totalFans: 0,
      fu: 0,
      score: 0,
      scoreName: null,
      pointChanges: {},
    },
    anyPlayerMeldInFirstRound: false,
    gameMode: 'allManual',
    ruleMode: 'classic',
    shouldAdvanceRound: false,
    nextDealerIndex: null,
    shouldEndGameAfterRound: false,
    pendingKanDoraReveal: false,
    animationState: {
      type: null,
      playerId: null,
    },
    riichiDiscardedTileId: {},
    previousConsecutiveWins: 0,
    showDealerDeterminationPopup: false,
    dealerDeterminationResult: {
      players: [],
    },
    lastCoinGain: 0,
    isRiichiBgmActive: false,
    previousBgm: null,
    highlightedDiscardTileId: null,
    stockSelectionCountdown: 1.3,
    stockSelectionTimerId: null,
    stockAnimationPlayerId: null,
    isTenpaiDisplay: {},

    // Online Match State
    onlineGameId: null,
    isGameOnline: false,
    localPlayerId: null,
    playersReadyForNextRound: [], // 次のラウンドに進む準備ができたプレイヤーのリスト
    isGameReady: false, // ゲームの初期化が完了し、開始準備ができたかどうか
    isAppReady: false, // アプリケーションの初期読み込みが完了したかどうか
    hasGameStarted: false, // ゲームが開始されたかどうかを示すフラグ
    isMatchmakingRequested: false, // マッチメイキングリクエストが送信されたかどうか
    chatBubbles: {}, // ★チャット吹き出しの状態を管理
  }),
  actions: {
    // ★チャットメッセージを送信するアクション
    sendChatMessage(messageId) {
      if (this.isGameOnline && socket && socket.connected) {
        socket.emit('sendChatMessage', {
          gameId: this.onlineGameId,
          playerId: this.localPlayerId,
          messageId: messageId,
        });
      }
    },
    // ★受信したチャットメッセージを表示するアクション
    displayChatMessage({ playerId, messageId }) {
      const audioStore = useAudioStore();
      audioStore.playSound('dahai.mp3');

      // 既存のタイマーがあればクリアして、連続投稿時に表示を上書きする
      if (this.chatBubbles[playerId]?.timeoutId) {
        clearTimeout(this.chatBubbles[playerId].timeoutId);
      }

      const timeoutId = setTimeout(() => {
        this.chatBubbles[playerId] = null;
      }, 3000); // 3秒後に吹き出しを消す

      this.chatBubbles[playerId] = {
        messageId: messageId,
        timeoutId: timeoutId,
        key: Date.now(), // 同じメッセージが連続で送られても再描画させるためのキー
      };
    },

    setAppReady(status) {
      this.isAppReady = status;
    },
    // --- Online Match Actions ---
    connectToServer() {
      const userStore = useUserStore(); // userStoreを取得

      if (!socket || !socket.connected) {
        console.log('[GameStore] Connecting to game server at', GAME_SERVER_URL);
        socket = io(GAME_SERVER_URL);

        socket.on('connect', () => {
          console.log('[GameStore] Successfully connected to game server with socket ID:', socket.id);
          // 接続成功時にマッチメイキングリクエストが保留されていれば送信
          if (this.isMatchmakingRequested) {
            const userStore = useUserStore(); // userStoreを再度取得
            console.log('[GameStore] Emitting "requestMatchmaking" event after connect...');
            socket.emit('requestMatchmaking', {
              userId: userStore.profile.id,
              rating: userStore.profile.rating,
              username: userStore.profile.username,
              avatarUrl: userStore.profile.avatar_url,
            });
            console.log(`[GameStore] "requestMatchmaking" event sent. UserID: ${userStore.profile.id}, Rating: ${userStore.profile.rating}, AvatarURL: ${userStore.profile.avatar_url}`);
          }
        });

        socket.on('connect_error', (err) => {
          console.error('[GameStore] Connection failed:', err.message);
          this.isMatchmakingRequested = false; // 接続エラー時はリクエストフラグをリセット
        });

        socket.on('disconnect', () => {
          console.log('[GameStore] Disconnected from game server');
          this.isGameOnline = false;
          this.onlineGameId = null; // 切断時にゲームIDをリセット
          this.localPlayerId = null;
          this.isMatchmakingRequested = false; // 切断時はリクエストフラグをリセット
          // 必要に応じてUIを更新
        });

        socket.on('game-state-update', (newState) => {
          console.log('Received game state update:', newState);
          this.handleRemoteStateUpdate(newState);
        });

        // ★チャットメッセージ受信時のリスナーを追加
        socket.on('newChatMessage', ({ playerId, messageId }) => {
          this.displayChatMessage({ playerId, messageId });
        });

        socket.on('gameError', (error) => {
          console.error('Game server error:', error);
          // const userStore = useUserStore(); // 既に取得済み
          // サーバーからのエラーメッセージをポップアップで表示
          userStore.setPenalty(error.message, 5000);
          this.isMatchmakingRequested = false; // ゲームエラー時はリクエストフラグをリセット
        });

        socket.on('error', (error) => {
          console.error('Socket error:', error);
        });

        socket.on('matchmaking-update', ({ gameId, players }) => {
          console.log(`マッチング状況更新: ゲームID ${gameId}, プレイヤー:`, players);
          this.onlineGameId = gameId;
          this.isGameOnline = true;
          this.localPlayerId = userStore.profile.id; // 自分のIDを設定
          this.players = players; // サーバーから受け取ったプレイヤーリストで更新

          // ★修正: マッチング待機中も更新情報を受け取れるように、すぐにゲームチャンネルに参加する
          if (socket && socket.connected) {
            socket.emit('joinGame', { gameId, userId: this.localPlayerId });
          }
        });

        socket.on('game-found', ({ gameId, players }) => {
          console.log(`ゲームが見つかりました: ゲームID ${gameId}, プレイヤー:`, players);
          this.players = players; // 最終的なプレイヤーリストで更新
          this.setOnlineGame({ gameId, localUserId: userStore.profile.id });
          this.isMatchmakingRequested = false; // ゲームが見つかったらリクエストフラグをリセット
        });
      }
    },
    setOnlineGame({ gameId, localUserId }) { // hostIdは不要
      this.isGameOnline = true;
      this.onlineGameId = gameId;
      this.localPlayerId = localUserId;
      this.gameMode = 'online';
      this.setRuleMode('stock');

      console.log(`オンライン対戦を開始します。ゲームID: ${gameId}, ユーザーID: ${localUserId}`);

      // サーバーにゲーム参加を通知
      if (socket && socket.connected) {
        socket.emit('joinGame', { gameId, userId: localUserId });
      } else {
        // ソケットが接続されていない場合、接続を試みる
        this.connectToServer();
        // 接続後にjoinGameが呼ばれるように、connectイベントリスナー内で処理
      }
    },

    disconnectOnlineGame() {
      if (socket && socket.connected) {
        socket.disconnect();
      }
      this.isGameOnline = false;
      this.onlineGameId = null;
      this.isGameReady = false; // ゲーム準備状態をリセット
      this.isMatchmakingRequested = false; // 切断時はリクエストフラグをリセット
      console.log("オンライン対戦サーバーから切断しました。");
    },

    handleRemoteStateUpdate(newState) {
      if (!this.isGameOnline || !newState) return;

      // サーバーから送られてくる状態をそのまま適用
      this.$patch(newState);
    },

    signalReadyForNextRound(remotePlayerId = null) {
      // オフラインモードでは、待機せずに即座に次のラウンドへ進む
      if (!this.isGameOnline) {
        this.showResultPopup = false;
        if (this.shouldEndGameAfterRound) {
          this.handleGameEnd({ showLoading: false });
        } else {
          this.prepareNextRound();
        }
        return;
      }

      // --- 以下、オンライン対戦のロジック ---
      const playerId = remotePlayerId || this.localPlayerId;
      if (!playerId || this.playersReadyForNextRound.includes(playerId)) return;

      // オンラインモードではサーバーに通知
      if (socket && socket.connected) {
        socket.emit('playerReadyForNextRound', { gameId: this.onlineGameId, playerId });
      }
    },

    

    async initializeOnlineGame() {
      // クライアント側での初期化ロジックは削除
      // サーバーにゲーム初期化を要求するイベントを発行
      if (socket && socket.connected) {
        socket.emit('initializeGame', { gameId: this.onlineGameId, userId: this.localPlayerId });
      }
    },

    startRiichiBgm() {
      const audioStore = useAudioStore();
      if (!this.isRiichiBgmActive) {
        this.previousBgm = audioStore.currentBgm;
      }
      audioStore.setBgm('NES-JP-A04-2(Stage3-Loop125).mp3');
      this.isRiichiBgmActive = true;
    },

    stopRiichiBgm() {
      const audioStore = useAudioStore();
      if (this.isRiichiBgmActive) {
        audioStore.setBgm(this.previousBgm);
        this.isRiichiBgmActive = false;
        this.previousBgm = null;
      }
    },

    initializeGame() {
      this.playersReadyForNextRound = []; // ★局の初期化時に、必ず準備完了リストをリセット

      const userStore = useUserStore(); // userStoreを取得

      this.hasGameStarted = true; // ゲームが開始されたことを示す

      if (this.dealerIndex === null) {
        const shuffledAis = [...allAiPlayers].sort(() => 0.5 - Math.random());
        const selectedAis = shuffledAis.slice(0, 3).map((ai, index) => {
          let catCoins = 0;
          let rating = 0;
          switch (ai.originalId) {
            case 'kuro':
              catCoins = 4583;
              rating = 1671;
              break;
            case 'tora':
              catCoins = 2292;
              rating = 1421;
              break;
            case 'tama':
              catCoins = 6372;
              rating = 1584;
              break;
            case 'janneko':
              catCoins = 9235;
              rating = 1883;
              break;
            default:
              catCoins = 0;
              rating = 1500;
          }

          return {
            id: `player${index + 2}`,
            name: ai.name,
            originalId: ai.originalId,
            hand: [],
            discards: [],
            melds: [],
            isDealer: false,
            score: 50000,
            seatWind: null,
            stockedTile: null,
            isUsingStockedTile: false,
            isStockedTileSelected: false,
            cat_coins: catCoins,
            rating: rating,
            isAi: true, // AIプレイヤーであることを明示
          };
        });

        if (userStore.profile) {
          this.players[0].name = userStore.profile.username;
          this.players[0].cat_coins = userStore.profile.cat_coins; // 追加
          this.players[0].rating = userStore.profile.rating;       // 追加
          this.players[0].avatar_url = userStore.profile.avatar_url; // 自分のアバターURLを追加
          this.players[0].isAi = false; // 人間プレイヤーであることを明示
        }

        this.players = [
          this.players[0],
          ...selectedAis
        ];

        for (let i = this.players.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [this.players[i], this.players[j]] = [this.players[j], this.players[i]];
        }
      }

      this.turnCount = 0;
      this.players.forEach(player => {
        this.playerTurnCount[player.id] = 0;
        this.isIppatsuChance[player.id] = false;
        this.canDeclareRon[player.id] = false;
        this.canDeclarePon[player.id] = null;
        this.canDeclareMinkan[player.id] = null;
        this.canDeclareAnkan[player.id] = null;
        this.canDeclareKakan[player.id] = null;
        this.playerActionEligibility[player.id] = {};
        this.playerResponses = {};
        this.waitingForPlayerResponses = [];
        this.riichiDiscardOptions = [];
        this.actionResponseQueue = [];
        this.isDoujunFuriTen[player.id] = false;
        this.isFuriTen[player.id] = false;
        this.isTenpaiDisplay[player.id] = false;
        this.isDeclaringRiichi[player.id] = false;
        this.activeActionPlayerId = null;
        this.anyPlayerMeldInFirstRound = false;
        this.pendingKanDoraReveal = false;
        this.animationState = { type: null, playerId: null };
        this.riichiDiscardedTileId[player.id] = null;
      });
      this.highlightedDiscardTileId = null;
      this.rinshanKaihouChance = false;
      this.lastActionPlayerId = null;
      this.shouldEndGameAfterRound = false;

      const playerCount = this.players.length;
      if (this.dealerIndex === null) {
        this.dealerIndex = Math.floor(Math.random() * playerCount);
      }
      const currentDealerIndex = this.dealerIndex;

      this.players.forEach((player, index) => {
        player.isDealer = (index === currentDealerIndex);
      });

      const playersWithWinds = mahjongLogic.assignPlayerWinds(
        this.players,
        currentDealerIndex,
        playerCount
      );
      this.players = playersWithWinds;

      let fullWall = mahjongLogic.getAllTiles();
      fullWall = mahjongLogic.shuffleWall(fullWall);

      const deadWallSize = 14;
      this.deadWall = fullWall.slice(0, deadWallSize);
      const liveWallForDealing = fullWall.slice(deadWallSize);

      const initialHandSize = 4;
      const { hands: initialHands, wall: updatedLiveWall } = mahjongLogic.dealInitialHands(playerCount, liveWallForDealing, initialHandSize);
      this.wall = updatedLiveWall;

      this.players.forEach((player, index) => {
        player.hand = initialHands[index] || [];
        player.discards = [];
        player.melds = [];
        player.isRiichi = false;
        player.isDeclaringRiichi = false;
        player.isDoubleRiichi = false;
        this.isDoujunFuriTen[player.id] = false;
      });

      this.doraIndicators = [mahjongLogic.revealDora(this.deadWall)].filter(Boolean);

      this.currentTurnPlayerId = this.players[this.dealerIndex]?.id;
      this.gamePhase = GAME_PHASES.PLAYER_TURN;

      this.dealerDeterminationResult.players = this.players.map(p => ({
        id: p.id,
        name: p.name,
        seatWind: p.seatWind,
        isDealer: p.isDealer,
        score: 50000,
        originalId: p.originalId,
      }));

            // userStore.setGameInProgress(true); // AI対戦では切断ペナルティを無効にするため、ゲーム進行中フラグを立てない

      if (this.currentRound.wind === 'east' && this.currentRound.number === 1 && this.honba === 0) {
        this.showDealerDeterminationPopup = true;
      }
    },

    drawTile() {
      if (this.isGameOnline) { // isHostチェックを削除
        if (socket && socket.connected) {
          socket.emit('drawTile', { gameId: this.onlineGameId, playerId: this.localPlayerId });
        }
        return; // サーバーからの状態更新を待つ
      }

      if (this.wall.length > 0 &&
          this.currentTurnPlayerId &&
          this.gamePhase === GAME_PHASES.PLAYER_TURN) {

        if (this.ruleMode === 'stock') {
          const currentPlayer = this.players.find(p => p.id === this.currentTurnPlayerId);
          if (currentPlayer && currentPlayer.stockedTile) {
            if (currentPlayer.isRiichi || currentPlayer.isDoubleRiichi) {
              this.drawFromWall(currentPlayer.id);
              return;
            }

            if (currentPlayer.isStockedTileSelected) {
              this.useStockedTile(currentPlayer.id);
              return;
            }
            if (currentPlayer.id !== 'player1') {
              this.gamePhase = GAME_PHASES.AWAITING_STOCK_SELECTION_TIMER;
              this.stockSelectionCountdown = 1.3;

              const useStocked = Math.random() < 0.3;

              if (useStocked) {
                const aiDelay = Math.random() * (1200 - 200) + 200;
                this.stockSelectionTimerId = setInterval(() => {
                  this.stockSelectionCountdown = parseFloat((this.stockSelectionCountdown - 0.01).toFixed(2));
                  if (this.stockSelectionCountdown <= 0) {
                    clearInterval(this.stockSelectionTimerId);
                  }
                }, 10);
                setTimeout(() => {
                  this.stopStockSelectionCountdown();
                  this.useStockedTile(currentPlayer.id);
                }, aiDelay);
              } else {
                this.stockSelectionTimerId = setInterval(() => {
                  this.stockSelectionCountdown = parseFloat((this.stockSelectionCountdown - 0.01).toFixed(2));
                  if (this.stockSelectionCountdown <= 0) {
                    clearInterval(this.stockSelectionTimerId);
                  }
                }, 10);
                setTimeout(() => {
                  if (this.stockSelectionTimerId) {
                    this.stopStockSelectionCountdown();
                    this.drawFromWall(currentPlayer.id);
                  }
                }, 600);
              }

              return;
            }
          }
        }

        if (this.playerTurnCount[this.currentTurnPlayerId] !== undefined && !this.rinshanKaihouChance) {
          this.playerTurnCount[this.currentTurnPlayerId]++;
        }

        const tile = this.wall.shift();
        this.drawnTile = tile;
        this.gamePhase = GAME_PHASES.AWAITING_DISCARD;
        this.lastActionPlayerId = this.currentTurnPlayerId;

        // オンラインモードではサーバー主導なので、クライアントからはブロードキャストしない
        // if (this.isGameOnline) {
        //   this.broadcastGameState();
        // }

        this.players.forEach(p => this.canDeclareRon[p.id] = false);
        this.players.forEach(p => this.canDeclarePon[p.id] = null);
        this.players.forEach(p => this.canDeclareMinkan[p.id] = null);
        if (this.isChankanChance && this.lastActionPlayerId === this.currentTurnPlayerId) {
            this.isChankanChance = false;
        }
        const currentPlayer = this.players.find(p => p.id === this.currentTurnPlayerId);
        if (currentPlayer) {
          this.isDoujunFuriTen[currentPlayer.id] = false;
          this.playerActionEligibility[currentPlayer.id] = { 
            canTsumoAgari: mahjongLogic.canWinBasicShape(currentPlayer.hand, this.drawnTile, currentPlayer.melds)
          };

          if (currentPlayer.isRiichi || currentPlayer.isDoubleRiichi) {
            if (this.wall.length > 3) {
              const ankanOptions = mahjongLogic.checkCanAnkan(currentPlayer.hand, this.drawnTile);
              this.playerActionEligibility[currentPlayer.id].canAnkan = ankanOptions.length > 0 ? ankanOptions : null;
            } else {
              this.playerActionEligibility[currentPlayer.id].canAnkan = null;
            }
            this.playerActionEligibility[currentPlayer.id].canRiichi = false;
            this.playerActionEligibility[currentPlayer.id].canPon = null;
            this.playerActionEligibility[currentPlayer.id].canMinkan = null;
            this.playerActionEligibility[currentPlayer.id].canKakan = null;

            const gameContextForTsumo = this.createGameContextForPlayer(currentPlayer, true);
            const tsumoWinResult = mahjongLogic.checkYonhaiWin([...currentPlayer.hand, this.drawnTile], this.drawnTile, true, gameContextForTsumo);
            this.playerActionEligibility[currentPlayer.id].canTsumoAgari = tsumoWinResult.isWin;

            if (this.gameMode === 'vsCPU' && currentPlayer.id !== 'player1') {
                if (this.playerActionEligibility[currentPlayer.id].canTsumoAgari) {
                    this.handleAgari(currentPlayer.id, this.drawnTile, true);
                } else if (this.playerActionEligibility[currentPlayer.id].canAnkan && this.playerActionEligibility[currentPlayer.id].canAnkan.length > 0) {
                    this.declareAnkan(currentPlayer.id, this.playerActionEligibility[currentPlayer.id].canAnkan[0]);
                } else {
                    setTimeout(() => {
                        if (this.currentTurnPlayerId === currentPlayer.id && this.drawnTile) {
                            this.discardTile(currentPlayer.id, this.drawnTile.id, true);
                        }
                    }, 500);
                }
            } else {
                if (!this.playerActionEligibility[currentPlayer.id].canTsumoAgari) {
                    setTimeout(() => {
                        if (this.currentTurnPlayerId === currentPlayer.id && this.drawnTile) {
                            this.discardTile(currentPlayer.id, this.drawnTile.id, true);
                        }
                    }, 500);
                }
            }
          } else {
            let canRiichi = false;
            if (this.wall.length > 3 && currentPlayer.melds.every(m => m.type === 'ankan') && currentPlayer.score >= 1000) {
              const potentialHandAfterDraw = [...currentPlayer.hand, this.drawnTile];
              for (const tileToDiscard of potentialHandAfterDraw) {
                const tempHand = [];
                let discarded = false;
                for (const tile of potentialHandAfterDraw) {
                  if (tile.id === tileToDiscard.id && !discarded) {
                    discarded = true;
                  } else {
                    tempHand.push(tile);
                  }
                }
                const tenpaiResult = mahjongLogic.checkYonhaiTenpai(tempHand, this.createGameContextForPlayer(currentPlayer, false));
                if (tenpaiResult.isTenpai && tenpaiResult.waits.length > 0) {
                  canRiichi = true;
                  break;
                }
              }
            }
            this.playerActionEligibility[currentPlayer.id].canRiichi = canRiichi;

            if (this.wall.length > 3) {
              const ankanOptions = mahjongLogic.checkCanAnkan(currentPlayer.hand, this.drawnTile, this.createGameContextForPlayer(currentPlayer, false));
              this.canDeclareAnkan[currentPlayer.id] = ankanOptions.length > 0 ? ankanOptions : null;
              const kakanOptions = mahjongLogic.checkCanKakan(currentPlayer.hand, currentPlayer.melds, this.drawnTile, this.createGameContextForPlayer(currentPlayer, false));
              this.canDeclareKakan[currentPlayer.id] = kakanOptions.length > 0 ? kakanOptions : null;
            }
            this.updateFuriTenState(currentPlayer.id);

            if (this.gameMode === 'vsCPU' && currentPlayer.id !== 'player1') {
              let actionTaken = false;
              const riichiRand = Math.random();
              const ankanRand = Math.random();
              const kakanRand = Math.random();

              if (this.playerActionEligibility[currentPlayer.id].canTsumoAgari) {
                this.handleAgari(currentPlayer.id, this.drawnTile, true);
                actionTaken = true;
              }

              if (!actionTaken) {
                if (this.playerActionEligibility[currentPlayer.id].canRiichi && riichiRand < 0.08) {
                  this.declareRiichi(currentPlayer.id);
                  actionTaken = true;
                }
              }

              if (!actionTaken) {
                if (this.canDeclareAnkan[currentPlayer.id] && ankanRand < 1.0) {
                  this.declareAnkan(currentPlayer.id, this.canDeclareAnkan[currentPlayer.id][0]);
                  actionTaken = true;
                } else if (this.canDeclareKakan[currentPlayer.id] && kakanRand < 1.0) {
                  this.declareKakan(currentPlayer.id, this.canDeclareKakan[currentPlayer.id][0]);
                  actionTaken = true;
                }
              }

              if (!actionTaken) {
                setTimeout(() => {
                  handleAiDiscardLogic(this, currentPlayer.id);
                }, 500);
              }
            }
          }
        }
      } else {
        if (this.wall.length === 0) {
          this.handleRyuukyoku();
        } else {
          console.warn(`gameStore: Cannot draw tile. Conditions not met. Player: ${this.currentTurnPlayerId}, Phase: ${this.gamePhase}, Wall: ${this.wall.length}`);
        }
      }
    },

    useStockedTile(playerId) {
      if (this.isGameOnline) {
        if (socket && socket.connected) {
          socket.emit('useStockedTile', { gameId: this.onlineGameId, playerId: this.localPlayerId });
        }
        return; // サーバーからの状態更新を待つ
      }

      const currentPlayer = this.players.find(p => p.id === playerId);
      if (!currentPlayer || !currentPlayer.stockedTile) {
        console.warn("Cannot use stocked tile now. Conditions not met.");
        return;
      }

      this.drawnTile = currentPlayer.stockedTile;
      currentPlayer.stockedTile = null;
      currentPlayer.isUsingStockedTile = true;
      currentPlayer.isStockedTileSelected = false;

      if (this.playerTurnCount[playerId] !== undefined && !this.rinshanKaihouChance) {
        this.playerTurnCount[playerId]++;
      }

      this.gamePhase = GAME_PHASES.AWAITING_DISCARD;
      this.lastActionPlayerId = playerId;

      this.players.forEach(p => this.canDeclareRon[p.id] = false);
      this.players.forEach(p => this.canDeclarePon[p.id] = null);
      this.players.forEach(p => this.canDeclareMinkan[p.id] = null);
      if (this.isChankanChance && this.lastActionPlayerId === playerId) {
          this.isChankanChance = false;
      }

      this.isDoujunFuriTen[playerId] = false;

      this.playerActionEligibility[playerId] = { canTsumoAgari: false, canAnkan: null, canKakan: null };

      if (this.gameMode === 'vsCPU' && playerId !== 'player1') {
        setTimeout(() => {
          if (this.currentTurnPlayerId === playerId && this.drawnTile) {
            handleAiDiscardLogic(this, playerId);
          }
        }, 500);
      }
    },

    drawFromWall(playerId) {
      if (this.isGameOnline) {
        if (socket && socket.connected) {
          socket.emit('drawFromWall', { gameId: this.onlineGameId, playerId: this.localPlayerId });
        }
        return; // サーバーからの状態更新を待つ
      }

      const currentPlayer = this.players.find(p => p.id === playerId);
      if (!currentPlayer || (this.gamePhase !== GAME_PHASES.PLAYER_TURN && this.gamePhase !== GAME_PHASES.AWAITING_STOCK_SELECTION_TIMER)) {
        console.warn("Cannot draw from wall now. Conditions not met.");
        return;
      }

      currentPlayer.isUsingStockedTile = false;

      if (this.playerTurnCount[playerId] !== undefined && !this.rinshanKaihouChance) {
        this.playerTurnCount[playerId]++;
      }
      const tile = this.wall.shift();
      this.drawnTile = tile;
      this.gamePhase = GAME_PHASES.AWAITING_DISCARD;
      this.lastActionPlayerId = playerId;

      this.players.forEach(p => this.canDeclareRon[p.id] = false);
      this.players.forEach(p => this.canDeclarePon[p.id] = null);
      this.players.forEach(p => this.canDeclareMinkan[p.id] = null);
      if (this.isChankanChance && this.lastActionPlayerId === playerId) {
          this.isChankanChance = false;
      }

      this.isDoujunFuriTen[playerId] = false;

      this.playerActionEligibility[playerId] = { 
        canTsumoAgari: mahjongLogic.canWinBasicShape(currentPlayer.hand, this.drawnTile, currentPlayer.melds)
      };

      if (currentPlayer.isRiichi || currentPlayer.isDoubleRiichi) {
        if (this.wall.length > 3) {
            const ankanOptions = mahjongLogic.checkCanAnkan(currentPlayer.hand, this.drawnTile);
            this.playerActionEligibility[playerId].canAnkan = ankanOptions.length > 0 ? ankanOptions : null;
        } else {
            this.playerActionEligibility[playerId].canAnkan = null;
        }
        this.playerActionEligibility[playerId].canRiichi = false;
        this.playerActionEligibility[playerId].canPon = null;
        this.playerActionEligibility[playerId].canMinkan = null;
        this.playerActionEligibility[playerId].canKakan = null;

        const gameContextForTsumo = this.createGameContextForPlayer(currentPlayer, true);
        const tsumoWinResult = mahjongLogic.checkYonhaiWin([...currentPlayer.hand, this.drawnTile], this.drawnTile, true, gameContextForTsumo);
        this.playerActionEligibility[playerId].canTsumoAgari = tsumoWinResult.isWin;

        if (this.gameMode === 'vsCPU' && playerId !== 'player1') {
            if (this.playerActionEligibility[playerId].canTsumoAgari) {
                this.handleAgari(playerId, this.drawnTile, true);
            } else {
                setTimeout(() => {
                    if (this.currentTurnPlayerId === playerId && this.drawnTile) {
                        this.discardTile(playerId, this.drawnTile.id, true);
                    }
                }, 500);
            }
        } else {
            if (!this.playerActionEligibility[playerId].canTsumoAgari) {
                setTimeout(() => {
                    if (this.currentTurnPlayerId === playerId && this.drawnTile) {
                        this.discardTile(playerId, this.drawnTile.id, true);
                    }
                }, 500);
            }
        }
      } else {
        let canRiichi = false;
        if (this.wall.length > 3 && currentPlayer.melds.every(m => m.type === 'ankan') && currentPlayer.score >= 1000) {
          const potentialHandAfterDraw = [...currentPlayer.hand, this.drawnTile];
          for (const tileToDiscard of potentialHandAfterDraw) {
            const tempHand = [];
            let discarded = false;
            for (const tile of potentialHandAfterDraw) {
              if (tile.id === tileToDiscard.id && !discarded) {
                discarded = true;
              } else {
                tempHand.push(tile);
              }
            }
            const tenpaiResult = mahjongLogic.checkYonhaiTenpai(tempHand, this.createGameContextForPlayer(currentPlayer, false));
            if (tenpaiResult.isTenpai && tenpaiResult.waits.length > 0) {
              canRiichi = true;
              break;
            }
          }
        }
        this.playerActionEligibility[playerId].canRiichi = canRiichi;

        if (this.wall.length > 3) {
          const ankanOptions = mahjongLogic.checkCanAnkan(currentPlayer.hand, this.drawnTile, this.createGameContextForPlayer(currentPlayer, false));
          this.canDeclareAnkan[playerId] = ankanOptions.length > 0 ? ankanOptions : null;
          const kakanOptions = mahjongLogic.checkCanKakan(currentPlayer.hand, currentPlayer.melds, this.drawnTile, this.createGameContextForPlayer(currentPlayer, false));
          this.canDeclareKakan[playerId] = kakanOptions.length > 0 ? kakanOptions : null;
        }
        this.updateFuriTenState(playerId);

        if (this.gameMode === 'vsCPU' && playerId !== 'player1') {
          let actionTaken = false;

          if (this.playerActionEligibility[playerId].canRiichi && Math.random() < 0.08) {
            this.declareRiichi(playerId);
            actionTaken = true;
          }

          if (!actionTaken) {
            if (this.canDeclareAnkan[playerId] && Math.random() < 1.0) {
              this.declareAnkan(playerId, this.canDeclareAnkan[playerId][0]);
            } else if (this.canDeclareKakan[playerId] && Math.random() < 1.0) {
              this.declareKakan(playerId, this.canDeclareKakan[playerId][0]);
            } else {
              handleAiDiscardLogic(this, playerId);
            }
          }
        }
      }

      // オンラインモードではサーバー主導なので、クライアントからはブロードキャストしない
      // if (this.isGameOnline) {
      //   this.broadcastGameState();
      // }
    },

    discardTile(playerId, tileIdToDiscard, isFromDrawnTile, isStocking = false) {
      if (this.isGameOnline) { // isHostチェックを削除
        if (playerId !== this.localPlayerId) return;

        if (socket && socket.connected) {
          socket.emit('discardTile', { gameId: this.onlineGameId, playerId, tileIdToDiscard, isFromDrawnTile, isStocking });
        }
        return; // サーバーからの状態更新を待つ
      }

      const audioStore = useAudioStore();
      if (!isStocking) {
        audioStore.playSound('dahai.mp3');
      }

      const runDiscardLogic = () => {
        const player = this.players.find(p => p.id === playerId);
        if (!player || (!isStocking && this.gamePhase !== GAME_PHASES.AWAITING_DISCARD && this.gamePhase !== GAME_PHASES.AWAITING_RIICHI_DISCARD)) {
          console.warn('gameStore: Cannot discard tile now. Conditions not met.', { playerId: player?.id, phase: this.gamePhase, isFromDrawnTile, drawnTile: this.drawnTile });
          return;
        }

        const isFinalAction = this.wall.length === 0;

        let discardedTileActual;

        if (this.gamePhase === GAME_PHASES.AWAITING_RIICHI_DISCARD) {
          this.riichiDiscardedTileId[playerId] = tileIdToDiscard;
          const fullHand = [...player.hand, this.drawnTile];
          const discardIndex = fullHand.findIndex(t => t && t.id === tileIdToDiscard);

          if (discardIndex === -1) {
            console.error('Riichi discard: Tile to discard not found in hand or drawn tile:', tileIdToDiscard);
            return;
          }

          const tempFullHand = [...fullHand];
          const tempDiscardedTile = tempFullHand.splice(discardIndex, 1)[0];
          const handAfterDiscard = tempFullHand;

          const hasAnkan = player.melds.some(m => m.type === 'ankan');
          const isTenpai = hasAnkan ? true : mahjongLogic.checkYonhaiTenpai(handAfterDiscard, this.createGameContextForPlayer(player, false)).isTenpai;

          if (!isTenpai) {
            console.warn(`Player ${player.id} tried to discard ${tempDiscardedTile.id} after Riichi, but it breaks Tenpai. Aborting.`);
            return;
          }

          discardedTileActual = tempDiscardedTile;
          player.hand = mahjongLogic.sortHand(handAfterDiscard);
          this.drawnTile = null;
          this.startRiichiBgm();
        } else {
          if ((player.isRiichi || player.isDoubleRiichi) && !this.riichiDiscardedTileId[playerId]) {
            this.riichiDiscardedTileId[playerId] = tileIdToDiscard;
          }
          if (isFromDrawnTile) {
            if (!this.drawnTile || this.drawnTile.id !== tileIdToDiscard) {
              console.error('Mismatch: Trying to discard drawn tile, but IDs do not match or no drawn tile.');
              return;
            }
            discardedTileActual = this.drawnTile;
            this.drawnTile = null;
          } else {
            const tileIndex = player.hand.findIndex(t => t.id === tileIdToDiscard);
            if (tileIndex === -1) {
              console.error('Tile to discard not found in hand:', tileIdToDiscard);
              return;
            }
            discardedTileActual = player.hand.splice(tileIndex, 1)[0];
              if (this.drawnTile) {
                player.hand.push(this.drawnTile);
                player.hand = mahjongLogic.sortHand(player.hand);
              }
            this.drawnTile = null;
          }
        }

        if (discardedTileActual) {
          if (isStocking) {
            player.stockedTile = { ...discardedTileActual, isPublic: true, isStockedTile: true };
            if (isFinalAction) {
              this.handleRyuukyoku();
              return;
            }
            this.gamePhase = GAME_PHASES.PLAYER_TURN;
            this.moveToNextPlayer();
            return; // isStockingの場合、他のプレイヤーのアクション確認をスキップして即座に次のターンへ
          } else {
            player.discards = [...player.discards, discardedTileActual];
          }
        } else {
          console.error("Discard failed: discardedTileActual is undefined. Cannot update discards.");
          return;
        }
        this.lastDiscardedTile = discardedTileActual;

        if (this.pendingKanDoraReveal) {
          if (this.deadWall.length > 0) {
              const newDoraIndicator = mahjongLogic.revealDora(this.deadWall);
              if (newDoraIndicator && !this.doraIndicators.find(d => d.id === newDoraIndicator.id)) {
                  this.doraIndicators.push(newDoraIndicator);
              }
          }
          this.pendingKanDoraReveal = false;
        }

        this.updateFuriTenState(player.id);
        this.turnCount++;
        this.lastActionPlayerId = player.id;
        this.rinshanKaihouChance = false;

        if (this.gamePhase !== GAME_PHASES.AWAITING_RIICHI_DISCARD) {
          this.isIppatsuChance[player.id] = false;
        }
        this.isChankanChance = false;

        this.waitingForPlayerResponses = [];
        let canAnyoneAct = false;
        this.players.forEach(p => {
          if (p.id !== player.id) {
            const eligibility = {};
            const isPlayerInFuriTen = this.isFuriTen[p.id] || this.isDoujunFuriTen[p.id] || false;

            if (isPlayerInFuriTen) {
              eligibility.canRon = false;
            }
            else {
              const gameContext = this.createGameContextForPlayer(p, false, this.lastDiscardedTile);
              eligibility.canRon = mahjongLogic.checkCanRon(p.hand, this.lastDiscardedTile, gameContext).isWin;
            }

            if (!isFinalAction) {
              if (this.wall.length > 3 && !p.isRiichi && !p.isDoubleRiichi) {
                eligibility.canPon = mahjongLogic.checkCanPon(p.hand, this.lastDiscardedTile) ? this.lastDiscardedTile : null;
                eligibility.canMinkan = mahjongLogic.checkCanMinkan(p.hand, this.lastDiscardedTile) ? this.lastDiscardedTile : null;
              }
            }

            this.playerActionEligibility[p.id] = eligibility;

            if (eligibility.canRon || eligibility.canPon || eligibility.canMinkan) {
              canAnyoneAct = true;
              this.waitingForPlayerResponses.push(p.id);
            }
          }
        });

        if (isFinalAction) {
          if (canAnyoneAct) {
            this.gamePhase = GAME_PHASES.AWAITING_ACTION_RESPONSE;
            this.setNextActiveResponder();
          } else {
            this.handleRyuukyoku();
          }
          return;
        }

        if (!canAnyoneAct && !this.isDeclaringRiichi[player.id]) {
          this.gamePhase = GAME_PHASES.PLAYER_TURN;
          this.moveToNextPlayer();
        } else {
          this.gamePhase = GAME_PHASES.AWAITING_ACTION_RESPONSE;
          this.playerResponses = {};
          this.setNextActiveResponder();
        }
      };

      if (this.gameMode === 'vsCPU') {
        setTimeout(runDiscardLogic, 100);
      } else {
        runDiscardLogic();
      }
    },

    executeStock(playerId, tileIdToStock, isFromDrawnTile) {
      if (this.isGameOnline) {
        if (playerId !== this.localPlayerId) return;
        if (socket && socket.connected) {
          socket.emit('executeStock', { gameId: this.onlineGameId, playerId, tileIdToStock, isFromDrawnTile });
        }
        return;
      }
    // ... 既存のアクション ...
      const player = this.players.find(p => p.id === playerId);
      if (!player) {
        console.error('executeStock: Player not found');
        return;
      }
      if (player.stockedTile) {
        console.error('executeStock: Player already has a stocked tile');
        return;
      }

      let tileToStock;

      if (isFromDrawnTile) {
        if (!this.drawnTile || this.drawnTile.id !== tileIdToStock) {
          console.error('executeStock: Tile to stock does not match drawn tile.');
          return;
        }
        tileToStock = this.drawnTile;
        this.drawnTile = null;
      } else {
        const tileIndex = player.hand.findIndex(t => t.id === tileIdToStock);
        if (tileIndex === -1) {
          console.error('executeStock: Tile to stock not found in hand.');
          return;
        }
        tileToStock = player.hand.splice(tileIndex, 1)[0];
        if (this.drawnTile) {
          player.hand.push(this.drawnTile);
          player.hand = mahjongLogic.sortHand(player.hand);
        }
        this.drawnTile = null;
      }

      if (!tileToStock) {
        console.error('executeStock: Failed to process stock tile.');
        return;
      }

      player.stockedTile = { ...tileToStock, isPublic: true, isStockedTile: true };

      // 次のプレイヤーのターンへ
      this.moveToNextPlayer();
    },

    /**
     * オンライン対戦のマッチメイキングをサーバーに要求します。
     */
    async requestMatchmaking() {
      const userStore = useUserStore();
      if (!userStore.profile || !userStore.profile.id) {
        console.error('[GameStore] Matchmaking request failed: User profile or ID not found.');
        return;
      }

      // 既にオンラインゲームが開始されている、またはオンラインゲームIDがある場合は何もしない
      if (this.isGameOnline || this.onlineGameId) {
        console.log('[GameStore] Already in an online game or game ID exists. Skipping matchmaking request.');
        return;
      }

      // マッチメイキングリクエストが送信中であればスキップ
      if (this.isMatchmakingRequested) {
        console.log('[GameStore] Matchmaking request already in progress. Skipping.');
        return;
      }

      this.isMatchmakingRequested = true; // リクエストフラグを立てる

      console.log('[GameStore] Calling connectToServer()...');
      this.connectToServer(); // サーバーへの接続を開始

      // ソケットが既に接続済みであれば直接イベントを送信
      if (socket && socket.connected) {
        console.log('[GameStore] Emitting "requestMatchmaking" event...');
        socket.emit('requestMatchmaking', { userId: userStore.profile.id, rating: userStore.profile.rating, username: userStore.profile.username, avatarUrl: userStore.profile.avatar_url });
        console.log(`[GameStore] "requestMatchmaking" event sent. UserID: ${userStore.profile.id}, Rating: ${userStore.profile.rating}, AvatarURL: ${userStore.profile.avatar_url}`);
      } else if (!socket) {
        console.error('[GameStore] Matchmaking request failed: Socket.io instance not created.');
        this.isMatchmakingRequested = false; // エラー時はリクエストフラグをリセット
      }
      // ソケットが未接続の場合は、connectToServer内のconnectイベントリスナーで処理される
    },

    moveToNextPlayer() {
      if (this.isGameOnline) {
        // サーバーからの状態更新を待つため、クライアント側では何もしない
        return;
      }

      if (this.players.length === 0) return;

      const currentPlayerIndex = this.players.findIndex(p => p.id === this.currentTurnPlayerId);

      if (currentPlayerIndex === -1) {
        this.currentTurnPlayerId = this.players[0].id;
      } else {
        this.currentTurnPlayerId = this.players[(currentPlayerIndex + 1) % this.players.length].id;
      }

      this.gamePhase = GAME_PHASES.PLAYER_TURN;

      const nextPlayer = this.players.find(p => p.id === this.currentTurnPlayerId);
      if (nextPlayer) {
        nextPlayer.isUsingStockedTile = false;
      }
      if (this.ruleMode === 'stock' && nextPlayer && !nextPlayer.isAi) {
        if (nextPlayer.stockedTile && !nextPlayer.isRiichi && !nextPlayer.isDoubleRiichi) {
          this.startStockSelectionCountdown(nextPlayer.id);
        } else {
          this.drawTile();
        }
      }
      else {
        this.drawTile();
      }
      this.waitingForPlayerResponses = [];
      this.activeActionPlayerId = null;

      // if (this.isGameOnline) { // サーバー主導なので、クライアントからはブロードキャストしない
      //   this.broadcastGameState();
      // }
    },

    handleRyuukyoku() {
      try {
        this.gamePhase = GAME_PHASES.ROUND_END;
        const dealerPlayer = this.players[this.dealerIndex];

        this.agariResultDetails = {
          roundWind: this.currentRound.wind,
          roundNumber: this.currentRound.number,
          honba: this.honba,
          doraIndicators: [...this.doraIndicators],
          uraDoraIndicators: [],
          winningHand: [],
          agariTile: null,
          yakuList: [],
          totalFans: 0,
          fu: 0,
          score: 0,
          scoreName: null,
          pointChanges: {},
          isDraw: true,
        };

        const tenpaiStates = this.players.map(player => {
          const context = this.createGameContextForPlayer(player, false);
          const tenpaiResult = mahjongLogic.checkYonhaiTenpai(player.hand, context);
          this.isTenpaiDisplay[player.id] = tenpaiResult.isTenpai;
          console.log(`Player ${player.id} tenpai status: ${tenpaiResult.isTenpai}`);
          return {
            id: player.id,
            isTenpai: tenpaiResult.isTenpai,
          };
        });

        const tenpaiPlayers = tenpaiStates.filter(p => p.isTenpai);
        const notenPlayers = tenpaiStates.filter(p => !p.isTenpai);
        const pointChanges = {};
        this.players.forEach(p => pointChanges[p.id] = 0);

        if (tenpaiPlayers.length > 0 && tenpaiPlayers.length < 4) {
          
          let paymentPerNoten = 0;
          let incomePerTenpai = 0;

          if (tenpaiPlayers.length === 1) { paymentPerNoten = 1000; incomePerTenpai = 3000; }
          else if (tenpaiPlayers.length === 2) { paymentPerNoten = 1500; incomePerTenpai = 1500; }
          else if (tenpaiPlayers.length === 3) { paymentPerNoten = 3000; incomePerTenpai = 1000; }

          notenPlayers.forEach(notenPlayer => { pointChanges[notenPlayer.id] -= paymentPerNoten; });
          tenpaiPlayers.forEach(tenpaiPlayer => { pointChanges[tenpaiPlayer.id] += incomePerTenpai; });
        }
        this.agariResultDetails.pointChanges = pointChanges;

        const isDealerTenpai = tenpaiPlayers.some(p => p.id === dealerPlayer.id);
        const rankedPlayers = getRankedPlayers(this.players);
        const dealerRank = rankedPlayers.find(p => p.id === dealerPlayer.id)?.rank;

        const isEast4 = this.currentRound.wind === 'east' && this.currentRound.number === 4;
        const isDealerTop = dealerRank === 1;

        if (isEast4 && isDealerTenpai && isDealerTop) {
          this.resultMessage = `親（${dealerPlayer.name}）がテンパイでトップのため終局`;
          this.honba = 0;
          this.nextDealerIndex = (this.dealerIndex + 1) % this.players.length;
          this.shouldAdvanceRound = true;
          this.shouldEndGameAfterRound = true;
        } else if (isDealerTenpai) {
          this.resultMessage = `親（${dealerPlayer.name}）がテンパイのため連荘`;
          this.honba++;
          this.nextDealerIndex = this.dealerIndex;
          this.shouldAdvanceRound = false;
        } else {
          this.resultMessage = `親（${this.players[this.dealerIndex].name}）がノーテンのため親流れ`;
          this.honba = 0;
          this.nextDealerIndex = (this.dealerIndex + 1) % this.players.length;
          this.shouldAdvanceRound = true;
        }

        if (isEast4 && !isDealerTenpai && isDealerTop) {
          this.shouldEndGameAfterRound = true;
        }

        if (this.shouldEndGameAfterRound && !(isEast4 && isDealerTenpai && isDealerTop)) {
          const playerBelowZero = this.players.find(p => (p.score + (pointChanges[p.id] || 0)) < 0);
          if (playerBelowZero) {
            this.resultMessage += `\n${playerBelowZero.name} の持ち点が0点未満になったため終局します。`;
          }
        }
      } catch (error) {
        console.error("流局処理中にエラーが発生しました:", error);
        this.resultMessage = "流局処理中にエラーが発生しました。";
        this.shouldAdvanceRound = true;
        this.nextDealerIndex = (this.dealerIndex + 1) % this.players.length;
      } finally {
        setTimeout(() => {
          this.stopRiichiBgm();
          this.showResultPopup = true;
          // if (this.isGameOnline) { // サーバー主導なので、クライアントからはブロードキャストしない
          //   this.broadcastGameState();
          // }
        }, 2000); // 2秒の遅延
      }
    },

    applyPointChanges() {
      if (this.agariResultDetails && this.agariResultDetails.pointChanges) {
        for (const playerId in this.agariResultDetails.pointChanges) {
          const player = this.players.find(p => p.id === playerId);
          if (player) {
            player.score += this.agariResultDetails.pointChanges[playerId];
          }
        }
      }
    },

    prepareNextRound() {
      this.applyPointChanges(); // 点数更新をここで実行

      // 和了した場合のみリーチ棒をリセット
      if (this.agariResultDetails && !this.agariResultDetails.isDraw) {
        this.riichiSticks = 0;
      }

      this.playersReadyForNextRound = []; // ★次のラウンドの準備を始める前に、必ず準備完了リストをリセット

      const playerBelowZero = this.players.find(p => p.score < 0);
      if (playerBelowZero) {
        this.shouldEndGameAfterRound = true;
      }

      if (this.nextDealerIndex !== null) {
        this.dealerIndex = this.nextDealerIndex;
        this.nextDealerIndex = null;
      }

      if (this.shouldEndGameAfterRound) {
        this.handleGameEnd();
        return;
      }

      this.showResultPopup = false;
      this.resultMessage = '';
      this.drawnTile = null;
      this.lastDiscardedTile = null;
      this.highlightedDiscardTileId = null;
      this.animationState = { type: null, playerId: null };
      if (this.isChankanChance) this.isChankanChance = false;
      this.chankanTile = null;
      this.players.forEach(p => {
        this.canDeclarePon[p.id] = null; this.canDeclareMinkan[p.id] = null;
        p.stockedTile = null;
        p.isUsingStockedTile = false;
      });
      if (this.shouldAdvanceRound) {
        this.currentRound.number++;
        this.players.forEach((player, index) => {
          player.isDealer = (index === this.dealerIndex);
        });
        const playersWithNewWinds = mahjongLogic.assignPlayerWinds(
          this.players,
          this.dealerIndex,
          this.players.length
        );
        this.players = playersWithNewWinds;
      }
      this.shouldAdvanceRound = false;

      if (this.currentRound.wind === 'east' && this.currentRound.number > 4 && !this.shouldEndGameAfterRound) {
        this.handleGameEnd();
        return;
      }
      this.initializeGame();
      this.startGameFlow();
    },

    setGameMode(mode) {
      this.gameMode = mode;
    },

    setRuleMode(mode) {
      this.ruleMode = mode;
    },

    chooseToDrawFromWall(playerId) {
      if (this.isGameOnline) { // isHostチェックを削除
        if (playerId !== this.localPlayerId) return;
        if (socket && socket.connected) {
          socket.emit('chooseToDrawFromWall', { gameId: this.onlineGameId, playerId });
        }
        return; // サーバーからの状態更新を待つ
      }

      const player = this.players.find(p => p.id === playerId);
      if (this.gamePhase === GAME_PHASES.AWAITING_STOCK_SELECTION_TIMER && this.currentTurnPlayerId === playerId && player) {
        this.stopStockSelectionCountdown();
        this.drawFromWall(playerId);
      }
    },

    toggleStockedTileSelection(playerId) {
      const player = this.players.find(p => p.id === playerId);
      if (player && player.stockedTile) {
        player.isStockedTileSelected = !player.isStockedTileSelected;
        if (this.gamePhase === GAME_PHASES.AWAITING_STOCK_SELECTION_TIMER && player.isStockedTileSelected) {
          this.stopStockSelectionCountdown();
          this.useStockedTile(playerId);
        }
      }
    },

    startStockSelectionCountdown(playerId) {
      const player = this.players.find(p => p.id === playerId);
      if (!player || player.isAi) return;

      this.gamePhase = GAME_PHASES.AWAITING_STOCK_SELECTION_TIMER;
      this.stockSelectionCountdown = 1.3;

      if (this.stockSelectionTimerId) {
        clearInterval(this.stockSelectionTimerId);
      }

      this.stockSelectionTimerId = setInterval(() => {
        this.stockSelectionCountdown = parseFloat((this.stockSelectionCountdown - 0.01).toFixed(2));
        if (this.stockSelectionCountdown <= 0) {
          clearInterval(this.stockSelectionTimerId);
          this.stockSelectionTimerId = null;

          setTimeout(() => {
            const currentPlayer = this.players.find(p => p.id === playerId);
            if (this.gamePhase === GAME_PHASES.AWAITING_STOCK_SELECTION_TIMER && currentPlayer && !currentPlayer.isStockedTileSelected) {
              this.chooseToDrawFromWall(playerId);
            }
          }, 250);
        }
      }, 10);
    },

    stopStockSelectionCountdown() {
      if (this.stockSelectionTimerId) {
        clearInterval(this.stockSelectionTimerId);
        this.stockSelectionTimerId = null;
      }
      this.stockSelectionCountdown = 1.3;
    },

    setRiichiAnimationState(playerId) {
      this.animationState = { type: 'riichi', playerId: playerId };
      setTimeout(() => {
        this.animationState = { type: null, playerId: null };
        if (this.gamePhase === GAME_PHASES.RIICHI_ANIMATION) {
          this.gamePhase = GAME_PHASES.AWAITING_RIICHI_DISCARD;

          // if (this.isGameOnline) { // サーバー主導なので、クライアントからはブロードキャストしない
          //   this.broadcastGameState();
          // }

          const currentPlayer = this.players.find(p => p.id === this.currentTurnPlayerId);
          if (this.gameMode === 'vsCPU' && currentPlayer && currentPlayer.id !== 'player1') {
            this.handleAiRiichiDiscard();
          }
        }
      }, 1500);
    },

    declareRiichi(playerId) {
      if (this.isGameOnline) { // isHostチェックを削除
        if (playerId !== this.localPlayerId) return;
        if (socket && socket.connected) {
          socket.emit('declareRiichi', { gameId: this.onlineGameId, playerId });
        }
        return; // サーバーからの状態更新を待つ
      }

      const audioStore = useAudioStore();
      const player = this.players.find(p => p.id === playerId);
      if (!player || player.isRiichi || player.isDoubleRiichi || !this.drawnTile || player.melds.some(m => m.type !== 'ankan') || this.wall.length <= 3 || player.score < 1000) {
        console.warn("Cannot declare Riichi now.");
        return;
      }
      this.isDeclaringRiichi[playerId] = true;
      this.isIppatsuChance[playerId] = true;
      this.playerActionEligibility[playerId] = {};
      this.gamePhase = GAME_PHASES.RIICHI_ANIMATION;
      audioStore.playSound('Kagura_Suzu03-1.mp3');
      const potentialDiscards = [...player.hand, this.drawnTile];
      this.riichiDiscardOptions = potentialDiscards.filter(tileToDiscard => {
        if (!tileToDiscard) return false;
        const currentFullHand = [...player.hand, this.drawnTile];
        let tempHand = [];
        let discarded = false;
        for (const tile of currentFullHand) {
          if (tile.id === tileToDiscard.id && !discarded) {
            discarded = true;
          } else {
            tempHand.push(tile);
          }
        }
        return mahjongLogic.checkYonhaiTenpai(tempHand, this.createGameContextForPlayer(player, false)).isTenpai;
      }).map(tile => tile.id);

      this.setRiichiAnimationState(playerId);

      // if (this.isGameOnline) { // サーバー主導なので、クライアントからはブロードキャストしない
      //   this.broadcastGameState();
      // }
    },

    playerSkipsCall(playerId) {
      if (this.isGameOnline) { // isHostチェックを削除
        if (playerId !== this.localPlayerId) return;
        if (socket && socket.connected) {
          socket.emit('playerSkipsCall', { gameId: this.onlineGameId, playerId });
        }
        return; // サーバーからの状態更新を待つ
      }

      if (this.activeActionPlayerId !== playerId) {
        console.warn(`Player ${playerId} cannot skip now. Active player is ${this.activeActionPlayerId}.`);
        return;
      }

      const player = this.getPlayerById(playerId);
      if (player && this.playerActionEligibility[playerId]?.canRon) {
        if (player.isRiichi || player.isDoubleRiichi) {
          this.isFuriTen[playerId] = true;
        } else {
          this.isDoujunFuriTen[playerId] = true;
        }
      }
      
      this.playerResponses[playerId] = 'skip';
      this.playerActionEligibility[playerId] = {};

      this.setNextActiveResponder();
    },

    playerDeclaresCall(playerId, actionType, tile) {
      if (this.isGameOnline) { // isHostチェックを削除
        if (playerId !== this.localPlayerId) return;
        if (socket && socket.connected) {
          socket.emit('playerDeclaresCall', { gameId: this.onlineGameId, playerId, actionType, tile });
        }
        return; // サーバーからの状態更新を待つ
      }

      if (this.activeActionPlayerId !== playerId) {
         console.warn(`Player ${playerId} cannot declare ${actionType} now. Active player is ${this.activeActionPlayerId}.`);
         return;
      }

      const tileForAction = actionType === 'ron'
        ? (this.isChankanChance ? this.chankanTile : this.lastDiscardedTile)
        : tile;

      this.playerResponses[playerId] = actionType;
      this.playerActionEligibility[playerId] = {};

      let priority = 0;
      if (actionType === 'ron') priority = 3;
      else if (actionType === 'minkan') priority = 1;
      else if (actionType === 'pon') priority = 1;

      this.actionResponseQueue.push({ playerId, actionType, tile: tileForAction, priority });

      this.setNextActiveResponder();
    },
    _finalizeRiichi(playerId) {
      const player = this.players.find(p => p.id === playerId);
      if (!player || !this.isDeclaringRiichi[playerId]) return;

      if (this.playerTurnCount[player.id] === 1 && this.turnCount < this.players.length) {
        player.isDoubleRiichi = true;
      } else {
        player.isRiichi = true;
      }
      this.isDeclaringRiichi[playerId] = false;

      player.score -= 1000;
      this.riichiSticks++;
    },

    setNextActiveResponder() {
      // Find the next player who hasn't responded yet
      const nextResponderId = this.waitingForPlayerResponses.find(
        (playerId) => !this.playerResponses[playerId]
      );

      if (nextResponderId) {
        // If there is a next responder, set them as active
        this.activeActionPlayerId = nextResponderId;
        
        // If the next responder is a CPU, automatically handle their response
        const nextResponder = this.players.find(p => p.id === nextResponderId);
        if (this.gameMode === 'vsCPU' && nextResponder && nextResponder.id !== 'player1') {
          this.handleAiResponse();
        }
      } else {
        // If all players have responded, process the collected actions
        this.activeActionPlayerId = null;
        this.processPendingActions();
      }

      // ★★★ Crucially, broadcast the state change ★★★
      // if (this.isGameOnline) { // サーバー主導なので、クライアントからはブロードキャストしない
      //   this.broadcastGameState();
      // }
    },

    processPendingActions() {
      if (this.gamePhase === GAME_PHASES.AWAITING_KAKAN_RESPONSE) {
        const ronAction = this.actionResponseQueue.find(a => a.actionType === 'ron' && a.tile?.id === this.chankanTile?.id);
        if (ronAction) {
          this.handleAgari(ronAction.playerId, this.chankanTile, false, this.currentTurnPlayerId);
        } else {
          this.drawRinshanAfterKakan(this.currentTurnPlayerId);
        }
      }
      else if (this.gamePhase === GAME_PHASES.AWAITING_ACTION_RESPONSE) {
        const discarder = this.players.find(p => p.id === this.lastActionPlayerId);
        if (discarder && this.isDeclaringRiichi[discarder.id]) {
          const hasRon = this.actionResponseQueue.some(a => a.actionType === 'ron');
          if (hasRon) {
            this.isDeclaringRiichi[discarder.id] = false;
          } else {
            this._finalizeRiichi(discarder.id);
          }
        }
        if (this.actionResponseQueue.length > 0) {
          this.actionResponseQueue.sort((a, b) => b.priority - a.priority);
          const highestPriorityAction = this.actionResponseQueue[0];

          let ronActions = this.actionResponseQueue.filter(a => a.actionType === 'ron');
          if (ronActions.length > 0) {
            let winningRonAction = ronActions[0];
            if (ronActions.length > 1) {
              const discarderIndex = this.players.findIndex(p => p.id === this.lastActionPlayerId);
              ronActions.sort((a, b) => {
                const indexA = this.players.findIndex(p => p.id === a.playerId);
                const indexB = this.players.findIndex(p => p.id === b.playerId);
                const relativeIndexA = (indexA - discarderIndex + this.players.length) % this.players.length;
                const relativeIndexB = (indexB - discarderIndex + this.players.length) % this.players.length;
                return relativeIndexA - relativeIndexB;
              });
              winningRonAction = ronActions[0];
            }
            this.handleAgari(winningRonAction.playerId, this.lastDiscardedTile, false, this.lastActionPlayerId);
          } else if (highestPriorityAction.actionType === 'minkan') {
            this.declareMinkan(highestPriorityAction.playerId, this.lastActionPlayerId, highestPriorityAction.tile);
          } else if (highestPriorityAction.actionType === 'pon') {
            this.declarePon(highestPriorityAction.playerId, this.lastActionPlayerId, highestPriorityAction.tile);
          }
        } else {
          if (this.actionResponseQueue.length === 0) {
            this.moveToNextPlayer();
          }
        }
      }

      this.actionResponseQueue = [];
      this.waitingForPlayerResponses = [];
      this.playerResponses = {};
      if (this.gamePhase !== GAME_PHASES.ROUND_END && this.gamePhase !== GAME_PHASES.GAME_OVER && this.gamePhase !== GAME_PHASES.AWAITING_DISCARD) {
          this.players.forEach(p => this.playerActionEligibility[p.id] = {});
      }
      this.isChankanChance = false;
      this.chankanTile = null;
      this.activeActionPlayerId = null;
    },

    declarePon(playerId, targetPlayerId, tileToPon) {
      if (this.isGameOnline) {
        if (socket && socket.connected) {
          socket.emit('declarePon', { gameId: this.onlineGameId, playerId, targetPlayerId, tileToPon });
        }
        return; // サーバーからの状態更新を待つ
      }

      const audioStore = useAudioStore();
      const player = this.players.find(p => p.id === playerId);
      const targetPlayer = this.players.find(p => p.id === targetPlayerId);
      if (!player || !targetPlayer || !this.lastDiscardedTile || mahjongLogic.getTileKey(this.lastDiscardedTile) !== mahjongLogic.getTileKey(tileToPon)) {
        console.error("Pon declaration invalid.");
        return;
      }
      const canPon = mahjongLogic.checkCanPon(player.hand, this.lastDiscardedTile);
      if (!canPon) {
        console.error("Cannot declare Pon. Conditions not met.");
        return;
      }

      targetPlayer.discards.pop();

      if (this.riichiDiscardedTileId[targetPlayer.id] === tileToPon.id) {
        this.riichiDiscardedTileId[targetPlayer.id] = null;
      }

      let removedCount = 0;
      player.hand = player.hand.filter(tileInHand => {
        if (mahjongLogic.getTileKey(tileInHand) === mahjongLogic.getTileKey(this.lastDiscardedTile) && removedCount < 2) {
          removedCount++;
          return false;
        }
        return true;
      });

      const currentPlayerIndex = this.players.findIndex(p => p.id === playerId);
      const targetPlayerIndex = this.players.findIndex(p => p.id === targetPlayerId);
      let takenTileRelativePosition = null;
      if ((currentPlayerIndex + 1) % this.players.length === targetPlayerIndex) {
        takenTileRelativePosition = 'right';
      } else if ((currentPlayerIndex + 2) % this.players.length === targetPlayerIndex) {
        takenTileRelativePosition = 'middle';
      } else if ((currentPlayerIndex + 3) % this.players.length === targetPlayerIndex) {
        takenTileRelativePosition = 'left';
      }

      player.melds.push({ type: 'pon', tiles: [tileToPon, tileToPon, tileToPon], from: targetPlayerId, takenTileRelativePosition: takenTileRelativePosition });
      this.updateFuriTenState(playerId);
      
      this.currentTurnPlayerId = playerId;
      this.playerActionEligibility[playerId] = {};
      this.gamePhase = GAME_PHASES.AWAITING_DISCARD;
      this.drawnTile = null;
      this.lastDiscardedTile = null;
      this.rinshanKaihouChance = false;
      this.players.forEach(p => this.isDoujunFuriTen[p.id] = false);
      this.players.forEach(p => this.isIppatsuChance[p.id] = false);
      this.isChankanChance = false;
      this.players.forEach(p => {
        this.playerActionEligibility[p.id] = {};
      });
      this.lastActionPlayerId = playerId;
      if (this.playerTurnCount[playerId] !== undefined) {
        this.playerTurnCount[playerId]++;
      }
      if (this.turnCount < this.players.length) {
        this.anyPlayerMeldInFirstRound = true;
      }
      if (this.gameMode === 'vsCPU' && playerId !== 'player1') {
        setTimeout(() => {
          if (this.currentTurnPlayerId === playerId && this.gamePhase === GAME_PHASES.AWAITING_DISCARD) {
            handleAiDiscardLogic(this, playerId);
          }
        }, 1550);
      }

      this.animationState = { type: 'pon', playerId: playerId };
      // if (this.isGameOnline) { // サーバー主導なので、クライアントからはブロードキャストしない
      //   this.broadcastGameState();
      // }
      audioStore.playSound('Percussive_Accent03-1(Dry).mp3');
      setTimeout(() => {
        this.animationState = { type: null, playerId: null };
        // if (this.isGameOnline) { // サーバー主導なので、クライアントからはブロードキャストしない
        //   this.broadcastGameState();
        // }
      }, 1500);
    },

    declareMinkan(playerId, targetPlayerId, tileToKan) {
      if (this.isGameOnline) {
        if (socket && socket.connected) {
          socket.emit('declareMinkan', { gameId: this.onlineGameId, playerId, targetPlayerId, tileToKan });
        }
        return; // サーバーからの状態更新を待つ
      }

      const audioStore = useAudioStore();
      const player = this.players.find(p => p.id === playerId);
      const targetPlayer = this.players.find(p => p.id === targetPlayerId);
      if (!player || !targetPlayer || !this.lastDiscardedTile || mahjongLogic.getTileKey(this.lastDiscardedTile) !== mahjongLogic.getTileKey(tileToKan)) {
        console.error("Minkan declaration invalid: No valid tile to kan from discard.");
        return;
      }
      const canMinkan = mahjongLogic.checkCanMinkan(player.hand, this.lastDiscardedTile);
      if (!canMinkan) {
        console.error("Cannot declare Minkan. Conditions not met.");
        return;
      }
      targetPlayer.discards.pop();

      if (this.riichiDiscardedTileId[targetPlayer.id] === tileToKan.id) {
        this.riichiDiscardedTileId[targetPlayer.id] = null;
      }

      let removedCount = 0;
      player.hand = player.hand.filter(t => {
        if (mahjongLogic.getTileKey(t) === mahjongLogic.getTileKey(tileToKan) && removedCount < 3) {
          removedCount++;
          return false;
        }
        return true;
      });

      const currentPlayerIndex = this.players.findIndex(p => p.id === playerId);
      const targetPlayerIndex = this.players.findIndex(p => p.id === targetPlayerId);
      let takenTileRelativePosition = null;
      if ((currentPlayerIndex + 1) % this.players.length === targetPlayerIndex) {
        takenTileRelativePosition = 'right';
      } else if ((currentPlayerIndex + 2) % this.players.length === targetPlayerIndex) {
        takenTileRelativePosition = 'middle';
      } else if ((currentPlayerIndex + 3) % this.players.length === targetPlayerIndex) {
        takenTileRelativePosition = 'left';
      }

      player.melds.push({ type: 'minkan', tiles: [tileToKan, tileToKan, tileToKan, tileToKan], from: targetPlayerId, takenTileRelativePosition: takenTileRelativePosition });
      
      this.currentTurnPlayerId = playerId;
      this.lastDiscardedTile = null;
      this.players.forEach(p => this.isDoujunFuriTen[p.id] = false);
      this.players.forEach(p => this.isIppatsuChance[p.id] = false);
      this.isChankanChance = false;
      this.players.forEach(p => {
        this.playerActionEligibility[p.id] = {};
      });
      this.lastActionPlayerId = playerId;
      if (this.playerTurnCount[playerId] !== undefined) {
        this.playerTurnCount[playerId]++;
      }
      if (this.turnCount < this.players.length) {
        this.anyPlayerMeldInFirstRound = true;
      }
      if (this.deadWall.length > 0) {
        this.drawnTile = mahjongLogic.drawRinshanTile(this.wall);
        this.rinshanKaihouChance = true;
        this.pendingKanDoraReveal = true;
        this._handlePostRinshanDraw(playerId);
        this.gamePhase = GAME_PHASES.AWAITING_DISCARD;
      } else {
        console.warn("Cannot draw Rinshan tile, dead wall is empty.");
        this.gamePhase = GAME_PHASES.AWAITING_DISCARD;
      }

      this.animationState = { type: 'kan', playerId: playerId };
      // if (this.isGameOnline) { // サーバー主導なので、クライアントからはブロードキャストしない
      //   this.broadcastGameState();
      // }
      audioStore.playSound('Hyoshigi01-1.mp3');
      setTimeout(() => {
        this.animationState = { type: null, playerId: null };
        // if (this.isGameOnline) { // サーバー主導なので、クライアントからはブロードキャストしない
        //   this.broadcastGameState();
        // }
      }, 1500);
    },

    declareAnkan(playerId, tileToAnkan) {
      if (this.isGameOnline) {
        if (playerId !== this.localPlayerId) return;
        if (socket && socket.connected) {
          socket.emit('declareAnkan', { gameId: this.onlineGameId, playerId, tileToAnkan });
        }
        return; // サーバーからの状態更新を待つ
      }

      const audioStore = useAudioStore();
      const player = this.players.find(p => p.id === playerId);
      if (!player || !tileToAnkan) {
        console.error("Ankan declaration invalid. Player or tile not found.");
        return;
      }
      const ankanKey = mahjongLogic.getTileKey(tileToAnkan);
      const drawnTileKey = this.drawnTile ? mahjongLogic.getTileKey(this.drawnTile) : null;
      const isFromDrawn = ankanKey === drawnTileKey;

      const removeCount = isFromDrawn ? 3 : 4;
      let removedCount = 0;
      player.hand = player.hand.filter(t => {
        if (mahjongLogic.getTileKey(t) === ankanKey && removedCount < removeCount) {
          removedCount++;
          return false;
        }
        return true;
      });
      player.hand = mahjongLogic.sortHand(player.hand);
      player.melds.push({ type: 'ankan', tiles: [tileToAnkan, tileToAnkan, tileToAnkan, tileToAnkan], from: playerId, takenTileRelativePosition: null });
      if (isFromDrawn) {
          this.drawnTile = null;
      } else if (this.drawnTile) {
          player.hand.push(this.drawnTile);
          this.drawnTile = null;
      }

      this.updateFuriTenState(playerId);
      this.players.forEach(p => this.isDoujunFuriTen[p.id] = false);

      this.isChankanChance = false;
      this.players.forEach(p => {
        this.canDeclareRon[p.id] = false;
        this.canDeclarePon[p.id] = null;
        this.canDeclareMinkan[p.id] = null;
      });
      this.lastActionPlayerId = playerId;
      if (this.playerTurnCount[playerId] !== undefined) {
        this.playerTurnCount[playerId]++;
      }
      if (this.turnCount < this.players.length) { // 暗槓も地和・人和を消す
        this.anyPlayerMeldInFirstRound = true;
      }
      if (this.deadWall.length > 0) {
        this.drawnTile = mahjongLogic.drawRinshanTile(this.wall);
        this.rinshanKaihouChance = true;
        if (this.deadWall.length > 0) {
            const newDoraIndicator = mahjongLogic.revealDora(this.deadWall);
            if (newDoraIndicator && !this.doraIndicators.find(d => d.id === newDoraIndicator.id)) this.doraIndicators.push(newDoraIndicator);
        }
        this._handlePostRinshanDraw(playerId);
        this.gamePhase = GAME_PHASES.AWAITING_DISCARD;
      } else {
        console.warn("Cannot draw Rinshan tile, dead wall is empty.");
        this.gamePhase = GAME_PHASES.AWAITING_DISCARD;
      }

      this.animationState = { type: 'kan', playerId: playerId };
      // if (this.isGameOnline) { // サーバー主導なので、クライアントからはブロードキャストしない
      //   this.broadcastGameState();
      // }
      audioStore.playSound('Hyoshigi01-1.mp3');
      setTimeout(() => {
        this.animationState = { type: null, playerId: null };
        // if (this.isGameOnline) { // サーバー主導なので、クライアントからはブロードキャストしない
        //   this.broadcastGameState();
        // }
      }, 1500);
    },

    declareKakan(playerId, tileToKakan) {
      if (this.isGameOnline) {
        if (playerId !== this.localPlayerId) return;
        if (socket && socket.connected) {
          socket.emit('declareKakan', { gameId: this.onlineGameId, playerId, tileToKakan });
        }
        return; // サーバーからの状態更新を待つ
      }

      const audioStore = useAudioStore();
      const player = this.players.find(p => p.id === playerId);
      if (player && (player.isRiichi || player.isDoubleRiichi)) {
        console.warn(`Player ${playerId} is in Riichi and cannot declare Kakan.`);
        return;
      }
      if (!player || !tileToKakan) {
        console.error("Kakan declaration invalid. Player or tile not found.");
        return;
      }
      const kakanKey = mahjongLogic.getTileKey(tileToKakan);
      const ponMeldIndex = player.melds.findIndex(m => m.type === 'pon' && mahjongLogic.getTileKey(m.tiles[0]) === kakanKey);
      if (ponMeldIndex === -1) {
        console.error("Kakan failed: Corresponding Pon meld not found.");
        return;
      }
      player.melds[ponMeldIndex].type = 'kakan';
      player.melds[ponMeldIndex].tiles.push(tileToKakan);
      if (this.drawnTile && mahjongLogic.getTileKey(this.drawnTile) === kakanKey) {
          this.drawnTile = null;
      }
      else {
        const tileIndexInHand = player.hand.findIndex(t => mahjongLogic.getTileKey(t) === kakanKey);
        if (tileIndexInHand > -1) player.hand.splice(tileIndexInHand, 1);
      }

      this.updateFuriTenState(playerId);
      this.isChankanChance = true;
      this.chankanTile = tileToKakan;
      this.waitingForPlayerResponses = [];
      this.playerResponses = {};
      this.players.forEach(p => {
        if (p.id !== playerId) {
          const canChankanRon = mahjongLogic.canWinBasicShape(p.hand, this.chankanTile, p.melds);
          if (canChankanRon && !this.isFuriTen[p.id] && !this.isDoujunFuriTen[p.id]) {
            this.playerActionEligibility[p.id] = { canRon: true };
            this.waitingForPlayerResponses.push(p.id);
          } else {
            this.playerActionEligibility[p.id] = { canRon: false };
          }
        }
      });
      this.lastActionPlayerId = playerId;

      this.players.forEach(p => this.isDoujunFuriTen[p.id] = false);
      this.players.forEach(p => this.isIppatsuChance[p.id] = false);
      if (this.playerTurnCount[playerId] !== undefined) {
        this.playerTurnCount[playerId]++;
      }
      if (this.turnCount < this.players.length) {
        this.anyPlayerMeldInFirstRound = true;
      }
      this.gamePhase = GAME_PHASES.AWAITING_KAKAN_RESPONSE;
      this.setNextActiveResponder();

      this.animationState = { type: 'kan', playerId: playerId };
      // if (this.isGameOnline) { // サーバー主導なので、クライアントからはブロードキャストしない
      //   this.broadcastGameState();
      // }
      audioStore.playSound('Hyoshigi01-1.mp3');
      setTimeout(() => {
        this.animationState = { type: null, playerId: null };
        // if (this.isGameOnline) { // サーバー主導なので、クライアントからはブロードキャストしない
        //   this.broadcastGameState();
        // }
      }, 1500);
    },
    
    drawRinshanAfterKakan(playerId) {
      if (this.currentTurnPlayerId !== playerId || this.gamePhase !== GAME_PHASES.AWAITING_KAKAN_RESPONSE) {
        console.warn("Cannot draw rinshan tile now for Kakan.");
        return;
      }
      this.players.forEach(p => {
        if (p.id !== playerId) {
            this.playerActionEligibility[p.id] = {};
            this.playerResponses[p.id] = undefined;
        }
      });
      if (this.deadWall.length > 0) {
        this.drawnTile = mahjongLogic.drawRinshanTile(this.wall);
        this.rinshanKaihouChance = true;
        this.pendingKanDoraReveal = true;
        this._handlePostRinshanDraw(playerId);
        this.gamePhase = GAME_PHASES.AWAITING_DISCARD;
      } else {
        console.warn("Cannot draw Rinshan tile, dead wall is empty.");
        this.gamePhase = GAME_PHASES.AWAITING_DISCARD;
      }
    },
    handleAgari(agariPlayerId, agariTile, isTsumo, ronTargetPlayerId = null) {
      if (this.isGameOnline) {
        if (agariPlayerId !== this.localPlayerId) return;
        if (socket && socket.connected) {
          socket.emit('handleAgari', { gameId: this.onlineGameId, agariPlayerId, agariTile, isTsumo, ronTargetPlayerId });
        }
        return; // サーバーからの状態更新を待つ
      }

      const audioStore = useAudioStore();
      this.actionResponseQueue = [];
      const player = this.players.find(p => p.id === agariPlayerId);
      if (!player) {
        console.error(`[handleAgari] Player not found: ${agariPlayerId}`);
        return;
      }

      if (player.isRiichi || player.isDoubleRiichi) {
        this.uraDoraIndicators = mahjongLogic.getUraDoraIndicators(this.deadWall, this.doraIndicators);
      } else {
        this.uraDoraIndicators = [];
      }

      const handForWin = isTsumo ? [...player.hand, this.drawnTile] : [...player.hand, agariTile];
      if (handForWin.some(tile => !tile)) {
          console.error('[handleAgari] Invalid tile in handForWin:', handForWin);
          return;
      }

      const gameCtxForWin = this.createGameContextForPlayer(player, isTsumo, agariTile);
      const winResult = isTsumo 
        ? mahjongLogic.checkCanTsumo(player.hand, this.drawnTile, gameCtxForWin)
        : mahjongLogic.checkCanRon(player.hand, agariTile, gameCtxForWin);

      if (!winResult.isWin) {
        console.error("handleAgari called but win condition not met.");
        return;
      }

      if (agariPlayerId === 'player1' && !winResult.isChombo) {
        const userStore = useUserStore();
        winResult.yaku.forEach(yaku => {
          if (yaku.key) { userStore.updateYakuAchievement(yaku.key); }
        });
      }

      if (!isTsumo && !gameCtxForWin.isChankan) {
        this.highlightedDiscardTileId = this.lastDiscardedTile.id;
      }

      this.animationState = { type: winResult.isChombo ? 'ron' : (isTsumo ? 'tsumo' : 'ron'), playerId: agariPlayerId };
      if (winResult.isChombo) {
        audioStore.playSound('Single_Accent17-2(Dry).mp3');
      } else if (isTsumo) {
        audioStore.playSound('Multi_Accent01-3(Dry).mp3');
      } else {
        audioStore.playSound('Single_Accent17-2(Dry).mp3');
      }

      const pointChanges = {};
      this.players.forEach(p => pointChanges[p.id] = 0);

      if (winResult.isChombo) {
        const isChomboParent = winResult.chomboPlayerIsParent;
        if (isChomboParent) {
          pointChanges[agariPlayerId] = -12000;
          this.players.forEach(p => { if (p.id !== agariPlayerId) pointChanges[p.id] = 4000; });
        } else {
          pointChanges[agariPlayerId] = -8000;
          this.players.forEach(p => {
            if (p.id !== agariPlayerId) pointChanges[p.id] = p.isDealer ? 4000 : 2000;
          });
        }
      } else {
        if (isTsumo) {
          if (player.isDealer) {
            const scorePerKo = winResult.score / (this.players.length - 1);
            this.players.forEach(p => { if (p.id !== agariPlayerId) pointChanges[p.id] = -scorePerKo; });
          } else {
            const parentPayment = Math.ceil(winResult.score / 2);
            const koPayment = Math.ceil(winResult.score / 4);
            this.players.forEach(p => { if (p.id !== agariPlayerId) pointChanges[p.id] = p.isDealer ? -parentPayment : -koPayment; });
          }
          pointChanges[agariPlayerId] = winResult.score;
        } else if (ronTargetPlayerId) {
          pointChanges[ronTargetPlayerId] = -winResult.score;
          pointChanges[agariPlayerId] = winResult.score;
        }
        pointChanges[agariPlayerId] += this.riichiSticks * 1000;
      }

      this.gamePhase = GAME_PHASES.ROUND_END;
      this.agariResultDetails = {
        roundWind: this.currentRound.wind,
        roundNumber: this.currentRound.number,
        honba: this.honba,
        doraIndicators: [...this.doraIndicators],
        uraDoraIndicators: (player.isRiichi || player.isDoubleRiichi) ? [...this.uraDoraIndicators] : [],
        winningHand: mahjongLogic.sortHand([...handForWin]),
        agariTile: { ...agariTile },
        yakuList: winResult.yaku,
        totalFans: winResult.fans,
        fu: winResult.fu || 0,
        score: winResult.score,
        scoreName: winResult.scoreName,
        pointChanges: pointChanges,
        melds: player.melds,
        isDraw: false,
        isChombo: winResult.isChombo,
        chomboPlayerId: winResult.isChombo ? agariPlayerId : null,
      };
      
      const playersWithNewScores = this.players.map(p => ({
        ...p,
        score: p.score + (pointChanges[p.id] || 0)
      }));

      const isLastRound = this.currentRound.wind === 'east' && this.currentRound.number === 4;
      const agariPlayerIsDealer = player.isDealer;
      let baseMessage = winResult.isChombo ? `${player.name} が役なしチョンボ！` : `${player.name} の和了！`;
      let roundEndMessage = '';

      if (winResult.isChombo) {
        roundEndMessage = `チョンボのため、親は流れず次の本場になります。`;
        this.honba++;
        this.nextDealerIndex = this.dealerIndex;
        this.shouldAdvanceRound = false;
      } else if (agariPlayerIsDealer) {
        const rankedPlayers = getRankedPlayers(playersWithNewScores);
        const dealerIsTop = rankedPlayers.find(p => p.id === agariPlayerId)?.rank === 1;

        if (isLastRound && dealerIsTop) {
          roundEndMessage = `親がトップで和了したため、ゲーム終了です。`;
          this.honba = 0;
          this.nextDealerIndex = (this.dealerIndex + 1) % this.players.length;
          this.shouldAdvanceRound = true;
          this.shouldEndGameAfterRound = true;
        } else {
          roundEndMessage = `親が和了したため、連荘します。`;
          this.honba++;
          this.nextDealerIndex = this.dealerIndex;
          this.shouldAdvanceRound = false;
        }
      } else {
        roundEndMessage = `子が和了したため、親が流れます。`;
        this.honba = 0;
        this.nextDealerIndex = (this.dealerIndex + 1) % this.players.length;
        this.shouldAdvanceRound = true;
      }

      if (!this.shouldEndGameAfterRound && playersWithNewScores.some(p => p.score < 0)) {
        this.shouldEndGameAfterRound = true;
        const playerBelowZero = playersWithNewScores.find(p => p.score < 0);
        const originalPlayer = this.players.find(p => p.id === playerBelowZero.id);
        roundEndMessage += `\n${originalPlayer.name}の持ち点が0点未満になったため終局します。`;
      }
      
      if (isLastRound && this.shouldAdvanceRound && !this.shouldEndGameAfterRound) {
          this.shouldEndGameAfterRound = true;
          if (!roundEndMessage.includes('ゲーム終了')) {
            roundEndMessage += `\n東4局が終了したため、ゲーム終了です。`;
          }
      }

      this.resultMessage = `${baseMessage}\n${roundEndMessage}`;

      setTimeout(() => {
        this.showResultPopup = true;
        this.stopRiichiBgm();
        if (this.isGameOnline) {
          this.broadcastGameState();
        }
      }, 1800);
    },

  async handleGameEnd(options = { showLoading: true }) {
    const userStore = useUserStore();

    this.gamePhase = GAME_PHASES.GAME_OVER;
    const rankedPlayers = getRankedPlayers(this.players);
    const myPlayerRank = rankedPlayers.find(p => p.id === 'player1')?.rank;

    if (this.gameMode !== 'allManual' && userStore.profile) {
      let initialCurrentWinStreak = userStore.profile?.current_win_streak || 0;
      let maxConsecutiveWins = userStore.profile?.max_win_streak || 0;

      let newConsecutiveWins = initialCurrentWinStreak;
      if (myPlayerRank === 1) {
        newConsecutiveWins++;
        this.previousConsecutiveWins = 0;
      } else {
        if (initialCurrentWinStreak > 0) {
          this.previousConsecutiveWins = initialCurrentWinStreak;
        } else {
          this.previousConsecutiveWins = 0;
        }
        newConsecutiveWins = 0;
      }
      if (newConsecutiveWins > maxConsecutiveWins) {
        maxConsecutiveWins = newConsecutiveWins;
      }

      this.finalResultDetails.consecutiveWins = newConsecutiveWins;
    } else if (userStore.profile) {
      this.finalResultDetails.consecutiveWins = userStore.profile.current_win_streak || 0;
    }


    this.finalResultDetails.rankedPlayers = rankedPlayers.map(p => ({
      id: p.id,
      rank: p.rank,
      name: p.name,
      score: p.score,
    }));

    if (userStore.profile) {
      // UI表示を優先するため、awaitせずにバックグラウンドで実行
      userStore.saveAchievedYaku(options);
    }

    const player1 = this.players.find(p => p.id === 'player1');
    if (player1 && userStore.profile) {
      let gain = 0;
      if (myPlayerRank === 1) {
        gain = Math.floor(player1.score / 300) + 300;
      } else if (myPlayerRank === 2) {
        gain = Math.floor(player1.score / 300) + 100;
      } else if (myPlayerRank === 3) {
        gain = -Math.floor((50000 - player1.score) / 200);
      } else if (myPlayerRank === 4) {
        if (player1.score < 0) {
          gain = -400;
        } else {
          gain = -Math.floor((50000 - player1.score) / 200) - 100;
        }
      }
      this.lastCoinGain = gain;

      const matchData = {
        user_id: userStore.profile.id,
        rank: myPlayerRank,
        is_win: myPlayerRank === 1,
        coin_change: gain,
      };
      // UI表示を優先するため、awaitせずにバックグラウンドで実行
      supabase.from('matches').insert([matchData]).then(({ error }) => {
        if (error) {
          console.error('matchesテーブルへの対局結果の保存中にエラーが発生しました:', error.message);
        } else {
          console.log('対局結果をmatchesテーブルに保存しました。');
        }
      });
    }

    userStore.setGameInProgress(false);

    this.showFinalResultPopup = true;

    if (this.isGameOnline) {
      await this.broadcastGameState();
    }
  },

    returnToTitle() {
      const userStore = useUserStore();
      this.showFinalResultPopup = false;
      this.resetGameForNewSession();
    },

    resetGameAndStreak() {
      const userStore = useUserStore();
      this.showFinalResultPopup = false;
      this.resetGameForNewSession();
      userStore.resetWinStreak();
    },

    resetGameForNewSession(options = { keepStreak: false }) {
      this.playersReadyForNextRound = []; // ★ 強制的にリセット

      const userStore = useUserStore();
      userStore.resetTemporaryData();

      if (!options.keepStreak) {
        // 後から記載
      }

      const currentStreakFromUserStore = userStore.profile?.current_win_streak || 0;
      const wins = options.keepStreak ? currentStreakFromUserStore : 0;

      const localPlayerId = this.isGameOnline ? this.localPlayerId : 'player1';
      const localPlayer = this.players.find(p => p.id === localPlayerId);

      this.players = localPlayer ? [localPlayer] : [];

      if (this.players.length > 0 && userStore.profile) {
        this.players[0].name = userStore.profile.username;
      }

      this.players.forEach(player => {
        player.hand = [];
        player.discards = [];
        player.melds = [];
        player.score = 50000;
        player.isDealer = false;
        player.seatWind = null;
        player.isRiichi = false;
        player.isDoubleRiichi = false;
        player.isDeclaringRiichi = false;
        player.stockedTile = null;
        player.isUsingStockedTile = false;
        player.isStockedTileSelected = false;
        this.isIppatsuChance[player.id] = false;
      });

      this.wall = [];
      this.deadWall = [];
      this.doraIndicators = [];
      this.drawnTile = null;
      this.lastDiscardedTile = null;
      this.dealerIndex = null;
      this.currentTurnPlayerId = null;
      this.gamePhase = GAME_PHASES.WAITING_TO_START;
      this.showResultPopup = false;
      this.resultMessage = '';
      this.showFinalResultPopup = false;
      this.finalResultDetails = {
        rankedPlayers: [],
        consecutiveWins: wins,
      };
      this.previousConsecutiveWins = 0;
      this.currentRound = { wind: 'east', number: 1 };
      this.honba = 0;
      this.turnCount = 0;
      this.playerTurnCount = {};
      this.isChankanChance = false;
      this.chankanTile = null;
      this.rinshanKaihouChance = false;
      this.lastActionPlayerId = null;
      this.players.forEach(p => this.canDeclareRon[p.id] = false);
      this.players.forEach(p => {
        this.canDeclareRon[p.id] = false;
        this.canDeclarePon[p.id] = null;
        this.canDeclareMinkan[p.id] = null;
        this.canDeclareAnkan[p.id] = null;
        this.canDeclareKakan[p.id] = null;
        this.playerActionEligibility[p.id] = {};
        this.playerResponses = {};
        this.waitingForPlayerResponses = [];
        this.riichiDiscardOptions = [];
        this.actionResponseQueue = [];
        this.isDoujunFuriTen = {};
        this.isFuriTen = {};
        this.isTenpaiDisplay = {};
        this.isDeclaringRiichi[p.id] = false;
        this.activeActionPlayerId = null;
      });
      this.shouldEndGameAfterRound = false;
      this.animationState = { type: null, playerId: null };
      this.pendingKanDoraReveal = false;
      this.stopRiichiBgm();
      this.previousBgm = null;
      this.isGameReady = false; // ゲーム準備状態をリセット
      this.hasGameStarted = false; // ゲームが終了したことを示す
    },

    updateFuriTenState(playerId) {
      const player = this.players.find(p => p.id === playerId);
      if (!player) {
        this.isFuriTen[playerId] = false;
        return;
      }

      if ((player.isRiichi || player.isDoubleRiichi) && this.isFuriTen[playerId] === true) {
        return;
      }

      const tenpaiResult = mahjongLogic.checkYonhaiTenpai(player.hand, this.createGameContextForPlayer(player, false));
      if (!tenpaiResult.isTenpai) {
        this.isFuriTen[playerId] = false;
        return;
      }

      const waitingTileKeys = new Set(tenpaiResult.waits.map(mahjongLogic.getTileKey));
      const discardTileKeys = new Set(player.discards.map(mahjongLogic.getTileKey));

      const isFuriten = [...waitingTileKeys].some(waitKey => discardTileKeys.has(waitKey));
      this.isFuriTen[playerId] = isFuriten;
    },

    createGameContextForPlayer(player, isTsumo, agariTile = null) {
      if (!player) return null;
      return {
          playerWind: player.seatWind,
          roundWind: this.currentRound.wind === 'east' ? mahjongLogic.PLAYER_WINDS.EAST : mahjongLogic.PLAYER_WINDS.SOUTH,
          doraIndicators: this.doraIndicators,
          uraDoraIndicators: (player.isRiichi || player.isDoubleRiichi) ? this.uraDoraIndicators : [],
          turnCount: this.turnCount,
          playerTurnCount: this.playerTurnCount[player.id],
          isRiichi: player.isRiichi,
          isDoubleRiichi: player.isDoubleRiichi,
          isIppatsu: this.isIppatsuChance[player.id],
          isHaitei: isTsumo && this.wall.length === 0 && !this.rinshanKaihouChance,
          isHoutei: !isTsumo && this.wall.length === 0 && agariTile && this.lastDiscardedTile && agariTile.id === this.lastDiscardedTile.id,
          isChankan: this.isChankanChance && agariTile && this.chankanTile && agariTile.id === this.chankanTile.id,
          isTenho: player.isDealer && (this.playerTurnCount[player.id] || 0) === 1 && isTsumo && this.turnCount === 0 && (player.melds || []).length === 0,
          isChiho: !player.isDealer && (this.playerTurnCount[player.id] || 0) === 1 && isTsumo && this.turnCount < this.players.length && !this.anyPlayerMeldInFirstRound,
          isRenho: !player.isDealer && !isTsumo && (this.playerTurnCount[player.id] || 0) === 0 && this.turnCount < this.players.length && !this.anyPlayerMeldInFirstRound,
          melds: player.melds,
          isParent: player.isDealer,
          remainingTilesCount: this.wall.length,
          currentPlayerTurnCount: this.playerTurnCount[player.id] || 0,
          isUsingStockedTile: player.isUsingStockedTile
      };
    },

    handleAiRiichiDiscard() {
      const player = this.players.find(p => p.id === this.currentTurnPlayerId);
      if (!player || this.riichiDiscardOptions.length === 0) {
        this.handleAiDiscard();
        return;
      }

      let bestRiichiDiscardTile = null;
      let minScoreForRiichiDiscard = Infinity;

      const potentialDiscardsObjects = [...player.hand, this.drawnTile].filter(tile =>
        tile && this.riichiDiscardOptions.includes(tile.id)
      );

      for (const tile of potentialDiscardsObjects) {
        let score = 0;
        const fullHandForScoring = [...player.hand, this.drawnTile];
        const tempHandAfterDiscard = fullHandForScoring.filter(t => t.id !== tile.id);

        if (tile.suit === mahjongLogic.SUITS.JIHAI) {
          const tileKey = mahjongLogic.getTileKey(tile);
          const count = tempHandAfterDiscard.filter(t => mahjongLogic.getTileKey(t) === tileKey).length;

          if (count >= 2) {
            score -= 50;
          }
          const isWindTile = tile.rank >= mahjongLogic.JIHAI_TYPES.TON && tile.rank <= mahjongLogic.JIHAI_TYPES.PEI;
          const isSangenTile = tile.rank >= mahjongLogic.JIHAI_TYPES.HAKU && tile.rank <= mahjongLogic.JIHAI_TYPES.CHUN;

          if (isWindTile) {
            const otherWindTiles = tempHandAfterDiscard.filter(t => t.suit === mahjongLogic.SUITS.JIHAI && t.rank >= mahjongLogic.JIHAI_TYPES.TON && t.rank <= mahjongLogic.JIHAI_TYPES.PEI && mahjongLogic.getTileKey(t) !== tileKey);
            if (otherWindTiles.length === 0) {
              score += 80;
            } else {
              score -= 20;
            }
          } else if (isSangenTile) {
            const otherSangenTiles = tempHandAfterDiscard.filter(t => t.suit === mahjongLogic.SUITS.JIHAI && t.rank >= mahjongLogic.JIHAI_TYPES.HAKU && t.rank <= mahjongLogic.JIHAI_TYPES.CHUN && mahjongLogic.getTileKey(t) !== tileKey);
            if (otherSangenTiles.length === 0) {
              score += 80;
            } else {
              score -= 20;
            }
          } else {
            score += 100;
          }
        } else {
          const suitTiles = tempHandAfterDiscard.filter(t => t.suit === tile.suit);
          const rank = tile.rank;

          if (suitTiles.length <= 2) {
            score += 80;
          } else if (suitTiles.length <= 4) {
            score += 40;
          }

          let connections = 0;
          if (suitTiles.some(t => t.rank === rank + 1)) { connections += 2; }
          if (suitTiles.some(t => t.rank === rank - 1)) { connections += 2; }
          if (suitTiles.some(t => t.rank === rank + 2)) { connections += 1; }
          if (suitTiles.some(t => t.rank === rank - 2)) { connections += 1; }
          score -= (connections * 10);

          if (rank === 1 && !suitTiles.some(t => t.rank === 2 || t.rank === 3)) { score += 25; }
          if (rank === 9 && !suitTiles.some(t => t.rank === 7 || t.rank === 8)) { score += 25; }
          if (rank > 1 && rank < 9 && connections === 0) { score += 30; }
        }

        if (score < minScoreForRiichiDiscard) {
          minScoreForRiichiDiscard = score;
          bestRiichiDiscardTile = tile;
        } 
      }

      if (bestRiichiDiscardTile) {
        this.discardTile(player.id, bestRiichiDiscardTile.id, this.drawnTile && bestRiichiDiscardTile.id === this.drawnTile.id);
      } else {
        this.handleAiDiscard();
      }
    },
    
    _handlePostRinshanDraw(playerId) {
      const player = this.players.find(p => p.id === playerId);
      if (!player || !this.drawnTile) return;

      this.players.forEach(p => this.isIppatsuChance[p.id] = false);

      const eligibility = {};

      const gameContextForTsumo = this.createGameContextForPlayer(player, true);
      const tsumoWinResult = mahjongLogic.checkYonhaiWin([...player.hand, this.drawnTile], this.drawnTile, true, gameContextForTsumo);
      eligibility.canTsumoAgari = tsumoWinResult.isWin;

      if (!player.isRiichi && !player.isDoubleRiichi) {
          if (this.wall.length > 0) {
              const ankanOptions = mahjongLogic.checkCanAnkan(player.hand, this.drawnTile);
              eligibility.canAnkan = ankanOptions.length > 0 ? ankanOptions : null;

              const kakanOptions = mahjongLogic.checkCanKakan(player.hand, player.melds, this.drawnTile);
              eligibility.canKakan = kakanOptions.length > 0 ? kakanOptions : null;
          }
          
          let canRiichi = false;
          if (this.wall.length > 3 && player.melds.every(m => m.type === 'ankan') && player.score >= 1000) {
            const potentialHandAfterDraw = [...player.hand, this.drawnTile];
            for (const tileToDiscard of potentialHandAfterDraw) {
              const tempHand = [];
              let discarded = false;
              for (const tile of potentialHandAfterDraw) {
                if (tile.id === tileToDiscard.id && !discarded) {
                  discarded = true;
                }
                else {
                  tempHand.push(tile);
                }
              }
              const tenpaiResult = mahjongLogic.checkYonhaiTenpai(tempHand, this.createGameContextForPlayer(player, false));
              if (tenpaiResult.isTenpai && tenpaiResult.waits.length > 0) {
                canRiichi = true;
                break;
              }
            }
          }
          eligibility.canRiichi = canRiichi;
      }
      
      this.playerActionEligibility[playerId] = eligibility;
      this.canDeclareAnkan[playerId] = eligibility.canAnkan;
      this.canDeclareKakan[playerId] = eligibility.canKakan;

      if (this.gameMode === 'vsCPU' && player.id !== 'player1') {
        setTimeout(() => {
          if (this.currentTurnPlayerId === player.id && this.gamePhase === GAME_PHASES.AWAITING_DISCARD) {
            if (eligibility.canTsumoAgari) {
              setTimeout(() => {
                this.handleAgari(playerId, this.drawnTile, true);
              }, 200);
            } else if (eligibility.canAnkan && Math.random() < 1.0) {
              this.declareAnkan(playerId, eligibility.canAnkan[0]);
            } else if (eligibility.canKakan && Math.random() < 1.0) {
              this.declareKakan(playerId, eligibility.canKakan[0]);
            } else {
              const fullHand = [...player.hand, this.drawnTile];
              const tileToDiscard = this._getBestTileToDiscard(player, fullHand);
              const isFromDrawnTile = tileToDiscard.id === this.drawnTile.id;
              this.discardTile(playerId, tileToDiscard.id, isFromDrawnTile);
            }
          }
        }, 1550);
      }
    },
    
    _getBestTileToDiscard(player, currentFullHand) {
      let bestTileToDiscard = null;
      let maxScore = -Infinity;

      const lastMeld = player.melds.length > 0 ? player.melds[player.melds.length - 1] : null;

      for (const tile of currentFullHand) {
        let score = 0;
        const tileKey = mahjongLogic.getTileKey(tile);
        const tileCountInHand = currentFullHand.filter(t => mahjongLogic.getTileKey(t) === tileKey).length;

        if (tileCountInHand >= 2) {
          score -= 100;
        }
        if (tileCountInHand >= 3) {
          score -= 150;
        }

        if (lastMeld && lastMeld.tiles.length > 0) {
          const calledTile = lastMeld.tiles[0];

          if (calledTile.suit === 'z') {
            if (tile.suit === 'z') {
              score -= 200;
            }
          } else {
            const isCalledTileTerminal = (calledTile.rank === 1 || calledTile.rank === 9);

            if (isCalledTileTerminal) {
              if (tile.suit !== 'z' && (tile.rank === 1 || tile.rank === 9)) {
                score -= 200;
              }
            } else {
              if (tile.suit === calledTile.suit) {
                score -= 200;
              }
            }
          }
        }

        if (tile.suit === mahjongLogic.SUITS.JIHAI) {
          const isWindTile = tile.rank >= mahjongLogic.JIHAI_TYPES.TON && tile.rank <= mahjongLogic.JIHAI_TYPES.PEI;
          const isSangenTile = tile.rank >= mahjongLogic.JIHAI_TYPES.HAKU && tile.rank <= mahjongLogic.JIHAI_TYPES.CHUN;

          if (isWindTile) {
            const otherWindTiles = currentFullHand.filter(t => t.suit === mahjongLogic.SUITS.JIHAI && t.rank >= mahjongLogic.JIHAI_TYPES.TON && t.rank <= mahjongLogic.JIHAI_TYPES.PEI && mahjongLogic.getTileKey(t) !== tileKey);
            if (otherWindTiles.length === 0) {
              score += 80;
            } else {
              score -= 20;
            }
          } else if (isSangenTile) {
            const otherSangenTiles = currentFullHand.filter(t => t.suit === mahjongLogic.SUITS.JIHAI && t.rank >= mahjongLogic.JIHAI_TYPES.HAKU && t.rank <= mahjongLogic.JIHAI_TYPES.CHUN && mahjongLogic.getTileKey(t) !== tileKey);
            if (otherSangenTiles.length === 0) {
              score += 80;
            } else {
              score -= 20;
            }
          } else {
            score += 100;
          }
        } else {
          const suitTiles = currentFullHand.filter(t => t.suit === tile.suit);
          const rank = tile.rank;

          if (suitTiles.length <= 2) {
            score += 80;
          } else if (suitTiles.length <= 4) {
            score += 40;
          }

          let connections = 0;
          for (let i = -2; i <= 2; i++) {
            if (i === 0) continue;
            if (suitTiles.some(t => t.rank === rank + i)) {
              connections++;
            }
          }
          score -= (connections * 10);

          if (rank === 1 && !suitTiles.some(t => t.rank === 2 || t.rank === 3)) {
            score += 25;
          }
          if (rank === 9 && !suitTiles.some(t => t.rank === 7 || t.rank === 8)) {
            score += 25;
          }
          if (rank > 1 && rank < 9 && connections === 0) {
              score += 30;
          }
        }

        if (score > maxScore) {
          maxScore = score;
          bestTileToDiscard = tile;
        }
      }
      return bestTileToDiscard || currentFullHand[Math.floor(Math.random() * currentFullHand.length)];
    },

    handleAiDiscard() {
      if (this.gameMode !== 'vsCPU' || this.gamePhase !== GAME_PHASES.AWAITING_DISCARD) {
        return;
      }

      const aiPlayerId = this.currentTurnPlayerId;
      const player = this.players.find(p => p.id === aiPlayerId);

      if (!player || player.id === 'player1') {
        return;
      }

      setTimeout(() => {
        if (this.drawnTile && this.playerActionEligibility[aiPlayerId]?.canTsumoAgari) {
          this.handleAgari(aiPlayerId, this.drawnTile, true);
          return;
        }

        const fullHand = this.drawnTile ? [...player.hand, this.drawnTile] : [...player.hand];

        if (fullHand.length === 0) {
          console.error(`AI ${aiPlayerId} has no tiles to discard.`);
          return;
        }

        const tileToDiscard = this._getBestTileToDiscard(player, fullHand);
        const isFromDrawnTile = this.drawnTile ? tileToDiscard.id === this.drawnTile.id : false;

        this.discardTile(aiPlayerId, tileToDiscard.id, isFromDrawnTile);
      }, 500);
    },

    handleAiResponse() {
      const aiPlayerId = this.activeActionPlayerId;
      if (!aiPlayerId || this.gameMode !== 'vsCPU' || aiPlayerId === 'player1') {
        return;
      }

      setTimeout(() => {
        if (this.activeActionPlayerId === aiPlayerId) {
          const eligibility = this.playerActionEligibility[aiPlayerId];

          if (eligibility?.canRon && Math.random() < 0.75) {
            this.playerDeclaresCall(aiPlayerId, 'ron', null);
            return;
          }

          if (eligibility?.canMinkan && Math.random() < 1.0) {
            this.playerDeclaresCall(aiPlayerId, 'minkan', eligibility.canMinkan);
            return;
          }

          if (eligibility?.canPon && Math.random() < 0.3) {
            this.playerDeclaresCall(aiPlayerId, 'pon', eligibility.canPon);
            return;
          }

          this.playerSkipsCall(aiPlayerId);
        }
      }, 0);
    },
    startGameFlow() {
      if (this.currentTurnPlayerId && this.gamePhase === GAME_PHASES.PLAYER_TURN) {
        this.drawTile();
      }
    }
  },
  getters: {
    getPlayerById: (state) => (playerId) => {
      return state.players.find(p => p.id === playerId);
    },
    currentPlayer: (state) => {
      return state.players.find(p => p.id === state.currentTurnPlayerId);
    },
    revealedDoraIndicators: (state) => {
      return state.doraIndicators;
    },
    remainingWallTilesCount: (state) => {
      return state.wall.length;
    },
    opponentHandsInfo: (state) => {
      return state.players
        .filter(p => p.id !== 'player1')
        .map(p => ({ id: p.id, handSize: p.hand.length }));
    }
  }
});