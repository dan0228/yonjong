<template>
  <transition name="popup-animation">
    <div
      v-if="show"
      class="popup-overlay"
      @click="emit('close')"
    >
      <div
        class="player-info-popup"
        @click.stop
      >
        <!-- 1. プレイヤー名 -->
        <h3 class="player-name">
          {{ player.name }}
        </h3>
        
        <!-- 2. プレイヤーアイコン -->
        <div class="player-icon-area">
          <img
            :src="playerIconSrc"
            alt="Player Avatar"
            class="player-avatar"
          >
          <img
            v-if="rankBadgeSrc"
            :src="rankBadgeSrc"
            alt="Rank Badge"
            class="rank-badge"
          >
        </div>

        <!-- 3. レートと猫コイン -->
        <div class="player-stats-area">
          <img
            :src="statBoardImageSrc"
            alt="Player Stats Board"
            class="stat-board-image"
          >
          <div class="stat-values-overlay">
            <div class="stat-value-row rating-row">
              <span class="stat-value">{{ player.rating }}</span>
            </div>
            <div class="stat-value-row cat-coins-row">
              <span class="stat-value">{{ player.cat_coins }}</span>
            </div>
          </div>
        </div>

        <!-- 4. 追加情報 (アバターとレートの下) -->
        <div class="additional-stats">
          <div class="stat-item">
            <span class="stat-label">{{ t('playerInfo.avgRank') }}：</span>
            <span class="stat-value-num">{{ averageRank }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">{{ t('playerInfo.totalGames') }}：</span>
            <span class="stat-value-num">{{ player.total_games_played ?? 0 }}</span>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { defineProps, computed, defineEmits } from 'vue';
import { useI18n } from 'vue-i18n';

const emit = defineEmits(['close']);

const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  player: {
    type: Object,
    default: () => ({}),
  },
});

const { locale, t } = useI18n();

const rankBadgeSrc = computed(() => {
  const rank = props.player?.user_rank_class;
  if (!rank) return null;

  const langSuffix = locale.value === 'en' ? '_en' : '';
  
  switch (rank) {
    case 1:
      return `/assets/images/info/kitten${langSuffix}.png`;
    case 2:
      return `/assets/images/info/alley${langSuffix}.png`;
    case 3:
      return `/assets/images/info/boss${langSuffix}.png`;
    default:
      return null;
  }
});

// 平均順位を計算する算出プロパティ
const averageRank = computed(() => {
  if (!props.player || !props.player.total_games_played || props.player.total_games_played === 0) {
    return '-';
  }

  const totalRankPoints =
    (1 * (props.player.first_place_count ?? 0)) +
    (2 * (props.player.second_place_count ?? 0)) +
    (3 * (props.player.third_place_count ?? 0)) +
    (4 * (props.player.fourth_place_count ?? 0));

  const avg = totalRankPoints / props.player.total_games_played;
  return avg.toFixed(2);
});

const playerIconSrc = computed(() => {
  if (!props.player || !props.player.id) return '/assets/images/info/hito_icon_1.png'; // プレイヤーオブジェクトまたはIDがない場合
  if (props.player.avatar_url) return props.player.avatar_url; // avatar_url が設定されていればそれを使用

  // AIプレイヤーのアイコン
  if (props.player.originalId === 'kuro') return '/assets/images/info/cat_icon_3.png';
  if (props.player.originalId === 'tama') return '/assets/images/info/cat_icon_2.png';
  if (props.player.originalId === 'tora') return '/assets/images/info/cat_icon_1.png';
  if (props.player.originalId === 'janneko') return '/assets/images/info/cat_icon_4.png';
  
  // 上記以外（人間プレイヤーでavatar_urlがnullの場合など）はデフォルトアイコン
  return '/assets/images/info/hito_icon_1.png';
});

const statBoardImageSrc = computed(() => {
  return locale.value === 'en'
    ? '/assets/images/info/board_en.png'
    : '/assets/images/info/board.png';
});
</script>

<style scoped>
/* オーバーレイとアニメーションの基本スタイルは変更なし */
.popup-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
  pointer-events: auto;
}

.popup-animation-enter-active,
.popup-animation-leave-active {
  transition: opacity 0.3s ease;
}
.popup-animation-enter-active .player-info-popup,
.popup-animation-leave-active .player-info-popup {
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.popup-animation-enter-from,
.popup-animation-leave-to {
  opacity: 0;
}
.popup-animation-enter-from .player-info-popup,
.popup-animation-leave-to .player-info-popup {
  transform: scale(0.8);
}

/* ポップアップ本体のレイアウトをCSS Gridに変更 */
.player-info-popup {
  width: 360px;
  height: 250px;
  background-image: url('/assets/images/back/omikuji_board.png');
  background-size: 100% 100%;
  padding: 20px;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 1));
  box-sizing: border-box;
  transform-origin: center;

  /* CSS Gridで新しいレイアウトを定義 */
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    "name      name"
    "icon      stats"
    "add-stats add-stats";
  align-items: center;
  justify-items: center;
  gap: 5px; /* グリッドアイテム間の隙間 */
  scale: 0.9;
}

/* 1. プレイヤー名 (一番上の中央) */
.player-name {
  grid-area: name;
  font-size: 1.5em;
  font-family: 'Yuji Syuku', serif;
  font-weight: bold;
  color: #4a2c1a;
  text-shadow: 1px 1px 2px rgba(43, 42, 42, 0.3);
  margin: 0;
  white-space: normal; /* 長い名前の場合、折り返しを許可 */
  text-align: center;
  line-height: 1.2;
  align-self: start; /* 上端に配置 */
  padding-top: 15px; /* 上部の余白を調整 */
}

/* 2. プレイヤーアイコン (中央左) */
.player-icon-area {
  grid-area: icon;
  justify-self: center;
  align-self: center;
  position: relative; /* バッジを絶対配置するために必要 */
}

.player-avatar {
  width: 90px;
  height: 90px;
  border-radius: 50%;
  border: 3px solid #411603;
  object-fit: cover;
  margin-top: -10px;
  margin-left: -5px;
}

.rank-badge {
  position: absolute;
  width: 80px; /* バッジのサイズを調整 */
  height: 80px; /* バッジのサイズを調整 */
  right: -42px; /* アイコンの右端に配置 */
  bottom: 15px; /* アイコンの下端に配置し、少しはみ出すように調整 */
  transform: translateX(25%) translateY(25%); /* アイコンの右下に少し重なるように調整 */
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3)); /* 影を追加して目立たせる */
}

/* 4. 追加情報のスタイル */
.additional-stats {
  grid-area: add-stats;
  justify-self: center;
  align-self: start;
  font-family: 'Yuji Syuku', serif;
  font-size: 1.0em;
  font-weight: bold;
  color: #4a2c1a;
  text-align: center;
  display: flex;
  gap: 20px;
  white-space: nowrap;
  margin-bottom: 30px;
  margin-top: -10px;
}

.stat-item {
  display: flex;
  align-items: center;
}

.stat-value-num {
  min-width: 40px; /* 数値部分の最小幅を確保 */
  text-align: left; /* 数値を左揃えにする */
  display: inline-block;
}


/* 3. レートと猫コイン (中央右) */
.player-stats-area {
  grid-area: stats;
  position: relative;
  width: 120px;
  height: 90px;
  justify-self: center;
  align-self: center;
  margin-top: 0px;
  margin-right: -10px;
}

.stat-board-image {
  width: 100%;
  height: 100%;
}

.stat-values-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-end;
  color: #fff;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
}

.stat-value-row {
  margin: 2px 0;
}

.rating-row {
  margin-top: -2px;
  margin-bottom: -5px;
}

.cat-coins-row {
  margin-top: 24px;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 1.1em;
  font-family: 'Yuji Syuku', serif;
  margin-right: 17px;
}
</style>


