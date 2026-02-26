/**
 * @file 四牌麻雀（よんじゃん！）のコアロジックを定義します。
 * 牌の生成、山牌のシャッフル、配牌、和了判定、役計算など、ゲームのルールに関する純粋な関数を提供します。
 * このモジュールはUIやゲームの状態管理（gameStore）から独立しており、再利用可能なルールセットとして機能します。
 */

// --- 定数定義 ---

/**
 * 牌の種類（スーツ）を表す定数。
 * @property {string} MANZU - 萬子
 * @property {string} PINZU - 筒子
 * @property {string} SOZU - 索子
 * @property {string} JIHAI - 字牌
 */
export const SUITS = { MANZU: 'm', PINZU: 'p', SOZU: 's', JIHAI: 'z' };

/**
 * 字牌のランクを表す定数。
 * @property {number} TON - 東
 * @property {number} NAN - 南
 * @property {number} SHA - 西
 * @property {number} PEI - 北
 * @property {number} HAKU - 白
 * @property {number} HATSU - 發
 * @property {number} CHUN - 中
 */
export const JIHAI_TYPES = { TON: 1, NAN: 2, SHA: 3, PEI: 4, HAKU: 5, HATSU: 6, CHUN: 7 }; // 東南西北白發中

/**
 * プレイヤーの席風を表す定数。
 * @property {string} EAST - 東家
 * @property {string} SOUTH - 南家
 * @property {string} WEST - 西家
 * @property {string} NORTH - 北家
 */
export const PLAYER_WINDS = { EAST: '東', SOUTH: '南', WEST: '西', NORTH: '北' };

// 席風の割り当て順序
const WIND_ORDER = [PLAYER_WINDS.EAST, PLAYER_WINDS.SOUTH, PLAYER_WINDS.WEST, PLAYER_WINDS.NORTH];

// --- ゲーム準備関連の関数 ---

/**
 * 四牌麻雀で使用する全ての牌（136枚）のリストを生成します。
 * 各牌は `suit`, `rank`, `id` を持ちます。
 * @returns {Array<Object>} 全ての牌の配列。
 */
export function getAllTiles() {
  const tiles = [];

  // 萬子(m), 筒子(p), 索子(s) の1から9までを各4枚生成
  [SUITS.MANZU, SUITS.PINZU, SUITS.SOZU].forEach(suit => {
      // [SUITS.MANZU].forEach(suit => {
    for (let rank = 1; rank <= 9; rank++) {
      for (let i = 0; i < 4; i++) {
        tiles.push({
          suit,
          rank,
          id: `${suit}${rank}_${i}`, // 例: m1_0, m1_1, m1_2, m1_3
        });
      }
    }
  });

  // 字牌 (東南西北白發中) を各4枚生成
  Object.values(JIHAI_TYPES).forEach(rank => {
    for (let i = 0; i < 4; i++) {
      tiles.push({
        suit: SUITS.JIHAI,
        rank,
        id: `${SUITS.JIHAI}${rank}_${i}`, // 例: z1_0 (東), z5_0 (白)
      });
    }
  });

  return tiles;
}

/**
 * 王牌から初期ドラ表示牌を取得します。
 * このゲームのルールでは、王牌の固定された位置（5枚目）をドラ表示牌とします。
 * @param {Array<Object>} deadWall - 王牌の配列（14枚）。
 * @returns {Array<Object>} ドラ表示牌を含む配列（要素は1つ）。王牌が足りない場合は空配列。
 */
export function getDoraIndicators(deadWall) {
  if (!deadWall || deadWall.length === 0) {
    return [];
  }
  // このゲームでは、王牌の5枚目（インデックス4）を最初のドラ表示牌とする
  const initialDoraIndicatorIndex = 4;
  if (deadWall.length > initialDoraIndicatorIndex) {
    return [deadWall[initialDoraIndicatorIndex]];
  }
  // 王牌が足りない場合は空を返す
  return [];
}

/**
 * 牌の山をシャッフルします（Fisher-Yatesアルゴリズム）。
 * @param {Array<Object>} wall - シャッフル対象の牌山。
 * @returns {Array<Object>} シャッフルされた新しい牌山の配列。
 */
export function shuffleWall(wall) {
  const shuffledWall = [...wall]; // 元の配列をコピーしてシャッフル
  for (let i = shuffledWall.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledWall[i], shuffledWall[j]] = [shuffledWall[j], shuffledWall[i]];
  }
  return shuffledWall;
}

/**
 * 指定されたプレイヤー数と手牌の枚数で初期手牌を配ります。
 * @param {number} playerCount - プレイヤー数。
 * @param {Array<Object>} wall - 配牌元の山牌。この関数内で消費されます。
 * @param {number} handSize - 各プレイヤーの手牌の枚数。
 * @returns {{hands: Array<Array<Object>>, wall: Array<Object>}} 各プレイヤーの手牌と、配牌後の残りの山牌。
 */
export function dealInitialHands(playerCount, wall, handSize) {
  const hands = Array.from({ length: playerCount }, () => []);
  for (let i = 0; i < handSize; i++) {
    for (let j = 0; j < playerCount; j++) {
      if (wall.length > 0) {
        hands[j].push(wall.pop());
      } else {
        console.warn("配牌中に山牌が不足しました。");
        return { hands, wall }; // 山が尽きたら現在の状態で終了
      }
    }
  }
  // 各プレイヤーの手牌をソート
  hands.forEach(hand => sortHand(hand));
  return { hands, wall };
}

/**
 * カン成立時に、王牌から新しいドラ表示牌をめくります。
 * @param {Array<Object>} deadWall - 王牌の配列。
 * @returns {Object|null} 新しく表示されたドラ表示牌。めくる牌がない場合はnull。
 */
export function revealDora(deadWall) {
  // 王牌14枚の構成: [嶺上1,嶺上2,嶺上3,嶺上4, 表1,裏1, 表2,裏2, 表3,裏3, 表4,裏4, 予備,予備]
  // ドラ表示牌は 表1, 表2, 表3, 表4 の位置からめくられる
  const doraIndicatorPositions = [4, 6, 8, 10]; // 0-indexed
  const revealedCount = deadWall.filter(t => t.isDoraIndicator).length;

  if (revealedCount < doraIndicatorPositions.length && deadWall.length > doraIndicatorPositions[revealedCount]) {
    const newDoraIndicator = deadWall[doraIndicatorPositions[revealedCount]];
    newDoraIndicator.isDoraIndicator = true; // isDoraIndicatorプロパティを立てておく
    return newDoraIndicator;
  }
  console.warn("新しいドラ表示牌をめくるための十分な王牌がありません、または最大数です。");
  return null;
}

/**
 * 手牌をルールに従ってソートします。
 * ソート順: 萬子 → 筒子 → 索子 → 字牌。各種類の中ではランク昇順。
 * @param {Array<Object>} hand - ソートする手牌。
 * @returns {Array<Object>} ソートされた手牌。
 */
export function sortHand(hand) {
  const suitOrder = { [SUITS.MANZU]: 0, [SUITS.PINZU]: 1, [SUITS.SOZU]: 2, [SUITS.JIHAI]: 3 };
  return hand.sort((a, b) => {
    if (a.suit !== b.suit) {
      return suitOrder[a.suit] - suitOrder[b.suit];
    }
    return a.rank - b.rank;
  });
}

// --- プレイヤーアクション関連の関数 ---

/**
 * プレイヤーに席風（東南西北）を割り当てます。
 * 親（dealerIndex）が東となり、反時計回りに南、西、北と割り振られます。
 * @param {Array<Object>} players - プレイヤーオブジェクトの配列。
 * @param {number} dealerIndex - 親となるプレイヤーのインデックス。
 * @param {number} [playerCount=4] - プレイヤーの総数。
 * @returns {Array<Object>} 各プレイヤーに `seatWind` プロパティが追加された新しいプレイヤー配列。
 */
export function assignPlayerWinds(players, dealerIndex, playerCount = 4) {
  // 元のプレイヤー配列を変更しないようにコピーを作成
  const updatedPlayers = players.map(player => ({ ...player }));

  for (let i = 0; i < playerCount; i++) {
    // 親から数えてi番目のプレイヤーの実際のインデックスを計算
    const playerActualIndex = (dealerIndex + i) % playerCount;
    updatedPlayers[playerActualIndex].seatWind = WIND_ORDER[i];
  }
  return updatedPlayers;
}

/**
 * 嶺上牌をツモります。
 * @param {Array<Object>} wall - 山牌の配列。
 * @returns {Object|null} 嶺上牌。山牌がない場合はnull。
 */
export function drawRinshanTile(wall) {
  // 本来、嶺上牌は王牌の特定の位置から取りますが、この実装では簡略化のため山牌の末尾から取得します。
  if (wall && wall.length > 0) {
    return wall.pop();
  }
  console.warn("嶺上牌を取得できませんでした。山牌が空です。");
  return null;
}

/**
 * 指定された捨て牌でロン和了が可能か判定します。
 * @param {Array<Object>} hand - 現在の手牌（4枚）。
 * @param {Object} discardedTile - ロン対象の捨て牌。
 * @param {Object} gameContext - 役判定に必要なゲームコンテキスト。
 * @returns {Object} 和了情報を格納したオブジェクト。詳細は `checkYonhaiWin` を参照。
 */
export function checkCanRon(hand, discardedTile, gameContext) {
  if (!hand || !discardedTile) {
    return { isWin: false, yaku: [], score: 0, fans: 0, isYakuman: false, yakumanPower: 0 };
  }
  // ロン和了なので、isTsumoフラグはfalse
  const handForWin = [...hand, discardedTile];
  return checkYonhaiWin(handForWin, discardedTile, false, gameContext);
}

/**
 * 指定されたツモ牌でツモ和了が可能か判定します。
 * @param {Array<Object>} hand - 現在の手牌（4枚）。
 * @param {Object} drawnTile - ツモってきた牌。
 * @param {Object} gameContext - 役判定に必要なゲームコンテキスト。
 * @returns {Object} 和了情報を格納したオブジェクト。詳細は `checkYonhaiWin` を参照。
 */
export function checkCanTsumo(hand, drawnTile, gameContext) {
  if (!hand || !drawnTile) {
    return { isWin: false, yaku: [], score: 0, fans: 0, isYakuman: false, yakumanPower: 0 };
  }
  // ツモ和了なので、isTsumoフラグはtrue
  const handForWin = [...hand, drawnTile];
  return checkYonhaiWin(handForWin, drawnTile, true, gameContext);
}

/**
 * 役を考慮せず、和了の基本形（1面子1雀頭）が成立するかどうかを判定します。
 * テンパイ判定などで高速なチェックが必要な場合に使用します。
 * @param {Array<Object>} hand - 手牌（4枚）。
 * @param {Object} targetTile - 和了牌と仮定する牌。
 * @param {Array<Object>} [melds=[]] - 鳴きの情報。
 * @returns {boolean} 和了形が成立すればtrue。
 */
export function canWinBasicShape(hand, targetTile, melds = []) {
  if (!hand || !targetTile) {
    return false;
  }
  const handForCheck = [...hand, targetTile];

  // 鳴きがある場合、残りの手牌が雀頭を形成するかどうかで判定
  if (melds.length > 0) {
    return handForCheck.length === 2 && getTileKey(handForCheck[0]) === getTileKey(handForCheck[1]);
  }
  // 門前の場合、5枚の手牌で和了形を判定
  else {
    if (handForCheck.length === 5) {
      const basicWinInfo = checkBasicYonhaiWinCondition(sortHand(handForCheck));
      return basicWinInfo.isWin;
    }
  }
  return false;
}

/**
 * 指定された捨て牌でポンが可能かチェックします。
 * @param {Array<Object>} hand - 手牌。
 * @param {Object} discardedTile - 他家から捨てられた牌。
 * @returns {boolean} ポン可能ならtrue。
 */
export function checkCanPon(hand, discardedTile) {
  if (!discardedTile) return false;
  // 手牌に同じ牌が2枚以上あればポン可能
  const count = hand.filter(tile => getTileKey(tile) === getTileKey(discardedTile)).length;
  return count >= 2;
}

/**
 * 指定された捨て牌で明槓（大明槓）が可能かチェックします。
 * @param {Array<Object>} hand - 手牌。
 * @param {Object} discardedTile - 他家から捨てられた牌。
 * @returns {boolean} 明槓可能ならtrue。
 */
export function checkCanMinkan(hand, discardedTile) {
  if (!discardedTile) return false;
  // 手牌に同じ牌が3枚あれば明槓可能
  const count = hand.filter(tile => getTileKey(tile) === getTileKey(discardedTile)).length;
  return count >= 3;
}

/**
 * 暗槓が可能かチェックします。
 * @param {Array<Object>} hand - 手牌。
 * @param {Object} drawnTile - ツモってきた牌。
 * @returns {Array<Object>} 暗槓可能な牌の配列。なければ空配列。
 */
export function checkCanAnkan(hand, drawnTile, gameContext = {}) {
  if (gameContext.isUsingStockedTile) {
    return [];
  }
  const ankanableTiles = [];
  const fullHand = drawnTile ? [...hand, drawnTile] : [...hand];
  const counts = {};
  fullHand.forEach(tile => {
    if (!tile) return;
    const key = getTileKey(tile);
    counts[key] = (counts[key] || 0) + 1;
  });

  // 4枚揃っている牌を探す
  for (const key in counts) {
    if (counts[key] === 4) {
      const tile = fullHand.find(t => getTileKey(t) === key);
      if (tile) ankanableTiles.push(tile);
    }
  }
  return ankanableTiles;
}

/**
 * 加槓（カカン）が可能かチェックします。
 * @param {Array<Object>} hand - 手牌。
 * @param {Array<Object>} melds - 既にポンしている鳴きの情報。
 * @param {Object|null} drawnTile - ツモってきた牌。
 * @returns {Array<Object>} 加槓可能な牌の配列。なければ空配列。
 */
export function checkCanKakan(hand, melds, drawnTile, gameContext = {}) {
    if (gameContext.isUsingStockedTile) {
        return [];
    }
    const kakanableTiles = [];
    if (!melds || melds.length === 0) {
        return kakanableTiles;
    }

    const fullHand = drawnTile ? [...hand, drawnTile] : [...hand];
    if (fullHand.length === 0) {
        return kakanableTiles;
    }

    const ponMelds = melds.filter(meld => meld.type === 'pon');

    for (const ponMeld of ponMelds) {
        const ponKey = getTileKey(ponMeld.tiles[0]);
        // 手牌（ツモ牌含む）の中に、ポンしている牌と同じ牌があるか探す
        const tileInHand = fullHand.find(tile => getTileKey(tile) === ponKey);
        if (tileInHand && !kakanableTiles.some(t => getTileKey(t) === ponKey)) {
            kakanableTiles.push(tileInHand);
        }
    }

    return kakanableTiles;}

// --- 役の定義 ---

/**
 * 四牌麻雀の通常役を定義したオブジェクト。
 * @property {string} key - i18nのキーと一致する内部的なキー。
 * @property {string} name - 日本語の役名。
 * @property {number} fans - 門前清（メンゼン）の場合の基本翻数。
 * @property {boolean} menzenOnly - 門前でのみ成立する役かどうかのフラグ。
 * @property {number} [kuisagari] - 鳴いた（副露した）場合に下がる翻数。
 * @property {Array<Object>|null} exampleTiles - 役の例を示す牌の配列。UI表示用。
 */
export const YONHAI_YAKU = {
  REACH: { key: "riichi", name: "立直", fans: 1, menzenOnly: true, exampleTiles: null },
  TSUMO: { key: "tsumo", name: "門前清自摸和", fans: 1, menzenOnly: true, exampleTiles: null },
  TANYAO: { key: "tanyao", name: "断么九", fans: 1, menzenOnly: false, exampleTiles: [{suit:'m',rank:2},{suit:'m',rank:3},{suit:'m',rank:4},{suit:'p',rank:5},{suit:'p',rank:5}] },
  PINFU: { key: "pinfu", name: "平和", fans: 1, menzenOnly: true, exampleTiles: [{suit:'m',rank:9},{suit:'m',rank:9},{suit:'s',rank:5},{suit:'s',rank:6},{suit:'s',rank:7}] },
  JIKAZE: { key: "jikaze", name: "自風牌", fans: 1, menzenOnly: false, exampleTiles: [{suit:'m',rank:2},{suit:'m',rank:2},{suit:'z',rank:JIHAI_TYPES.SHA},{suit:'z',rank:JIHAI_TYPES.SHA},{suit:'z',rank:JIHAI_TYPES.SHA}] },
  BAKAZE: { key: "bakaze", name: "場風牌", fans: 1, menzenOnly: false, exampleTiles: [{suit:'m',rank:2},{suit:'m',rank:2},{suit:'z',rank:JIHAI_TYPES.TON},{suit:'z',rank:JIHAI_TYPES.TON},{suit:'z',rank:JIHAI_TYPES.TON}] },
  SANGENPAI: { key: "sangenpai", name: "三元牌", fans: 1, menzenOnly: false, exampleTiles: [{suit:'s',rank:4},{suit:'s',rank:4},{suit:'z',rank:JIHAI_TYPES.HAKU},{suit:'z',rank:JIHAI_TYPES.HAKU},{suit:'z',rank:JIHAI_TYPES.HAKU}] },
  CHANKAN: { key: "chankan", name: "槍槓", fans: 1, menzenOnly: false, exampleTiles: null },
  HAITEI_RAOYUE: { key: "haiteiRaoyue", name: "海底摸月", fans: 1, menzenOnly: false, exampleTiles: null },
  HOUTEI_RAOYUI: { key: "houteiRaoyui", name: "河底撈魚", fans: 1, menzenOnly: false, exampleTiles: null },
  IPPATSU: { key: "ippatsu", name: "一発", fans: 1, menzenOnly: true, exampleTiles: null }, // リーチが成立していることが前提
  DOUBLE_REACH: { key: "doubleRiichi", name: "ダブル立直", fans: 2, menzenOnly: true, exampleTiles: null },
  SANGEN_DOUKOU: { key: "sanshokuDoukou", name: "三色同刻", fans: 2, menzenOnly: false, exampleTiles: [{suit:'m',rank:2},{suit:'m',rank:2},{suit:'m',rank:5},{suit:'p',rank:5},{suit:'s',rank:5}] },
  TOITOI: { key: "toitoi", name: "対々和", fans: 2, menzenOnly: false, exampleTiles: [{suit:'m',rank:7},{suit:'m',rank:7},{suit:'p',rank:8},{suit:'p',rank:8},{suit:'p',rank:8}] },
  IIANKOU: { key: "iiankou", name: "一暗刻", fans: 2, menzenOnly: false, exampleTiles: [{suit:'m',rank:7},{suit:'m',rank:7},{suit:'m',rank:7},{suit:'p',rank:8},{suit:'p',rank:8}] }, // 三暗刻の代用役
  HONROUTOU: { key: "honroutou", name: "混老頭", fans: 2, menzenOnly: false, exampleTiles: [{suit:'p',rank:1},{suit:'p',rank:1},{suit:'p',rank:1},{suit:'z',rank:JIHAI_TYPES.NAN},{suit:'z',rank:JIHAI_TYPES.NAN}] },
  CHANTA: { key: "chanta", name: "混全帯么九", fans: 2, menzenOnly: false, kuisagari: 1, exampleTiles: [{suit:'m',rank:7},{suit:'m',rank:8},{suit:'m',rank:9},{suit:'z',rank:JIHAI_TYPES.PEI},{suit:'z',rank:JIHAI_TYPES.PEI}] },
  JUNCHAN: { key: "junchan", name: "純全帯么九", fans: 3, menzenOnly: false, kuisagari: 1, exampleTiles: [{suit:'m',rank:7},{suit:'m',rank:8},{suit:'m',rank:9},{suit:'s',rank:1},{suit:'s',rank:1}] },
  HONITSU: { key: "honitsu", name: "混一色", fans: 3, menzenOnly: false, kuisagari: 1, exampleTiles: [{suit:'s',rank:1},{suit:'s',rank:2},{suit:'s',rank:3},{suit:'z',rank:JIHAI_TYPES.HATSU},{suit:'z',rank:JIHAI_TYPES.HATSU}] },
  CHINITSU: { key: "chinitsu", name: "清一色", fans: 4, menzenOnly: false, kuisagari: 1, exampleTiles: [{suit:'s',rank:1},{suit:'s',rank:2},{suit:'s',rank:3},{suit:'s',rank:8},{suit:'s',rank:8}] },
  // ドラ・裏ドラは状況に応じて翻数が変動するため、ここでは基本翻数を0に設定
  DORA: { key: "dora", name: "ドラ", fans: 0, menzenOnly: false },
  URA_DORA: { key: "uraDora", name: "裏ドラ", fans: 0, menzenOnly: true },
};

/**
 * 四牌麻雀の役満を定義したオブジェクト。
 * @property {string} key - i18nのキーと一致する内部的なキー。
 * @property {string} name - 日本語の役名。
 * @property {number} power - 役満の倍率（例: 1倍役満、2倍役満）。
 * @property {Array<Object>|null} exampleTiles - 役の例を示す牌の配列。UI表示用。
 */
export const YONHAI_YAKUMAN = {
  TENHOU: { key: "tenhou", name: "天和", power: 1, exampleTiles: null },
  CHIHOU: { key: "chihou", name: "地和", power: 1, exampleTiles: null },
  RENHOU: { key: "renhou", name: "人和", power: 1, exampleTiles: null },
  DAISANGEN: { key: "daisangen", name: "大三元", power: 1, exampleTiles: [{suit:'p',rank:4},{suit:'p',rank:4},{suit:'z',rank:JIHAI_TYPES.HAKU},{suit:'z',rank:JIHAI_TYPES.HATSU},{suit:'z',rank:JIHAI_TYPES.CHUN}] }, // 特殊形: 白・發・中 + 任意の雀頭
  TSUIISOU: { key: "tsuiisou", name: "字一色", power: 1, exampleTiles: [{suit:'z',rank:JIHAI_TYPES.TON},{suit:'z',rank:JIHAI_TYPES.TON},{suit:'z',rank:JIHAI_TYPES.TON},{suit:'z',rank:JIHAI_TYPES.NAN},{suit:'z',rank:JIHAI_TYPES.NAN}] },
  RYUIISOU: { key: "ryuiisou", name: "緑一色", power: 1, exampleTiles: [{suit:'s',rank:2},{suit:'s',rank:3},{suit:'s',rank:4},{suit:'s',rank:6},{suit:'s',rank:6}] }, // 緑の牌（索子の2,3,4,6,8と發）のみで構成
  CHINROUTOU: { key: "chinroutou", name: "清老頭", power: 1, exampleTiles: [{suit:'m',rank:1},{suit:'m',rank:1},{suit:'s',rank:9},{suit:'s',rank:9},{suit:'s',rank:9}] },
  IIKANTSU: { key: "iikantsu", name: "一槓子", power: 1, exampleTiles: [{suit:'m',rank:8},{suit:'m',rank:8},{suit:'z',rank:JIHAI_TYPES.HAKU},{suit:'z',rank:JIHAI_TYPES.HAKU},{suit:'z',rank:JIHAI_TYPES.HAKU},{suit:'z',rank:JIHAI_TYPES.HAKU}] }, // 四槓子の代用役
  SHOUSUUSHI: { key: "shousuushi", name: "小四喜", power: 1, exampleTiles: [{suit:'z',rank:JIHAI_TYPES.TON},{suit:'z',rank:JIHAI_TYPES.NAN},{suit:'z',rank:JIHAI_TYPES.NAN},{suit:'z',rank:JIHAI_TYPES.SHA},{suit:'z',rank:JIHAI_TYPES.PEI}] }, // 特殊形: 3種の風牌 + 残り1種の風牌の雀頭
  DAISUUSHI: { key: "daisuushi", name: "大四喜", power: 2, exampleTiles: [{suit:'z',rank:JIHAI_TYPES.TON},{suit:'z',rank:JIHAI_TYPES.NAN},{suit:'z',rank:JIHAI_TYPES.SHA},{suit:'z',rank:JIHAI_TYPES.PEI},{suit:'z',rank:JIHAI_TYPES.PEI}] }, // 特殊形: 4種の風牌 + いずれかの風牌の雀頭
  IIANKOU_TANKI: { key: "iiankanTanki", name: "一暗槓単騎", power: 2, exampleTiles: [{suit:'m',rank:8},{suit:'m',rank:8},{suit:'z',rank:JIHAI_TYPES.HAKU},{suit:'z',rank:JIHAI_TYPES.HAKU},{suit:'z',rank:JIHAI_TYPES.HAKU},{suit:'z',rank:JIHAI_TYPES.HAKU}] } // 四暗刻単騎の代用役
};

/**
 * 牌オブジェクトから一意のキー文字列（例: "m1"）を生成します。
 * @param {Object} tile - 牌オブジェクト。
 * @returns {string} 牌のキー文字列。
 */
export function getTileKey(tile) {
  if (!tile) return '';
  return `${tile.suit}${tile.rank}`;
}

/**
 * 手牌中の特定の牌の数をカウントします。
 * @param {Array<Object>} hand - 手牌の配列。
 * @param {Object} targetTile - カウント対象の牌。
 * @returns {number} 手牌に含まれる対象の牌の数。
 */
function countSpecificTile(hand, targetTile) {
  const targetKey = getTileKey(targetTile);
  return hand.filter(tile => getTileKey(tile) === targetKey).length;
}

/**
 * 四牌麻雀の基本的な和了形を判定します。
 * (1面子 + 1雀頭)
 * 役の判定は別途行う必要があります。
 * @param {Array<Object>} hand5tiles - 手牌5枚 (ソートされていることが望ましいが、内部でソートも考慮)
 * @returns {{isWin: boolean, mentsuType: string|null, jantou: Array<Object>|null, mentsu: Array<Object>|null}} 和了情報
 */
export function checkBasicYonhaiWinCondition(hand5tiles) {
  // 手牌が5枚でなければ和了形ではない
  if (!hand5tiles || hand5tiles.length !== 5) {
    return { isWin: false, mentsuType: null, jantou: null, mentsu: null };
  }

  // 手牌中の各牌の出現回数をカウント
  const counts = {};
  hand5tiles.forEach(tile => {
    const key = getTileKey(tile);
    counts[key] = (counts[key] || 0) + 1;
  });

  // --- 1. 雀頭を仮定して面子を探すパターン ---
  // 手牌中のユニークな牌の種類を取得
  const uniqueTileKeysInHand = Array.from(new Set(hand5tiles.map(t => getTileKey(t))));

  // 各ユニークな牌を雀頭候補として試す
  for (const jantouCandidateKey of uniqueTileKeysInHand) {
    // 雀頭候補が2枚以上ある場合
    if (counts[jantouCandidateKey] >= 2) {
      // 雀頭を構成する2枚の牌を取得
      const jantou = hand5tiles.filter(t => getTileKey(t) === jantouCandidateKey).slice(0, 2);

      // 雀頭を除いた残りの3牌を取得
      const remainingForMentsuCandidate = [];
      let jantouRemovedCount = 0;
      for (const tile of hand5tiles) {
        if (getTileKey(tile) === jantouCandidateKey && jantouRemovedCount < 2) {
          jantouRemovedCount++;
        } else {
          remainingForMentsuCandidate.push(tile);
        }
      }

      // 残りの3牌が面子（順子または刻子）を形成するかチェック
      if (remainingForMentsuCandidate.length === 3) {
        const sortedMentsuCandidate = sortHand(remainingForMentsuCandidate); // 面子候補をソート

        // 順子判定 (字牌は順子にならない)
        if (
          sortedMentsuCandidate[0].suit !== SUITS.JIHAI &&
          sortedMentsuCandidate[0].suit === sortedMentsuCandidate[1].suit &&
          sortedMentsuCandidate[1].suit === sortedMentsuCandidate[2].suit &&
          sortedMentsuCandidate[1].rank === sortedMentsuCandidate[0].rank + 1 &&
          sortedMentsuCandidate[2].rank === sortedMentsuCandidate[1].rank + 1
        ) {
          return { isWin: true, mentsuType: 'shuntsu', jantou: jantou, mentsu: sortedMentsuCandidate };
        }

        // 刻子判定
        if (
          getTileKey(sortedMentsuCandidate[0]) === getTileKey(sortedMentsuCandidate[1]) &&
          getTileKey(sortedMentsuCandidate[1]) === getTileKey(sortedMentsuCandidate[2])
        ) {
          return { isWin: true, mentsuType: 'koutsu', jantou: jantou, mentsu: sortedMentsuCandidate };
        }
      }
    }
  }

  // --- 2. 面子を仮定して雀頭を探すパターン ---
  // 5枚の手牌から3枚を選び、それが面子を形成するかチェック
  for (let i = 0; i < hand5tiles.length; i++) {
    for (let j = i + 1; j < hand5tiles.length; j++) {
      for (let k = j + 1; k < hand5tiles.length; k++) {
        const mentsuCandidate = sortHand([hand5tiles[i], hand5tiles[j], hand5tiles[k]]);
        let isMentsu = false;
        let mentsuType = null;

        // 刻子判定
        if (getTileKey(mentsuCandidate[0]) === getTileKey(mentsuCandidate[1]) && getTileKey(mentsuCandidate[1]) === getTileKey(mentsuCandidate[2])) {
          isMentsu = true; mentsuType = 'koutsu';
        }
        // 順子判定
        if (!isMentsu && mentsuCandidate[0].suit !== SUITS.JIHAI && mentsuCandidate[0].suit === mentsuCandidate[1].suit && mentsuCandidate[1].suit === mentsuCandidate[2].suit &&
            mentsuCandidate[1].rank === mentsuCandidate[0].rank + 1 && mentsuCandidate[2].rank === mentsuCandidate[1].rank + 1) {
          isMentsu = true; mentsuType = 'shuntsu';
        }

        // 面子が成立した場合、残りの2牌が雀頭を形成するかチェック
        if (isMentsu) {
          const remainingForJantou = hand5tiles.filter((tile, index) => index !== i && index !== j && index !== k);
          if (remainingForJantou.length === 2 && getTileKey(remainingForJantou[0]) === getTileKey(remainingForJantou[1])) {
            return { isWin: true, mentsuType: mentsuType, jantou: remainingForJantou, mentsu: mentsuCandidate };
          }
        }
      }
    }
  }

  // --- 3. 特殊な役満の形を判定 (1面子1雀頭の標準形以外で和了とみなす形) ---

  // 大三元 (白發中各1枚 + 任意の雀頭2枚) の判定
  const hasHaku = hand5tiles.some(t => t.suit === SUITS.JIHAI && t.rank === JIHAI_TYPES.HAKU);
  const hasHatsu = hand5tiles.some(t => t.suit === SUITS.JIHAI && t.rank === JIHAI_TYPES.HATSU);
  const hasChun = hand5tiles.some(t => t.suit === SUITS.JIHAI && t.rank === JIHAI_TYPES.CHUN);
  if (hasHaku && hasHatsu && hasChun) {
    // 白發中が各1枚以上あることを確認し、それらを除いた残りの2枚が雀頭を形成するかチェック
    const sangenTileObjects = [
      { suit: SUITS.JIHAI, rank: JIHAI_TYPES.HAKU },
      { suit: SUITS.JIHAI, rank: JIHAI_TYPES.HATSU },
      { suit: SUITS.JIHAI, rank: JIHAI_TYPES.CHUN },
    ];
    let sangenCount = 0;
    const tempHandForSangenCheck = [...hand5tiles];
    for (const st of sangenTileObjects) {
      const idx = tempHandForSangenCheck.findIndex(t => getTileKey(t) === getTileKey(st));
      if (idx > -1) {
        sangenCount++;
        tempHandForSangenCheck.splice(idx, 1); // 見つかった三元牌を除外
      }
    }

    if (sangenCount === 3 && tempHandForSangenCheck.length === 2 && getTileKey(tempHandForSangenCheck[0]) === getTileKey(tempHandForSangenCheck[1])) {
      // 白發中が各1枚あり、残りの2枚が雀頭
      return { isWin: true, mentsuType: 'daisangen_special', jantou: tempHandForSangenCheck, mentsu: sangenTileObjects };
    }
  }

  // 小四喜・大四喜の判定 (四牌麻雀の特殊な形)
  const windTiles = [JIHAI_TYPES.TON, JIHAI_TYPES.NAN, JIHAI_TYPES.SHA, JIHAI_TYPES.PEI];
  let windCounts = {};
  windTiles.forEach(wt => windCounts[wt] = 0);
  hand5tiles.forEach(t => {
    if (t.suit === SUITS.JIHAI && windTiles.includes(t.rank)) {
      windCounts[t.rank]++;
    }
  });
  const distinctPresentWinds = Object.keys(windCounts).filter(key => windCounts[key] > 0).length;
  let jantouWindKey = null;
  let koutsuWindKeys = []; // このゲームでは刻子ではなく、単一の風牌が3枚ある場合を想定

  for (const key in windCounts) {
    if (windCounts[key] >= 2) jantouWindKey = key; // 雀頭候補の風牌
    if (windCounts[key] >= 3) koutsuWindKeys.push(key); // 刻子候補の風牌 (大四喜の面子部分)
  }

  // 大四喜or小四喜: 4種類の風牌が全て手牌にあり、そのうち1種類が雀頭で、他3種類が各1枚
  // 例: 東東南西北 (東が雀頭、南西北が単牌)
  if (distinctPresentWinds === 4 && jantouWindKey && koutsuWindKeys.length === 0) {
    return { isWin: true, mentsuType: 'shousuushi_special', jantou: hand5tiles.filter(t => getTileKey(t) === jantouWindKey).slice(0,2), mentsu: null };
  }

  // --- 4. 特殊な役の形を判定 (三色同刻) ---
  const sanshokuCounts = { ...counts }; // 最初に計算した牌の出現回数をコピー
  for (let rank = 1; rank <= 9; rank++) {
    const manKey = `m${rank}`;
    const pinKey = `p${rank}`;
    const souKey = `s${rank}`;

    // 萬子、筒子、索子で同じランクの牌がそれぞれ1枚以上ある場合
    if (sanshokuCounts[manKey] >= 1 && sanshokuCounts[pinKey] >= 1 && sanshokuCounts[souKey] >= 1) {
      const tempCounts = { ...sanshokuCounts };
      tempCounts[manKey]--; // 1枚ずつ消費
      tempCounts[pinKey]--;
      tempCounts[souKey]--;

      // 残りの2牌が雀頭を形成するかチェック
      const remainingKeys = Object.keys(tempCounts).filter(key => tempCounts[key] > 0);
      if (remainingKeys.length === 1 && tempCounts[remainingKeys[0]] === 2) {
        const jantouTileKey = remainingKeys[0];
        const jantou = hand5tiles.filter(t => getTileKey(t) === jantouTileKey);
        
        // 三色同刻の構成牌を重複なく抽出
        const sanshokuTiles = [
            hand5tiles.find(t => getTileKey(t) === manKey),
            hand5tiles.find(t => getTileKey(t) === pinKey),
            hand5tiles.find(t => getTileKey(t) === souKey),
        ];

        return { isWin: true, mentsuType: 'sanshoku_special', jantou: jantou, mentsu: sanshokuTiles };
      }
    }
  }

  // どの和了形にも当てはまらない場合
  return { isWin: false, mentsuType: null, jantou: null, mentsu: null };
}

/**
 * 四牌麻雀の役判定を行う
 * @param {Object} handData - 役判定に必要なデータオブジェクト
 * @param {Array<Object>} handData.hand - 和了時の手牌5枚 (ソート済み)
 * @param {Object} handData.winTile - 和了牌
 * @param {boolean} handData.isTsumo - ツモ和了か
 * @param {Array<Object>} handData.melds - 副露 (四牌麻雀ではポン・カンのみ)
 * @param {string} handData.playerWind - 自風 (PLAYER_WINDSの値)
 * @param {string} handData.roundWind - 場風 (PLAYER_WINDSの値)
 * @param {Array<Object>} handData.doraIndicators - ドラ表示牌
 * @param {Array<Object>} handData.uraDoraIndicators - 裏ドラ表示牌
 * @param {boolean} handData.isParent - 親かどうか
 * @param {number} handData.turnCount - 現在の巡目 (人和などの判定用)
 * @param {Object} handData.basicWinInfo - checkBasicYonhaiWinConditionの結果
 * @param {boolean} handData.isRiichi - リーチしているか
 * @param {boolean} handData.isDoubleRiichi - ダブルリーチしているか
 * @param {boolean} handData.isIppatsu - 一発の可能性があるか (リーチ後1巡以内、かつ他家からの鳴きなし)
 * @param {boolean} handData.isHaitei - 海底牌での和了か
 * @param {boolean} handData.isHoutei - 河底牌での和了か
 * @param {boolean} handData.isChankan - 槍槓での和了か
 * @param {boolean} handData.isTenho - 天和の可能性があるか (親の配牌即和了)
 * @param {boolean} handData.isChiho - 地和の可能性があるか (子の配牌後第一ツモでの和了、鳴きなし)
 * @param {boolean} handData.isRenho - 人和の可能性があるか (子の配牌後、他家の第一打牌でのロン和了、鳴きなし)
 * @param {number} handData.remainingTilesCount - 残り山牌の数
 * @param {number} handData.playerCount - プレイヤー数 (人和判定用)
 * @returns {{yaku: Array<Object>, fans: number, yakuman: Array<Object>, yakumanPower: number}}
 */
function calculateYonhaiYaku(handData) {
  const yakuList = []; // 成立した通常役のリスト
  let totalFans = 0; // 通常役の合計翻数
  const yakumanList = []; // 成立した役満のリスト
  let totalYakumanPower = 0; // 役満の合計倍率

  // handDataから必要な情報を抽出
  const { hand, winTile, isTsumo, melds = [], playerWind, roundWind, doraIndicators = [], uraDoraIndicators = [], isRiichi, isDoubleRiichi, isIppatsu, isHaitei, isHoutei, isChankan, isTenho, isChiho, isRenho, remainingTilesCount, isParent, turnCount, playerCount, gameContext } = handData;
  const currentPlayerTurnCount = gameContext.currentPlayerTurnCount || 0; // 現在のプレイヤーのツモ回数
  const isMenzen = (melds || []).length === 0; // 門前（鳴きなし）かどうか
  // 基本和了形情報を取得（既に計算済みであればそれを使用、なければ再計算）
  const basicWinInfo = handData.basicWinInfo || checkBasicYonhaiWinCondition(hand);

  // --- 役満判定 (優先的にチェックし、成立すれば通常役は計算しない) ---
  // 天和 (Tenhou) - 親の配牌時ツモ和了
  if (isTenho) {
    yakumanList.push(YONHAI_YAKUMAN.TENHOU);
    totalYakumanPower += YONHAI_YAKUMAN.TENHOU.power;
  }
  // 地和 (Chiho)
  if (isChiho) {
    yakumanList.push(YONHAI_YAKUMAN.CHIHOU);
    totalYakumanPower += YONHAI_YAKUMAN.CHIHOU.power;
  }
  // 人和 (Renhou)
  if (isRenho) {
    yakumanList.push(YONHAI_YAKUMAN.RENHOU);
    totalYakumanPower += YONHAI_YAKUMAN.RENHOU.power;
  }
  // 字一色 (Tsuiisou)
  if (isYonhaiTsuiisou(handData, basicWinInfo)) {
    yakumanList.push(YONHAI_YAKUMAN.TSUIISOU);
    totalYakumanPower += YONHAI_YAKUMAN.TSUIISOU.power;
  }
  // 大三元 (Daisangen) - 特殊ルール: 白發中各1枚 + 雀頭2枚
  if (isYonhaiDaisangen(handData, basicWinInfo)) {
    yakumanList.push(YONHAI_YAKUMAN.DAISANGEN);
    totalYakumanPower += YONHAI_YAKUMAN.DAISANGEN.power;
  }
  // 緑一色 (Ryuiisou)
  if (isYonhaiRyuiisou(handData, basicWinInfo)) {
    yakumanList.push(YONHAI_YAKUMAN.RYUIISOU);
    totalYakumanPower += YONHAI_YAKUMAN.RYUIISOU.power;
  }
  // 清老頭 (Chinroutou)
  if (isYonhaiChinroutou(handData, basicWinInfo)) {
    yakumanList.push(YONHAI_YAKUMAN.CHINROUTOU);
    totalYakumanPower += YONHAI_YAKUMAN.CHINROUTOU.power;
  }
  // 小四喜 (Shousuushi)
  if (isYonhaiShousuushi(handData, basicWinInfo)) {
    yakumanList.push(YONHAI_YAKUMAN.SHOUSUUSHI);
    totalYakumanPower += YONHAI_YAKUMAN.SHOUSUUSHI.power;
  }
  // 大四喜 (Daisuushi)
  if (isYonhaiDaisuushi(handData, basicWinInfo)) {
    yakumanList.push(YONHAI_YAKUMAN.DAISUUSHI);
    totalYakumanPower += YONHAI_YAKUMAN.DAISUUSHI.power;
  }
  // 一暗槓単騎 (Iiankantanki) - 四暗刻単騎の代用
  if (isYonhaiIiankantanki(handData, basicWinInfo)) {
    yakumanList.push(YONHAI_YAKUMAN.IIANKOU_TANKI);
    totalYakumanPower += YONHAI_YAKUMAN.IIANKOU_TANKI.power;
  }
  // 一槓子 (Iikantsu) - 四槓子の代用
  // 一暗槓単騎が成立している場合は複合しない
  if (!yakumanList.some(y => y.name === YONHAI_YAKUMAN.IIANKOU_TANKI.name) && isYonhaiIikantsu(handData, basicWinInfo)) {
    yakumanList.push(YONHAI_YAKUMAN.IIKANTSU);
    totalYakumanPower += YONHAI_YAKUMAN.IIKANTSU.power;
  }

  // --- 通常役判定 ---
  // 門前清自摸和 (Menzen Tsumo) - 門前でツモ和了
  if (isMenzen && isTsumo) {
    yakuList.push(YONHAI_YAKU.TSUMO);
    totalFans += YONHAI_YAKU.TSUMO.fans;
  }
  // 立直 (Reach)
  if (isRiichi && !isDoubleRiichi && isMenzen) {
    yakuList.push(YONHAI_YAKU.REACH);
    totalFans += YONHAI_YAKU.REACH.fans;
  }
  // ダブル立直 (Double Reach)
  if (isDoubleRiichi && isMenzen) {
    yakuList.push(YONHAI_YAKU.DOUBLE_REACH);
    totalFans += YONHAI_YAKU.DOUBLE_REACH.fans;
  }
  // 一発 (Ippatsu)
  if (isIppatsu && (isRiichi || isDoubleRiichi) && isMenzen) {
    yakuList.push(YONHAI_YAKU.IPPATSU);
    totalFans += YONHAI_YAKU.IPPATSU.fans;
  }
  // 断么九 (Tanyao)
  if (isYonhaiTanyao(handData, basicWinInfo)) {
    yakuList.push(YONHAI_YAKU.TANYAO);
    totalFans += YONHAI_YAKU.TANYAO.fans;
  }
  // 対々和 (Toitoiho) - 鳴いて単騎か、三色同刻か、刻子持ちなら対々和
  if (isYonhaiToitoi(handData, basicWinInfo)) {
    yakuList.push(YONHAI_YAKU.TOITOI);
    totalFans += YONHAI_YAKU.TOITOI.fans;
  }
  // --- 役牌の判定 (自風牌、場風牌、三元牌) ---
  const tileCounts = {}; // 手牌中の牌の出現回数をカウント
  hand.forEach(t => {
    const key = getTileKey(t);
    tileCounts[key] = (tileCounts[key] || 0) + 1;
  });

  // 刻子になっている役牌を探す
  const koutsuTiles = [];
  // 手牌中の刻子候補
  for (const key in tileCounts) {
    if (tileCounts[key] >= 3) koutsuTiles.push(key);
  }
  // 鳴き（ポン、カン）で成立している刻子も追加
  melds.filter(m => m.type === 'pon' || m.type === 'ankan' || m.type === 'minkan' || m.type === 'kakan').forEach(m => {
    koutsuTiles.push(getTileKey(m.tiles[0])); // 刻子の代表牌
  });

  // 成立した役牌をyakuListに追加
  koutsuTiles.forEach(koutsuKey => {
    const tileObj = { suit: koutsuKey.charAt(0), rank: parseInt(koutsuKey.substring(1)) };
    const yakuhaiInfo = isYakuhai(tileObj, playerWind, roundWind);
    // 自風牌
    if (yakuhaiInfo.isPlayerWind && !yakuList.some(y => y.name === YONHAI_YAKU.JIKAZE.name)) {
        yakuList.push(YONHAI_YAKU.JIKAZE); totalFans += YONHAI_YAKU.JIKAZE.fans;
    }
    // 場風牌
    if (yakuhaiInfo.isRoundWind && !yakuList.some(y => y.name === YONHAI_YAKU.BAKAZE.name)) {
        yakuList.push(YONHAI_YAKU.BAKAZE); totalFans += YONHAI_YAKU.BAKAZE.fans;
    }
    // 三元牌
    if (yakuhaiInfo.isSangenpai) {
      // 同じ三元牌が複数回役牌としてカウントされないようにチェック
      if (!yakuList.some(y => y.name === YONHAI_YAKU.SANGENPAI.name && getTileKey(y.tile) === getTileKey(tileObj))) {
        yakuList.push({ ...YONHAI_YAKU.SANGENPAI, tile: tileObj }); // どの三元牌かを記録
        totalFans += YONHAI_YAKU.SANGENPAI.fans;
      }
    }
  });
  // 平和 (Pinfu)
  if (isYonhaiPinfu(handData, basicWinInfo)) { // basicWinInfoを渡す
    yakuList.push(YONHAI_YAKU.PINFU);
    totalFans += YONHAI_YAKU.PINFU.fans;
  }
  // 混老頭 (Honroutou)
  if (isYonhaiHonroutou(handData, basicWinInfo)) {
    yakuList.push(YONHAI_YAKU.HONROUTOU);
    totalFans += YONHAI_YAKU.HONROUTOU.fans;
  }
  // 一暗刻 (Sanankou Daiyo)
  if (isYonhaiIianko(handData, basicWinInfo)) {
    yakuList.push(YONHAI_YAKU.IIANKOU);
    totalFans += YONHAI_YAKU.IIANKOU.fans;
  }
  // 三色同刻 (Sangen Doukou)
  if (isYonhaiSanshokuDoukou(handData, basicWinInfo)) {
    yakuList.push(YONHAI_YAKU.SANGEN_DOUKOU);
    totalFans += YONHAI_YAKU.SANGEN_DOUKOU.fans;
  }
  // 純全帯么九 (Junchan)
  if (isYonhaiJunchan(handData, basicWinInfo)) {
    const yakuInfo = YONHAI_YAKU.JUNCHAN;
    const actualFans = isMenzen ? yakuInfo.fans : (yakuInfo.fans - (yakuInfo.kuisagari || 0));
    yakuList.push({ ...yakuInfo, fans: actualFans });
    totalFans += actualFans;
  }
  // 混全帯么九 (Chanta)
  else if (isYonhaiChanta(handData, basicWinInfo)) {
    const yakuInfo = YONHAI_YAKU.CHANTA;
    const actualFans = isMenzen ? yakuInfo.fans : (yakuInfo.fans - (yakuInfo.kuisagari || 0));
    yakuList.push({ ...yakuInfo, fans: actualFans });
    totalFans += actualFans;
  }
  // 混一色 (Honitsu)
  if (isYonhaiHonitsu(handData, basicWinInfo)) {
    const yakuInfo = YONHAI_YAKU.HONITSU;
    const actualFans = isMenzen ? yakuInfo.fans : (yakuInfo.fans - (yakuInfo.kuisagari || 0));
    yakuList.push({ ...yakuInfo, fans: actualFans });
    totalFans += actualFans;
  }
  // 清一色 (Chinitsu)
  if (isYonhaiChinitsu(handData, basicWinInfo)) {
    const yakuInfo = YONHAI_YAKU.CHINITSU;
    const actualFans = isMenzen ? yakuInfo.fans : (yakuInfo.fans - (yakuInfo.kuisagari || 0));
    yakuList.push({ ...yakuInfo, fans: actualFans });
    totalFans += actualFans;
  }
  // 槍槓 (Chankan)
  if (isChankan) {
    yakuList.push(YONHAI_YAKU.CHANKAN);
    totalFans += YONHAI_YAKU.CHANKAN.fans;
  }
  // 海底摸月 (Haitei Raoyue)
  if (isHaitei && isTsumo) {
    yakuList.push(YONHAI_YAKU.HAITEI_RAOYUE);
    totalFans += YONHAI_YAKU.HAITEI_RAOYUE.fans;
  }
  // 河底撈魚 (Houtei Raoyui)
  if (isHoutei && !isTsumo) {
    yakuList.push(YONHAI_YAKU.HOUTEI_RAOYUI);
    totalFans += YONHAI_YAKU.HOUTEI_RAOYUI.fans;
  }
  // --- ドラ・裏ドラの計算 ---
  let pureFans = totalFans; // ここで純粋な役の翻数を保持
  const doraCount = countDora(hand, doraIndicators);
  if (doraCount > 0) {
    yakuList.push({ ...YONHAI_YAKU.DORA, fans: doraCount });
    totalFans += doraCount;
  }
  // リーチしている場合のみ裏ドラをカウント
  if ((isRiichi || isDoubleRiichi) && uraDoraIndicators && uraDoraIndicators.length > 0) {
    const uraDoraCount = countDora(hand, uraDoraIndicators);
    if (uraDoraCount > 0) {
      yakuList.push({ ...YONHAI_YAKU.URA_DORA, fans: uraDoraCount });
      totalFans += uraDoraCount;
    }
  }

  // --- 最終結果の返却 ---
  // 役満が成立している場合は、役満のみを返す (通常役とは複合しない)
  if (totalYakumanPower > 0) {
    return { yaku: [], fans: 0, yakuman: yakumanList, yakumanPower: totalYakumanPower, pureFans: 0 }; // 役満の場合は pureFans も 0
  }
  return { yaku: yakuList, fans: totalFans, yakuman: [], yakumanPower: 0, pureFans: pureFans };
}

/**
 * 王牌から裏ドラ表示牌を取得します。
 * @param {Array<Object>} deadWall - 王牌の配列
 * @param {Array<Object>} revealedDoraIndicators - 表示されている表ドラ表示牌の配列
 * @returns {Array<Object>} 裏ドラ表示牌の配列
 */
export function getUraDoraIndicators(deadWall, revealedDoraIndicators) {
  // 王牌または表ドラ表示牌がなければ、裏ドラは存在しない
  if (!deadWall || !revealedDoraIndicators || revealedDoraIndicators.length === 0) {
    return [];
  }
  const uraDoraIndicators = [];
  // 裏ドラ表示牌の位置 (王牌の表ドラ表示牌の真下の牌)
  // 王牌14枚の構成: [嶺上1,嶺上2,嶺上3,嶺上4, 表1,裏1, 表2,裏2, 表3,裏3, 表4,裏4, 予備,予備]
  const uraDoraIndicatorPositions = [5, 7, 9, 11]; // 0-indexed

  // 表示されている表ドラの数だけ裏ドラをめくる
  for (let i = 0; i < revealedDoraIndicators.length; i++) {
    const uraPos = uraDoraIndicatorPositions[i];
    // 王牌の範囲内で裏ドラ表示牌が存在するかチェック
    if (deadWall.length > uraPos) {
      uraDoraIndicators.push(deadWall[uraPos]);
    }
  }
  return uraDoraIndicators;
}

// --- 各役の判定関数の実装 ---
// isTenho, isChiho, isRenho は handData のフラグで判定済み

/**
 * 役牌かどうかを判定するヘルパー関数。
 * @param {Object} tile - 判定対象の牌オブジェクト。
 * @param {string} playerWind - 自風（例: '東', '南'）。
 * @param {string} roundWind - 場風（例: '東', '南'）。
 * @returns {{isPlayerWind: boolean, isRoundWind: boolean, isSangenpai: boolean}} 役牌の成立状況を示すオブジェクト。
 */
function isYakuhai(tile, playerWind, roundWind) {
  const result = { isPlayerWind: false, isRoundWind: false, isSangenpai: false };
  // 字牌でなければ役牌ではない
  if (!tile || tile.suit !== SUITS.JIHAI) return result;

  const tileRank = tile.rank;
  // 風牌のランクと対応する風のマップ
  const windMap = {
    [PLAYER_WINDS.EAST]: JIHAI_TYPES.TON,
    [PLAYER_WINDS.SOUTH]: JIHAI_TYPES.NAN,
    [PLAYER_WINDS.WEST]: JIHAI_TYPES.SHA,
    [PLAYER_WINDS.NORTH]: JIHAI_TYPES.PEI
  };

  // 自風牌の判定
  if (windMap[playerWind] === tileRank) {
    result.isPlayerWind = true;
  }
  // 場風牌の判定 (このゲームでは場風は東のみを想定)
  if (windMap[roundWind] === tileRank && roundWind === PLAYER_WINDS.EAST) {
    result.isRoundWind = true;
  }
  // 三元牌の判定 (白、發、中)
  if (tileRank >= JIHAI_TYPES.HAKU && tileRank <= JIHAI_TYPES.CHUN) {
    result.isSangenpai = true;
  }
  return result;
}

/**
 * ドラの枚数をカウントする
 * @param {Array<Object>} hand - 手牌
 * @param {Array<Object>} doraIndicators - ドラ表示牌
 * @returns {number} ドラの枚数
 */
function countDora(hand, doraIndicators) {
  let doraCount = 0;
  // ドラ表示牌がなければドラは存在しない
  if (!doraIndicators || doraIndicators.length === 0) return 0;

  // 各ドラ表示牌に対応する実際のドラ牌を計算
  const actualDoraTiles = doraIndicators.map(indicator => getNextTile(indicator));

  // 手牌の各牌がドラ牌と一致するかをチェックし、ドラの枚数をカウント
  hand.forEach(handTile => {
    actualDoraTiles.forEach(doraTile => {
      if (doraTile && handTile.suit === doraTile.suit && handTile.rank === doraTile.rank) {
        doraCount++;
      }
    });
  });
  return doraCount;
}

/**
 * ドラ表示牌の次の牌（実際のドラ牌）を取得する。
 * 数牌は次の数字、字牌は種類ごとに循環します。
 * @param {Object} indicatorTile - ドラ表示牌オブジェクト。
 * @returns {Object|null} 計算されたドラ牌オブジェクト、またはnull（不正な入力の場合）。
 */
export function getNextTile(indicatorTile) {
  if (!indicatorTile) return null;
  let { suit, rank } = indicatorTile;

  // 数牌の場合 (萬子、筒子、索子)
  if (suit !== SUITS.JIHAI) {
      // 9の次は1 (循環)
      rank = rank === 9 ? 1 : rank + 1;
  } else { // 字牌の場合
      // 風牌 (東南西北) の循環
      if (rank >= JIHAI_TYPES.TON && rank <= JIHAI_TYPES.PEI) {
          // 北の次は東 (循環)
          rank = rank === JIHAI_TYPES.PEI ? JIHAI_TYPES.TON : rank + 1;
      }
      // 三元牌 (白發中) の循環
      else if (rank >= JIHAI_TYPES.HAKU && rank <= JIHAI_TYPES.CHUN) {
          // 中の次は白 (循環)
          rank = rank === JIHAI_TYPES.CHUN ? JIHAI_TYPES.HAKU : rank + 1;
      }
  }
  // 新しいドラ牌オブジェクトを生成 (IDは仮)
  return { suit, rank, id: `${suit}${rank}_dora` };
}


/**
 * 四牌麻雀における大三元役満の判定。
 * 白・發・中がそれぞれ1枚以上あり、残りの2枚が雀頭を形成している場合に成立します。
 * @param {Object} handData - 役判定に必要な手牌データ。
 * @param {Array<Object>} handData.hand - 和了時の手牌5枚。
 * @returns {boolean} 大三元が成立すればtrue。
 */
function isYonhaiDaisangen(handData) {
  const { hand } = handData;
  // 手牌が5枚でなければ大三元は成立しない
  if (hand.length !== 5) return false;

  // 白・發・中が手牌にそれぞれ1枚以上存在するかチェック
  const hasHaku = hand.some(t => t.suit === SUITS.JIHAI && t.rank === JIHAI_TYPES.HAKU);
  const hasHatsu = hand.some(t => t.suit === SUITS.JIHAI && t.rank === JIHAI_TYPES.HATSU);
  const hasChun = hand.some(t => t.suit === SUITS.JIHAI && t.rank === JIHAI_TYPES.CHUN);

  // 3種類の三元牌が全て揃っていなければ不成立
  if (!(hasHaku && hasHatsu && hasChun)) return false;

  // 白・發・中を1枚ずつ除いた残りの2枚が雀頭になっているかを確認
  const sangenTilesKeys = [
    getTileKey({ suit: SUITS.JIHAI, rank: JIHAI_TYPES.HAKU }),
    getTileKey({ suit: SUITS.JIHAI, rank: JIHAI_TYPES.HATSU }),
    getTileKey({ suit: SUITS.JIHAI, rank: JIHAI_TYPES.CHUN }),
  ];
  const remaining = []; // 三元牌を除いた残りの牌
  const handKeys = hand.map(t => getTileKey(t)); // 手牌の牌キーリスト
  const usedSangen = new Set(); // 使用済みの三元牌キーを追跡

  // 手牌をループし、三元牌を1枚ずつ取り除き、残りをremainingに格納
  for (const tileKey of handKeys) {
    if (sangenTilesKeys.includes(tileKey) && !usedSangen.has(tileKey)) {
      usedSangen.add(tileKey); // 未使用の三元牌であれば使用済みとしてマーク
    } else {
      // 三元牌でなければ、または既に1枚使用済みの三元牌であれば、残りの牌として追加
      remaining.push(hand.find(t => getTileKey(t) === tileKey)); // 元の牌オブジェクトを保持
    }
  }
  // remainingの長さが2で、かつ同じ牌（雀頭）であれば大三元成立
  return remaining.length === 2 && getTileKey(remaining[0]) === getTileKey(remaining[1]);
}

/**
 * 四牌麻雀における字一色役満の判定。
 * 全ての牌が字牌（東、南、西、北、白、發、中）で構成されている場合に成立します。
 * @param {Object} handData - 役判定に必要な手牌データ。
 * @param {Object} basicWinInfo - `checkBasicYonhaiWinCondition` の結果。
 * @returns {boolean} 字一色が成立すればtrue。
 */
function isYonhaiTsuiisou(handData, basicWinInfo) {
  const { hand, melds } = handData;
  // 基本和了形が成立していなければ不成立
  if (!basicWinInfo.isWin) return false;
  // 手牌と鳴き牌（あれば）を全て結合
  const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];
  // 全ての牌が字牌であるかチェック
  return allTiles.every(tile => tile.suit === SUITS.JIHAI);
}

/**
 * 四牌麻雀における緑一色役満の判定。
 * 全ての牌が緑色の牌（索子の2,3,4,6,8と發）で構成されている場合に成立します。
 * @param {Object} handData - 役判定に必要な手牌データ。
 * @param {Object} basicWinInfo - `checkBasicYonhaiWinCondition` の結果。
 * @returns {boolean} 緑一色が成立すればtrue。
 */
function isYonhaiRyuiisou(handData, basicWinInfo) {
  const { hand, melds } = handData;
  // 基本和了形が成立していなければ不成立
  if (!basicWinInfo.isWin) return false;
  // 手牌と鳴き牌（あれば）を全て結合
  const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];
  // 緑色の牌のキーリスト
  const greenTiles = [
    getTileKey({ suit: SUITS.SOZU, rank: 2 }),
    getTileKey({ suit: SUITS.SOZU, rank: 3 }),
    getTileKey({ suit: SUITS.SOZU, rank: 4 }),
    getTileKey({ suit: SUITS.SOZU, rank: 6 }),
    getTileKey({ suit: SUITS.SOZU, rank: 8 }),
    getTileKey({ suit: SUITS.JIHAI, rank: JIHAI_TYPES.HATSU }), // 發
  ];
  // 全ての牌が緑色の牌であるかチェック
  return allTiles.every(tile => greenTiles.includes(getTileKey(tile)));
}

/**
 * 四牌麻雀における清老頭役満の判定。
 * 全ての牌が老頭牌（数牌の1と9）で構成されている場合に成立します。
 * @param {Object} handData - 役判定に必要な手牌データ。
 * @param {Object} basicWinInfo - `checkBasicYonhaiWinCondition` の結果。
 * @returns {boolean} 清老頭が成立すればtrue。
 */
function isYonhaiChinroutou(handData, basicWinInfo) {
  const { hand, melds } = handData;
  // 基本和了形が成立していなければ不成立
  if (!basicWinInfo.isWin) return false;
  // 手牌と鳴き牌（あれば）を全て結合
  const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];
  // 老頭牌のランク
  const terminalTiles = [1, 9];
  // 全ての牌が字牌ではなく、かつ老頭牌であるかチェック
  return allTiles.every(tile =>
    tile.suit !== SUITS.JIHAI && terminalTiles.includes(tile.rank)
  );
}

/**
 * 四牌麻雀における一槓子役満の判定（四槓子の代用役）。
 * 1つの槓子（暗槓、明槓、加槓のいずれか）が含まれている場合に成立します。
 * @param {Object} handData - 役判定に必要な手牌データ。
 * @param {Object} basicWinInfo - `checkBasicYonhaiWinCondition` の結果。
 * @returns {boolean} 一槓子が成立すればtrue。
 */
function isYonhaiIikantsu(handData, basicWinInfo) {
  const { melds } = handData;
  // 基本和了形が成立していなければ不成立
  if (!basicWinInfo.isWin) return false;
  // 成立している槓子の数をカウント
  const kanCount = melds.filter(m => m.type === 'ankan' || m.type === 'minkan' || m.type === 'kakan').length;
  // 槓子が1つであれば成立
  return kanCount === 1;
}

/**
 * 四牌麻雀における小四喜役満の判定。
 * 門前で、風牌4種全てが手牌にあり、そのうち3種が単牌、残り1種が雀頭を形成し、
 * その雀頭が和了牌ではない場合に成立します。
 * @param {Object} handData - 役判定に必要な手牌データ。
 * @param {Array<Object>} handData.hand - 和了時の手牌5枚。
 * @param {Object} handData.winTile - 和了牌。
 * @param {Array<Object>} handData.melds - 鳴きの情報。
 * @param {Object} basicWinInfo - `checkBasicYonhaiWinCondition` の結果。
 * @returns {boolean} 小四喜が成立すればtrue。
 */
function isYonhaiShousuushi(handData, basicWinInfo) {
  const { hand, winTile, melds } = handData; // hand は和了形5枚
  // 基本和了形が成立していなければ不成立
  if (!basicWinInfo.isWin) return false;
  // 手牌が5枚でなければ不成立
  if (hand.length !== 5) return false;
  // 門前限定
  if ((melds || []).length > 0) return false;

  const windTiles = [JIHAI_TYPES.TON, JIHAI_TYPES.NAN, JIHAI_TYPES.SHA, JIHAI_TYPES.PEI];
  const handWindCounts = {}; // 手牌中の風牌の出現回数をカウント
  windTiles.forEach(wt => handWindCounts[wt] = 0);

  hand.forEach(tile => {
    if (tile.suit === SUITS.JIHAI && windTiles.includes(tile.rank)) {
      handWindCounts[tile.rank]++;
    }
  });

  // 和了牌を除いた手牌4枚を考える
  const winTileKey = getTileKey(winTile);
  let winTileRemoved = false;
  const originalHand4 = []; // 和了牌を除いた手牌
  for (const tile of hand) {
    if (getTileKey(tile) === winTileKey && !winTileRemoved) {
      winTileRemoved = true;
    } else {
      originalHand4.push(tile);
    }
  }
  // 和了牌が手牌になかった場合など、手牌が4枚でなければ不成立
  if (originalHand4.length !== 4) return false;

  const originalHandWindCounts = {}; // 和了牌を除いた手牌4枚中の風牌の出現回数
  windTiles.forEach(wt => originalHandWindCounts[wt] = 0);
  let distinctWindTypesInOriginalHand4 = 0; // 4枚の手牌に含まれる風牌の種類数
  let jantouWindInOriginalHand4 = null; // 4枚の手牌中の雀頭を形成する風牌

  originalHand4.forEach(tile => {
    if (tile.suit === SUITS.JIHAI && windTiles.includes(tile.rank)) {
      originalHandWindCounts[tile.rank]++;
      if (originalHandWindCounts[tile.rank] === 1) {
        distinctWindTypesInOriginalHand4++;
      }
      if (originalHandWindCounts[tile.rank] === 2) {
        jantouWindInOriginalHand4 = tile.rank;
      }
    }
  });

  // 手牌4枚に3種類の風牌があり、そのうち1種類が2枚(雀頭)であること
  if (!(distinctWindTypesInOriginalHand4 === 3 && jantouWindInOriginalHand4 !== null)) {
    return false;
  }

  // 和了牌が、手牌4枚に存在しない残り1種類の風牌であるか
  let missingWindType = null; // 手牌4枚に含まれていない風牌
  for (const wt of windTiles) {
    if (originalHandWindCounts[wt] === 0) {
      missingWindType = wt;
      break;
    }
  }
  // 和了牌が字牌であり、かつ手牌4枚に含まれていなかった風牌である場合に成立
  return winTile.suit === SUITS.JIHAI && winTile.rank === missingWindType;
}

/**
 * 四牌麻雀における大四喜役満の判定。
 * 門前で、風牌4種全てが刻子（または槓子）と雀頭を形成している場合に成立します。
 * @param {Object} handData - 役判定に必要な手牌データ。
 * @param {Array<Object>} handData.hand - 和了時の手牌5枚。
 * @param {Object} handData.winTile - 和了牌。
 * @param {Array<Object>} handData.melds - 鳴きの情報。
 * @param {Object} basicWinInfo - `checkBasicYonhaiWinCondition` の結果。
 * @returns {boolean} 大四喜が成立すればtrue。
 */
function isYonhaiDaisuushi(handData, basicWinInfo) {
  const { hand, winTile, melds } = handData; // hand は和了形5枚
  // 基本和了形が成立していなければ不成立
  if (!basicWinInfo.isWin) return false;
  // 手牌が5枚でなければ不成立
  if (hand.length !== 5) return false;
  // 門前限定
  if ((melds || []).length > 0) return false;

  const windTiles = [JIHAI_TYPES.TON, JIHAI_TYPES.NAN, JIHAI_TYPES.SHA, JIHAI_TYPES.PEI];
  // 和了牌を除いた手牌4枚を考える
  const winTileKey = getTileKey(winTile);
  let winTileRemoved = false;
  const originalHand4 = []; // 和了牌を除いた手牌
  for (const tile of hand) {
    if (getTileKey(tile) === winTileKey && !winTileRemoved) {
      winTileRemoved = true;
    } else {
      originalHand4.push(tile);
    }
  }
  // 和了牌が手牌になかった場合など、手牌が4枚でなければ不成立
  if (originalHand4.length !== 4) return false;

  // originalHand4 に4種類の風牌が全て含まれているかチェック
  let distinctWindsInOriginalHand4 = 0;
  for (const wt of windTiles) {
    if (originalHand4.some(t => t.suit === SUITS.JIHAI && t.rank === wt)) {
      distinctWindsInOriginalHand4++;
    }
  }
  // 4種類の風牌が全て含まれていなければ不成立
  if (distinctWindsInOriginalHand4 !== 4) return false;

  // 和了牌がその4種類の風牌のいずれかであること
  return winTile.suit === SUITS.JIHAI && windTiles.includes(winTile.rank);
}

/**
 * 四牌麻雀における一暗槓単騎役満の判定（四暗刻単騎の代用役）。
 * 1つの暗槓が含まれ、かつ手牌が2枚で雀頭を形成し、その雀頭が和了牌である場合に成立します。
 * @param {Object} handData - 役判定に必要な手牌データ。
 * @param {Array<Object>} handData.melds - 鳴きの情報。
 * @param {Array<Object>} handData.hand - 和了時の手牌5枚。
 * @param {Object} handData.winTile - 和了牌。
 * @param {Object} handData.basicWinInfo - `checkBasicYonhaiWinCondition` の結果。
 * @returns {boolean} 一暗槓単騎が成立すればtrue。
 */
function isYonhaiIiankantanki(handData) {
  const { melds, hand, winTile, basicWinInfo } = handData;
  // 基本和了形が成立していなければ不成立
  if (!basicWinInfo.isWin) return false;
  // 暗槓が1つでなければ不成立
  const ankanCount = melds.filter(m => m.type === 'ankan').length;
  if (ankanCount !== 1) return false;

  // 手牌が2枚で雀頭を形成し、かつその雀頭が和了牌である（単騎待ち）
  return hand.length === 2 && getTileKey(hand[0]) === getTileKey(hand[1]) && getTileKey(hand[0]) === getTileKey(winTile);
}

/**
 * 四牌麻雀における断么九（タンヤオ）の判定。
 * 全ての牌が中張牌（数牌の2～8）で構成されている場合に成立します。
 * @param {Object} handData - 役判定に必要な手牌データ。
 * @param {Array<Object>} handData.hand - 和了時の手牌5枚。
 * @param {Array<Object>} handData.melds - 鳴きの情報。
 * @param {Object} basicWinInfo - `checkBasicYonhaiWinCondition` の結果。
 * @returns {boolean} 断么九が成立すればtrue。
 */
function isYonhaiTanyao(handData) {
  const { hand, melds, basicWinInfo } = handData;
  // 基本和了形が成立していなければ不成立
  if (!basicWinInfo.isWin) return false;
  // 手牌と鳴き牌（あれば）を全て結合
  const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];
  // 全ての牌が字牌ではなく、かつ1と9の牌でもない（中張牌である）かチェック
  return allTiles.every(tile =>
    tile.suit !== SUITS.JIHAI && tile.rank !== 1 && tile.rank !== 9
  );
}

/**
 * 四牌麻雀における平和（ピンフ）の判定。
 * 門前で、面子が順子、雀頭が役牌でなく、待ちが両面待ちの場合に成立します。
 * @param {Object} handData - 役判定に必要な手牌データ。
 * @param {Array<Object>} handData.hand - 和了時の手牌5枚。
 * @param {Object} handData.winTile - 和了牌。
 * @param {Array<Object>} handData.melds - 鳴きの情報。
 * @param {string} handData.playerWind - 自風。
 * @param {string} handData.roundWind - 場風。
 * @param {Object} basicWinInfo - `checkBasicYonhaiWinCondition` の結果。
 * @returns {boolean} 平和が成立すればtrue。
 */
function isYonhaiPinfu(handData, basicWinInfo) {
  const { winTile, melds, playerWind, roundWind } = handData;

  // 1. 門前限定
  if (melds && melds.length > 0) return false;

  // 2. 面子が順子であること
  if (basicWinInfo.mentsuType !== 'shuntsu') return false;

  const jantou = basicWinInfo.jantou;
  const mentsu = basicWinInfo.mentsu;

  // 3. 雀頭が役牌でないこと
  const yakuhaiInfo = isYakuhai(jantou[0], playerWind, roundWind);
  if (yakuhaiInfo.isPlayerWind || yakuhaiInfo.isRoundWind || yakuhaiInfo.isSangenpai) {
    return false;
  }

  // 4. 待ちが両面待ちであること
  const winTileKey = getTileKey(winTile);
  const mentsuTileKeys = mentsu.map(getTileKey);

  // 和了牌が順子の一部でなければならない (ノベタン待ちなどを除外)
  if (!mentsuTileKeys.includes(winTileKey)) {
    return false;
  }

  // 両面待ちの判定：順子の最初か最後の牌で待っている必要がある
  const isRyanmenWait = winTileKey === mentsuTileKeys[0] || winTileKey === mentsuTileKeys[2];

  // 辺張待ち(123の3、789の7)を除外
  const isPenchanWait = (mentsu[0].rank === 1 && winTile.rank === 3) || (mentsu[0].rank === 7 && winTile.rank === 7);

  // 両面待ちであり、かつ辺張待ちではない場合に成立
  if (isRyanmenWait && !isPenchanWait) {
    return true; // 全ての平和の条件を満たす
  }

  return false;
}

/**
 * 四牌麻雀における対々和（トイトイホー）の判定。
 * 全ての面子が刻子（または槓子）で構成されている場合に成立します。
 * 平和とは複合しません。
 * @param {Object} handData - 役判定に必要な手牌データ。
 * @param {Object} basicWinInfo - `checkBasicYonhaiWinCondition` の結果。
 * @returns {boolean} 対々和が成立すればtrue。
 */
function isYonhaiToitoi(handData, basicWinInfo) {
  // 平和とは複合しないため、平和が成立していれば不成立
  if (isYonhaiPinfu(handData, basicWinInfo)) {
    return false;
  }

  // 三色同刻の特殊形（三色同刻の刻子形）の場合、無条件で対々和とみなす
  if (basicWinInfo.mentsuType === 'sanshoku_special') {
    return true;
  }

  // 基本的な和了形が成立しており、かつ面子が刻子(koutsu)であれば対々和
  if (!basicWinInfo.isWin || basicWinInfo.mentsuType !== 'koutsu') {
    return false;
  }

  return true;
}

/**
 * 四牌麻雀における一暗刻の判定（三暗刻の代用役）。
 * 鳴きがなく、手牌中に1つ以上の暗刻（暗槓またはツモ和了による暗刻）がある場合に成立します。
 * @param {Object} handData - 役判定に必要な手牌データ。
 * @param {Array<Object>} handData.hand - 和了時の手牌5枚。
 * @param {Array<Object>} handData.melds - 鳴きの情報。
 * @param {Object} handData.winTile - 和了牌。
 * @param {boolean} handData.isTsumo - ツモ和了か。
 * @param {Object} basicWinInfo - `checkBasicYonhaiWinCondition` の結果。
 * @returns {boolean} 一暗刻が成立すればtrue。
 */
function isYonhaiIianko(handData, basicWinInfo) {
  const { melds, winTile, isTsumo } = handData;

  // そもそも和了形が成立していなければ不成立
  if (!basicWinInfo.isWin) {
    return false;
  }

  // 鳴き（ポン、明槓、加槓）がある場合は一暗刻は成立しない（門前限定ではないが、鳴くと暗刻にならないため）
  if (melds.some(m => m.type === 'pon' || m.type === 'minkan' || m.type === 'kakan')) {
    return false;
  }

  let ankouCount = 0; // 暗刻の数

  // 1. 暗槓(ankan)をチェック
  if (melds) {
    ankouCount += melds.filter(m => m.type === 'ankan').length;
  }

  // 2. 手牌の中の暗刻をチェック
  // 基本和了形が刻子を含んでいるか
  if (basicWinInfo.mentsuType === 'koutsu') {
    const koutsu = basicWinInfo.mentsu; // 刻子を構成する牌
    const koutsuKey = getTileKey(koutsu[0]); // 刻子の牌の種類
    const winTileKey = getTileKey(winTile); // 和了牌の種類

    // ツモ和了の場合は、その刻子は常に暗刻
    // ロン和了の場合は、和了牌で完成した刻子は明刻扱いになるため、暗刻ではない
    if (isTsumo || koutsuKey !== winTileKey) {
      ankouCount++;
    }
  }

  // 暗刻が1つ以上あれば成立
  return ankouCount >= 1;
}

/**
 * 四牌麻雀における混老頭（ホンロウトウ）の判定。
 * 全ての牌が幺九牌（数牌の1,9と字牌）で構成されている場合に成立します。
 * @param {Object} handData - 役判定に必要な手牌データ。
 * @param {Array<Object>} handData.hand - 和了時の手牌5枚。
 * @param {Array<Object>} handData.melds - 鳴きの情報。
 * @param {Object} basicWinInfo - `checkBasicYonhaiWinCondition` の結果。
 * @returns {boolean} 混老頭が成立すればtrue。
 */
function isYonhaiHonroutou(handData, basicWinInfo) {
  const { hand, melds } = handData;
  // 基本和了形が成立していなければ不成立
  if (!basicWinInfo.isWin) return false;
  // 手牌と鳴き牌（あれば）を全て結合
  const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];
  // 幺九牌であるかどうかの判定ヘルパー関数
  const isYaochuhai = (tile) => {
    if (tile.suit === SUITS.JIHAI) return true; // 字牌は全て幺九牌
    return tile.rank === 1 || tile.rank === 9; // 数牌の1と9は幺九牌
  };
  // 全ての牌が幺九牌であるかチェック
  return allTiles.every(isYaochuhai);
}

/**
 * 四牌麻雀における混全帯么九（チャンタ）の判定。
 * 全ての面子と雀頭が幺九牌（数牌の1,9と字牌）を含み、かつ字牌が含まれる場合に成立します。
 * @param {Object} handData - 役判定に必要な手牌データ。
 * @param {Array<Object>} handData.hand - 和了時の手牌5枚。
 * @param {Array<Object>} handData.melds - 鳴きの情報。
 * @param {Object} basicWinInfo - `checkBasicYonhaiWinCondition` の結果。
 * @returns {boolean} 混全帯么九が成立すればtrue。
 */
function isYonhaiChanta(handData, basicWinInfo) {
  const { melds } = handData;
  // 基本和了形が成立していなければ不成立
  if (!basicWinInfo.isWin) return false;

  // 順子が含まれている必要がある。四牌麻雀の鳴きは刻子のみなので、門前限定。
  // 鳴きがある場合、または面子が順子でなければ不成立
  if (melds.length > 0 || basicWinInfo.mentsuType !== 'shuntsu') {
    return false;
  }

  const allGroups = []; // 雀頭と面子を格納する配列
  if (basicWinInfo.jantou) allGroups.push(basicWinInfo.jantou);
  if (basicWinInfo.mentsu) allGroups.push(basicWinInfo.mentsu);

  // 各グループ（雀頭、面子）が幺九牌（字牌または数牌の1,9）を含んでいるかチェック
  const isYaochuhai = (tile) => (tile.suit === SUITS.JIHAI || tile.rank === 1 || tile.rank === 9);
  if (!allGroups.every(group => Array.isArray(group) && group.some(isYaochuhai))) return false;

  // 全ての牌の中に字牌が1枚でも含まれているかチェック
  return allGroups.flat().filter(Boolean).some(tile => tile.suit === SUITS.JIHAI);
}

/**
 * 四牌麻雀における純全帯么九（ジュンチャン）の判定。
 * 全ての面子と雀頭が老頭牌（数牌の1,9）を含む順子で構成され、字牌を含まない場合に成立します。
 * @param {Object} handData - 役判定に必要な手牌データ。
 * @param {Array<Object>} handData.hand - 和了時の手牌5枚。
 * @param {Array<Object>} handData.melds - 鳴きの情報。
 * @param {Object} basicWinInfo - `checkBasicYonhaiWinCondition` の結果。
 * @returns {boolean} 純全帯么九が成立すればtrue。
 */
function isYonhaiJunchan(handData, basicWinInfo) {
  const { melds } = handData;
  // 基本和了形が成立していなければ不成立
  if (!basicWinInfo.isWin) return false;

  // 順子が含まれている必要がある。四牌麻雀の鳴きは刻子のみなので、門前限定。
  // 鳴きがある場合、または面子が順子でなければ不成立
  if (melds.length > 0 || basicWinInfo.mentsuType !== 'shuntsu') {
    return false;
  }

  const allGroups = []; // 雀頭と面子を格納する配列
  if (basicWinInfo.jantou) allGroups.push(basicWinInfo.jantou);
  if (basicWinInfo.mentsu) allGroups.push(basicWinInfo.mentsu);

  // 各グループ（雀頭、面子）が老頭牌（数牌の1,9）を含んでいるかチェック
  const isTerminal = (tile) => (tile.suit !== SUITS.JIHAI && (tile.rank === 1 || tile.rank === 9));
  if (!allGroups.every(group => Array.isArray(group) && group.some(isTerminal))) return false;

  // 全ての牌の中に字牌が1枚も含まれていないかチェック
  return !allGroups.flat().filter(Boolean).some(tile => tile.suit === SUITS.JIHAI);
}

/**
 * 四牌麻雀における混一色（ホンイツ）の判定。
 * 字牌と一種類の数牌のみで構成されている場合に成立します。
 * @param {Object} handData - 役判定に必要な手牌データ。
 * @param {Array<Object>} handData.hand - 和了時の手牌5枚。
 * @param {Array<Object>} handData.melds - 鳴きの情報。
 * @param {Object} basicWinInfo - `checkBasicYonhaiWinCondition` の結果。
 * @returns {boolean} 混一色が成立すればtrue。
 */
function isYonhaiHonitsu(handData, basicWinInfo) {
  const { hand, melds } = handData;
  // 基本和了形が成立していなければ不成立
  if (!basicWinInfo.isWin) return false;
  // 手牌と鳴き牌（あれば）を全て結合
  const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];

  // 含まれる牌の種類（スーツ）をセットで取得
  const suitsPresent = new Set(allTiles.map(t => t.suit));

  // 数牌が2種類以上含まれていれば不成立
  if (suitsPresent.has(SUITS.MANZU) && suitsPresent.has(SUITS.PINZU)) return false;
  if (suitsPresent.has(SUITS.MANZU) && suitsPresent.has(SUITS.SOZU)) return false;
  if (suitsPresent.has(SUITS.PINZU) && suitsPresent.has(SUITS.SOZU)) return false;
  
  // 字牌を含み、かつ数牌を1種類のみ含む場合に成立
  return suitsPresent.has(SUITS.JIHAI) &&
         (suitsPresent.has(SUITS.MANZU) || suitsPresent.has(SUITS.PINZU) || suitsPresent.has(SUITS.SOZU));
}

/**
 * 四牌麻雀における清一色（チンイツ）の判定。
 * 一種類の数牌のみで構成されている場合に成立します。字牌は含みません。
 * @param {Object} handData - 役判定に必要な手牌データ。
 * @param {Array<Object>} handData.hand - 和了時の手牌5枚。
 * @param {Array<Object>} handData.melds - 鳴きの情報。
 * @param {Object} basicWinInfo - `checkBasicYonhaiWinCondition` の結果。
 * @returns {boolean} 清一色が成立すればtrue。
 */
function isYonhaiChinitsu(handData, basicWinInfo) {
  const { hand, melds } = handData;
  // 基本和了形が成立していなければ不成立
  if (!basicWinInfo.isWin) return false;
  // 手牌と鳴き牌（あれば）を全て結合
  const allTiles = [...hand, ...melds.flatMap(m => m.tiles)];

  // 字牌が含まれていれば不成立
  if (allTiles.some(tile => tile.suit === SUITS.JIHAI)) return false;
  // 最初の牌のスーツを取得
  const firstSuit = allTiles[0].suit;
  // 全ての牌が最初の牌と同じスーツであるかチェック
  return allTiles.every(tile => tile.suit === firstSuit);
}

/**
 * 四牌麻雀における三色同刻（サンショクドウコウ）の判定。
 * 萬子、筒子、索子で同じ数字の刻子（または槓子）をそれぞれ1つずつ持っている場合に成立します。
 * @param {Object} handData - 役判定に必要な手牌データ。
 * @param {Array<Object>} handData.hand - 和了時の手牌5枚。
 * @param {Array<Object>} handData.melds - 鳴きの情報。
 * @param {Object} basicWinInfo - `checkBasicYonhaiWinCondition` の結果。
 * @returns {boolean} 三色同刻が成立すればtrue。
 */
function isYonhaiSanshokuDoukou(handData, basicWinInfo) {
  const { melds } = handData;
  // 基本和了形が成立していなければ不成立
  if (!basicWinInfo || !basicWinInfo.isWin) return false;

  // 鳴いている場合は対象外 (このゲームのルール)
  if (melds && melds.length > 0) {
    return false;
  }

  // checkBasicYonhaiWinCondition で sanshoku_special と判定された場合（特殊な5枚構成）
  if (basicWinInfo.mentsuType === 'sanshoku_special') {
    return true;
  }

  // 通常の三色同刻（3つの刻子）の判定
  // 基本和了形が刻子を含んでいる場合
  if (basicWinInfo.mentsuType === 'koutsu') {
      const koutsu = basicWinInfo.mentsu; // 基本和了形を構成する刻子
      const jantou = basicWinInfo.jantou; // 基本和了形を構成する雀頭

      // 刻子と雀頭が同じ数字・スーツであってはならない（対々和との複合を避けるため）
      if (getTileKey(koutsu[0]) === getTileKey(jantou[0])) {
          return false;
      }

      // 全ての刻子（手牌中の暗刻、鳴きによるポン・カン）の牌の種類をカウント
      const koutsuCounts = {};
      const allKoutsuTiles = [...melds.filter(m => m.type.includes('kan') || m.type === 'pon').flatMap(m => m.tiles), ...koutsu];
      
      allKoutsuTiles.forEach(tile => {
          const key = getTileKey(tile);
          koutsuCounts[key] = (koutsuCounts[key] || 0) + 1;
      });

      // 萬子、筒子、索子で同じランクの刻子が存在するかチェック
      for (let rank = 1; rank <= 9; rank++) {
          const manKey = `m${rank}`;
          const pinKey = `p${rank}`;
          const souKey = `s${rank}`;

          if (koutsuCounts[manKey] >= 3 && koutsuCounts[pinKey] >= 3 && koutsuCounts[souKey] >= 3) {
              return true;
          }
      }
  }

  return false;
}

/**
 * 四牌麻雀の5枚手牌における和了判定 (役と点数計算は含まない基本的な形のみ)
 * @param {Array<Object>} currentHandWithWinTile - 和了牌を含んだ手牌 (5枚)
 * @param {Object} winTile - 和了牌 (ロン牌またはツモ牌)
 * @param {boolean} isTsumo - ツモ和了か
 * @param {Object} gameContext - 役判定に必要なゲームのコンテキスト情報 (自風、場風、ドラ、鳴きなど)
 * @returns {{isWin: boolean, yaku: Array, score: number}}
 */
export function checkYonhaiWin(currentHandWithWinTile, winTile, isTsumo, gameContext = {}) {
  const melds = gameContext.melds || [];
  const isParent = gameContext.isParent || false;
  let basicWinInfo = { isWin: false, mentsuType: null, jantou: null, mentsu: null };

  // ストック牌使用時のツモ和了制限
  if (gameContext.isUsingStockedTile && isTsumo) {
    return { isWin: false, yaku: [], score: 0, fans: 0, isYakuman: false, yakumanPower: 0 };
  }

  // --- 鳴き（ポン、カン）がある場合の和了形判定 ---
  if (melds.length > 0) {
    // 手牌から鳴き牌を除外し、残りの2枚が雀頭を形成するかどうかを判定します。
    // 暗槓も他の鳴きと同様に、手牌から除外して雀頭判定を行います。

    // currentHandWithWinTile の牌の出現回数をカウント
    const handCounts = {};
    currentHandWithWinTile.forEach(tile => {
      const key = getTileKey(tile);
      handCounts[key] = (handCounts[key] || 0) + 1;
    });

    const meldToExclude = melds[0]; // 四牌麻雀では鳴きは一つのみと仮定

    // 鳴き牌の出現回数を手牌のカウントから減算
    meldToExclude.tiles.forEach(meldTile => {
      const key = getTileKey(meldTile);
      if (handCounts[key] && handCounts[key] > 0) {
        handCounts[key]--;
      }
    });

    // 残りの牌を再構築
    const remainingTiles = [];
    for (const key in handCounts) {
      for (let i = 0; i < handCounts[key]; i++) {
        // 新しい牌オブジェクトを作成して追加 (IDは不要なため、suitとrankのみで構成)
        remainingTiles.push({ suit: key.charAt(0), rank: parseInt(key.substring(1)) });
      }
    }

    // 残りの牌が2枚で雀頭を形成しているかチェック
    if (remainingTiles.length === 2 && getTileKey(remainingTiles[0]) === getTileKey(remainingTiles[1])) {
      basicWinInfo = {
        isWin: true,
        mentsuType: 'koutsu', // 鳴き（ポン、カン）は全て刻子とみなす
        jantou: remainingTiles, // 雀頭
        mentsu: meldToExclude.tiles // 鳴き牌を面子として記録
      };
    }
  } else {
    // --- 鳴きがない場合（門前）の和了形判定 ---
    // 5枚の手牌全体で和了形を判定します。
    const sortedHand = sortHand([...currentHandWithWinTile]);
    basicWinInfo = checkBasicYonhaiWinCondition(sortedHand);
  }

  if (basicWinInfo.isWin) {
    const handDataForYaku = {
      hand: currentHandWithWinTile, // 役判定には、鳴きを含まない実際の手牌を渡す
      winTile,
      isTsumo,
      melds: gameContext.melds || [],
      isRiichi: gameContext.isRiichi || false,
      isDoubleRiichi: gameContext.isDoubleRiichi || false,
      isIppatsu: gameContext.isIppatsu || false,
      isHaitei: gameContext.isHaitei || false,
      isHoutei: gameContext.isHoutei || false,
      isChankan: gameContext.isChankan || false,
      isTenho: gameContext.isTenho || false,
      isChiho: gameContext.isChiho || false,
      isRenho: gameContext.isRenho || false,
      playerWind: gameContext.playerWind,
      roundWind: gameContext.roundWind,
      doraIndicators: gameContext.doraIndicators || [],
      uraDoraIndicators: gameContext.uraDoraIndicators || [], // 裏ドラも渡す
      isParent: gameContext.isParent || false, // 親フラグ
      turnCount: gameContext.turnCount ?? 1, // 巡目 (0は有効な値なのでnull合体演算子を使う)
      // ...その他必要な情報を gameContext から取得
      basicWinInfo: basicWinInfo, // 計算済みの基本和了情報を渡す
      playerCount: gameContext.playerCount, // プレイヤー数を渡す
      gameContext: gameContext // 人和判定のために gameContext 自体も渡す
    };
    const yakuResult = calculateYonhaiYaku(handDataForYaku);

    // --- 役なし和了（チョンボ）の処理 ---
    // 役なし和了は認めないため、役がない場合はチョンボとして扱う
    // ドラのみの場合もチョンボとするため、pureFans を参照する
    if (yakuResult.pureFans === 0 && yakuResult.yakumanPower === 0) {
        const chomboScore = isParent ? -12000 : -8000; // 親か子かでチョンボの点数を設定
        return {
            isWin: true, // 和了形は成立しているが、役がない状態
            yaku: [{ name: "役なしチョンボ", fans: 0, isChombo: true }], // チョンボ役を追加
            score: chomboScore, // チョンボしたプレイヤーが失う点数
            fans: 0,
            isYakuman: false,
            yakumanPower: 0,
            scoreName: "役なしチョンボ",
            isChombo: true, // チョンボであることを示すフラグ
            chomboPlayerIsParent: isParent, // チョンボしたのが親かどうかのフラグ
            chomboHand: currentHandWithWinTile // チョンボ時の手牌
        };
    }

    let score = 0;
    let calculatedFans = yakuResult.fans;
    let calculatedYakumanPower = yakuResult.yakumanPower;
    let isWinResult = false; 
    let resultYakuList = [];
    let resultIsYakuman = false;
    let resultYakumanPower = calculatedYakumanPower;
    let scoreName = null;

    const MANGAN_BASE_KO = 8000;
    const MANGAN_BASE_OYA = 12000;
    const KAZOE_YAKUMAN_FANS_THRESHOLD = 13;

    if (calculatedYakumanPower > 0) { // 役満の場合
      isWinResult = true;
      resultIsYakuman = true;
      resultYakuList = yakuResult.yakuman;
      
      // 役満は満貫の4倍が基本
      const yakumanUnitScore = isParent ? MANGAN_BASE_OYA * 4 : MANGAN_BASE_KO * 4;
      score = yakumanUnitScore * calculatedYakumanPower; // N倍役満に対応
      scoreName = calculatedYakumanPower >= 2 ? `${calculatedYakumanPower}倍役満` : "役満";

    } else if (calculatedFans >= KAZOE_YAKUMAN_FANS_THRESHOLD) { // 数え役満の場合
      isWinResult = true;
      resultIsYakuman = true;
      resultYakumanPower = 1; // 1倍役満として扱う
      resultYakuList = yakuResult.yaku; // 通常役のリストはそのまま
      const yakumanUnitScore = isParent ? MANGAN_BASE_OYA * 4 : MANGAN_BASE_KO * 4;
      score = yakumanUnitScore;
      scoreName = "数え役満";
    } else if (calculatedFans > 0) { // 通常役の場合
      isWinResult = true;
      resultIsYakuman = false;
      resultYakuList = yakuResult.yaku;

      // 翻数に応じた満貫以上の点数計算
      const MANGAN_FANS_THRESHOLD = 4;     // 4翻以上で満貫
      const HANEMAN_FANS_THRESHOLD = 6;    // 6翻以上で跳満
      const BAIMAN_FANS_THRESHOLD = 8;     // 8翻以上で倍満
      const SANBAIMAN_FANS_THRESHOLD = 11; // 11翻以上で三倍満

      if (calculatedFans >= SANBAIMAN_FANS_THRESHOLD) { // 三倍満
        score = isParent ? MANGAN_BASE_OYA * 3 : MANGAN_BASE_KO * 3;
        scoreName = "三倍満";
      } else if (calculatedFans >= BAIMAN_FANS_THRESHOLD) { // 倍満
        score = isParent ? MANGAN_BASE_OYA * 2 : MANGAN_BASE_KO * 2;
        scoreName = "倍満";
      } else if (calculatedFans >= HANEMAN_FANS_THRESHOLD) { // 跳満
        score = isParent ? 18000 : 12000; // 親18000点, 子12000点
        scoreName = "跳満";
      } else if (calculatedFans >= MANGAN_FANS_THRESHOLD) { // 満貫
        // 4翻かつ平和+ツモの場合は0点とする特殊ルール
        const isPinfuTsumo4Han = calculatedFans === 4 &&
                                resultYakuList.some(y => y.name === YONHAI_YAKU.PINFU.name) &&
                                resultYakuList.some(y => y.name === YONHAI_YAKU.TSUMO.name);
        if (isPinfuTsumo4Han) {
          score = 0; // 特殊ルールにより0点
        } else {
          score = isParent ? MANGAN_BASE_OYA : MANGAN_BASE_KO; // 通常の満貫点
          scoreName = "満貫";
        }
      } else {
        // 満貫未満の場合は点数移動なし (score は 0 のまま)
        score = 0;
        scoreName = null;
      }
    } else {
      // 役なし (calculateYonhaiYaku で yakuResult.fans と yakumanPower が 0 になるため)
      isWinResult = false;
    }

    // 最終的な和了結果を返却
    if (isWinResult) {
      return { 
        isWin: true, 
        yaku: resultYakuList, 
        score: score, // 満貫未満なら0, それ以上なら計算後の点数
        fans: calculatedFans, 
        isYakuman: resultIsYakuman,
        yakumanPower: resultYakumanPower,
        scoreName: scoreName
      };
    }
  }
  // 基本和了形不成立
  return { isWin: false, yaku: [], score: 0, fans: 0, isYakuman: false, yakumanPower: 0 };
}

/**
 * 四牌麻雀の4枚手牌におけるテンパイ判定と待ち牌を返します。
 * @param {Array<Object>} hand4tiles - ソート済みの手牌4枚 (牌オブジェクトの配列)。
 * @param {Object} gameContext - ゲームのコンテキスト情報 (現在は未使用だが将来的な拡張用)。
 * @returns {{isTenpai: boolean, waits: Array<Object>}} テンパイ状況と待ち牌の配列。
 */
export function checkYonhaiTenpai(hand4tiles, gameContext = {}) {
  // 手牌が4枚または1枚でなければテンパイ判定は行わない
  if (!hand4tiles || (hand4tiles.length !== 4 && hand4tiles.length !== 1)) {
    return { isTenpai: false, waits: [] };
  }

  const waits = []; // 待ち牌を格納する配列

  // 手牌が1枚の場合（単騎待ち）
  if (hand4tiles.length === 1) {
    const waitingTile = { ...hand4tiles[0] }; // 待ち牌は手牌のコピー
    waits.push(waitingTile);
    return { isTenpai: true, waits: waits };
  }

  // 手牌が4枚の場合、ありえる待ち牌を全て試す
  // 全ての牌種（重複なし）のリストを取得
  const allPossibleTiles = getAllTiles().filter(
    (tile, index, self) => index === self.findIndex(t => t.suit === tile.suit && t.rank === tile.rank)
  );

  // 手牌の牌の枚数をカウント
  const handCounts = {};
  hand4tiles.forEach(tile => {
    const key = getTileKey(tile);
    handCounts[key] = (handCounts[key] || 0) + 1;
  });

  // 全ての可能な牌を1枚ずつ手牌に加えて和了形になるか試す
  for (const potentialTile of allPossibleTiles) {
    // 既に4枚持っている牌は、5枚目を待つことはできないのでスキップ
    const potentialTileKey = getTileKey(potentialTile);
    if ((handCounts[potentialTileKey] || 0) >= 4) {
      continue;
    }
    // 仮想的に手牌に1枚加えて5枚にする
    const tempHand5 = sortHand([...hand4tiles, potentialTile]);
    // 5枚の手牌で基本和了形が成立するかチェック
    const basicWinResult = checkBasicYonhaiWinCondition(tempHand5);
    if (basicWinResult.isWin) {
      waits.push(potentialTile); // 成立すれば待ち牌として追加
    }
  }
  // 待ち牌の重複を除去し、ユニークな待ち牌のリストを作成
  const uniqueWaitKeys = new Set();
  const uniqueWaits = waits.filter(tile => {
      if (!tile) return false;
      const key = getTileKey(tile);
      if (uniqueWaitKeys.has(key)) return false; // 既にリストにあればスキップ
      uniqueWaitKeys.add(key); // セットに追加
      return true;
  });
  // 待ち牌があればテンパイ、なければノーテン
  return { isTenpai: uniqueWaits.length > 0, waits: uniqueWaits };
}

/**
 * 四牌麻雀の向聴数（シャンテン数）を計算します。
 * @param {Array<Object>} hand - 手牌の配列。
 * @param {Array<Object>} melds - 副露の配列。
 * @returns {number} 向聴数。
 */
export function findShanten(hand, melds) {
  // 四牌麻雀では、手牌4枚 + 鳴き1つ（3枚） = 7枚、または手牌4枚 = 4枚
  // 最終形は1面子1雀頭なので、5枚で和了形。
  // 鳴きがある場合、手牌は2枚で雀頭を待つ形。
  // 鳴きがない場合、手牌は4枚で、ツモ牌を加えて5枚で和了形。

  const numMelds = melds.length; // 鳴きの数
  const currentHandSize = hand.length; // 現在の手牌の枚数

  // 鳴きがある場合 (1面子確定)
  if (numMelds > 0) {
    // 残りの手牌2枚で雀頭を形成していれば和了形 (シャンテン数 -1)
    if (currentHandSize === 2 && getTileKey(hand[0]) === getTileKey(hand[1])) {
      return -1; // 和了
    }
    // 残りの手牌2枚で雀頭を形成していなければ1シャンテン (雀頭待ち)
    return 0; // テンパイ
  }
  // 鳴きがない場合 (門前)
  else {
    // 手牌4枚で、ツモ牌を加えて5枚で和了形になるか
    // テンパイしていれば0シャンテン
    const tenpaiResult = checkYonhaiTenpai(hand);
    if (tenpaiResult.isTenpai) {
      return 0; // テンパイ
    }
    // テンパイしていなければ1シャンテン (1枚足りない)
    return 1; // 1シャンテン
  }
}



// --- サーバーサイド専用の関数 ---

/**
 * サーバーサイドでゲームの状態を初期化します。
 * @param {Array<string>} playerIds - プレイヤーIDの配列。
 * @param {number} dealerIndex - 親のインデックス。
 * @returns {Object} 初期化されたゲーム状態。
 */
export function initializeServerGame(playerIds, dealerIndex) {
  const playerCount = playerIds.length;
  const allTiles = getAllTiles();
  const shuffledWall = shuffleWall(allTiles);

  // 山牌と王牌に分割
  const deadWallSize = 14;
  const deadWall = shuffledWall.slice(0, deadWallSize);
  const wall = shuffledWall.slice(deadWallSize);

  // 配牌
  const { hands, wall: remainingWall } = dealInitialHands(playerCount, wall, 4);

  // ドラ表示牌
  const doraIndicators = getDoraIndicators(deadWall);

  // プレイヤー情報の初期化
  let players = playerIds.map((id, index) => ({
    id: id,
    hand: hands[index],
    discardPile: [],
    melds: [],
    score: 25000, // 初期スコア
    isRiichi: false,
    isParent: index === dealerIndex,
    seatWind: '', // 後で割り当て
    isMyTurn: index === dealerIndex,
  }));

  // 席風の割り当て
  players = assignPlayerWinds(players, dealerIndex, playerCount);

  return {
    players,
    wall: remainingWall,
    deadWall,
    doraIndicators,
    uraDoraIndicators: [],
    currentPlayerIndex: dealerIndex,
    turn: 1,
    lastDiscardedTile: null,
    gamePhase: 'in_progress', // 'waiting', 'in_progress', 'round_over', 'game_over'
    roundWind: PLAYER_WINDS.EAST, // 仮
    roundNumber: 1, // 仮
    honba: 0, // 仮
  };
}