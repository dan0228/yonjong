import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as mahjongLogic from './src/mahjongLogic.js'; // mahjongLogicをインポート

dotenv.config(); // .env ファイルから環境変数をロード

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

const app = express();
const httpServer = createServer(app);

// CORS設定
app.use(cors({
  origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : '*', // 環境変数からフロントエンドのURLを読み込むか、全て許可
  methods: ["GET", "POST"]
}));

const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : '*',
    methods: ["GET", "POST"]
  }
});

// Supabaseクライアントの初期化
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // サービスロールキーを使用

// ★追加: 環境変数の存在チェック
if (!supabaseUrl) {
  console.error("Error: SUPABASE_URL 環境変数が設定されていません。Renderの環境設定を確認してください。");
}
if (!supabaseKey) {
  console.error("Error: SUPABASE_SERVICE_KEY 環境変数が設定されていません。Renderの環境設定を確認してください。");
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 現在アクティブなゲームの状態を保持するオブジェクト
const gameStates = {};
const stockSelectionTimerIds = {}; // 各ゲームのストック選択タイマーIDを保持

// ユーザーIDとソケットIDをマッピングするMap
const userSocketMap = new Map();
const gameInitializationLocks = {}; // ゲーム初期化ロック用のオブジェクト

// デフォルトのゲーム状態を生成する関数 (サーバーサイド版)
function createDefaultGameState() {
  return {
    players: [],
    wall: [],
    deadWall: [],
    dealerIndex: null,
    doraIndicators: [],
    uraDoraIndicators: [],
    currentTurnPlayerId: null,
    gamePhase: 'waitingToStart',
    lastDiscardedTile: null,
    drawnTile: null,
    showResultPopup: false,
    resultMessage: '',
    showFinalResultPopup: false,
    finalResultDetails: { rankedPlayers: [] },
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
    gameMode: 'online',
    ruleMode: 'stock',
    shouldAdvanceRound: false,
    nextDealerIndex: null,
    shouldEndGameAfterRound: false,
    pendingKanDoraReveal: false,
    animationState: { type: null, playerId: null },
    riichiDiscardedTileId: {},
    showDealerDeterminationPopup: false,
    dealerDeterminationResult: { players: [] },
    isRiichiBgmActive: false,
    highlightedDiscardTileId: null,
    isTenpaiDisplay: {},
    playersReadyForNextRound: [],
    disconnectedPlayers: [], // 切断されたプレイヤーのIDを格納

    isGameReady: false,
    hasGameStarted: false,
    chatBubbles: {},
    lastChattedPlayerId: null,
    version: 1, // ★追加: 楽観的ロックのためのバージョン管理
  };
}


// ルートハンドラ
app.get('/', (req, res) => {
  res.send('Mahjong Game Server is running!');
});

// ゲームの状態をSupabaseに保存するヘルパー関数
async function saveGameState(gameId, gameState, expectedVersion) { // expectedVersion を追加
  const { data, error, count } = await supabase // count を取得
    .from('games')
    .update({
      game_data: gameState,
      updated_at: new Date(),
      current_turn_user_id: gameState.currentTurnPlayerId,
      status: gameState.gamePhase === 'gameOver' ? 'finished' : 'in_progress',
      version: expectedVersion + 1 // version をインクリメント
    })
    .eq('id', gameId)
    .eq('version', expectedVersion); // 楽観的ロックの条件

  if (error) {
    console.error("Error updating game state in DB:", error);
    return false; // 更新失敗
  }

  if (count === 0) {
    console.warn(`Optimistic lock failed for game ${gameId}. Expected version ${expectedVersion}, but it was already updated.`);
    // ここでクライアントにエラーを通知するか、リトライロジックを検討することも可能
    return false; // 更新失敗
  }
  return true; // 更新成功
}

// game_players テーブルのプレイヤーのステータスを更新するヘルパー関数
async function updatePlayerStatus(gameId, userId, status) {
  const { error } = await supabase
    .from('game_players')
    .update({ status: status, updated_at: new Date() })
    .eq('game_id', gameId)
    .eq('user_id', userId);

  if (error) {
    console.error(`Error updating player ${userId} status to ${status} in game ${gameId}:`, error);
    return false;
  }
  console.log(`Player ${userId} status updated to ${status} in game ${gameId}.`);
  return true;
}

// Helper to update game state and broadcast to clients
async function updateAndBroadcastGameState(gameId, gameState) {
  // 送信直前にツモ牌の状態を最終チェックし、不要なプロパティを削除する
  const isAnyoneUsingStock = gameState.players.some(p => p.isUsingStockedTile);
  if (gameState.drawnTile && !isAnyoneUsingStock) {
    if (gameState.drawnTile.isStockedTile) {
      // 元の牌オブジェクトを変更せず、クリーンな新しいオブジェクトで上書きする
      gameState.drawnTile = {
        suit: gameState.drawnTile.suit,
        rank: gameState.drawnTile.rank,
        id: gameState.drawnTile.id
      };
    }
  }

  // ★修正: saveGameState に現在のバージョンを渡す
  const success = await saveGameState(gameId, gameState, gameState.version);
  if (success) {
    // DB更新が成功した場合のみ、メモリ上のバージョンを更新し、クライアントにブロードキャスト
    gameState.version++; // メモリ上のバージョンもインクリメント
    io.to(gameId).emit('game-state-update', gameState);
  } else {
    // 楽観的ロックに失敗した場合、最新のゲーム状態をDBから再取得してクライアントに送信するなどのリカバリー処理を検討
    console.warn(`Failed to save game state for ${gameId} due to optimistic lock. Attempting to re-fetch and broadcast latest state.`);
    const { data, error } = await supabase
      .from('games')
      .select('game_data, version')
      .eq('id', gameId)
      .single();

    if (error || !data) {
      console.error(`Error re-fetching game state for ${gameId} after optimistic lock failure:`, error?.message);
      // クライアントにエラーを通知
      io.to(gameId).emit('gameError', { message: 'ゲームの状態同期に失敗しました。' });
      return;
    }
    // 最新の状態をメモリにロードし、クライアントにブロードキャスト
    gameStates[gameId] = Object.assign(createDefaultGameState(), data.game_data);
    gameStates[gameId].version = data.version; // 最新のバージョンをセ���ト
    io.to(gameId).emit('game-state-update', gameStates[gameId]);
  }
}

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

// ゲームのコンテキストを生成するヘルパー関数
function createGameContextForPlayer(gameState, player, isTsumo, lastDiscardedTile = null) {
  return {
    players: gameState.players,
    currentPlayer: player,
    playerWind: player.seatWind,
    roundWind: gameState.currentRound.wind === 'east' ? '東' : '南',
    currentRound: gameState.currentRound,
    honba: gameState.honba,
    riichiSticks: gameState.riichiSticks,
    doraIndicators: gameState.doraIndicators,
    uraDoraIndicators: gameState.uraDoraIndicators,
    wall: gameState.wall,
    deadWall: gameState.deadWall,
    turnCount: gameState.turnCount,
    playerTurnCount: gameState.playerTurnCount[player.id],
    isIppatsuChance: gameState.isIppatsuChance[player.id],
    isChankanChance: gameState.chankanChance,
    chankanTile: gameState.chankanTile,
    rinshanKaihouChance: gameState.rinshanKaihouChance,
    lastActionPlayerId: gameState.lastActionPlayerId,
    lastDiscardedTile: lastDiscardedTile || gameState.lastDiscardedTile,
    isTsumo: isTsumo,
    isRiichi: player.isRiichi || gameState.isDeclaringRiichi[player.id], // Adjusted for server state
    isDoubleRiichi: player.isDoubleRiichi,
    isFuriTen: gameState.isFuriTen[player.id],
    isDoujunFuriTen: gameState.isDoujunFuriTen[player.id],
    anyPlayerMeldInFirstRound: gameState.anyPlayerMeldInFirstRound,
    ruleMode: gameState.ruleMode,
    melds: player.melds, // ★追加: プレイヤーの鳴き牌情報をコンテキストに含める
  };
}

// フリテン状態を更新するヘルパー関数
function updateFuriTenState(gameId, playerId) {
  const gameState = gameStates[gameId];
  if (!gameState) return;

  const player = gameState.players.find(p => p.id === playerId);
  if (!player) return;

  // ★追加: リーチ中かつ既にフリテン状態であれば、フリテン状態を更新せずに終了する
  // これにより、リーチ後の見逃しフリテンが永続化される
  if ((player.isRiichi || player.isDoubleRiichi) && gameState.isFuriTen[playerId] === true) {
    return;
  }

  const gameContext = createGameContextForPlayer(gameState, player, false);
  const tenpaiResult = mahjongLogic.checkYonhaiTenpai(player.hand, gameContext);

  if (tenpaiResult.isTenpai) {
    const myDiscards = player.discards;
    const hasFuriTen = tenpaiResult.waits.some(waitTile =>
      myDiscards.some(discard => mahjongLogic.getTileKey(discard) === mahjongLogic.getTileKey(waitTile))
    );
    gameState.isFuriTen[playerId] = hasFuriTen;
  } else {
    gameState.isFuriTen[playerId] = false;
  }
}

// ターンを次のプレイヤーに進めるヘルパー関数
async function moveToNextPlayer(gameId) {
  const gameState = gameStates[gameId];
  if (!gameState) return;

  if (gameState.players.length === 0) return;

  const currentPlayerIndex = gameState.players.findIndex(p => p.id === gameState.currentTurnPlayerId);

  let nextPlayerIndex;
  if (currentPlayerIndex === -1) {
    nextPlayerIndex = 0;
  } else {
    nextPlayerIndex = (currentPlayerIndex + 1) % gameState.players.length;
  }
  gameState.currentTurnPlayerId = gameState.players[nextPlayerIndex].id;

  gameState.gamePhase = GAME_PHASES.PLAYER_TURN;

  const nextPlayer = gameState.players.find(p => p.id === gameState.currentTurnPlayerId);
  if (nextPlayer) {
    nextPlayer.isUsingStockedTile = false;
  }

  // クライアント側でストック選択のUIをトリガーするためにフェーズを設定
  if (gameState.ruleMode === 'stock' && nextPlayer) {
    if (nextPlayer.stockedTile && !nextPlayer.isRiichi && !nextPlayer.isDoubleRiichi) {
      gameState.gamePhase = GAME_PHASES.AWAITING_STOCK_SELECTION_TIMER; // クライアントにストック選択を促す
      // サーバー側でストック選択タイマーを開始
      stockSelectionTimerIds[gameId] = setTimeout(async () => {
        console.log(`[Server] Stock selection timed out for player ${gameState.currentTurnPlayerId}. Auto-drawing from wall.`);
        // タイムアウトした場合、自動的に山から牌を引く
        const timedOutPlayerId = gameState.currentTurnPlayerId;
        gameState.gamePhase = GAME_PHASES.PLAYER_TURN;
        await _executeDrawTile(gameId, timedOutPlayerId);
        await updateAndBroadcastGameState(gameId, gameState);
        delete stockSelectionTimerIds[gameId]; // タイマーをクリア
      }, 1800); // 0.3秒増やす
    }
  }

  gameState.waitingForPlayerResponses = [];
  gameState.activeActionPlayerId = null;

  // moveToNextPlayerは状態を更新するだけ。ブロードキャストと牌を引く処理は呼び出し元で行う
  // await updateAndBroadcastGameState(gameId, gameState);
  // この後、通常は _executeDrawTile が呼ばれる
}

// 次のアクション応答者を設定するヘルパー関数
async function setNextActiveResponder(gameId) {
  const gameState = gameStates[gameId];
  if (!gameState) return;

  // まだ応答していない次のプレイヤーを見つける
  const nextResponderId = gameState.waitingForPlayerResponses.find(
    (playerId) => !gameState.playerResponses[playerId]
  );

  if (nextResponderId) {
    // 次の応答者がいる場合、アクティブに設定
    gameState.activeActionPlayerId = nextResponderId;
    // サーバー側ではAIの自動応答は行わない（クライアント側で処理されるか、別途AIロジックを実装）
  } else {
    // 全てのプレイヤーが応答した場合、収集されたアクションを処理する
    gameState.activeActionPlayerId = null;
    await processPendingActions(gameId); // processPendingActionsを呼び出す
  }

  // setNextActiveResponderは状態を更新するだけ。ブロードキャストは呼び出し元で行う
  // await updateAndBroadcastGameState(gameId, gameState);
}

// 保留中のアクションを処理するヘルパー関数
async function processPendingActions(gameId) {
  const gameState = gameStates[gameId];
  if (!gameState) return;

  if (gameState.gamePhase === GAME_PHASES.AWAITING_KAKAN_RESPONSE) {
    const ronAction = gameState.actionResponseQueue.find(a => a.actionType === 'ron' && a.tile?.id === gameState.chankanTile?.id);
    if (ronAction) {
      // 槍槓ロンのアクションを処理
      await handleAgari(gameId, ronAction.playerId, gameState.chankanTile, false, gameState.currentTurnPlayerId);
    } else {
      // 槍槓がなかったので、加槓したプレイヤーが嶺上牌をツモる
      await drawRinshanAfterKakan(gameId, gameState.currentTurnPlayerId);
    }
  }
  else if (gameState.gamePhase === GAME_PHASES.AWAITING_ACTION_RESPONSE) {
    const discarder = gameState.players.find(p => p.id === gameState.lastActionPlayerId);
    if (discarder && gameState.isDeclaringRiichi[discarder.id]) {
      const hasRon = gameState.actionResponseQueue.some(a => a.actionType === 'ron');
      if (hasRon) {
        gameState.isDeclaringRiichi[discarder.id] = false;
      } else {
        // ロンされなかった場合、リーチが成立
        _finalizeRiichi(gameId, discarder.id);
      }
    }
    if (gameState.actionResponseQueue.length > 0) {
      gameState.actionResponseQueue.sort((a, b) => b.priority - a.priority);
      const highestPriorityAction = gameState.actionResponseQueue[0];

      let ronActions = gameState.actionResponseQueue.filter(a => a.actionType === 'ron');
      if (ronActions.length > 0) {
        let winningRonAction = ronActions[0];
        if (ronActions.length > 1) {
          const discarderIndex = gameState.players.findIndex(p => p.id === gameState.lastActionPlayerId);
          ronActions.sort((a, b) => {
            const indexA = gameState.players.findIndex(p => p.id === a.playerId);
            const indexB = gameState.players.findIndex(p => p.id === b.playerId);
            const relativeIndexA = (indexA - discarderIndex + gameState.players.length) % gameState.players.length;
            const relativeIndexB = (indexB - discarderIndex + gameState.players.length) % gameState.players.length;
            return relativeIndexA - relativeIndexB;
          });
          winningRonAction = ronActions[0];
        }
        // ロンを処理（頭ハネを考慮済み）
        // ★★★ 修正: アニメーション再生のためのロジックを追加 ★★★
        // まず、ロンアニメーションの状態を設定
        gameState.animationState = { type: 'ron', playerId: winningRonAction.playerId };
        gameState.highlightedDiscardTileId = gameState.lastDiscardedTile.id;
        
        // アニメーションとハイライトの状態をブロードキャスト
        console.log(`[Server DEBUG][Ron] Before 1st broadcast. GameId: ${gameId}, AnimationType: ${gameState.animationState.type}, ShowResultPopup: ${gameState.showResultPopup}`);
        await updateAndBroadcastGameState(gameId, gameState);

        // アニメーション表示のために少し待ってから、和了処理と結果ポップアップ表示を行う
        console.log(`[Server DEBUG][Ron] SetTimeout started for gameId: ${gameId}`);
        setTimeout(async () => {
            const currentGameState = gameStates[gameId];
            if (currentGameState) {
                // アニメーション状態をクリアしてから和了処理
                currentGameState.animationState = { type: null, playerId: null };
                await handleAgari(gameId, winningRonAction.playerId, currentGameState.lastDiscardedTile, false, currentGameState.lastActionPlayerId);
                // handleAgari 処理後、最終的なゲーム状態をブロードキャスト
                console.log(`[Server DEBUG][Ron] Before 2nd broadcast. GameId: ${gameId}, AnimationType: ${currentGameState.animationState.type}, ShowResultPopup: ${currentGameState.showResultPopup}`);
                await updateAndBroadcastGameState(gameId, currentGameState);
            }
        }, 1500); // 1.5秒待つ

      } else if (highestPriorityAction.actionType === 'minkan') {
        await declareMinkan(gameId, highestPriorityAction.playerId, gameState.lastActionPlayerId, highestPriorityAction.tile);
      } else if (highestPriorityAction.actionType === 'pon') {
        await declarePon(gameId, highestPriorityAction.playerId, gameState.lastActionPlayerId, highestPriorityAction.tile);
      }
    } else {
      // 誰もアクションしなかった場合
      if (gameState.actionResponseQueue.length === 0) {
        await moveToNextPlayer(gameId);
        // ストック選択待ちの場合は、ツモらずにクライアントの選択を待つ
        if (gameState.gamePhase !== GAME_PHASES.AWAITING_STOCK_SELECTION_TIMER) {
            await _executeDrawTile(gameId, gameState.currentTurnPlayerId);
        } else {
            await updateAndBroadcastGameState(gameId, gameState);
        }
      }
    }
  }

  // 状態をリセット
  gameState.actionResponseQueue = [];
  gameState.waitingForPlayerResponses = [];
  gameState.playerResponses = {};
  if (gameState.gamePhase !== GAME_PHASES.ROUND_END && gameState.gamePhase !== GAME_PHASES.GAME_OVER && gameState.gamePhase !== GAME_PHASES.AWAITING_DISCARD) {
      gameState.players.forEach(p => gameState.playerActionEligibility[p.id] = {});
  }
  gameState.isChankanChance = false;
  gameState.chankanTile = null;
  gameState.activeActionPlayerId = null;
}

// リーチ宣言を確定するヘルパー関数
function _finalizeRiichi(gameId, playerId) {
  const gameState = gameStates[gameId];
  if (!gameState) return;

  const player = gameState.players.find(p => p.id === playerId);
  if (!player || !gameState.isDeclaringRiichi[playerId]) return;

  if (gameState.playerTurnCount[player.id] === 1 && gameState.turnCount < gameState.players.length) {
    player.isDoubleRiichi = true;
  } else {
    player.isRiichi = true;
  }
  gameState.isDeclaringRiichi[playerId] = false;

  player.score -= 1000;
  gameState.riichiSticks++;
  gameState.isIppatsuChance[playerId] = true; // リーチ成立直後は一発のチャンス
}

// 加槓後の嶺上牌ツモ処理を行うヘルパー関数
async function drawRinshanAfterKakan(gameId, playerId) {
  const gameState = gameStates[gameId];
  if (!gameState) return;

  if (gameState.currentTurnPlayerId !== playerId || gameState.gamePhase !== GAME_PHASES.AWAITING_KAKAN_RESPONSE) {
    console.warn(`Cannot draw rinshan tile now for Kakan. Player: ${playerId}, Phase: ${gameState.gamePhase}`);
    return;
  }

  // 他のプレイヤーの応答状態をリセット
  gameState.players.forEach(p => {
    if (p.id !== playerId) {
        gameState.playerActionEligibility[p.id] = {};
        gameState.playerResponses[p.id] = undefined;
    }
  });

  if (gameState.wall.length > 0) {
    // プロジェクトの慣例に従い、嶺上牌は山からツモる
    gameState.drawnTile = mahjongLogic.drawRinshanTile(gameState.wall);
    gameState.rinshanKaihouChance = true;
    gameState.pendingKanDoraReveal = true; // 打牌後に新しいドラが表示される
    _handlePostRinshanDraw(gameId, playerId); // 新しいアクション選択肢を計算
    gameState.gamePhase = GAME_PHASES.AWAITING_DISCARD;
  } else {
    // 山が空の場合は流局
    console.warn(`Cannot draw Rinshan tile for game ${gameId}, wall is empty.`);
    await handleRyuukyoku(gameId);
    return;
  }
}

// 点数計算を行うヘルパー関数
function calculateScore(fans, yakumanPower, isDealer) {
  const MANGAN_BASE_KO = 8000;
  const MANGAN_BASE_OYA = 12000;
  const KAZOE_YAKUMAN_FANS_THRESHOLD = 13;

  if (yakumanPower > 0) {
    const yakumanUnitScore = isDealer ? MANGAN_BASE_OYA * 4 : MANGAN_BASE_KO * 4;
    return { score: yakumanUnitScore * yakumanPower, scoreName: yakumanPower >= 2 ? `${yakumanPower}倍役満` : "役満" };
  }
  if (fans >= KAZOE_YAKUMAN_FANS_THRESHOLD) {
    const yakumanUnitScore = isDealer ? MANGAN_BASE_OYA * 4 : MANGAN_BASE_KO * 4;
    return { score: yakumanUnitScore, scoreName: "数え役満" };
  }

  const MANGAN_FANS_THRESHOLD = 4;
  const HANEMAN_FANS_THRESHOLD = 6;
  const BAIMAN_FANS_THRESHOLD = 8;
  const SANBAIMAN_FANS_THRESHOLD = 11;

  if (fans >= SANBAIMAN_FANS_THRESHOLD) {
    return { score: isDealer ? MANGAN_BASE_OYA * 3 : MANGAN_BASE_KO * 3, scoreName: "三倍満" };
  }
  if (fans >= BAIMAN_FANS_THRESHOLD) {
    return { score: isDealer ? MANGAN_BASE_OYA * 2 : MANGAN_BASE_KO * 2, scoreName: "倍満" };
  }
  if (fans >= HANEMAN_FANS_THRESHOLD) {
    return { score: isDealer ? 18000 : 12000, scoreName: "跳満" };
  }
  if (fans >= MANGAN_FANS_THRESHOLD) {
    return { score: isDealer ? MANGAN_BASE_OYA : MANGAN_BASE_KO, scoreName: "満貫" };
  }
  return { score: 0, scoreName: null };
}

// ツモ和了時の支払い点数を計算するヘルパー関数
function calculateTsumoPayment(totalScore, isDealer) {
  if (isDealer) {
    const payment = Math.ceil(totalScore / 3 / 100) * 100;
    return { dealer: 0, nonDealer: payment };
  } else {
    const dealerPayment = Math.ceil(totalScore / 2 / 100) * 100;
    const nonDealerPayment = Math.ceil(totalScore / 4 / 100) * 100;
    return { dealer: dealerPayment, nonDealer: nonDealerPayment };
  }
}

// 和了処理を行うヘルパー関数
async function handleAgari(gameId, agariPlayerId, agariTile, isTsumo, ronTargetPlayerId = null) {
  const gameState = gameStates[gameId];
  if (!gameState) return;

  const player = gameState.players.find(p => p.id === agariPlayerId);
  if (!player) {
    console.error(`[handleAgari] Player not found: ${agariPlayerId}`);
    return;
  }

  // リーチ中であれば裏ドラを決定
  if (player.isRiichi || player.isDoubleRiichi) {
    gameState.uraDoraIndicators = mahjongLogic.getUraDoraIndicators(gameState.deadWall, gameState.doraIndicators);
  } else {
    gameState.uraDoraIndicators = [];
  }

  // 和了形を構成
  const handForWin = isTsumo ? [...player.hand, gameState.drawnTile] : [...player.hand, agariTile];
  if (handForWin.some(tile => !tile)) {
      console.error('[handleAgari] Invalid tile in handForWin:', handForWin);
      return;
  }

  // 和了判定のためのゲームコンテキストを作成
  const gameCtxForWin = createGameContextForPlayer(gameState, player, isTsumo, agariTile);
  
  // isTsumo に応じて適切な和了判定関数を呼び出す
  const winResult = mahjongLogic.checkYonhaiWin(
    handForWin,
    isTsumo ? gameState.drawnTile : agariTile,
    isTsumo,
    { ...gameCtxForWin, melds: player.melds }
  );

  if (!winResult.isWin) {
    console.error(`handleAgari called for player ${agariPlayerId} but win condition not met on server.`);
    return;
  }

  // 点数計算
  const { score, scoreName } = calculateScore(winResult.fans, winResult.yakumanPower, player.isDealer);

  // ロンされた場合、相手の河から牌を削除
  if (!isTsumo && !gameCtxForWin.isChankan) {
    const targetPlayer = gameState.players.find(p => p.id === ronTargetPlayerId);
    if (targetPlayer && targetPlayer.discards.length > 0) {
      const lastDiscard = targetPlayer.discards[targetPlayer.discards.length - 1];
      if (lastDiscard.id === agariTile.id) {
        targetPlayer.discards.pop();
      }
    }
  }

  // 和了結果詳細を格納
  gameState.agariResultDetails = {
    winnerId: agariPlayerId, // ★ 和了者IDを追加
    roundWind: gameState.currentRound.wind,
    roundNumber: gameState.currentRound.number,
    honba: gameState.honba,
    doraIndicators: [...gameState.doraIndicators],
    uraDoraIndicators: [...gameState.uraDoraIndicators],
    winningHand: handForWin,
    agariTile: agariTile,
    yakuList: winResult.yaku,
    totalFans: winResult.fans,
    fu: 0, // 符計算はなし
    score: score,
    scoreName: scoreName,
    pointChanges: {},
    isDraw: false,
    melds: player.melds,
    isChombo: winResult.isChombo || false, // ★追加: チョンボフラグ
    chomboPlayerIsParent: winResult.chomboPlayerIsParent || false, // ★追加: チョンボしたのが親かどうかのフラグ
    chomboPlayerId: winResult.isChombo ? agariPlayerId : null, // ★追加: チョンボしたプレイヤーのID
  };

  const pointChanges = {};
  gameState.players.forEach(p => pointChanges[p.id] = 0);
  // 本場は考慮しないため、honbaPointsPerPlayer と totalHonbaPoints の計算は削除

  // ★修正: チョンボの場合の点数移動ロジックを追加
  if (winResult.isChombo) {
    const chomboScore = winResult.score; // mahjongLogic.checkYonhaiWin で計算されたチョンボ点数
    const chomboPlayer = gameState.players.find(p => p.id === agariPlayerId);

    if (chomboPlayer) {
      // AI対戦と同様に、親は12000点、子は8000点のチョンボ点数
      const parentChomboPenalty = -12000;
      const childChomboPenalty = -8000;

      if (chomboPlayer.isDealer) { // 親がチョンボ
        pointChanges[chomboPlayer.id] += parentChomboPenalty; // 親は12000点失う
        // 他の子プレイヤーはそれぞれ4000点ずつ得る (12000 / 3 = 4000)
        gameState.players.forEach(p => {
          if (p.id !== chomboPlayer.id) {
            pointChanges[p.id] += 4000;
          }
        });
      } else { // 子がチョンボ
        pointChanges[chomboPlayer.id] += childChomboPenalty; // 子は8000点失う
        // 親は4000点得る (8000 / 2 = 4000)
        const dealer = gameState.players.find(p => p.isDealer);
        if (dealer) {
          pointChanges[dealer.id] += 4000;
        }
        // 他の子プレイヤーはそれぞれ2000点ずつ得る (8000 / 4 = 2000, 親が4000点取るので残りの4000点を2人で割る)
        gameState.players.forEach(p => {
          if (p.id !== chomboPlayer.id && !p.isDealer) {
            pointChanges[p.id] += 2000;
          }
        });
      }
    }
  } else if (isTsumo) {
    const tsumoPayments = calculateTsumoPayment(score, player.isDealer);
    const dealer = gameState.players.find(p => p.isDealer);
    const nonDealers = gameState.players.filter(p => !p.isDealer);

    if (player.isDealer) {
      // 親のツモ和了
      const payment = tsumoPayments.nonDealer; // 本場点数を削除
      nonDealers.forEach(p => { pointChanges[p.id] -= payment; });
      pointChanges[player.id] += payment * nonDealers.length;
    } else {
      // 子のツモ和了
      const dealerPayment = tsumoPayments.dealer; // 本場点数を削除
      const nonDealerPayment = tsumoPayments.nonDealer; // 本場点数を削除
      pointChanges[dealer.id] -= dealerPayment;
      nonDealers.forEach(p => {
        if (p.id !== player.id) {
          pointChanges[p.id] -= nonDealerPayment;
        }
      });
      pointChanges[player.id] += dealerPayment + nonDealerPayment * (nonDealers.length - 1);
    }
  } else { // Ron
    const payment = score; // 本場点数を削除
    pointChanges[ronTargetPlayerId] -= payment;
    pointChanges[player.id] += payment;
  }

  // リーチ棒の精算 (チョンボの場合はリーチ棒は戻らない)
  if (!winResult.isChombo) {
    const riichiStickPoints = gameState.riichiSticks * 1000;
    pointChanges[player.id] += riichiStickPoints;
  }


  gameState.agariResultDetails.pointChanges = pointChanges;

  // 親の連荘・移動の決定と、次局の本場・リーチ棒の更新
  if (player.isDealer) {
    gameState.resultMessage = `親（${player.name}）の和了`;
    gameState.honba++;
    gameState.nextDealerIndex = gameState.dealerIndex;
    gameState.shouldAdvanceRound = false;
  } else {
    gameState.resultMessage = `子（${player.name}）の和了`;
    gameState.honba = 0;
    gameState.nextDealerIndex = (gameState.dealerIndex + 1) % gameState.players.length;
    gameState.shouldAdvanceRound = true;
  }
  // 和了があったので、リーチ棒は0に戻る
  gameState.riichiSticks = 0;

  // ゲーム終了条件のチェック
  const rankedPlayers = getRankedPlayers(gameState.players);
  const winnerRank = rankedPlayers.find(p => p.id === player.id)?.rank;
  const isEast4 = gameState.currentRound.wind === 'east' && gameState.currentRound.number === 4;

  if (isEast4 && player.isDealer && winnerRank === 1) {
    gameState.resultMessage += `\n親がトップで和了したため終局します。`;
    gameState.shouldEndGameAfterRound = true;
  }

  const playerBelowZero = gameState.players.find(p => p.score < 0);
  if (playerBelowZero) {
      gameState.shouldEndGameAfterRound = true;
      if (!gameState.resultMessage.includes('終局')) {
          gameState.resultMessage += `\n${playerBelowZero.name} の持ち点が0点未満になったため終局します。`;
      }
  }

  gameState.gamePhase = GAME_PHASES.ROUND_END;
  gameState.isRiichiBgmActive = false;

  // ★追加: アニメーション表示のために少し待ってから、最終状態をブロードキャストする
  await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5秒待つ

  gameState.showResultPopup = true; // 遅延後に表示フラグをtrueにする

  // ★修正: チョンボの場合、親流れ・連荘のメッセージを調整
  if (gameState.agariResultDetails.isChombo) {
    const chomboPlayer = gameState.players.find(p => p.id === agariPlayerId);
    if (chomboPlayer) {
      gameState.resultMessage = `${chomboPlayer.name} の役なしチョンボ`;
      // チョンボの場合は親流れ
      gameState.honba = 0;
      gameState.nextDealerIndex = (gameState.dealerIndex + 1) % gameState.players.length;
      gameState.shouldAdvanceRound = true;
    }
  }

  await updateAndBroadcastGameState(gameId, gameState); // 最終的なゲーム状態をブロードキャスト
}

// ポンを処理するヘルパー関数
async function declarePon(gameId, playerId, targetPlayerId, tileToPon) {
  const gameState = gameStates[gameId];
  if (!gameState) return;

  const player = gameState.players.find(p => p.id === playerId);
  const targetPlayer = gameState.players.find(p => p.id === targetPlayerId);

  if (!player || !targetPlayer || !gameState.lastDiscardedTile || mahjongLogic.getTileKey(gameState.lastDiscardedTile) !== mahjongLogic.getTileKey(tileToPon)) {
    console.error("Pon declaration invalid on server.");
    return;
  }

  // 相手の河から牌を削除
  targetPlayer.discards.pop();

  // 自分の手牌から2枚削除
  let removedCount = 0;
  player.hand = player.hand.filter(tileInHand => {
    if (mahjongLogic.getTileKey(tileInHand) === mahjongLogic.getTileKey(gameState.lastDiscardedTile) && removedCount < 2) {
      removedCount++;
      return false;
    }
    return true;
  });

  // UI表示のために誰から鳴いたかを判定
  const currentPlayerIndex = gameState.players.findIndex(p => p.id === playerId);
  const targetPlayerIndex = gameState.players.findIndex(p => p.id === targetPlayerId);
  let takenTileRelativePosition = null;
  if ((currentPlayerIndex + 1) % gameState.players.length === targetPlayerIndex) {
    takenTileRelativePosition = 'right';
  } else if ((currentPlayerIndex + 2) % gameState.players.length === targetPlayerIndex) {
    takenTileRelativePosition = 'middle';
  } else if ((currentPlayerIndex + 3) % gameState.players.length === targetPlayerIndex) {
    takenTileRelativePosition = 'left';
  }

  // 鳴きメンツを追加
  player.melds.push({ type: 'pon', tiles: [tileToPon, tileToPon, tileToPon], from: targetPlayerId, takenTileRelativePosition: takenTileRelativePosition });
  
  updateFuriTenState(gameId, playerId);
  
  gameState.currentTurnPlayerId = playerId;
  gameState.gamePhase = GAME_PHASES.AWAITING_DISCARD;
  gameState.drawnTile = null;
  gameState.lastDiscardedTile = null;
  gameState.rinshanKaihouChance = false;
  gameState.players.forEach(p => {
    gameState.isDoujunFuriTen[p.id] = false;
    gameState.isIppatsuChance[p.id] = false;
    gameState.playerActionEligibility[p.id] = {};
  });
  gameState.lastActionPlayerId = playerId;
  if (gameState.playerTurnCount[playerId] !== undefined) {
    gameState.playerTurnCount[playerId]++;
  }
  if (gameState.turnCount < gameState.players.length) {
    gameState.anyPlayerMeldInFirstRound = true;
  }

  gameState.animationState = { type: 'pon', playerId: playerId };
  
  await updateAndBroadcastGameState(gameId, gameState);

  // アニメーション表示のために少し待ってからリセット
  setTimeout(async () => {
    const currentGameState = gameStates[gameId];
    if (currentGameState) {
      currentGameState.animationState = { type: null, playerId: null };
      await updateAndBroadcastGameState(gameId, currentGameState);
    }
  }, 1500);
}

// 明槓を処理するヘルパー関数
async function declareMinkan(gameId, playerId, targetPlayerId, tileToKan) {
  const gameState = gameStates[gameId];
  if (!gameState) return;

  const player = gameState.players.find(p => p.id === playerId);
  const targetPlayer = gameState.players.find(p => p.id === targetPlayerId);

  if (!player || !targetPlayer || !gameState.lastDiscardedTile || mahjongLogic.getTileKey(gameState.lastDiscardedTile) !== mahjongLogic.getTileKey(tileToKan)) {
    console.error("Minkan declaration invalid on server.");
    return;
  }

  // 相手の河から牌を削除
  targetPlayer.discards.pop();

  // 自分の手牌から3枚削除
  let removedCount = 0;
  player.hand = player.hand.filter(tileInHand => {
    if (mahjongLogic.getTileKey(tileInHand) === mahjongLogic.getTileKey(gameState.lastDiscardedTile) && removedCount < 3) {
      removedCount++;
      return false;
    }
    return true;
  });

  // UI表示のために誰から鳴いたかを判定
  const currentPlayerIndex = gameState.players.findIndex(p => p.id === playerId);
  const targetPlayerIndex = gameState.players.findIndex(p => p.id === targetPlayerId);
  let takenTileRelativePosition = null;
  if ((currentPlayerIndex + 1) % gameState.players.length === targetPlayerIndex) {
    takenTileRelativePosition = 'right';
  } else if ((currentPlayerIndex + 2) % gameState.players.length === targetPlayerIndex) {
    takenTileRelativePosition = 'middle';
  } else if ((currentPlayerIndex + 3) % gameState.players.length === targetPlayerIndex) {
    takenTileRelativePosition = 'left';
  }

  // 鳴きメンツを追加
  player.melds.push({ type: 'minkan', tiles: [tileToKan, tileToKan, tileToKan, tileToKan], from: targetPlayerId, takenTileRelativePosition: takenTileRelativePosition });
  
  gameState.currentTurnPlayerId = playerId;
  gameState.lastDiscardedTile = null;
  gameState.players.forEach(p => {
    gameState.isDoujunFuriTen[p.id] = false;
    gameState.isIppatsuChance[p.id] = false;
    gameState.playerActionEligibility[p.id] = {};
  });
  gameState.lastActionPlayerId = playerId;
  if (gameState.playerTurnCount[playerId] !== undefined) {
    gameState.playerTurnCount[playerId]++;
  }
  if (gameState.turnCount < gameState.players.length) {
    gameState.anyPlayerMeldInFirstRound = true;
  }

  // 嶺上牌をツモる
  if (gameState.wall.length > 0) {
    gameState.drawnTile = mahjongLogic.drawRinshanTile(gameState.wall);
    gameState.rinshanKaihouChance = true;
    gameState.pendingKanDoraReveal = true;
    _handlePostRinshanDraw(gameId, playerId);
    gameState.gamePhase = GAME_PHASES.AWAITING_DISCARD;
  } else {
    console.warn("Cannot draw Rinshan tile, wall is empty.");
    await handleRyuukyoku(gameId);
    return;
  }

  gameState.animationState = { type: 'kan', playerId: playerId };
  
  await updateAndBroadcastGameState(gameId, gameState);

  // アニメーション表示のために少し待ってからリセット
  setTimeout(async () => {
    const currentGameState = gameStates[gameId];
    if (currentGameState) {
      currentGameState.animationState = { type: null, playerId: null };
      await updateAndBroadcastGameState(gameId, currentGameState);
    }
  }, 1500);
}

// 嶺上牌を引いた後の処理を行うヘルパー関数
function _handlePostRinshanDraw(gameId, playerId) {
  const gameState = gameStates[gameId];
  if (!gameState) return;

  const player = gameState.players.find(p => p.id === playerId);
  if (!player) return;

  gameState.playerActionEligibility[playerId] = {
    canTsumoAgari: mahjongLogic.canWinBasicShape(player.hand, gameState.drawnTile, player.melds),
    canAnkan: null,
    canKakan: null,
    canRiichi: false,
    canPon: null,
    canMinkan: null,
  };

  if (player.isRiichi || player.isDoubleRiichi) {
    // リーチ中は暗槓のみ可能
    if (gameState.wall.length > 3) {
      const ankanOptions = mahjongLogic.checkCanAnkan(player.hand, gameState.drawnTile);
      gameState.playerActionEligibility[playerId].canAnkan = ankanOptions.length > 0 ? ankanOptions : null;
    }
  } else {
    // リーチ中でない場合は、暗槓、加槓が可能
    if (gameState.wall.length > 3) {
      const ankanOptions = mahjongLogic.checkCanAnkan(player.hand, gameState.drawnTile, createGameContextForPlayer(gameState, player, false));
      gameState.playerActionEligibility[playerId].canAnkan = ankanOptions.length > 0 ? ankanOptions : null;
      const kakanOptions = mahjongLogic.checkCanKakan(player.hand, player.melds, gameState.drawnTile, createGameContextForPlayer(gameState, player, false));
      gameState.playerActionEligibility[playerId].canKakan = kakanOptions.length > 0 ? kakanOptions : null;
    }
  }
}

// 流局処理を行うヘルパー関数
async function handleRyuukyoku(gameId) {
  const gameState = gameStates[gameId];
  if (!gameState) return;

  try {
    gameState.gamePhase = GAME_PHASES.ROUND_END;
    const dealerPlayer = gameState.players[gameState.dealerIndex];

    gameState.agariResultDetails = {
      roundWind: gameState.currentRound.wind,
      roundNumber: gameState.currentRound.number,
      honba: gameState.honba,
      doraIndicators: [...gameState.doraIndicators],
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

    const tenpaiStates = gameState.players.map(player => {
      const context = createGameContextForPlayer(gameState, player, false);
      const tenpaiResult = mahjongLogic.checkYonhaiTenpai(player.hand, context);
      gameState.isTenpaiDisplay[player.id] = tenpaiResult.isTenpai;
      return {
        id: player.id,
        isTenpai: tenpaiResult.isTenpai,
      };
    });

    const tenpaiPlayers = tenpaiStates.filter(p => p.isTenpai);
    const notenPlayers = tenpaiStates.filter(p => !p.isTenpai);
    const pointChanges = {};
    gameState.players.forEach(p => pointChanges[p.id] = 0);

    if (tenpaiPlayers.length > 0 && tenpaiPlayers.length < 4) {
      let paymentPerNoten = 0;
      let incomePerTenpai = 0;

      if (tenpaiPlayers.length === 1) { paymentPerNoten = 1000; incomePerTenpai = 3000; }
      else if (tenpaiPlayers.length === 2) { paymentPerNoten = 1500; incomePerTenpai = 1500; }
      else if (tenpaiPlayers.length === 3) { incomePerTenpai = 1000; paymentPerNoten = 3000; }

      notenPlayers.forEach(notenPlayer => { pointChanges[notenPlayer.id] -= paymentPerNoten; });
      tenpaiPlayers.forEach(tenpaiPlayer => { pointChanges[tenpaiPlayer.id] += incomePerTenpai; });
    }
    gameState.agariResultDetails.pointChanges = pointChanges;

    const isDealerTenpai = tenpaiPlayers.some(p => p.id === dealerPlayer.id);
    const rankedPlayers = getRankedPlayers(gameState.players);
    const dealerRank = rankedPlayers.find(p => p.id === dealerPlayer.id)?.rank;

    const isEast4 = gameState.currentRound.wind === 'east' && gameState.currentRound.number === 4;
    const isDealerTop = dealerRank === 1;

    if (isEast4 && isDealerTenpai && isDealerTop) {
      gameState.resultMessage = `親（${dealerPlayer.name}）がテンパイでトップのため終局`;
      gameState.shouldEndGameAfterRound = true;
      gameState.nextDealerIndex = (gameState.dealerIndex + 1) % gameState.players.length;
      gameState.honba = 0;
    } else if (isDealerTenpai) {
      gameState.resultMessage = `親（${dealerPlayer.name}）がテンパイのため連荘`;
      gameState.honba++;
      gameState.nextDealerIndex = gameState.dealerIndex;
      gameState.shouldAdvanceRound = false;
    } else {
      gameState.resultMessage = `親（${gameState.players[gameState.dealerIndex].name}）がノーテンのため親流れ`;
      gameState.honba = 0; // クライアントの実装に合わせる
      gameState.nextDealerIndex = (gameState.dealerIndex + 1) % gameState.players.length;
      gameState.shouldAdvanceRound = true;
    }

    const playerBelowZero = gameState.players.find(p => p.id === dealerPlayer.id && p.score < 0);
    if (playerBelowZero) {
        gameState.shouldEndGameAfterRound = true;
        if (!gameState.resultMessage.includes('終局')) {
            gameState.resultMessage += `\n${playerBelowZero.name} の持ち点が0点未満になったため終局します。`;
        }
    }

    gameState.showResultPopup = true; // クライアント側で表示を制御するため、ここでは設定しない
    gameState.isRiichiBgmActive = false;

  } catch (error) {
    console.error(`Error during Ryuukyoku for game ${gameId}:`, error);
  } finally {
    await updateAndBroadcastGameState(gameId, gameState);
  }
}

// ポイントの変更を適用するヘルパー関数
function applyPointChanges(gameId) {
  const gameState = gameStates[gameId];
  if (!gameState) return;

  if (!gameState.agariResultDetails || !gameState.agariResultDetails.pointChanges) return;

  for (const playerId in gameState.agariResultDetails.pointChanges) {
    const player = gameState.players.find(p => p.id === playerId);
    if (player) {
      player.score += gameState.agariResultDetails.pointChanges[playerId];
    }
  }
}

// ゲーム終了処理を行うヘルパー関数

// レートに基づいたランク名を取得する関数
function getRankName(playerClass) {
  if (playerClass === 1) return '子猫級';
  if (playerClass === 2) return '野良猫級';
  if (playerClass === 3) return 'ボス猫級';
  return '不明';
}

async function handleGameEnd(gameId) {
  const gameState = gameStates[gameId];
  if (!gameState) return;

  // 最終的なスコアに基づいてプレイヤーをランク付け
  const rankedPlayers = getRankedPlayers(gameState.players);

  // --- レート計算ロジック ---
  const baseRatingChanges = {
    '子猫級': { 1: 150, 2: 50, 3: -10, 4: -50 },
    '野良猫級': { 1: 100, 2: 30, 3: -30, 4: -100 },
    'ボス猫級': { 1: 80, 2: 20, 3: -40, 4: -120 },
  };

  // 部屋全体の平均レートを計算 (AIプレイヤーは除く)
  const humanPlayers = rankedPlayers.filter(p => !p.isAi);
  const totalRating = humanPlayers.reduce((sum, player) => sum + player.rating, 0);
  const roomAverageRating = humanPlayers.length > 0 ? totalRating / humanPlayers.length : 1500;

  // 猫コインと統計情報の���新
  const coinChanges = { 1: 100, 2: 50, 3: -50, 4: -100 };
  const updatedRankedPlayers = [];

  const updatePromises = rankedPlayers.map(async (player) => {
    const coinChange = coinChanges[player.rank] || 0;
    let ratingChange = 0;

    // AIプレイヤーはDB更新しない
    if (player.isAi) {
      updatedRankedPlayers.push({ ...player, coin_change: coinChange, rating_change: 0 });
      return;
    }

    // オンライン対戦の場合のみレートを計算
    if (gameState.gameMode === 'online') {
      // 1. 基礎点の計算
      const rankName = getRankName(player.user_rank_class);
      const basePoint = baseRatingChanges[rankName]?.[player.rank] || 0;

      // 2. 補正値の計算
      const otherPlayers = humanPlayers.filter(p => p.id !== player.id);
      const othersTotalRating = otherPlayers.reduce((sum, p) => sum + p.rating, 0);
      const othersAverageRating = otherPlayers.length > 0 ? othersTotalRating / otherPlayers.length : roomAverageRating;
      const correction = (othersAverageRating - player.rating) / 20;

      // 3. 最終的なレート変動値の計算 (整数に丸める)
      let finalRatingChange = Math.round(basePoint + correction);

      // 4. 最低保証の適用
      if (player.rank === 1 && finalRatingChange < 10) {
        finalRatingChange = 10;
      } else if (player.rank === 2 && finalRatingChange < 2) {
        finalRatingChange = 2;
      }
      ratingChange = finalRatingChange;
    }

    try {
      // RPCを使って原子的に更新
      const { error: rpcError } = await supabase.rpc('update_user_stats_and_coins', {
        p_user_id: player.id,
        p_rank: player.rank,
        p_coin_change: coinChange,
        p_rating_change: ratingChange, // レート変動値を渡す
      });

      if (rpcError) {
        console.error(`Error updating stats for player ${player.id}:`, rpcError);
        // エラーが発生しても処理を続行するが、変更は0として扱う
        updatedRankedPlayers.push({ ...player, coin_change: 0, rating_change: 0 });
      } else {
        updatedRankedPlayers.push({ ...player, coin_change: coinChange, rating_change: ratingChange });
      }
    } catch (e) {
      console.error(`Exception during player stats update for ${player.id}:`, e);
      updatedRankedPlayers.push({ ...player, coin_change: 0, rating_change: 0 });
    }
  });

  await Promise.all(updatePromises);

  // 元の順位を保持するために、更新後のリストをソートし直す
  updatedRankedPlayers.sort((a, b) => {
    const originalA = rankedPlayers.find(p => p.id === a.id);
    const originalB = rankedPlayers.find(p => p.id === b.id);
    return originalA.rank - originalB.rank;
  });

  gameState.finalResultDetails = {
    rankedPlayers: updatedRankedPlayers,
  };
  gameState.showFinalResultPopup = true;
  gameState.gamePhase = GAME_PHASES.GAME_OVER;

  // ゲームの状態をDBに保存し、クライアントにブロードキャスト
  await updateAndBroadcastGameState(gameId, gameState);

  // ★追加: ゲーム終了後、games と game_players のデータを履歴テーブルに移動し、元のテーブルから削除
  if (gameState.gamePhase === GAME_PHASES.GAME_OVER) {
    console.log(`[Server] Game ${gameId} is over. Moving data to history tables.`);

    // games テーブルのデータを games_history に挿入
    const { data: gameDataToArchive, error: fetchGameError } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single();

    if (fetchGameError) {
      console.error(`Error fetching game ${gameId} for archiving:`, fetchGameError);
    } else if (gameDataToArchive) {
      const { error: insertGameHistoryError } = await supabase
        .from('games_history')
        .insert([gameDataToArchive]);

      if (insertGameHistoryError) {
        console.error(`Error inserting game ${gameId} into games_history:`, insertGameHistoryError);
      } else {
        console.log(`Game ${gameId} moved to games_history.`);
        // games テーブルから削除
        const { error: deleteGameError } = await supabase
          .from('games')
          .delete()
          .eq('id', gameId);

        if (deleteGameError) {
          console.error(`Error deleting game ${gameId} from games:`, deleteGameError);
        } else {
          console.log(`Game ${gameId} deleted from games.`);
        }
      }
    }

    // game_players テーブルのデータを game_players_history に挿入
    // ★修正: 新しいカラム (final_score, final_rank, rating_change, final_rating) を含めて挿入
    const gamePlayersToArchiveWithStats = updatedRankedPlayers.map(player => ({
      id: player.id, // game_players_history の id は gen_random_uuid() なので、ここでは user_id を使う
      game_id: gameId,
      user_id: player.id,
      seat_index: gameState.players.find(p => p.id === player.id)?.seat_index, // 元の seat_index を取得
      status: 'finished', // 履歴に移動する時点では finished
      joined_at: gameState.players.find(p => p.id === player.id)?.joined_at, // 元の joined_at を取得
      updated_at: new Date(),
      final_score: player.score,
      final_rank: player.rank,
      rating_change: player.rating_change,
      final_rating: player.rating + player.rating_change, // 試合後のレート
    }));

    if (gamePlayersToArchiveWithStats.length > 0) {
      const { error: insertPlayersHistoryError } = await supabase
        .from('game_players_history')
        .insert(gamePlayersToArchiveWithStats);

      if (insertPlayersHistoryError) {
        console.error(`Error inserting game players for game ${gameId} into game_players_history:`, insertPlayersHistoryError);
      } else {
        console.log(`Game players for game ${gameId} moved to game_players_history.`);
        // game_players テーブルから削除
        const { error: deletePlayersError } = await supabase
          .from('game_players')
          .delete()
          .eq('game_id', gameId);

        if (deletePlayersError) {
          console.error(`Error deleting game players for game ${gameId} from game_players:`, deletePlayersError);
        } else {
          console.log(`Game players for game ${gameId} deleted from game_players.`);
        }
      }
    }
  }

  // ゲームの状態をメモリから削除
  delete gameStates[gameId];
}

// ゲームのコア初期化ロジックを処理するヘルパー関数
async function _initializeGameCore(gameId) {
  // gameStates[gameId] が undefined のまま渡される可能性に備え、ここで確実に初期化する
  if (!gameStates[gameId]) {
      console.error(`_initializeGameCore: gameStates[${gameId}] が undefined です。予期せぬ状態のため、デフォルト値で初期化します。`);
      gameStates[gameId] = createDefaultGameState();
  }

  // gameStates[gameId] のディープコピーを作成し、ローカルで操作する
  let localGameState = JSON.parse(JSON.stringify(gameStates[gameId]));

  // プレイヤー固有のオブジェクトの初期化
  localGameState.playerTurnCount = localGameState.playerTurnCount || {};
  localGameState.isIppatsuChance = localGameState.isIppatsuChance || {};
  localGameState.isFuriTen = localGameState.isFuriTen || {};
  localGameState.isDoujunFuriTen = localGameState.isDoujunFuriTen || {};
  localGameState.isDeclaringRiichi = localGameState.isDeclaringRiichi || {};
  localGameState.riichiDiscardedTileId = localGameState.riichiDiscardedTileId || {};
  localGameState.playerActionEligibility = localGameState.playerActionEligibility || {};
  localGameState.isTenpaiDisplay = localGameState.isTenpaiDisplay || {};
  localGameState.canDeclareRon = localGameState.canDeclareRon || {};
  localGameState.canDeclarePon = localGameState.canDeclarePon || {};
  localGameState.canDeclareMinkan = localGameState.canDeclareMinkan || {};
  localGameState.canDeclareAnkan = localGameState.canDeclareAnkan || {};
  localGameState.canDeclareKakan = localGameState.canDeclareKakan || {};
  localGameState.playerResponses = localGameState.playerResponses || {};

  localGameState.playersReadyForNextRound = []; // 局の初期化時に、必ず準備完了リストをリセット

  localGameState.turnCount = 0;
  localGameState.players.forEach(player => {
    localGameState.playerTurnCount[player.id] = 0;
    localGameState.isIppatsuChance[player.id] = false;
    localGameState.canDeclareRon[player.id] = false;
    localGameState.canDeclarePon[player.id] = null;
    localGameState.canDeclareMinkan[player.id] = null;
    localGameState.canDeclareAnkan[player.id] = null;
    localGameState.canDeclareKakan[player.id] = null;
    localGameState.playerActionEligibility[player.id] = {};
    localGameState.playerResponses = {};
    localGameState.waitingForPlayerResponses = [];
    localGameState.riichiDiscardOptions = [];
    localGameState.actionResponseQueue = [];
    localGameState.isDoujunFuriTen[player.id] = false;
    localGameState.isFuriTen[player.id] = false;
    localGameState.isTenpaiDisplay[player.id] = false;
    localGameState.isDeclaringRiichi[player.id] = false;
    localGameState.activeActionPlayerId = null;
    localGameState.anyPlayerMeldInFirstRound = false;
    localGameState.pendingKanDoraReveal = false;
    localGameState.animationState = { type: null, playerId: null };
    localGameState.riichiDiscardedTileId[player.id] = null;
  });
  localGameState.highlightedDiscardTileId = null;
  localGameState.rinshanKaihouChance = false;
  localGameState.lastActionPlayerId = null;
  localGameState.shouldEndGameAfterRound = false;

  const playerCount = localGameState.players.length;
  // dealerIndexがプレイヤー数を超えていた場合に補正する
  const currentDealerIndex = localGameState.dealerIndex % playerCount;
  localGameState.dealerIndex = currentDealerIndex; // 補正した値をgameStateにも反映

  localGameState.players.forEach((player, index) => {
    player.isDealer = (index === currentDealerIndex);
  });

  const playersWithWinds = mahjongLogic.assignPlayerWinds(
    localGameState.players,
    currentDealerIndex,
    playerCount
  );
  localGameState.players = playersWithWinds;

  let fullWall = mahjongLogic.getAllTiles();
  fullWall = mahjongLogic.shuffleWall(fullWall);

  const deadWallSize = 14;
  localGameState.deadWall = fullWall.slice(0, deadWallSize);
  const liveWallForDealing = fullWall.slice(deadWallSize);

  const initialHandSize = 4;
  const { hands: initialHands, wall: updatedLiveWall } = mahjongLogic.dealInitialHands(playerCount, liveWallForDealing, initialHandSize);
  localGameState.wall = updatedLiveWall;

  localGameState.players.forEach((player, index) => {
    player.hand = initialHands[index] || [];
    player.discards = [];
    player.melds = [];
    player.isRiichi = false;
    player.isDeclaringRiichi = false;
    player.isDoubleRiichi = false;
    localGameState.isDoujunFuriTen[player.id] = false;
  });

  localGameState.doraIndicators = [mahjongLogic.revealDora(localGameState.deadWall)].filter(Boolean);

  localGameState.currentTurnPlayerId = localGameState.players[localGameState.dealerIndex]?.id;
  localGameState.gamePhase = GAME_PHASES.PLAYER_TURN;

  localGameState.dealerDeterminationResult.players = localGameState.players.map(p => ({
    id: p.id,
    name: p.name,
    avatar_url: p.avatar_url,
    seatWind: p.seatWind,
    isDealer: p.isDealer,
    score: 50000,
    originalId: p.originalId,
  }));

  if (localGameState.currentRound.wind === 'east' && localGameState.currentRound.number === 1 && localGameState.honba === 0) {
    localGameState.showDealerDeterminationPopup = true;
  }
  localGameState.isGameReady = true; // ゲームの準備が完了
  localGameState.hasGameStarted = true;

  // グローバルな gameStates オブジェクトを更新
  gameStates[gameId] = localGameState;
}

// 次のラウンドの準備を行うヘルパー関数
async function prepareNextRound(gameId) {
  const gameState = gameStates[gameId];
  if (!gameState) return;

  applyPointChanges(gameId); // 点数更新をここで実行

  // 和了した場合のみリーチ棒をリセット
  if (gameState.agariResultDetails && !gameState.agariResultDetails.isDraw) {
    gameState.riichiSticks = 0;
  }

  gameState.playersReadyForNextRound = []; // ★次のラウンドの準備を始める前に、必ず準備完了リストをリセット

  const playerBelowZero = gameState.players.find(p => p.score < 0);
  if (playerBelowZero) {
    gameState.shouldEndGameAfterRound = true;
  }

  if (gameState.nextDealerIndex !== null) {
    gameState.dealerIndex = gameState.nextDealerIndex;
    gameState.nextDealerIndex = null;
  }

  if (gameState.shouldEndGameAfterRound) {
    await handleGameEnd(gameId); // handleGameEndを呼び出す
    return;
  }

  gameState.showResultPopup = false;
  gameState.resultMessage = '';
  gameState.showDealerDeterminationPopup = false;
  gameState.drawnTile = null;
  gameState.lastDiscardedTile = null;
  gameState.highlightedDiscardTileId = null;
  gameState.animationState = { type: null, playerId: null };
  if (gameState.isChankanChance) gameState.isChankanChance = false;
  gameState.chankanTile = null;
  gameState.players.forEach(p => {
    gameState.canDeclarePon[p.id] = null; gameState.canDeclareMinkan[p.id] = null;
    p.stockedTile = null;
    p.isUsingStockedTile = false;
  });
  if (gameState.shouldAdvanceRound) {
    gameState.currentRound.number++;
    gameState.players.forEach((player, index) => {
      player.isDealer = (index === gameState.dealerIndex);
    });
    const playersWithNewWinds = mahjongLogic.assignPlayerWinds(
      gameState.players,
      gameState.dealerIndex,
      gameState.players.length
    );
    gameState.players = playersWithNewWinds;
  }
  gameState.shouldAdvanceRound = false;

  if (gameState.currentRound.wind === 'east' && gameState.currentRound.number > 4 && !gameState.shouldEndGameAfterRound) {
    await handleGameEnd(gameId); // handleGameEndを呼び出す
    return;
  }
  
  await _initializeGameCore(gameId); // _initializeGameCoreを呼び出す

  // ★★★ 修正: 次の局の親が最初のツモを行う処理を追加 ★★★
  // _initializeGameCore で gameState オブジェクトが再生成されるため、参照を再取得する
  const freshGameState = gameStates[gameId];
  const dealerId = freshGameState.players[freshGameState.dealerIndex]?.id;
  if (dealerId) {
    console.log(`[Server] Next round dealer is ${dealerId}. Executing first draw.`);
    await _executeDrawTile(gameId, dealerId);
    await updateAndBroadcastGameState(gameId, freshGameState);
  } else {
    console.error(`[Server] Could not determine dealer for the next round in game ${gameId}.`);
  }
}

// 牌を引く共通ヘルパー関数
async function _executeDrawTile(gameId, playerId, isRinshan = false) {
  const gameState = gameStates[gameId];
  if (!gameState) return;

  const player = gameState.players.find(p => p.id === playerId);
  if (!player) return;

  // 山牌がなければ流局
  if (gameState.wall.length === 0) {
    await handleRyuukyoku(gameId);
    return;
  }

  // 牌を引く
  const tile = isRinshan ? mahjongLogic.drawRinshanTile(gameState.wall) : gameState.wall.shift();
  gameState.drawnTile = tile;

  // ストック牌使用後、次のツモ牌にエフェクトが残る問題への対策。
  // ツモった牌に isStockedTile プロパティが存在する場合、それを削除してクリーンな状態にする。
  if (gameState.drawnTile && gameState.drawnTile.isStockedTile) {
    delete gameState.drawnTile.isStockedTile;
  }
  gameState.gamePhase = GAME_PHASES.AWAITING_DISCARD;
  gameState.lastActionPlayerId = playerId;

  // ★追加: ツモ牌が手牌に入った状態を一度ブロードキャストし、クライアントがレンダリングする時間を確保
  await updateAndBroadcastGameState(gameId, gameState);
  await new Promise(resolve => setTimeout(resolve, 200)); // 200msの視覚的な遅延

  if (!isRinshan) {
    if (gameState.playerTurnCount[playerId] !== undefined) {
      gameState.playerTurnCount[playerId]++;
    }
  }

  // 各種状態のリセット
  gameState.players.forEach(p => {
    // 一発フラグは自分のツモ番が来る前に他家のアクションがなければ消える
    if (p.id !== playerId) {
      gameState.isIppatsuChance[p.id] = false;
    }
  });
  if (gameState.isChankanChance && gameState.lastActionPlayerId === playerId) {
    gameState.isChankanChance = false;
  }
  gameState.isDoujunFuriTen[playerId] = false;
  gameState.rinshanKaihouChance = isRinshan;

  // アクション選択肢を計算
  const gameContext = createGameContextForPlayer(gameState, player, true);
  const eligibility = {};

  // ツモ和了
  // 鳴きがある場合も考慮して、player.melds を gameContext に含める
  const gameContextForTsumo = { ...gameContext, melds: player.melds };
  const tsumoWinResult = mahjongLogic.checkYonhaiWin([...player.hand, gameState.drawnTile], gameState.drawnTile, true, gameContextForTsumo);
  eligibility.canTsumoAgari = tsumoWinResult.isWin;

  if (player.isRiichi || player.isDoubleRiichi) {
    // リーチ中はツモ和了と暗槓のみ
    if (gameState.wall.length > 3) {
      const ankanOptions = mahjongLogic.checkCanAnkan(player.hand, gameState.drawnTile);
      eligibility.canAnkan = ankanOptions.length > 0 ? ankanOptions : null;
    }
  } else {
    // リーチ中でない場合
    eligibility.canRiichi = false;
    if (gameState.wall.length > 3 && player.melds.every(m => m.type === 'ankan') && player.score >= 1000) {
      const potentialHandAfterDraw = [...player.hand, gameState.drawnTile];
      for (const tileToDiscard of potentialHandAfterDraw) {
        const tempHand = potentialHandAfterDraw.filter(t => t.id !== tileToDiscard.id);
        const tenpaiResult = mahjongLogic.checkYonhaiTenpai(tempHand, createGameContextForPlayer(gameState, player, false));
        if (tenpaiResult.isTenpai && tenpaiResult.waits.length > 0) {
          eligibility.canRiichi = true;
          break;
        }
      }
    }

    if (gameState.wall.length > 3) {
      const ankanOptions = mahjongLogic.checkCanAnkan(player.hand, gameState.drawnTile, gameContext);
      eligibility.canAnkan = ankanOptions.length > 0 ? ankanOptions : null;
      const kakanOptions = mahjongLogic.checkCanKakan(player.hand, player.melds, gameState.drawnTile, gameContext);
      eligibility.canKakan = kakanOptions.length > 0 ? kakanOptions : null;
    }
  }
  
  gameState.playerActionEligibility[playerId] = eligibility;
  updateFuriTenState(gameId, playerId);

  // リーチ後、または切断中の自動ツモ切り処理
  if (player.status === 'disconnected' || ((player.isRiichi || player.isDoubleRiichi) && !eligibility.canTsumoAgari && !eligibility.canAnkan)) {
    // 和了もカンもできない場合、または切断中の場合は、即座にツモ切り処理を実行する
    // setTimeoutによる非同期処理をやめ、一連の処理として実行することで状態の不整合を防ぐ
    console.log(`[Server] Player ${playerId} (Riichi: ${player.isRiichi}, Disconnected: ${player.status === 'disconnected'}) cannot win or kan, or is disconnected. Auto-discarding.`);
    
    // ★追加: AI対戦と同様に、ツモ切り動作に遅延を追加
    await new Promise(resolve => setTimeout(async () => {
        // _processDiscardを直接呼び出し、その後のブロードキャストもこの中で行われる
        await _processDiscard(gameId, playerId, gameState.drawnTile.id, true);
        resolve(); // Promiseを解決して遅延を終了
    }, 500)); // 500ミリ秒待つ

    return; // 処理が完了したので関数を抜ける
  }

  // 通常のツモ（自動ツモ切り以外）の場合、状態をブロードキャスト
  await updateAndBroadcastGameState(gameId, gameState);

}

// 他のプレイヤーのアクションを確認するヘルパー関数
function _checkForPlayerActions(gameId, discarderId, discardedTile) {
    const gameState = gameStates[gameId];
    if (!gameState) return false;

    const isFinalAction = gameState.wall.length === 0;
    gameState.waitingForPlayerResponses = [];
    let canAnyoneAct = false;

    console.log(`[DEBUG] Checking actions for discard by ${discarderId}. Tile: ${JSON.stringify(discardedTile)}`);

    gameState.players.forEach(p => {
      if (p.id !== discarderId) {
        // オブジェクトの構造を常に一定に保つため、毎回全プロパティを初期化する
        gameState.playerActionEligibility[p.id] = {
            canRon: false,
            canPon: null,
            canMinkan: null
        };
        const eligibility = gameState.playerActionEligibility[p.id]; // ショートカット

        // 切断中のプレイヤーはアクション不可としてスキップ
        if (p.status === 'disconnected') {
           console.log(`[DEBUG] Player ${p.id} is disconnected. Skipping action check.`);
           return;
        }

        const gameContext = createGameContextForPlayer(gameState, p, false, discardedTile);
        const isPlayerInFuriTen = gameState.isFuriTen[p.id] || gameState.isDoujunFuriTen[p.id];

        // ★★★ ここから詳細ログ ★★★
        console.log(`[DEBUG] Checking player ${p.id}: isRiichi=${p.isRiichi}, isFuriTen=${gameState.isFuriTen[p.id]}, isDoujunFuriTen=${gameState.isDoujunFuriTen[p.id]}`);

        if (!isPlayerInFuriTen) {
          // 鳴きがある場合も考慮して、p.melds を gameContext に含める
          const gameContextForRon = { ...gameContext, melds: p.melds };
          const ronResult = mahjongLogic.checkCanRon(p.hand, discardedTile, gameContextForRon);
          eligibility.canRon = ronResult.isWin;
          // ronResultがオブジェクトの場合、中身もログに出す
          const ronResultLog = typeof ronResult === 'object' ? JSON.stringify(ronResult) : ronResult;
          console.log(`[DEBUG] Player ${p.id} is NOT in furiten. checkCanRon result: ${ronResultLog}. Setting canRon to ${ronResult.isWin}`);
        } else {
          eligibility.canRon = false;
          console.log(`[DEBUG] Player ${p.id} IS in furiten. Cannot ron.`);
        }
        // ★★★ ここまで詳細ログ ★★★

        if (!isFinalAction && gameState.wall.length > 3 && !p.isRiichi && !p.isDoubleRiichi) {
          eligibility.canPon = mahjongLogic.checkCanPon(p.hand, discardedTile) ? discardedTile : null;
          eligibility.canMinkan = mahjongLogic.checkCanMinkan(p.hand, discardedTile) ? discardedTile : null;
        }

        if (eligibility.canRon || eligibility.canPon || eligibility.canMinkan) {
          canAnyoneAct = true;
          gameState.waitingForPlayerResponses.push(p.id);
        }
      }
    });
    console.log(`[DEBUG] Finished checking actions. canAnyoneAct=${canAnyoneAct}, waitingForPlayerResponses=${JSON.stringify(gameState.waitingForPlayerResponses)}`);
    return canAnyoneAct;
}

// 打牌処理のコアロジック
async function _processDiscard(gameId, playerId, tileIdToDiscard, isFromDrawnTile) {
    const gameState = gameStates[gameId];
    const player = gameState.players.find(p => p.id === playerId);

    // Step 1: 牌を見つけて移動する
    let discardedTileActual;
    if (isFromDrawnTile) {
      if (!gameState.drawnTile || gameState.drawnTile.id !== tileIdToDiscard) {
        const tileIndex = player.hand.findIndex(t => t.id === tileIdToDiscard);
        if (tileIndex !== -1) {
          discardedTileActual = player.hand.splice(tileIndex, 1)[0];
        } else { throw new Error('捨てようとした牌がツモ牌とも手牌とも一致しません。'); }
      } else {
        discardedTileActual = gameState.drawnTile;
        gameState.drawnTile = null;
      }
    } else {
      const tileIndex = player.hand.findIndex(t => t.id === tileIdToDiscard);
      if (tileIndex === -1) { throw new Error('捨てようとした牌が手牌に見つかりません。'); }
      discardedTileActual = player.hand.splice(tileIndex, 1)[0];
      if (gameState.drawnTile) {
        player.hand.push(gameState.drawnTile);
        player.hand = mahjongLogic.sortHand(player.hand);
      }
      gameState.drawnTile = null;
    }
    if (!discardedTileActual) { throw new Error('打牌処理に失敗しました。'); }

    // ストック牌を使用したフラグは、打牌が完了したこの時点でリセットする
    if (player.isUsingStockedTile) {
      player.isUsingStockedTile = false;
    }

    player.discards.push(discardedTileActual);
    gameState.lastDiscardedTile = discardedTileActual;

    // Step 2: 打牌後のエフェクトを処理する
    if (gameState.isDeclaringRiichi[playerId]) {
      gameState.riichiDiscardedTileId[playerId] = tileIdToDiscard;
      _finalizeRiichi(gameId, playerId);
    }
    if (gameState.pendingKanDoraReveal) {
      if (gameState.deadWall.length > 0) {
        const newDoraIndicator = mahjongLogic.revealDora(gameState.deadWall);
        if (newDoraIndicator) { gameState.doraIndicators.push(newDoraIndicator); }
      }
      gameState.pendingKanDoraReveal = false;
    }
    updateFuriTenState(gameId, player.id);
    gameState.turnCount++;
    gameState.lastActionPlayerId = player.id;
    gameState.rinshanKaihouChance = false;

    // Step 3: 他のプレイヤーからの応答を確認する
    const canAnyoneAct = _checkForPlayerActions(gameId, playerId, discardedTileActual);
    const isFinalAction = gameState.wall.length === 0;

    // Step 4: 次のゲーム状態を決定する
    if (isFinalAction) {
        if (canAnyoneAct) {
            gameState.gamePhase = GAME_PHASES.AWAITING_ACTION_RESPONSE;
            await setNextActiveResponder(gameId);
            await updateAndBroadcastGameState(gameId, gameState);
        } else {
            await handleRyuukyoku(gameId);
        }
    } else {
      if (canAnyoneAct) {
        gameState.gamePhase = GAME_PHASES.AWAITING_ACTION_RESPONSE;
        gameState.playerResponses = {};
        await setNextActiveResponder(gameId);
        await updateAndBroadcastGameState(gameId, gameState);
      } else {
        await moveToNextPlayer(gameId);
        // ストック選択待ちの場合は、ツモらずにクライアントの選択を待つ
        if (gameState.gamePhase !== GAME_PHASES.AWAITING_STOCK_SELECTION_TIMER) {
            await _executeDrawTile(gameId, gameState.currentTurnPlayerId);
        } else {
            // ストック選択待ちの場合、状態を更新してクライアントの応答を待つだけ
            await updateAndBroadcastGameState(gameId, gameState);
        }
      }
    }
}

// プレイヤーの退出・切断を処理する共通関数
async function handlePlayerLeave(gameId, userId, statusToSet = 'cancelled') {
  const game = gameStates[gameId];
  if (!game || !Array.isArray(game.players)) {
    console.warn(`handlePlayerLeave: Game ${gameId} not found or has invalid players array.`);
    return;
  }

  const playerIndex = game.players.findIndex(p => p.id === userId);
  if (playerIndex === -1) {
    console.warn(`handlePlayerLeave: Player ${userId} not found in game ${gameId}.`);
    return;
  }

  // disconnectedPlayers に追加
  if (!game.disconnectedPlayers.includes(userId)) {
    game.disconnectedPlayers.push(userId);
    console.log(`Player ${userId} added to disconnectedPlayers for game ${gameId}`);
  }

  // もしプレイヤーが playersReadyForNextRound にいた場合、そこから削除
  const readyIndex = game.playersReadyForNextRound.indexOf(userId);
  if (readyIndex > -1) {
    game.playersReadyForNextRound.splice(readyIndex, 1);
    console.log(`Player ${userId} removed from playersReadyForNextRound for game ${gameId}`);
  }

  console.log(`Player ${userId} is leaving/disconnecting from game ${gameId}.`);

  // ★追加: games テーブルの現在のステータスを取得
  const { data: gameData, error: fetchGameErrorForStatus } = await supabase
    .from('games')
    .select('status')
    .eq('id', gameId)
    .single();

  if (fetchGameErrorForStatus || !gameData) {
    console.error(`Error fetching game status for game ${gameId}:`, fetchGameErrorForStatus?.message);
    return;
  }

  const currentGameStateInDb = gameData.status;

  if (currentGameStateInDb === 'waiting') {
    // games の status が 'waiting' の場合、game_players からプレイヤーを削除
    const { error: deletePlayerError } = await supabase
      .from('game_players')
      .delete()
      .eq('game_id', gameId)
      .eq('user_id', userId);

    if (deletePlayerError) {
      console.error(`Error deleting player ${userId} from game_players for game ${gameId}:`, deletePlayerError);
      return;
    }
    console.log(`Player ${userId} deleted from game_players for game ${gameId} (status: waiting).`);

    // メモリ上のゲーム状態からもプレイヤーを削除
    game.players = game.players.filter(p => p.id !== userId);

    // ★修正: game.game_data.players も明示的に更新する
    if (game.game_data && game.game_data.players) {
      game.game_data.players = game.players; // game.players の最新状態を game_data.players に反映
    } else {
      console.warn(`handlePlayerLeave: game.game_data or game.game_data.players is undefined for game ${gameId}. Cannot update in-memory game_data.players.`);
    }

    // 残りのプレイヤー数を取得
    const { count: remainingPlayerCount, error: countError } = await supabase
      .from('game_players')
      .select('id', { count: 'exact' })
      .eq('game_id', gameId);

    if (countError) {
      console.error(`Error counting remaining players for game ${gameId}:`, countError);
      return;
    }

    let newGameStatus = 'waiting';
    if (remainingPlayerCount === 0) {
      newGameStatus = 'cancelled'; // プレイヤーがいなくなったらキャンセル
      console.log(`Game ${gameId} has no players left. Setting status to 'cancelled'.`);
    } else {
      newGameStatus = 'waiting'; // プレイヤーが残っていれば引き続き waiting
    }

    // games テーブルの status, game_data, updated_at, version をまとめて更新
    const { data: currentGameStateFromDb, error: fetchGameVersionError } = await supabase
      .from('games')
      .select('version')
      .eq('id', gameId)
      .single();

    if (fetchGameVersionError || !currentGameStateFromDb) {
      console.error(`Error fetching current game version for game ${gameId}:`, fetchGameVersionError?.message);
      return;
    }
    const currentVersion = currentGameStateFromDb.version;

    const { error: updateGameError, count: updateCount } = await supabase
      .from('games')
      .update({
        status: newGameStatus,
        updated_at: new Date(),
        // ★修正: game_data 全体を更新するのではなく、game_data 内の players 配列のみを更新する
        game_data: { ...game.game_data, players: game.players }, // game.players の最新状態を game_data.players に反映
        version: currentVersion + 1
      })
      .eq('id', gameId)
      .eq('version', currentVersion);

    if (updateGameError) {
      console.error(`Error updating game status and data for game ${gameId} after player left:`, updateGameError);
      return;
    }
    if (updateCount === 0) {
      console.warn(`Optimistic lock failed for game ${gameId} during player leave. Game state was already updated.`);
      return;
    }

    if (remainingPlayerCount === 0) {
      // game_players が空になったら games テーブルからも削除
      const { error: deleteGameError } = await supabase
        .from('games')
        .delete()
        .eq('id', gameId);

      if (deleteGameError) {
        console.error(`Error deleting game ${gameId} from games table:`, deleteGameError);
      }
      delete gameStates[gameId];
      console.log(`Game ${gameId} removed from memory and DB.`);
    } else {
      // プレイヤーが残っている場合、他のプレイヤーに状態更新をブロードキャスト
      // プレイヤーが残っている場合、他のプレイヤーにマッチング状態更新をブロードキャスト
            game.version = currentVersion + 1; // メモリ上のバージョンも更新

            // DBから最新のプレイヤーリストを取得してブロードキャスト
            const { data: updatedGamePlayers, error: fetchPlayersError } = await supabase
                .from('game_players')
                .select(`
                    user_id,
                    seat_index,
                    users (
                        id,
                        username,
                        avatar_url,
                        rating,
                        cat_coins,
                        total_games_played,
                        first_place_count,
                        second_place_count,
                        third_place_count,
                        fourth_place_count,
                        class
                    )
                `)
                .eq('game_id', gameId)
                .order('seat_index', { ascending: true });

            if (fetchPlayersError) {
                console.error(`Error fetching updated game players for game ${gameId}:`, fetchPlayersError);
                return;
            }

            const playersForMatchmaking = updatedGamePlayers.map(gp => ({
                id: gp.users.id,
                name: gp.users.username,
                username: gp.users.username,
                avatar_url: gp.users.avatar_url,
                rating: gp.users.rating,
                cat_coins: gp.users.cat_coins,
                total_games_played: gp.users.total_games_played,
                first_place_count: gp.users.first_place_count,
                second_place_count: gp.users.second_place_count,
                third_place_count: gp.users.third_place_count,
                fourth_place_count: gp.users.fourth_place_count,
                user_rank_class: gp.users.class,
                score: 50000, // マッチング画面では初期スコアを表示
                isAi: false,
                seat_index: gp.seat_index
            }));

            console.log(`[Server Debug] Emitting 'matchmaking-update' for game ${gameId}. Players:`, JSON.stringify(playersForMatchmaking, null, 2)); // ★追加ログ
            io.to(gameId).emit('matchmaking-update', { gameId: gameId, players: playersForMatchmaking });
            console.log(`[Server] Broadcasted 'matchmaking-update' for game ${gameId} with updated players.`);
    }

  } else if (currentGameStateInDb === 'in_progress') {
    // games の status が 'in_progress' の場合、game_players のステータスを 'disconnected' に更新
    const { error: updatePlayerStatusError } = await supabase
      .from('game_players')
      .update({ status: 'disconnected', updated_at: new Date() })
      .eq('game_id', gameId)
      .eq('user_id', userId);

    if (updatePlayerStatusError) {
      console.error(`Error updating player ${userId} status to 'disconnected' for game ${gameId}:`, updatePlayerStatusError);
      return;
    }
    console.log(`Player ${userId} status updated to 'disconnected' in game ${gameId} (status: in_progress).`);

    // メモリ上のゲーム状態のプレイヤーのステータスも更新
    const playerInGameState = game.players.find(p => p.id === userId);
    if (playerInGameState) {
      playerInGameState.status = 'disconnected';
    }

    // 他のプレイヤーに状態更新をブロードキャスト
    await updateAndBroadcastGameState(gameId, game);

    // ★追加: 切断したプレイヤーが現在アクションを求められている場合、自動で処理を進める
    if (game.waitingForPlayerResponses && game.waitingForPlayerResponses.includes(userId) && !game.playerResponses[userId]) {
      console.log(`[Server] Player ${userId} disconnected while in waitingForPlayerResponses. Auto-passing.`);
      game.playerResponses[userId] = 'skip';
      game.playerActionEligibility[userId] = {};
      
      // もし現在アクティブな応答者であれば、次へ進める
      if (game.activeActionPlayerId === userId) {
         setTimeout(async () => {
            await setNextActiveResponder(gameId);
            await updateAndBroadcastGameState(gameId, game);
         }, 500);
      }
    } else if ((game.gamePhase === GAME_PHASES.AWAITING_DISCARD || game.gamePhase === GAME_PHASES.AWAITING_RIICHI_DISCARD) && game.currentTurnPlayerId === userId) {
      if (game.drawnTile) {
        console.log(`[Server] Player ${userId} disconnected during their turn. Auto-discarding drawn tile.`);
        setTimeout(async () => {
          await _processDiscard(gameId, userId, game.drawnTile.id, true);
        }, 500);
      } else if (playerInGameState && playerInGameState.hand.length > 0) {
        const rightmostTile = playerInGameState.hand[playerInGameState.hand.length - 1];
        console.log(`[Server] Player ${userId} disconnected during their turn without drawnTile. Auto-discarding rightmost tile.`);
        setTimeout(async () => {
          await _processDiscard(gameId, userId, rightmostTile.id, false);
        }, 500);
      }
    } else if (game.gamePhase === GAME_PHASES.AWAITING_STOCK_SELECTION_TIMER && game.currentTurnPlayerId === userId) {
       console.log(`[Server] Player ${userId} disconnected during stock selection. Auto-drawing from wall.`);
       setTimeout(async () => {
           game.gamePhase = GAME_PHASES.PLAYER_TURN;
           await _executeDrawTile(gameId, userId);
       }, 500);
    }

  } else {
    // その他のステータスの場合（例: finished）、何もしないか、ログを出す
    console.log(`Player ${userId} left game ${gameId} with status ${currentGameStateInDb}. No specific action taken.`);
  }
}


// Socket.io接続ハンドラ
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);
    let disconnectedUserId = null;
    let gameIdToUpdate = null;

    for (const [userId, socketId] of userSocketMap.entries()) {
      if (socketId === socket.id) {
        disconnectedUserId = userId;
        userSocketMap.delete(userId);
        break;
      }
    }

    if (disconnectedUserId) {
      // メモリ上のアクティブなゲームから探す
      for (const gameId in gameStates) {
        if (gameStates[gameId].players.some(p => p.id === disconnectedUserId)) {
          gameIdToUpdate = gameId;
          break;
        }
      }
      
      if (gameIdToUpdate) {
        await handlePlayerLeave(gameIdToUpdate, disconnectedUserId, 'disconnected');
      } else {
        // メモリになければDBのマッチング中のゲームから探す
        const { data: gamePlayers, error } = await supabase
          .from('game_players')
          .select('game_id')
          .eq('user_id', disconnectedUserId)
          .in('status', ['joined']); // 'joined' 状態のプレイヤーを探す

        if (error) {
          console.error(`Error fetching game_players for disconnected user ${disconnectedUserId}:`, error);
          return;
        }

        if (gamePlayers && gamePlayers.length > 0) {
          gameIdToUpdate = gamePlayers[0].game_id;
          // DBからゲームデータをロードしてメモリに一時的に保存し、handlePlayerLeaveを呼び出す
          const { data: gameDataFromDb, error: fetchGameError } = await supabase
            .from('games')
            // ★修正: game_data だけでなく status と version も取得する
            .select('game_data, status, version')
            .eq('id', gameIdToUpdate)
            .single();

          if (fetchGameError || !gameDataFromDb) {
            console.error(`Error fetching game data for game ${gameIdToUpdate} from DB:`, fetchGameError?.message);
            return;
          }
          // ★修正: createDefaultGameState() で初期化し、DBのデータで上書きする
          gameStates[gameIdToUpdate] = Object.assign(createDefaultGameState(), gameDataFromDb.game_data);
          // DBからロードしたstatusとversionも反映
          gameStates[gameIdToUpdate].status = gameDataFromDb.status;
          gameStates[gameIdToUpdate].version = gameDataFromDb.version;
          // ★追加: gameStates[gameIdToUpdate].players を gameDataFromDb.game_data.players で明示的に上書き
          if (gameDataFromDb.game_data && gameDataFromDb.game_data.players) {
            gameStates[gameIdToUpdate].players = gameDataFromDb.game_data.players;
          }
          await handlePlayerLeave(gameIdToUpdate, disconnectedUserId, 'disconnected');
        }
      }
    }
  });

  socket.on('declareTsumoAgari', async ({ gameId, playerId }) => {
    console.log(`Player ${playerId} declares Tsumo in game ${gameId}`);
    const gameState = gameStates[gameId];
    if (!gameState) {
      socket.emit('gameError', { message: 'ゲームが見つかりませんでした。' });
      return;
    }
    try {
      // サーバー側でツモアニメーションの状態を設定
      gameState.animationState = { type: 'tsumo', playerId: playerId };
      // アニメーション状態をクライアントにブロードキャスト
      console.log(`[Server DEBUG][Tsumo] Before 1st broadcast. GameId: ${gameId}, AnimationType: ${gameState.animationState.type}, ShowResultPopup: ${gameState.showResultPopup}`);
      await updateAndBroadcastGameState(gameId, gameState);

      // 和了処理は直接 handleAgari を呼び出す
      await handleAgari(gameId, playerId, gameState.drawnTile, true);
      
      // handleAgari の中で最終的なゲーム状態をブロードキャストするはずなので、ここでは不要
      // console.log(`[Server DEBUG][Tsumo] After handleAgari. GameId: ${gameId}, AnimationType: ${gameState.animationState.type}, ShowResultPopup: ${gameState.showResultPopup}`);
      // await updateAndBroadcastGameState(gameId, gameState);

    } catch (error) {
      console.error(`Error handling Tsumo agari for player ${playerId} in game ${gameId}:`, error);
      socket.emit('gameError', { message: 'ツモ和了処理中にエラーが発生しました。' });
    }
  });

  // クライアントがゲームから意図的に退出する
  socket.on('leaveGame', async ({ gameId, userId }) => {
    console.log(`Player ${userId} is intentionally leaving game ${gameId}`);
    await handlePlayerLeave(gameId, userId, 'finished');
  });


  // クライアントがゲームに参加する
  socket.on('joinGame', async ({ gameId, userId }) => {
    if (userId) {
        userSocketMap.set(userId, socket.id);
    }
    socket.join(gameId);
    console.log(`Player ${userId} (socket ${socket.id}) joined game ${gameId}`);

    // メモリ上にゲーム状態が存在すれば、それを参加者本人に送信する
    let currentState = gameStates[gameId];
    if (currentState) {
        socket.emit('game-state-update', currentState);
        console.log(`Sent existing game state of ${gameId} to player ${userId}`);
    } else {
        // メモリにゲーム状態がなければ、DBからロードを試みる
        console.log(`No game state in memory for ${gameId}. Attempting to load from DB.`);
        const { data, error } = await supabase
            .from('games') // ★修正: from('games') を追加
            .select('game_data, version') // ★修正: version も取得
            .eq('id', gameId)
            .single();

        if (error || !data) {
            console.error(`Error fetching game state for ${gameId} from DB during joinGame:`, error?.message);
            // エラーをクライアントに通知することも検討
            return;
        }
        currentState = Object.assign(createDefaultGameState(), data.game_data);
        currentState.version = data.version; // ★追加: version をセット
        gameStates[gameId] = currentState; // メモリにロード
        socket.emit('game-state-update', currentState);
        console.log(`Loaded game state of ${gameId} from DB and sent to player ${userId}`);
    }
  });

  // クライアントがマッチメイキングを要求する
  socket.on('requestMatchmaking', async ({ userId, rating, username, avatarUrl }) => {
    console.log(`[1/5] Matchmaking request received from user: ${userId}, rating: ${rating}, socket: ${socket.id}, avatarUrl: ${avatarUrl}`);

    if (!userId || rating === undefined || !username) {
        console.error('[ERROR] Invalid request: userId, rating or username is missing.');
        return socket.emit('gameError', { message: 'ユーザー情報、レーティング、またはユーザー名が不足しています。' });
    }

    // ユーザーとソケットIDをマップ
    userSocketMap.set(userId, socket.id);
    console.log(`[2/5] User ${userId} mapped to socket ${socket.id}`);

    try {
        console.log('[3/5] Calling RPC "find_or_create_match"...');
        const { data: matchData, error: rpcError } = await supabase.rpc('find_or_create_match', {
            p_user_id: userId,
            p_user_rating: rating,
            p_username: username,
            p_avatar_url: avatarUrl
        });

        if (rpcError) {
            console.error('[ERROR] RPC call failed:', rpcError);
            throw rpcError;
        }
        console.log('[4/5] RPC call successful. Result:', JSON.stringify(matchData, null, 2));

        // rpcは配列で結果を返す
        if (!matchData || matchData.length === 0) {
            throw new Error('マッチングに失敗しました。RPCからデータが返されませんでした。');
        }

        const { out_game_id, out_is_full, out_players } = matchData[0]; // out_game_id, out_is_full, out_players を取得
        // out_players が文字列であればパースし、そうでなければそのまま使用
        const players = typeof out_players === 'string' ? JSON.parse(out_players) : out_players;

        console.log(`[5/5] Processing match result. Game ID: ${out_game_id}, Is Full: ${out_is_full}`);

        // ★追加: メモリ上の gameStates にもプレイヤー情報を正しく初期化する
        // 新しいゲーム���作成された場合、または既存のゲームに参加した場合、
        // RPCから返された最新のプレイヤーリストで gameStates[out_game_id].players を更新する
        if (!gameStates[out_game_id]) {
            gameStates[out_game_id] = createDefaultGameState();
            gameStates[out_game_id].onlineGameId = out_game_id;
            gameStates[out_game_id].isGameOnline = true;
            gameStates[out_game_id].localPlayerId = userId; // リクエストしたユーザーがローカルプレイヤー
            gameStates[out_game_id].gameMode = 'online';
            gameStates[out_game_id].ruleMode = 'stock';
            gameStates[out_game_id].gamePhase = 'waitingToStart';
            gameStates[out_game_id].isGameReady = false;
            gameStates[out_game_id].hasGameStarted = false;
            gameStates[out_game_id].playersReadyForNextRound = [];
            gameStates[out_game_id].version = 1; // 新しいゲームなのでバージョンは1
            // ★修正: game_data.players もここで初期化
            gameStates[out_game_id].game_data = { players: players };
        } else {
            // 常に最新のプレイヤーリストで更新
            gameStates[out_game_id].players = players;
            // ★追加: game_data.players も更新
            gameStates[out_game_id].game_data.players = players;
        }

        // 参加している全プレイヤーに通知
        if (players && Array.isArray(players)) { // players が配列であることを確認
            for (const player of players) {
                const playerSocketId = userSocketMap.get(player.id);
                if (playerSocketId) {
                    const playerSocket = io.sockets.sockets.get(playerSocketId);
                    if (playerSocket) {
                        // イベント送信
                        if (out_is_full) {
                            playerSocket.emit('game-found', { gameId: out_game_id, players: players });
                        } else {
                            playerSocket.emit('matchmaking-update', { gameId: out_game_id, players: players });
                        }
                    }
                } else { // Socket IDが見つからない場合
                    console.warn(`Socket ID for player ${player.id} not found in userSocketMap.`);
                }
            }
        } else {
            console.error('[ERROR] RPC returned invalid players data:', out_players);
            socket.emit('gameError', { message: 'マッチング処理中にエラーが発生しました: プレイヤーデータが不正です。' });
        }

    } catch (error) {
        console.error('[FATAL] An error occurred in matchmaking process:', error);
        socket.emit('gameError', { message: `マッチング処理中にエラーが発生しました: ${error.message || error}` });
    }
  });

  // ★追加ログ: initializeGame イベントハンドラが登録されるか確認
  console.log(`[Server Debug] Registering initializeGame event handler for socket ${socket.id}`);

  // クライアントがゲームの初期化を要求する
  socket.on('initializeGame', async ({ gameId, userId }) => {
    console.log(`[Server] Received initializeGame event for game ${gameId} from user ${userId}`);

    if (userId) {
        userSocketMap.set(userId, socket.id);
    }

    // 既に初期化済み、または初期化処理中であれば何もしない
    if (gameStates[gameId]?.hasGameStarted || gameInitializationLocks[gameId]) {
      console.log(`[Server] Game ${gameId} has already started or initialization is in progress. Skipping.`);
      if (gameStates[gameId]) {
        io.to(gameId).emit('game-state-update', gameStates[gameId]);
      }
      return;
    }

    try {
      gameInitializationLocks[gameId] = true; // ロックを取得

      // gameStates[gameId] がメモリ上にない場合、DBからロードを試みる
      if (!gameStates[gameId] || Object.keys(gameStates[gameId]).length === 0) {
        console.log(`[Server] Game ${gameId} not found in memory or is empty. Attempting to load from DB.`);
        const { data, error } = await supabase
            .from('games') // game_states から games に変更
            .select('game_data, status, version') // ★修正: version も取得
            .eq('id', gameId)
            .single();

        if (error || !data) {
            console.error(`Error fetching game state for ${gameId} from DB during initializeGame:`, error?.message);
            socket.emit('gameError', { message: 'ゲームのロードに失敗しました。' });
            return; // finallyでロックが解放される
        }
        gameStates[gameId] = Object.assign(createDefaultGameState(), data.game_data);
        // DBからロードしたstatusをメモリ上のゲーム状態にも反映
        gameStates[gameId].status = data.status;
        gameStates[gameId].version = data.version; // ★追加: version をセット
        console.log(`[Server] Game ${gameId} loaded from DB. Status: ${gameStates[gameId].status}, Version: ${gameStates[gameId].version}`);
      }

      console.log(`Initializing game ${gameId} by user ${userId}`);

      // game_players テーブルからプレイヤー情報を取得
      const { data: gamePlayersInDb, error: fetchPlayersError } = await supabase
        .from('game_players')
        .select('user_id, seat_index')
        .eq('game_id', gameId)
        .order('seat_index', { ascending: true }); // seat_index でソート

      if (fetchPlayersError || !gamePlayersInDb) {
        throw new Error(`オンラインゲームのプレイヤー情報取得に失敗: ${fetchPlayersError?.message}`);
      }

      const playerIds = gamePlayersInDb.map(gp => gp.user_id);

      if (playerIds.length < 4) {
        console.error(`[initializeGame] Not enough players to start game ${gameId}. Required 4, found ${playerIds.length}.`);
        gameStates[gameId].gamePhase = GAME_PHASES.WAITING_TO_START;
        gameStates[gameId].isGameReady = false;
        gameStates[gameId].hasGameStarted = false;
        await supabase.from('games').update({ status: 'waiting' }).eq('id', gameId); // games テーブルを更新
        io.to(gameId).emit('game-state-update', gameStates[gameId]);
        socket.emit('gameError', { message: 'プレイヤーが不足しているため、ゲームを開始できません。' });
        return; // finallyでロックが解放される
      }

      const { data: profiles, error: profileError } = await supabase
        .from('users')
        .select('id, username, avatar_url, cat_coins, rating, total_games_played, first_place_count, second_place_count, third_place_count, fourth_place_count, class') // ★修正
        .in('id', playerIds);

      if (profileError || !profiles) {
        throw new Error(`プレイヤーのプロファイル情報取得に失敗: ${profileError?.message}`);
      }

      const initialPlayers = gamePlayersInDb.map(gp => {
            const profile = profiles.find(p => p.id === gp.user_id);
            return {
              id: gp.user_id,
              name: profile?.username || 'プレイヤー',
              username: profile?.username || 'プレイヤー',
              avatar_url: profile?.avatar_url || '/assets/images/info/hito_icon_1.png',
              cat_coins: profile?.cat_coins || 0,
              rating: profile?.rating || 1500,
              user_rank_class: profile?.class || 1,
              total_games_played: profile?.total_games_played || 0,
              first_place_count: profile?.first_place_count || 0,   // ★追加
              second_place_count: profile?.second_place_count || 0, // ★追加
              third_place_count: profile?.third_place_count || 0,   // ★追加
              fourth_place_count: profile?.fourth_place_count || 0, // ★追加
              hand: [], discards: [], melds: [], isDealer: false, score: 50000, seatWind: null,
              stockedTile: null, isUsingStockedTile: false, isStockedTileSelected: false,
              isAi: false,
              seat_index: gp.seat_index, // seat_index を追加
            };
          });

      // seat_index に基づいてプレイヤーをソート
      gameStates[gameId].players = initialPlayers.sort((a, b) => a.seat_index - b.seat_index);

      if (gameStates[gameId].dealerIndex === null) {
        gameStates[gameId].dealerIndex = Math.floor(Math.random() * initialPlayers.length);
        console.log(`[initializeGame] Dealer index set to: ${gameStates[gameId].dealerIndex}`);
      }

      console.log(`[initializeGame] Calling _initializeGameCore for game ${gameId}...`);
      _initializeGameCore(gameId);
      // ★追加: 全プレイヤーのステータスを 'active' に更新
      const updateStatusPromises = gameStates[gameId].players.map(player =>
        updatePlayerStatus(gameId, player.id, 'active')
      );
      await Promise.all(updateStatusPromises);

      console.log(`[initializeGame] _initializeGameCore completed for game ${gameId}. Final gamePhase: ${gameStates[gameId].gamePhase}`);

      // ★追加: games テーブルのステータスを 'in_progress' に更新
      const { error: updateGameStatusError } = await supabase
        .from('games')
        .update({ status: 'in_progress', updated_at: new Date() })
        .eq('id', gameId);

      if (updateGameStatusError) {
        console.error(`Error updating game ${gameId} status to 'in_progress':`, updateGameStatusError);
        // エラーが発生しても処理を続行するが、ログには残す
      } else {
        console.log(`Game ${gameId} status updated to 'in_progress'.`);
      }

      // ★追加: 初期化完了後、親プレイヤーにツモを促す
      const dealerId = gameStates[gameId].players[gameStates[gameId].dealerIndex]?.id;
      if (dealerId) {
        console.log(`[Server] Dealer is ${dealerId}. Executing first draw.`);
        await _executeDrawTile(gameId, dealerId);
        await updateAndBroadcastGameState(gameId, gameStates[gameId]);

        // ポ��プアップは一度表示したらサーバー側の状態はfalseに戻す
        if (gameStates[gameId]) {
          gameStates[gameId].showDealerDeterminationPopup = false;
        }
      } else {
        throw new Error("親プレイヤーを決定できませんでした。");
      }

    } catch (error) {
      console.error(`Error initializing game ${gameId}:`, error);
      socket.emit('gameError', { message: 'ゲームの初期化に失敗しました。' });
    } finally {
      delete gameInitializationLocks[gameId]; // ロックを解放
    }
  });

  // クライアントが次のラウンドの準備完了を通知する
  socket.on('playerReadyForNextRound', async ({ gameId, playerId }) => {
    const gameState = gameStates[gameId];
    if (!gameState) {
      console.error(`Game ${gameId} not found for playerReadyForNextRound.`);
      socket.emit('gameError', { message: 'ゲームが見つかりません。' });
      return;
    }

    if (!gameState.playersReadyForNextRound) {
      gameState.playersReadyForNextRound = []; // 初期化
    }

    if (!gameState.playersReadyForNextRound.includes(playerId)) {
      gameState.playersReadyForNextRound.push(playerId);
    }

    // アクティブなプレイヤー（切断されていないプレイヤー）の数を取得
    const activePlayers = gameState.players.filter(p => !gameState.disconnectedPlayers.includes(p.id));

    // すべてのアクティブなプレイヤーが準備完了した場合、次のラウンドを開始
    if (gameState.playersReadyForNextRound.length === activePlayers.length) {
      await prepareNextRound(gameId); // prepareNextRoundを呼び出す
    } else {
      // 全員が揃っていない場合は、現在の準備状況をブロードキャスト
      io.to(gameId).emit('game-state-update', gameState);
    }
  });

  // ★追加: クライアントがゲーム終了を通知する
  socket.on('playerFinishedGame', async ({ gameId, userId }) => {
    console.log(`[Server] Player ${userId} finished game ${gameId}. Updating status to 'finished'.`);
    await updatePlayerStatus(gameId, userId, 'finished');
  });

  // クライアントが壁から牌を引くことを要求する (通常ツモ)
  socket.on('drawFromWall', async ({ gameId, playerId }) => {
    const gameState = gameStates[gameId];
    if (!gameState) return socket.emit('gameError', { message: 'ゲームが見つかりません。' });
    if (gameState.currentTurnPlayerId !== playerId) return socket.emit('gameError', { message: 'あなたのターンではありません。' });
    if (gameState.gamePhase !== GAME_PHASES.PLAYER_TURN && gameState.gamePhase !== GAME_PHASES.AWAITING_STOCK_SELECTION_TIMER) return socket.emit('gameError', { message: '牌を引けるフェーズではありません。' });

    const player = gameState.players.find(p => p.id === playerId);
    if (player) player.isUsingStockedTile = false;

    await _executeDrawTile(gameId, playerId);
    await updateAndBroadcastGameState(gameId, gameState);
  });

  // クライアントがストック牌を使わずに山から引くことを選択した
  socket.on('chooseToDrawFromWall', async ({ gameId, playerId }) => {
    const gameState = gameStates[gameId];
    if (!gameState) return socket.emit('gameError', { message: 'ゲームが見つかりません。' });
    if (gameState.currentTurnPlayerId !== playerId) return socket.emit('gameError', { message: 'あなたのターンではありません。' });
    if (gameState.gamePhase !== GAME_PHASES.AWAITING_STOCK_SELECTION_TIMER) return socket.emit('gameError', { message: '牌を引けるフェーズではありません。' });

    const player = gameState.players.find(p => p.id === playerId);
    if (player) {
        player.isUsingStockedTile = false;
    }

    // サーバー側のストック選択タイマーをクリア
    if (stockSelectionTimerIds[gameId]) {
        clearTimeout(stockSelectionTimerIds[gameId]);
        delete stockSelectionTimerIds[gameId];
    }

    await _executeDrawTile(gameId, playerId);
    // _executeDrawTile が内部でブロードキャストするため、ここでは不要
  });

  // クライアントがストックした牌を使用することを要求する
  socket.on('useStockedTile', async ({ gameId, playerId }) => {
    const gameState = gameStates[gameId];
    if (!gameState) return socket.emit('gameError', { message: 'ゲームが見つかりません。' });
    if (gameState.currentTurnPlayerId !== playerId) return socket.emit('gameError', { message: 'あなたのターンではありません。' });
    
    // タイムアウト処理との競合を防ぐため、フェーズを厳密にチェックする
    if (gameState.gamePhase !== GAME_PHASES.AWAITING_STOCK_SELECTION_TIMER) {
      console.warn(`[Race Condition Guard] Player ${playerId} tried to use stock tile in wrong phase: ${gameState.gamePhase}. Ignoring.`);
      return; // 処理を中断
    }
    
    const player = gameState.players.find(p => p.id === playerId);
    if (!player || !player.stockedTile) return socket.emit('gameError', { message: 'ストックした牌がありません。' });

    // サーバー側のストック選択タイマーをクリア
    if (stockSelectionTimerIds[gameId]) {
        clearTimeout(stockSelectionTimerIds[gameId]);
        delete stockSelectionTimerIds[gameId];
    }

    gameState.drawnTile = player.stockedTile;
    player.stockedTile = null;
    player.isUsingStockedTile = true;
    player.isStockedTileSelected = false;

    if (gameState.playerTurnCount[playerId] !== undefined) {
      gameState.playerTurnCount[playerId]++;
    }

    gameState.gamePhase = GAME_PHASES.AWAITING_DISCARD;
    gameState.lastActionPlayerId = playerId;

    // 各種状態のリセット
    gameState.players.forEach(p => {
      // 一発フラグは自分のツモ番が来る前に他家のアクションがなければ消える
      if (p.id !== playerId) {
        gameState.isIppatsuChance[p.id] = false;
      }
    });
    if (gameState.isChankanChance && gameState.lastActionPlayerId === playerId) {
        gameState.isChankanChance = false;
    }
    gameState.isDoujunFuriTen[playerId] = false;

    // ストック牌使用時はツモ和了や槓はできないルール
    gameState.playerActionEligibility[playerId] = { canTsumoAgari: false, canAnkan: null, canKakan: null, canRiichi: false };

    await updateAndBroadcastGameState(gameId, gameState);
  });

  // クライアントが牌を捨てることを要求する
  socket.on('discardTile', async ({ gameId, playerId, tileIdToDiscard, isFromDrawnTile, isStocking = false }) => {
    const gameState = gameStates[gameId];
    if (!gameState) return socket.emit('gameError', { message: 'ゲームが見つかりません。' });
    
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return socket.emit('gameError', { message: 'プレイヤーが見つかりません。' });

    if (gameState.currentTurnPlayerId !== playerId) return socket.emit('gameError', { message: 'あなたのターンではありません。' });
    
    // isStockingフラグの有無で処理を分岐
    if (isStocking) {
      // ストック処理
      if (gameState.gamePhase !== GAME_PHASES.AWAITING_DISCARD) {
        return socket.emit('gameError', { message: '牌をストックできるフェーズではありません。' });
      }
      try {
        if (player.stockedTile) throw new Error('既にストック牌があります。');

        let tileToStock;
        if (isFromDrawnTile) {
          if (!gameState.drawnTile || gameState.drawnTile.id !== tileIdToDiscard) throw new Error('ストックしようとした牌がツモ牌と一致しません。');
          tileToStock = gameState.drawnTile;
          gameState.drawnTile = null;
        } else {
          const tileIndex = player.hand.findIndex(t => t.id === tileIdToDiscard);
          if (tileIndex === -1) throw new Error('ストックしようとした牌が手牌に見つかりません。');
          tileToStock = player.hand.splice(tileIndex, 1)[0];
          if (gameState.drawnTile) {
            player.hand.push(gameState.drawnTile);
            player.hand = mahjongLogic.sortHand(player.hand);
          }
          gameState.drawnTile = null;
        }

        player.stockedTile = { ...tileToStock, isPublic: true, isStockedTile: true };
        gameState.stockAnimationPlayerId = playerId;
        
        await moveToNextPlayer(gameId);
        // ストック選択待ちの場合は、ツモらずにクライアントの選択を待つ
        if (gameState.gamePhase !== GAME_PHASES.AWAITING_STOCK_SELECTION_TIMER) {
            await _executeDrawTile(gameId, gameState.currentTurnPlayerId);
        } else {
            await updateAndBroadcastGameState(gameId, gameState);
        }
        
        setTimeout(() => {
            const currentGameState = gameStates[gameId];
            if (currentGameState) {
                currentGameState.stockAnimationPlayerId = null; // サーバーの状態も更新
                io.to(gameId).emit('stock-animation-end');
            }
        }, 600);

      } catch (error) {
        console.error(`Error in stock action for game ${gameId}:`, error);
        socket.emit('gameError', { message: error.message });
      }
    } else {
      // 通常の打牌処理
      if (gameState.gamePhase !== GAME_PHASES.AWAITING_DISCARD && gameState.gamePhase !== GAME_PHASES.AWAITING_RIICHI_DISCARD) {
        return socket.emit('gameError', { message: '牌を捨てられるフェーズではありません。' });
      }
      try {
          await _processDiscard(gameId, playerId, tileIdToDiscard, isFromDrawnTile);
      } catch (error) {
          console.error(`Error in discardTile for game ${gameId}:`, error);
          socket.emit('gameError', { message: error.message });
      }
    }
  });

// クライアントがアクション（ポン・カン・ロンなど）を見送ることを通知する
  socket.on('playerSkipsCall', async ({ gameId, playerId }) => {
    const gameState = gameStates[gameId];
    if (!gameState) return socket.emit('gameError', { message: 'ゲームが見つかりません。' });
    if (gameState.activeActionPlayerId !== playerId) return socket.emit('gameError', { message: 'アクションを選択する番ではありません。' });

    const player = gameState.players.find(p => p.id === playerId);
    if (player && gameState.playerActionEligibility[playerId]?.canRon) {
      // リーチ中のロン見逃しは永続フリテン
      if (player.isRiichi || player.isDoubleRiichi) {
        gameState.isFuriTen[playerId] = true;
      } else {
        // それ以外は同巡フリテン
        gameState.isDoujunFuriTen[playerId] = true;
      }
    }
    
    gameState.playerResponses[playerId] = 'skip';
    gameState.playerActionEligibility[playerId] = {};

    await setNextActiveResponder(gameId);
    await updateAndBroadcastGameState(gameId, gameState);
  });

  // クライアントがアクション（ポン・カン・ロンなど）を宣言する
  socket.on('playerDeclaresCall', async ({ gameId, playerId, actionType, tile }) => {
    const gameState = gameStates[gameId];
    if (!gameState) return socket.emit('gameError', { message: 'ゲームが見つかりません。' });
    if (gameState.activeActionPlayerId !== playerId) return socket.emit('gameError', { message: 'アクションを選択する番ではありません。' });

    // TODO: 宣言が正当かどうかのより詳細なチェック

    gameState.playerResponses[playerId] = actionType;
    gameState.playerActionEligibility[playerId] = {};

    const tileForAction = actionType === 'ron'
      ? (gameState.isChankanChance ? gameState.chankanTile : gameState.lastDiscardedTile)
      : tile;

    let priority = 0;
    if (actionType === 'ron') priority = 3;
    else if (actionType === 'minkan') priority = 2; // ポンより優先
    else if (actionType === 'pon') priority = 1;

    gameState.actionResponseQueue.push({ playerId, actionType, tile: tileForAction, priority });

    await setNextActiveResponder(gameId);
    await updateAndBroadcastGameState(gameId, gameState);
  });

  // クライアントがリーチを宣言する
  socket.on('declareRiichi', async ({ gameId, playerId }) => {
    const gameState = gameStates[gameId];
    if (!gameState) return socket.emit('gameError', { message: 'ゲームが見つかりません。' });
    if (gameState.currentTurnPlayerId !== playerId) return socket.emit('gameError', { message: 'あなたのターンではありません。' });
    
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return socket.emit('gameError', { message: 'プレイヤーが見つかりません。' });

    // リーチの条件をサーバー側で再検証
    let canRiichi = false;
    if (gameState.wall.length > 3 && player.melds.every(m => m.type === 'ankan') && player.score >= 1000) {
      const potentialHandAfterDraw = [...player.hand, gameState.drawnTile];
      for (const tileToDiscard of potentialHandAfterDraw) {
        const tempHand = potentialHandAfterDraw.filter(t => t.id !== tileToDiscard.id);
        const tenpaiResult = mahjongLogic.checkYonhaiTenpai(tempHand, createGameContextForPlayer(gameState, player, false));
        if (tenpaiResult.isTenpai && tenpaiResult.waits.length > 0) {
          canRiichi = true;
          break;
        }
      }
    }

    if (!canRiichi) {
      return socket.emit('gameError', { message: 'リーチできる状態ではありません。' });
    }

    gameState.isDeclaringRiichi[playerId] = true;
    gameState.isIppatsuChance[playerId] = true; // 一発のチャンスは打牌後、ロンされなかった場合に確定
    gameState.playerActionEligibility[playerId] = {};
    gameState.gamePhase = GAME_PHASES.AWAITING_RIICHI_DISCARD; // アニメーションはクライアントに任せ、サーバーは打牌待ちに
    
    // リーチ後に捨てられる牌の選択肢を計算
    const potentialDiscards = [...player.hand, gameState.drawnTile];
    gameState.riichiDiscardOptions = potentialDiscards.filter(tileToDiscard => {
      if (!tileToDiscard) return false;
      const currentFullHand = [...player.hand, gameState.drawnTile];
      let tempHand = [];
      let discarded = false;
      for (const tile of currentFullHand) {
        if (tile.id === tileToDiscard.id && !discarded) {
          discarded = true;
        } else {
          tempHand.push(tile);
        }
      }
      return mahjongLogic.checkYonhaiTenpai(tempHand, createGameContextForPlayer(gameState, player, false)).isTenpai;
    }).map(tile => tile.id);

    gameState.animationState = { type: 'riichi', playerId: playerId };

    await updateAndBroadcastGameState(gameId, gameState);

    // アニメーション表示のために少し待ってからリセット
    setTimeout(async () => {
      const currentGameState = gameStates[gameId];
      if (currentGameState) {
        currentGameState.animationState = { type: null, playerId: null };
        await updateAndBroadcastGameState(gameId, currentGameState);
      }
    }, 1500);
  });

  // クライアントが暗槓を宣言する
  socket.on('declareAnkan', async ({ gameId, playerId, tileToAnkan }) => {
    const gameState = gameStates[gameId];
    if (!gameState) return socket.emit('gameError', { message: 'ゲームが見つかりません。' });
    if (gameState.currentTurnPlayerId !== playerId) return socket.emit('gameError', { message: 'あなたのターンではありません。' });

    const player = gameState.players.find(p => p.id === playerId);
    if (!player || !tileToAnkan) return socket.emit('gameError', { message: '暗槓の宣言が無効です。' });

    // 暗槓の条件をサーバー側で再検証
    const ankanOptions = mahjongLogic.checkCanAnkan(player.hand, gameState.drawnTile, createGameContextForPlayer(gameState, player, false));
    const isValidAnkan = ankanOptions.some(option => mahjongLogic.getTileKey(option[0]) === mahjongLogic.getTileKey(tileToAnkan));
    if (!isValidAnkan) {
      return socket.emit('gameError', { message: '暗槓できる状態ではありません。' });
    }

    const ankanKey = mahjongLogic.getTileKey(tileToAnkan);
    const drawnTileKey = gameState.drawnTile ? mahjongLogic.getTileKey(gameState.drawnTile) : null;
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

    if (isFromDrawn) {
        gameState.drawnTile = null;
    } else if (gameState.drawnTile) {
        player.hand.push(gameState.drawnTile);
        gameState.drawnTile = null;
    }
    player.hand = mahjongLogic.sortHand(player.hand);

    player.melds.push({ type: 'ankan', tiles: [tileToAnkan, tileToAnkan, tileToAnkan, tileToAnkan], from: playerId, takenTileRelativePosition: null });
    
    updateFuriTenState(gameId, playerId);
    gameState.players.forEach(p => gameState.isDoujunFuriTen[p.id] = false);
    gameState.isChankanChance = false; // 暗槓は槍槓できない
    gameState.lastActionPlayerId = playerId;
    if (gameState.playerTurnCount[playerId] !== undefined) {
      gameState.playerTurnCount[playerId]++;
    }
    if (gameState.turnCount < gameState.players.length) {
      gameState.anyPlayerMeldInFirstRound = true;
    }

    // 嶺上牌をツモる
    if (gameState.wall.length > 0) {
      gameState.drawnTile = mahjongLogic.drawRinshanTile(gameState.wall);
      gameState.rinshanKaihouChance = true;
      gameState.pendingKanDoraReveal = true; // 打牌後に新しいドラが表示される
      _handlePostRinshanDraw(gameId, playerId);
      gameState.gamePhase = GAME_PHASES.AWAITING_DISCARD;
    }
    else {
      console.warn("Cannot draw Rinshan tile, wall is empty.");
      await handleRyuukyoku(gameId);
      return;
    }

    gameState.animationState = { type: 'kan', playerId: playerId };
    
    await updateAndBroadcastGameState(gameId, gameState);

    // アニメーション表示のために少し待ってからリセット
    setTimeout(async () => {
      const currentGameState = gameStates[gameId];
      if (currentGameState) {
        currentGameState.animationState = { type: null, playerId: null };
        await updateAndBroadcastGameState(gameId, currentGameState);
      }
    }, 1500);
  });

  // クライアントが加槓を宣言する
  socket.on('declareKakan', async ({ gameId, playerId, tileToKakan }) => {
    const gameState = gameStates[gameId];
    if (!gameState) return socket.emit('gameError', { message: 'ゲームが見つかりません。' });
    if (gameState.currentTurnPlayerId !== playerId) return socket.emit('gameError', { message: 'あなたのターンではありません。' });

    const player = gameState.players.find(p => p.id === playerId);
    if (!player || !tileToKakan) return socket.emit('gameError', { message: '加槓の宣言が無効です。' });

    // 加槓の条件をサーバー側で再検証
    const kakanOptions = mahjongLogic.checkCanKakan(player.hand, player.melds, gameState.drawnTile, createGameContextForPlayer(gameState, player, false));
    const isValidKakan = kakanOptions.some(option => mahjongLogic.getTileKey(option) === mahjongLogic.getTileKey(tileToKakan));
    if (!isValidKakan) {
      return socket.emit('gameError', { message: '加槓できる状態ではありません。' });
    }

    const kakanKey = mahjongLogic.getTileKey(tileToKakan);
    const ponMeldIndex = player.melds.findIndex(m => m.type === 'pon' && mahjongLogic.getTileKey(m.tiles[0]) === kakanKey);
    
    player.melds[ponMeldIndex].type = 'kakan';
    player.melds[ponMeldIndex].tiles.push(tileToKakan);

    // 手牌またはツモ牌から加槓した牌を削除
    if (gameState.drawnTile && mahjongLogic.getTileKey(gameState.drawnTile) === kakanKey) {
        gameState.drawnTile = null;
    } else {
      const tileIndexInHand = player.hand.findIndex(t => t.id === tileToKakan.id);
      if (tileIndexInHand > -1) {
        player.hand.splice(tileIndexInHand, 1);
      }
    }
    if (gameState.drawnTile) {
        player.hand.push(gameState.drawnTile);
        player.hand = mahjongLogic.sortHand(player.hand);
        gameState.drawnTile = null;
    }

    updateFuriTenState(gameId, playerId);
    gameState.isChankanChance = true;
    gameState.chankanTile = tileToKakan;
    gameState.waitingForPlayerResponses = [];
    gameState.playerResponses = {};

    // 他のプレイヤーの槍槓チェック
    gameState.players.forEach(p => {
      if (p.id !== playerId) {
        const gameContext = createGameContextForPlayer(gameState, p, false, gameState.chankanTile);
        const isPlayerInFuriTen = gameState.isFuriTen[p.id] || gameState.isDoujunFuriTen[p.id];
        if (!isPlayerInFuriTen) {
          const ronResult = mahjongLogic.checkCanRon(p.hand, gameState.chankanTile, gameContext);
          if (ronResult.isWin) {
            gameState.playerActionEligibility[p.id] = { canRon: true };
            gameState.waitingForPlayerResponses.push(p.id);
          }
        }
      }
    });

    gameState.lastActionPlayerId = playerId;
    gameState.players.forEach(p => gameState.isIppatsuChance[p.id] = false);
    if (gameState.playerTurnCount[playerId] !== undefined) {
      gameState.playerTurnCount[playerId]++;
    }
    if (gameState.turnCount < gameState.players.length) {
      gameState.anyPlayerMeldInFirstRound = true;
    }

    if (gameState.waitingForPlayerResponses.length > 0) {
      gameState.gamePhase = GAME_PHASES.AWAITING_KAKAN_RESPONSE;
      await setNextActiveResponder(gameId);
    } else {
      // 槍槓できるプレイヤーがいない場合、即座に嶺上牌ツモへ
      await drawRinshanAfterKakan(gameId, playerId);
    }

    gameState.animationState = { type: 'kan', playerId: playerId };
    
    await updateAndBroadcastGameState(gameId, gameState);

    // アニメーション表示のために少し待ってからリセット
    setTimeout(async () => {
      const currentGameState = gameStates[gameId];
      if (currentGameState) {
        currentGameState.animationState = { type: null, playerId: null };
        await updateAndBroadcastGameState(gameId, currentGameState);
      }
    }, 1500);
  });

  // クライアントがツモ和了を宣言する
  socket.on('handleAgari', async ({ gameId, playerId }) => {
    const gameState = gameStates[gameId];
    if (!gameState) return socket.emit('gameError', { message: 'ゲームが見つかりません。' });
    if (gameState.currentTurnPlayerId !== playerId) return socket.emit('gameError', { message: 'あなたのターンではありません。' });
    if (gameState.gamePhase !== GAME_PHASES.AWAITING_DISCARD) return socket.emit('gameError', { message: '和了を宣言できるフェーズではありません。' });

    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return socket.emit('gameError', { message: 'プレイヤーが見つかりません。' });

    const agariTile = gameState.drawnTile;
    if (!agariTile) return socket.emit('gameError', { message: 'ツモ牌がありません。' });

    const gameContext = createGameContextForPlayer(gameState, player, true, agariTile);
    const winResult = mahjongLogic.checkYonhaiWin(
        [...player.hand, agariTile],
        agariTile,
        true, // isTsumo
        gameContext
    );

    if (!winResult.isWin) {
        return socket.emit('gameError', { message: 'ツモ和了できる状態ではありません。' });
    }

    // ヘルパー関数を呼び出して和了処理を実行
    await handleAgari(gameId, playerId, agariTile, true, null);
  });

  // クライアントが牌をストックする
  socket.on('executeStock', async ({ gameId, playerId, tileIdToStock, isFromDrawnTile }) => {
    const gameState = gameStates[gameId];
    if (!gameState) return socket.emit('gameError', { message: 'ゲームが見つかりません。' });
    if (gameState.currentTurnPlayerId !== playerId) return socket.emit('gameError', { message: 'あなたのターンではありません。' });

    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return socket.emit('gameError', { message: 'プレイヤーが見つかりません。' });
    if (player.stockedTile) return socket.emit('gameError', { message: '既に牌をストックしています。' });
    if (player.isRiichi || player.isDoubleRiichi) return socket.emit('gameError', { message: 'リーチ中はストックできません。' });

    let discardedTileActual;

    if (isFromDrawnTile) {
      if (!gameState.drawnTile || gameState.drawnTile.id !== tileIdToStock) {
        return socket.emit('gameError', { message: 'ストックしようとした牌がツモ牌と一致しません。' });
      }
      discardedTileActual = gameState.drawnTile;
      gameState.drawnTile = null;
    } else {
      const tileIndex = player.hand.findIndex(t => t.id === tileIdToStock);
      if (tileIndex === -1) {
        return socket.emit('gameError', { message: 'ストックしようとした牌が手牌に見つかりません。' });
      }
      discardedTileActual = player.hand.splice(tileIndex, 1)[0];
      if (gameState.drawnTile) {
        player.hand.push(gameState.drawnTile);
        player.hand = mahjongLogic.sortHand(player.hand);
      }
      gameState.drawnTile = null;
    }

    if (!discardedTileActual) {
      return socket.emit('gameError', { message: 'ストック処理に失敗しました。' });
    }

    player.stockedTile = { ...discardedTileActual, isPublic: true, isStockedTile: true };
    
    // ターンを次のプレイヤーへ
    await moveToNextPlayer(gameId);
    await _executeDrawTile(gameId, gameState.currentTurnPlayerId);
    
    await updateAndBroadcastGameState(gameId, gameState);
  });

  // クライアントがツモ和了を宣言する
  socket.on('declareTsumoAgari', async ({ gameId, playerId }) => {
    const gameState = gameStates[gameId];
    if (!gameState) return socket.emit('gameError', { message: 'ゲームが見つかりません。' });
    if (gameState.currentTurnPlayerId !== playerId) return socket.emit('gameError', { message: 'あなたのターンではありません。' });

    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return socket.emit('gameError', { message: 'プレイヤーが見つかりません。' });

    // サーバー側でツモ和了の条件を再検証
    const gameContext = createGameContextForPlayer(gameState, player, true);
    const winResult = mahjongLogic.checkYonhaiWin([...player.hand, gameState.drawnTile], gameState.drawnTile, true, gameContext);

    if (winResult.isWin) {
        await handleAgari(gameId, playerId, gameState.drawnTile, true);
    } else {
        socket.emit('gameError', { message: 'ツモ和了の条件を満たしていません。' });
    }
  });

  // クライアントがチャットメッセージを送信する
  socket.on('sendChatMessage', ({ gameId, playerId, messageId }) => {
    io.to(gameId).emit('newChatMessage', { playerId, messageId });
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});