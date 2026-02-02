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
    const allDiscards = gameState.players.flatMap(p => p.discards);
    const hasFuriTen = tenpaiResult.waits.some(waitTile =>
      allDiscards.some(discard => mahjongLogic.getTileKey(discard) === mahjongLogic.getTileKey(waitTile))
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
        await handleAgari(gameId, winningRonAction.playerId, gameState.lastDiscardedTile, false, gameState.lastActionPlayerId);
      } else if (highestPriorityAction.actionType === 'minkan') {
        await declareMinkan(gameId, highestPriorityAction.playerId, gameState.lastActionPlayerId, highestPriorityAction.tile);
      } else if (highestPriorityAction.actionType === 'pon') {
        await declarePon(gameId, highestPriorityAction.playerId, gameState.lastActionPlayerId, highestPriorityAction.tile);
      }
    } else {
      // 誰もアクションしなかった場合
      if (gameState.actionResponseQueue.length === 0) {
        await moveToNextPlayer(gameId);
        await _executeDrawTile(gameId, gameState.currentTurnPlayerId);
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
    roundWind: gameState.currentRound.wind,
    roundNumber: gameState.currentRound.number,
    honba: gameState.honba,
    doraIndicators: [...gameState.doraIndicators],
    uraDoraIndicators: [...gameState.uraDoraIndicators],
    winningHand: handForWin,
    agariTile: agariTile,
    yakuList: winResult.yaku,
    totalFans: winResult.totalFans,
    fu: winResult.fu,
    score: winResult.score,
    scoreName: winResult.scoreName,
    pointChanges: {},
    isDraw: false,
  };

  const pointChanges = {};
  gameState.players.forEach(p => pointChanges[p.id] = 0);

  if (isTsumo) {
    const dealer = gameState.players.find(p => p.isDealer);
    const nonDealers = gameState.players.filter(p => !p.isDealer);

    if (player.isDealer) {
      const payment = winResult.score.tsumo.nonDealer;
      nonDealers.forEach(p => { pointChanges[p.id] -= payment; });
      pointChanges[player.id] += payment * nonDealers.length;
    } else {
      pointChanges[dealer.id] -= winResult.score.tsumo.dealer;
      nonDealers.forEach(p => {
        if (p.id !== player.id) {
          pointChanges[p.id] -= winResult.score.tsumo.nonDealer;
        }
      });
      pointChanges[player.id] += winResult.score.tsumo.dealer + winResult.score.tsumo.nonDealer * (nonDealers.length - 1);
    }
  } else { // Ron
    pointChanges[ronTargetPlayerId] -= winResult.score.ron;
    pointChanges[player.id] += winResult.score.ron;
  }

  // リーチ棒と本場の精算
  const riichiStickPoints = gameState.riichiSticks * 1000;
  pointChanges[player.id] += riichiStickPoints;
  gameState.riichiSticks = 0;

  const honbaPoints = gameState.honba * 300; // クライアントのロジックに合わせる
  pointChanges[player.id] += honbaPoints;

  gameState.agariResultDetails.pointChanges = pointChanges;

  // 親の連荘・移動の決定
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

  // 点数移動を適用
  applyPointChanges(gameId);

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

    // Apply point changes to scores immediately to determine rank for game end conditions
    for (const playerId in pointChanges) {
        const player = gameState.players.find(p => p.id === playerId);
        if (player) {
            player.score += pointChanges[playerId];
        }
    }

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
  const gameState = gameStates[gameId];
  if (!gameState) return;

  gameState.playersReadyForNextRound = []; // ★局の初期化時に、必ず準備完了リストをリセット

  gameState.turnCount = 0;
  gameState.players.forEach(player => {
    gameState.playerTurnCount[player.id] = 0;
    gameState.isIppatsuChance[player.id] = false;
    gameState.canDeclareRon[player.id] = false;
    gameState.canDeclarePon[player.id] = null;
    gameState.canDeclareMinkan[player.id] = null;
    gameState.canDeclareAnkan[player.id] = null;
    gameState.canDeclareKakan[player.id] = null;
    gameState.playerActionEligibility[player.id] = {};
    gameState.playerResponses = {};
    gameState.waitingForPlayerResponses = [];
    gameState.riichiDiscardOptions = [];
    gameState.actionResponseQueue = [];
    gameState.isDoujunFuriTen[player.id] = false;
    gameState.isFuriTen[player.id] = false;
    gameState.isTenpaiDisplay[player.id] = false;
    gameState.isDeclaringRiichi[player.id] = false;
    gameState.activeActionPlayerId = null;
    gameState.anyPlayerMeldInFirstRound = false;
    gameState.pendingKanDoraReveal = false;
    gameState.animationState = { type: null, playerId: null };
    gameState.riichiDiscardedTileId[player.id] = null;
  });
  gameState.highlightedDiscardTileId = null;
  gameState.rinshanKaihouChance = false;
  gameState.lastActionPlayerId = null;
  gameState.shouldEndGameAfterRound = false;

  const playerCount = gameState.players.length;
  const currentDealerIndex = gameState.dealerIndex;

  gameState.players.forEach((player, index) => {
    player.isDealer = (index === currentDealerIndex);
  });

  const playersWithWinds = mahjongLogic.assignPlayerWinds(
    gameState.players,
    currentDealerIndex,
    playerCount
  );
  gameState.players = playersWithWinds;

  let fullWall = mahjongLogic.getAllTiles();
  fullWall = mahjongLogic.shuffleWall(fullWall);

  const deadWallSize = 14;
  gameState.deadWall = fullWall.slice(0, deadWallSize);
  const liveWallForDealing = fullWall.slice(deadWallSize);

  const initialHandSize = 4;
  const { hands: initialHands, wall: updatedLiveWall } = mahjongLogic.dealInitialHands(playerCount, liveWallForDealing, initialHandSize);
  gameState.wall = updatedLiveWall;

  gameState.players.forEach((player, index) => {
    player.hand = initialHands[index] || [];
    player.discards = [];
    player.melds = [];
    player.isRiichi = false;
    player.isDeclaringRiichi = false;
    player.isDoubleRiichi = false;
    gameState.isDoujunFuriTen[player.id] = false;
  });

  gameState.doraIndicators = [mahjongLogic.revealDora(gameState.deadWall)].filter(Boolean);

  gameState.currentTurnPlayerId = gameState.players[gameState.dealerIndex]?.id;
  gameState.gamePhase = GAME_PHASES.PLAYER_TURN;

  gameState.dealerDeterminationResult.players = gameState.players.map(p => ({
    id: p.id,
    name: p.name,
    avatar_url: p.avatar_url,
    seatWind: p.seatWind,
    isDealer: p.isDealer,
    score: 50000,
    originalId: p.originalId,
  }));

  gameState.showDealerDeterminationPopup = true;
  gameState.isGameReady = true; // ゲームの準備が完了

  await updateAndBroadcastGameState(gameId, gameState);
}

// 次のラウンドの準備を行うヘルパー関数
async function prepareNextRound(gameId) {
  const gameState = gameStates[gameId];
  if (!gameState) return;

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
}

// 他のプレイヤーのアクションを確認するヘルパー関数
function _checkForPlayerActions(gameId, discarderId, discardedTile) {
    const gameState = gameStates[gameId];
    if (!gameState) return false;

    const isFinalAction = gameState.wall.length === 0;
    gameState.waitingForPlayerResponses = [];
    let canAnyoneAct = false;

    gameState.players.forEach(p => {
      if (p.id !== discarderId) {
        const eligibility = {};
        const gameContext = createGameContextForPlayer(gameState, p, false, discardedTile);
        const isPlayerInFuriTen = gameState.isFuriTen[p.id] || gameState.isDoujunFuriTen[p.id];

        if (!isPlayerInFuriTen) {
          const ronResult = mahjongLogic.checkCanRon(p.hand, discardedTile, gameContext);
          eligibility.canRon = ronResult.isWin;
        } else {
          eligibility.canRon = false;
        }

        if (!isFinalAction && gameState.wall.length > 3 && !p.isRiichi && !p.isDoubleRiichi) {
          eligibility.canPon = mahjongLogic.checkCanPon(p.hand, discardedTile) ? discardedTile : null;
          eligibility.canMinkan = mahjongLogic.checkCanMinkan(p.hand, discardedTile) ? discardedTile : null;
        }

        gameState.playerActionEligibility[p.id] = eligibility;

        if (eligibility.canRon || eligibility.canPon || eligibility.canMinkan) {
          canAnyoneAct = true;
          gameState.waitingForPlayerResponses.push(p.id);
        }
      }
    });
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
    gameState.highlightedDiscardTileId = discardedTileActual.id;

    // Step 2: 打牌後のエフェクトを処理する
    if (gameState.isDeclaringRiichi[playerId]) {
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
      } else {
        await handleRyuukyoku(gameId);
      }
    } else {
      if (canAnyoneAct) {
        gameState.gamePhase = GAME_PHASES.AWAITING_ACTION_RESPONSE;
        gameState.playerResponses = {};
        await setNextActiveResponder(gameId);
      } else {
        await moveToNextPlayer(gameId);
        await _executeDrawTile(gameId, gameState.currentTurnPlayerId);
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
                console.log(`Player ${disconnectedUserId} disconnected from active game ${gameId}`);
                
                const updateData = { updated_at: new Date() };

                // ★★★ 修正: 堅牢な切断処理ロジック ★★★
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
                    // ゲームが進行中であれば status は in_progress のまま
                    // waiting 状態のゲームから抜けた場合は waiting に戻す
                    if (game.gamePhase === GAME_PHASES.WAITING_TO_START) {
                        updateData.status = 'waiting';
                        console.log(`Game ${gameId} still has players. Setting status to 'waiting'.`);
                    }
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
    socket.join(gameId); // Socket.ioルームに参加

    // ★★★ 修正: マッチング待機中も必ずDBから最新の状態を読み込む ★★★
    let currentState = gameStates[gameId];
    // メモリにない、またはマッチング待機中のゲームであればDBからロード
    const shouldLoadFromDB = !currentState || currentState.gamePhase === 'waitingToStart';

    if (shouldLoadFromDB) {
      const { data, error } = await supabase
        .from('game_states')
        .select('*')
        .eq('id', gameId)
        .single();

      if (error || !data) {
        console.error(`Error fetching game state for ${gameId}:`, error?.message);
        socket.emit('gameError', { message: 'ゲームのロードに失敗しました。' });
        return;
      }
      // メモリ上の状態を更新
      gameStates[gameId] = data.game_data;
      currentState = data.game_data;
      console.log(`Game ${gameId} loaded/re-loaded from Supabase.`);
    }

    // ★★★ 修正: 競合を避けるため、'game-state-update' は常にブロードキャストする ★★★
    // これにより、joinGameが呼ばれるたびに全プレイヤーのゲーム状態が最新に同期される
    console.log(`Broadcasting state for game ${gameId} to all players in room.`);
    io.to(gameId).emit('game-state-update', currentState);
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

  // クライアントがゲームの初期化を要求する
  socket.on('initializeGame', async ({ gameId, userId }) => {
    if (userId) {
        userSocketMap.set(userId, socket.id);
    }
    if (!gameStates[gameId]) {
      console.error(`Game ${gameId} not found for initialization.`);
      socket.emit('gameError', { message: 'ゲームが見つかりません。' });
      return;
    }

    // 既に初期化済みであれば何もしない
    if (gameStates[gameId].isGameReady) {
      io.to(gameId).emit('game-state-update', gameStates[gameId]);
      return;
    }

    console.log(`Initializing game ${gameId} by user ${userId}`);

    try {
      const { data: gameData, error: fetchError } = await supabase
        .from('game_states')
        .select('player_1_id, player_2_id, player_3_id, player_4_id')
        .eq('id', gameId)
        .single();

      if (fetchError || !gameData) {
        throw new Error(`オンラインゲームのプレイヤー情報取得に失敗: ${fetchError?.message}`);
      }

      const playerIds = [gameData.player_1_id, gameData.player_2_id, gameData.player_3_id, gameData.player_4_id].filter(Boolean);

      const { data: profiles, error: profileError } = await supabase
        .from('users')
        .select('id, username, avatar_url, cat_coins, rating')
        .in('id', playerIds);

      if (profileError || !profiles) {
        throw new Error(`プレイヤーのプロファイル情報取得に失敗: ${profileError?.message}`);
      }

      const initialPlayers = playerIds.map(id => {
            const profile = profiles.find(p => p.id === id);
            // socketId はサーバーサイドで管理されるべき情報であり、クライアントにブロードキャストされる game_data に含めるべきではない
            return {
              id: id,
              name: profile?.username || 'プレイヤー', // name プロパティはそのまま
              username: profile?.username || 'プレイヤー', // username プロパティを追加
              avatar_url: profile?.avatar_url || '/assets/images/info/hito_icon_1.png',
              cat_coins: profile?.cat_coins || 0,
              rating: profile?.rating || 1500,
              hand: [], discards: [], melds: [], isDealer: false, score: 50000, seatWind: null,
              stockedTile: null, isUsingStockedTile: false, isStockedTileSelected: false,
              isAi: false,
            };
          });

      gameStates[gameId].players = initialPlayers; // プレイヤー情報を更新

      await _initializeGameCore(gameId); // コア初期化ロジックを呼び出す

    } catch (error) {
      console.error(`Error initializing game ${gameId}:`, error);
      socket.emit('gameError', { message: 'ゲームの初期化に失敗しました。' });
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
  socket.on('discardTile', async ({ gameId, playerId, tileIdToDiscard, isFromDrawnTile }) => {
    const gameState = gameStates[gameId];
    if (!gameState) return socket.emit('gameError', { message: 'ゲームが見つかりません。' });
    
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return socket.emit('gameError', { message: 'プレイヤーが見つかりません。' });

    if (gameState.currentTurnPlayerId !== playerId) return socket.emit('gameError', { message: 'あなたのターンではありません。' });
    if (gameState.gamePhase !== GAME_PHASES.AWAITING_DISCARD && gameState.gamePhase !== GAME_PHASES.AWAITING_RIICHI_DISCARD) {
      return socket.emit('gameError', { message: '牌を捨てられるフェーズではありません。' });
    }

    try {
        await _processDiscard(gameId, playerId, tileIdToDiscard, isFromDrawnTile);
        await updateAndBroadcastGameState(gameId, gameState);
    } catch (error) {
        console.error(`Error in discardTile for game ${gameId}:`, error);
        socket.emit('gameError', { message: error.message });
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

  // ★修正: 信頼できる送信者情報を元にチャットを転送する
  socket.on('sendChatMessage', ({ gameId, messageId }) => {
    let senderId = null;
    // userSocketMapを逆引きして、ソケットIDからユーザーIDを見つける
    for (const [userId, socketId] of userSocketMap.entries()) {
      if (socketId === socket.id) {
        senderId = userId;
        break;
      }
    }

    if (senderId) {
      // 見つけたユーザーIDを使って、ルームの全員にメッセージを転送
      io.to(gameId).emit('newChatMessage', { playerId: senderId, messageId });
    } else {
      console.error(`Could not find user for socket ${socket.id} to send chat message.`);
    }
  });

});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});