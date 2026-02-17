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
    finalResultDetails: { rankedPlayers: [], consecutiveWins: 0 },
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
    isGameReady: false,
    hasGameStarted: false,
    chatBubbles: {},
    lastChattedPlayerId: null,
  };
}


// ルートハンドラ
app.get('/', (req, res) => {
  res.send('Mahjong Game Server is running!');
});

// ゲームの状態をSupabaseに保存するヘルパー関数
async function saveGameState(gameId, gameState) {
  const { error } = await supabase
    .from('game_states')
    .update({
      game_data: gameState,
      updated_at: new Date(),
      current_turn_user_id: gameState.currentTurnPlayerId,
      status: gameState.gamePhase === 'gameOver' ? 'finished' : 'in_progress'
    })
    .eq('id', gameId);

  if (error) {
    console.error("Error updating game state in DB:", error);
  }
}

// Helper to update game state and broadcast to clients
async function updateAndBroadcastGameState(gameId, gameState) {
  await saveGameState(gameId, gameState);
  io.to(gameId).emit('game-state-update', gameState);
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
    isChankanChance: gameState.isChankanChance,
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
  };
}

// フリテン状態を更新するヘルパー関数
function updateFuriTenState(gameId, playerId) {
  const gameState = gameStates[gameId];
  if (!gameState) return;

  const player = gameState.players.find(p => p.id === playerId);
  if (!player) return;

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
  if (gameState.ruleMode === 'stock' && nextPlayer && !nextPlayer.isAi) {
    if (nextPlayer.stockedTile && !nextPlayer.isRiichi && !nextPlayer.isDoubleRiichi) {
      gameState.gamePhase = GAME_PHASES.AWAITING_STOCK_SELECTION_TIMER; // クライアントにストック選択を促す
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
        await updateAndBroadcastGameState(gameId, gameState);

        // アニメーション表示のために少し待ってから、和了処理と結果ポップアップ表示を行う
        setTimeout(async () => {
            const currentGameState = gameStates[gameId];
            if (currentGameState) {
                // アニメーション状態をクリアしてから和了処理
                currentGameState.animationState = { type: null, playerId: null };
                await handleAgari(gameId, winningRonAction.playerId, currentGameState.lastDiscardedTile, false, currentGameState.lastActionPlayerId);
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
    gameCtxForWin
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
  };

  const pointChanges = {};
  gameState.players.forEach(p => pointChanges[p.id] = 0);
  const honbaPointsPerPlayer = gameState.honba * 100; // 1本場につき100点
  const totalHonbaPoints = gameState.honba * 300; // 1本場につき300点

  if (isTsumo) {
    const tsumoPayments = calculateTsumoPayment(score, player.isDealer);
    const dealer = gameState.players.find(p => p.isDealer);
    const nonDealers = gameState.players.filter(p => !p.isDealer);

    if (player.isDealer) {
      // 親のツモ和了
      const payment = tsumoPayments.nonDealer + honbaPointsPerPlayer;
      nonDealers.forEach(p => { pointChanges[p.id] -= payment; });
      pointChanges[player.id] += payment * nonDealers.length;
    } else {
      // 子のツモ和了
      const dealerPayment = tsumoPayments.dealer + honbaPointsPerPlayer;
      const nonDealerPayment = tsumoPayments.nonDealer + honbaPointsPerPlayer;
      pointChanges[dealer.id] -= dealerPayment;
      nonDealers.forEach(p => {
        if (p.id !== player.id) {
          pointChanges[p.id] -= nonDealerPayment;
        }
      });
      pointChanges[player.id] += dealerPayment + nonDealerPayment * (nonDealers.length - 1);
    }
  } else { // Ron
    const payment = score + totalHonbaPoints;
    pointChanges[ronTargetPlayerId] -= payment;
    pointChanges[player.id] += payment;
  }

  // リーチ棒の精算
  const riichiStickPoints = gameState.riichiSticks * 1000;
  pointChanges[player.id] += riichiStickPoints;

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
  gameState.showResultPopup = true;
  gameState.isRiichiBgmActive = false;

  await updateAndBroadcastGameState(gameId, gameState);
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

    gameState.showResultPopup = true;
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
async function handleGameEnd(gameId) {
  const gameState = gameStates[gameId];
  if (!gameState) return;

  // 最終的なスコアに基づいてプレイヤーをランク付け
  const rankedPlayers = getRankedPlayers(gameState.players);

  // 最大連勝数を更新 (サーバー側では 'player1' の概念がないため、ここではスキップまたはオンラインプレイヤーの勝敗を考慮)
  // TODO: オンライン対戦における連勝数・猫コインの更新ロジックを検討
  // 現状は、クライアント側で処理されることを想定し、サーバー側では基本的な状態更新のみ

  gameState.finalResultDetails = {
    rankedPlayers: rankedPlayers,
    consecutiveWins: 0, // サーバー側では連勝数を直接計算しない
  };
  gameState.showFinalResultPopup = true; // クライアントに最終結果表示を促す

  // ゲームの状態をリセット (次のゲームのためにメモリから削除)
  delete gameStates[gameId];

  await updateAndBroadcastGameState(gameId, gameState);
}

// ゲームのコア初期化ロジックを処理するヘルパー関数
async function _initializeGameCore(gameId) {
  // gameStates[gameId] が undefined のまま渡される可能性に備え、ここで確実に初期化する
  if (!gameStates[gameId]) {
      console.error(`_initializeGameCore: gameStates[${gameId}] が undefined です。予期せぬ状態のため、デフォルト値で初期化します。`);
      gameStates[gameId] = createDefaultGameState();
  }

  // ★★★ 修正: gameStates[gameId] のディープコピーを作成し、ローカルで操作する
  // JSON.parse(JSON.stringify()) はシンプルだが、Dateオブジェクトや関数などを失う点に注意。
  // このゲームの状態では問題ないと判断。
  let localGameState = JSON.parse(JSON.stringify(gameStates[gameId]));

  // 以前のガードは不要になるため削除
  // if (!gameState) return;

  // ... my previous initialization block for player-specific objects ...
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

  localGameState.playersReadyForNextRound = []; // ★局の初期化時に、必ず準備完了リストをリセット

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
  const currentDealerIndex = localGameState.dealerIndex;

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

  // ★★★ 修正: グローバルな gameStates オブジェクトを更新してからブロードキャストする
  gameStates[gameId] = localGameState;
  // await updateAndBroadcastGameState(gameId, localGameState);
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
  
  // isStockedTile プロパティが次のツモに引き継がれる問題を修正するため、
  // ツモった牌を新しいオブジェクトとして再生成し、不要なプロパティを確実に除去する。
  const cleanTile = { suit: tile.suit, rank: tile.rank, id: tile.id };
  gameState.drawnTile = cleanTile;
  gameState.gamePhase = GAME_PHASES.AWAITING_DISCARD;
  gameState.lastActionPlayerId = playerId;

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
  const tsumoWinResult = mahjongLogic.checkYonhaiWin([...player.hand, gameState.drawnTile], gameState.drawnTile, true, gameContext);
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

  // リーチ後の自動ツモ切り処理
  if ((player.isRiichi || player.isDoubleRiichi) && !eligibility.canTsumoAgari && !eligibility.canAnkan) {
    // 和了もカンもできない場合は、即座にツモ切り処理を実行する
    // setTimeoutによる非同期処理をやめ、一連の処理として実行することで状態の不整合を防ぐ
    console.log(`[Server] Riichi player ${playerId} cannot win or kan. Auto-discarding.`);
    // _processDiscardを直接呼び出し、その後のブロードキャストもこの中で行われる
    await _processDiscard(gameId, playerId, gameState.drawnTile.id, true);
    // この後のブロードキャストは_processDiscardに任せるため、ここでは何もしない
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

        const gameContext = createGameContextForPlayer(gameState, p, false, discardedTile);
        const isPlayerInFuriTen = gameState.isFuriTen[p.id] || gameState.isDoujunFuriTen[p.id];

        // ★★★ ここから詳細ログ ★★★
        console.log(`[DEBUG] Checking player ${p.id}: isRiichi=${p.isRiichi}, isFuriTen=${gameState.isFuriTen[p.id]}, isDoujunFuriTen=${gameState.isDoujunFuriTen[p.id]}`);

        if (!isPlayerInFuriTen) {
          const ronResult = mahjongLogic.checkCanRon(p.hand, discardedTile, gameContext);
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

// Socket.io接続ハンドラ
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('disconnect', async () => { // async を追加
    console.log('User disconnected:', socket.id);
    let disconnectedUserId = null;

    // userSocketMapから切断したユーザーを削除
    for (const [userId, socketId] of userSocketMap.entries()) {
        if (socketId === socket.id) {
            disconnectedUserId = userId;
            userSocketMap.delete(userId);
            console.log(`Removed user ${userId} from userSocketMap`);
            break;
        }
    }

    // ユーザーが切断された場合の処理
    if (disconnectedUserId) {
        let gameFoundAndUpdated = false;

        // 1. メモリ上のアクティブなゲームから切断したユーザーを探す
        for (const gameId in gameStates) {
            const game = gameStates[gameId];
            if (!Array.isArray(game.players)) {
                console.warn(`Game ${gameId} has invalid players array.`);
                continue;
            }

            const playerIndex = game.players.findIndex(p => p.id === disconnectedUserId);

            if (playerIndex !== -1) {
                const initialPlayerCount = game.players.length; // 切断前のプレイヤー数を記録
                console.log(`Player ${disconnectedUserId} disconnected from active game ${gameId}. Initial count: ${initialPlayerCount}`);

                const updateData = { updated_at: new Date() };

                const remainingPlayers = game.players.filter(p => p.id !== disconnectedUserId);
                game.players = remainingPlayers;
                updateData.game_data = game;

                updateData.player_1_id = remainingPlayers[0]?.id || null;
                updateData.player_2_id = remainingPlayers[1]?.id || null;
                updateData.player_3_id = remainingPlayers[2]?.id || null;
                updateData.player_4_id = remainingPlayers[3]?.id || null;

                if (remainingPlayers.length === 0) {
                    updateData.status = 'cancelled';
                    console.log(`Game ${gameId} has no players left. Setting status to 'cancelled'.`);
                } else {
                    // ゲーム開始前（カウントダウン中）に4人から3人以下になった場合
                    if (game.gamePhase === GAME_PHASES.WAITING_TO_START && initialPlayerCount === 4 && remainingPlayers.length < 4) {
                        updateData.status = 'waiting'; // DBのステータスを 'waiting' に戻す
                        // game オブジェクトの状態もリセット
                        game.isGameReady = false;
                        game.hasGameStarted = false;
                        game.dealerIndex = null;
                        game.currentTurnPlayerId = null;
                        console.log(`Game ${gameId} is returning to matchmaking state due to disconnection.`);
                    } else if (game.gamePhase === GAME_PHASES.WAITING_TO_START) {
                        // 4人揃う前のマッチング中に誰かが抜けた場合
                        updateData.status = 'waiting';
                        console.log(`Game ${gameId} still has players in matchmaking. Setting status to 'waiting'.`);
                    }
                    // ゲーム進行中に抜けた場合は、status は 'in_progress' のまま
                }

                const { error } = await supabase
                    .from('game_states')
                    .update(updateData)
                    .eq('id', gameId);

                if (error) {
                    console.error(`Error updating game state for game ${gameId}:`, error);
                } else {
                    if (remainingPlayers.length === 0) {
                        // メモリからもゲーム状態を削除
                        delete gameStates[gameId];
                        console.log(`Game ${gameId} removed from memory.`);
                    } else {
                        // プレイヤーが残っている場合、他のプレイヤーに状態更新をブロードキャスト
                        io.to(gameId).emit('game-state-update', game);
                    }
                }
                gameFoundAndUpdated = true;
                break; // 該当ゲームを見つけたらループを抜ける
            }
        }

        // 2. メモリ上のゲームに見つからなかった場合、Supabaseからマッチメイキング中のゲームを探す
        if (!gameFoundAndUpdated) {
            console.log(`Player ${disconnectedUserId} not found in active games. Checking Supabase for matchmaking games.`);
            const { data: matchmakingGames, error: fetchError } = await supabase
                .from('game_states')
                .select('id, player_1_id, player_2_id, player_3_id, player_4_id, game_data, status')
                .or(`player_1_id.eq.${disconnectedUserId},player_2_id.eq.${disconnectedUserId},player_3_id.eq.${disconnectedUserId},player_4_id.eq.${disconnectedUserId}`)
                .eq('status', 'waiting'); // マッチメイキング中のゲームのみを対象

            if (fetchError) {
                console.error(`Error fetching matchmaking games for disconnected user ${disconnectedUserId}:`, fetchError);
                return;
            }

            for (const dbGame of matchmakingGames) {
                // game_data 内の players 配列からも切断したプレイヤーを削除
                const updatedGameDataPlayers = dbGame.game_data.players.filter(p => p.id !== disconnectedUserId);
                dbGame.game_data.players = updatedGameDataPlayers;

                const updateData = { updated_at: new Date(), game_data: dbGame.game_data };

                // ★★★ 修正: 堅牢な切断処理ロジック ★★★
                const remainingPlayerIds = [];
                if (dbGame.player_1_id && dbGame.player_1_id !== disconnectedUserId) remainingPlayerIds.push(dbGame.player_1_id);
                if (dbGame.player_2_id && dbGame.player_2_id !== disconnectedUserId) remainingPlayerIds.push(dbGame.player_2_id);
                if (dbGame.player_3_id && dbGame.player_3_id !== disconnectedUserId) remainingPlayerIds.push(dbGame.player_3_id);
                if (dbGame.player_4_id && dbGame.player_4_id !== disconnectedUserId) remainingPlayerIds.push(dbGame.player_4_id);

                // 新しいプレイヤーリストに基づいてplayer_idを再割り当て（圧縮）
                updateData.player_1_id = remainingPlayerIds[0] || null;
                updateData.player_2_id = remainingPlayerIds[1] || null;
                updateData.player_3_id = remainingPlayerIds[2] || null;
                updateData.player_4_id = remainingPlayerIds[3] || null;

                // 残りのプレイヤー数に応じてstatusを更新
                if (remainingPlayerIds.length === 0) {
                    updateData.status = 'cancelled';
                    console.log(`Matchmaking game ${dbGame.id} has no players left. Setting status to 'cancelled'.`);
                } else {
                    updateData.status = 'waiting';
                    console.log(`Matchmaking game ${dbGame.id} still has players. Setting status to 'waiting'.`);
                }

                const { error: updateError } = await supabase
                    .from('game_states')
                    .update(updateData)
                    .eq('id', dbGame.id);

                if (updateError) {
                    console.error(`Error updating matchmaking game state for game ${dbGame.id}:`, updateError);
                } else {
                    console.log(`Matchmaking game ${dbGame.id} updated in Supabase.`);
                    // 他のプレイヤーに状態更新をブロードキャスト (もしいる場合)
                    if (remainingPlayerIds.length > 0) {
                        io.to(dbGame.id).emit('game-state-update', dbGame.game_data);
                    }
                }
                break; // 該当ゲームを見つけたらループを抜ける
            }
        }
    }
  });

  // クライアントがゲームに参加する
  socket.on('joinGame', async ({ gameId, userId }) => {
    if (userId) {
        userSocketMap.set(userId, socket.id);
    }
    socket.join(gameId);
    console.log(`Player ${userId} (socket ${socket.id}) joined game ${gameId}`);

    // メモリ上にゲーム状態が存在すれば、それを参加者本人に送信する
    const currentState = gameStates[gameId];
    if (currentState) {
        socket.emit('game-state-update', currentState);
        console.log(`Sent existing game state of ${gameId} to player ${userId}`);
    } else {
        // メモリにゲーム状態がなければ、initializeGameイベントによって作成されるのを待つ
        console.log(`No game state in memory for ${gameId}. Waiting for initialization.`);
    }
  });

  // クライアントがマッチメイキングを要求する
  socket.on('requestMatchmaking', async ({ userId, rating, username, avatarUrl }) => {
    console.log(`[1/5] Matchmaking request received from user: ${userId}, rating: ${rating}, socket: ${socket.id}, avatarUrl: ${avatarUrl}`);

    if (!userId || rating === undefined || !username) { // username のチェックを追加
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
            p_avatar_url: avatarUrl // 追加
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

        const { game_id, is_full, players } = matchData[0];
        console.log(`[5/5] Processing match result. Game ID: ${game_id}, Is Full: ${is_full}`);

        if (!players) {
            console.log("Waiting for more players...");
            // プレイヤーが自分しかいない場合、playersはnullになりうるので、自分自身の情報でリストを作成
            const { data: self, error: userError } = await supabase.from('users').select('id, username, avatar_url, rating').eq('id', userId).single();
            if (userError) throw userError;

            if (self) {
                 socket.emit('matchmaking-update', { gameId: game_id, players: [self] });
            }
            return;
        }

        // 参加している全プレイヤーに通知
        for (const player of players) {
            const playerSocketId = userSocketMap.get(player.id);
            if (playerSocketId) {
                const playerSocket = io.sockets.sockets.get(playerSocketId);
                if (playerSocket) {
                    // イベント送信
                    if (is_full) {
                        playerSocket.emit('game-found', { gameId: game_id, players: players });
                    } else {
                        playerSocket.emit('matchmaking-update', { gameId: game_id, players: players });
                    }
                }
            } else {
                console.warn(`Socket ID for player ${player.id} not found in userSocketMap.`);
            }
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
            .from('game_states')
            .select('*')
            .eq('id', gameId)
            .single();

        if (error || !data) {
            console.error(`Error fetching game state for ${gameId} from DB during initializeGame:`, error?.message);
            socket.emit('gameError', { message: 'ゲームのロードに失敗しました。' });
            return; // finallyでロックが解放される
        }
        gameStates[gameId] = Object.assign(createDefaultGameState(), data.game_data);
        console.log(`[Server] Game ${gameId} loaded from DB.`);
      }

      console.log(`Initializing game ${gameId} by user ${userId}`);

      const { data: gameData, error: fetchError } = await supabase
        .from('game_states')
        .select('player_1_id, player_2_id, player_3_id, player_4_id')
        .eq('id', gameId)
        .single();

      if (fetchError || !gameData) {
        throw new Error(`オンラインゲームのプレイヤー情報取得に失敗: ${fetchError?.message}`);
      }

      const playerIds = [gameData.player_1_id, gameData.player_2_id, gameData.player_3_id, gameData.player_4_id].filter(Boolean);

      if (playerIds.length < 4) {
        console.error(`[initializeGame] Not enough players to start game ${gameId}. Required 4, found ${playerIds.length}.`);
        gameStates[gameId].gamePhase = GAME_PHASES.WAITING_TO_START;
        gameStates[gameId].isGameReady = false;
        gameStates[gameId].hasGameStarted = false;
        await supabase.from('game_states').update({ status: 'waiting' }).eq('id', gameId);
        io.to(gameId).emit('game-state-update', gameStates[gameId]);
        socket.emit('gameError', { message: 'プレイヤーが不足しているため、ゲームを開始できません。' });
        return; // finallyでロックが解放される
      }

      const { data: profiles, error: profileError } = await supabase
        .from('users')
        .select('id, username, avatar_url, cat_coins, rating')
        .in('id', playerIds);

      if (profileError || !profiles) {
        throw new Error(`プレイヤーのプロファイル情報取得に失敗: ${profileError?.message}`);
      }

      const initialPlayers = playerIds.map(id => {
            const profile = profiles.find(p => p.id === id);
            return {
              id: id,
              name: profile?.username || 'プレイヤー',
              username: profile?.username || 'プレイヤー',
              avatar_url: profile?.avatar_url || '/assets/images/info/hito_icon_1.png',
              cat_coins: profile?.cat_coins || 0,
              rating: profile?.rating || 1500,
              hand: [], discards: [], melds: [], isDealer: false, score: 50000, seatWind: null,
              stockedTile: null, isUsingStockedTile: false, isStockedTileSelected: false,
              isAi: false,
            };
          });

      gameStates[gameId].players = initialPlayers;

      if (gameStates[gameId].dealerIndex === null) {
        gameStates[gameId].dealerIndex = Math.floor(Math.random() * initialPlayers.length);
        console.log(`[initializeGame] Dealer index set to: ${gameStates[gameId].dealerIndex}`);
      }

      

      console.log(`[initializeGame] Calling _initializeGameCore for game ${gameId}...`);
      _initializeGameCore(gameId);
      console.log(`[initializeGame] _initializeGameCore completed for game ${gameId}. Final gamePhase: ${gameStates[gameId].gamePhase}`);

      // ★追加: 初期化完了後、親プレイヤーにツモを促す
      const dealerId = gameStates[gameId].players[gameStates[gameId].dealerIndex]?.id;
      if (dealerId) {
        console.log(`[Server] Dealer is ${dealerId}. Executing first draw.`);
        await _executeDrawTile(gameId, dealerId);
        await updateAndBroadcastGameState(gameId, gameStates[gameId]);

        // ポップアップは一度表示したらサーバー側の状態はfalseに戻す
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

    // 全員の準備が完了した場合
    if (gameState.playersReadyForNextRound.length >= gameState.players.length) {
      await prepareNextRound(gameId); // prepareNextRoundを呼び出す
    } else {
      // 全員が揃っていない場合は、現在の準備状況をブロードキャスト
      io.to(gameId).emit('game-state-update', gameState);
    }
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

    await _executeDrawTile(gameId, playerId);
    // _executeDrawTile が内部でブロードキャストするため、ここでは不要
  });

  // クライアントがストックした牌を使用することを要求する
  socket.on('useStockedTile', async ({ gameId, playerId }) => {
    const gameState = gameStates[gameId];
    if (!gameState) return socket.emit('gameError', { message: 'ゲームが見つかりません。' });
    if (gameState.currentTurnPlayerId !== playerId) return socket.emit('gameError', { message: 'あなたのターンではありません。' });
    
    const player = gameState.players.find(p => p.id === playerId);
    if (!player || !player.stockedTile) return socket.emit('gameError', { message: 'ストックした牌がありません。' });

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