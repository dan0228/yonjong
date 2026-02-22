<template>
  <div
    class="leaderboard-view-container"
    :style="{ height: viewportHeight }"
  >
    <div
      class="leaderboard-screen"
      :style="scalerStyle"
    >
      <div class="user-stats">
        <img
          :src="boardImageSrc"
          alt="Board"
          class="board-image"
        >
        <span class="rating-number-on-board">{{ userStore.profile?.rating ?? 1500 }}</span>
        <span class="cat-coins-number-on-board">{{ userStore.profile?.cat_coins || 0 }}</span>
      </div>
      <div class="top-controls">
        <h2 class="top-30-text">
          TOP30
        </h2>
        <button
          class="back-button"
          @click="goBack"
        >
          <img
            src="/assets/images/button/buckToTitle.png"
            :alt="$t('shrineView.backToTitle')"
          >
        </button>
      </div>

      <!-- eslint-disable-next-line vue/no-v-html -->
      <h1><span v-html="$t('leaderboardView.title')" /></h1>

      <!-- ランキング種類切り替えUI (New) -->
      <button 
        :class="['cat-coin-toggle-button', { active: activeRankingType === 'catCoins', vertical: locale === 'ja' }]" 
        @click="activeRankingType = 'catCoins'"
      >
        {{ $t('leaderboardView.typeCatCoins') }}
      </button>
      <button 
        :class="['rating-toggle-button', { active: activeRankingType === 'rating', vertical: locale === 'ja' }]" 
        @click="activeRankingType = 'rating'"
      >
        {{ $t('leaderboardView.typeRating') }}
      </button>

      <h2 class="ranking-list-title">
        {{ activeRankingTitle }}
      </h2>
      <img
        src="/assets/images/back/fude.png"
        class="fude-image"
        alt=""
      >
      <transition
        name="fade"
        mode="out-in"
      >
        <div
          v-if="!isLoading"
          class="ranking-list-container"
        >
          <div
            v-for="player in displayLeaderboard"
            :key="player.id"
            class="ranking-row"
            :class="{ 'is-first-place': player.isFirstPlace, 'is-second-place': player.isSecondPlace, 'is-third-place': player.isThirdPlace }"
          >
            <div class="rank">
              <img
                v-if="player.rank === 1"
                src="/assets/images/info/No1.png"
                alt="1st"
                class="rank-icon"
              >
              <img
                v-else-if="player.rank === 2"
                src="/assets/images/info/No2.png"
                alt="2nd"
                class="rank-icon"
              >
              <img
                v-else-if="player.rank === 3"
                src="/assets/images/info/No3.png"
                alt="3rd"
                class="rank-icon"
              >
              <template v-else>
                <img
                  src="/assets/images/info/hand.png"
                  alt="Rank"
                  class="rank-icon"
                >
                <span class="rank-number">{{ player.rank }}</span>
              </template>
            </div>
            <div class="player-info">
              <span class="user-name">{{ player.name }}</span>
              <div
                class="player-details"
                @click="openPlayerInfoPopup(player)"
              >
                <img
                  :src="player.avatar_url"
                  alt="avatar"
                  class="player-icon"
                >
                <span class="score">{{ player.score }}</span>
              </div>
            </div>
          </div>
        </div>
        <div
          v-else
          class="ranking-list-placeholder"
        >
          <!-- ローディング中にレイアウトが崩れないようにスペースを確保 -->
        </div>
      </transition>
    </div>
    <PlayerInfoPopup
      :show="showPlayerInfoPopup"
      :player="selectedPlayerForPopup"
      @close="closePlayerInfoPopup"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useViewportHeight } from '@/composables/useViewportHeight';
import { useAudioStore } from '@/stores/audioStore';
import { supabase } from '@/supabaseClient';
import { useUserStore } from '@/stores/userStore';
import PlayerInfoPopup from '@/components/PlayerInfoPopup.vue';

// --- リアクティブな状態とストア ---
const router = useRouter();
const { t, locale } = useI18n();
const { viewportHeight } = useViewportHeight();
const audioStore = useAudioStore();
const userStore = useUserStore();

const ratingLeaderboard = ref([]);
const catCoinsLeaderboard = ref([]);
const isLoading = ref(true);
const error = ref(null);
const activeRankingType = ref('rating');

const showPlayerInfoPopup = ref(false);
const selectedPlayerForPopup = ref(null);

// --- ポップアップ制御 ---
function openPlayerInfoPopup(player) {
  selectedPlayerForPopup.value = player;
  showPlayerInfoPopup.value = true;
}

function closePlayerInfoPopup() {
  showPlayerInfoPopup.value = false;
}

// --- 画面のスケーリング処理 ---
const DESIGN_WIDTH = 360;
const DESIGN_HEIGHT = 640;
const scaleFactor = ref(1);

const scalerStyle = computed(() => ({
  transform: `translate(-50%, -50%) scale(${scaleFactor.value})`
}));

const boardImageSrc = computed(() =>
  locale.value === 'en'
    ? '/assets/images/info/board_en.png'
    : '/assets/images/info/board.png'
);

const updateScaleFactor = () => {
  const currentWidth = window.innerWidth;
  const currentHeight = window.innerHeight;
  const scaleX = currentWidth / DESIGN_WIDTH;
  const scaleY = currentHeight / DESIGN_HEIGHT;
  scaleFactor.value = Math.min(scaleX, scaleY);
};

// --- データ取得ロジック ---
async function fetchLeaderboardData(type) {
  isLoading.value = true;
  error.value = null;
  try {
    const selectColumns = 'id, username, avatar_url, rating, cat_coins, total_games_played, sum_of_ranks, user_rank_class:class';
    let query = supabase.from('users').select(selectColumns);

    if (type === 'rating') {
      query = query.not('rating', 'is', null).order('rating', { ascending: false });
    } else if (type === 'catCoins') {
      query = query.not('cat_coins', 'is', null).order('cat_coins', { ascending: false });
    }
    
    const { data: fetchedData, error: supabaseError } = await query.limit(30);
    if (supabaseError) throw supabaseError;

    const processedData = fetchedData.map(player => ({
      id: player.id,
      name: player.username,
      score: type === 'rating' ? player.rating : player.cat_coins,
      avatar_url: player.avatar_url || '/assets/images/info/hito_icon_1.png',
      rating: player.rating,
      cat_coins: player.cat_coins,
      total_games_played: player.total_games_played,
      sum_of_ranks: player.sum_of_ranks,
      user_rank_class: player.user_rank_class,
    }));

    if (type === 'rating') {
      ratingLeaderboard.value = processedData;
    } else {
      catCoinsLeaderboard.value = processedData;
    }
  } catch (e) {
    console.error('ランキングの取得エラー:', e.message);
    error.value = e.message;
  } finally {
    isLoading.value = false;
  }
}

const displayLeaderboard = computed(() => {
  const currentData = activeRankingType.value === 'rating' ? ratingLeaderboard.value : catCoinsLeaderboard.value;
  const rankedData = [];
  let currentRank = 1;
  let previousValue = -1;
  let rankIncrement = 1;

  currentData.forEach((player, index) => {
    if (index > 0 && player.score < previousValue) {
      currentRank += rankIncrement;
      rankIncrement = 1;
    } else if (index > 0 && player.score === previousValue) {
      rankIncrement++;
    }
    
    rankedData.push({
      ...player,
      rank: currentRank,
      isFirstPlace: currentRank === 1,
      isSecondPlace: currentRank === 2,
      isThirdPlace: currentRank === 3,
    });
    previousValue = player.score;
  });
  return rankedData;
});

const activeRankingTitle = computed(() => {
  if (activeRankingType.value === 'rating') {
    return t('leaderboardView.typeRating');
  } else {
    return t('leaderboardView.typeCatCoins');
  }
});

// --- ライフサイクルフック ---
onMounted(() => {
  updateScaleFactor();
  window.addEventListener('resize', updateScaleFactor);
  fetchLeaderboardData(activeRankingType.value);
  audioStore.setBgm('GB-JP-A02-2(Menu-Loop105).mp3');
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateScaleFactor);
  audioStore.setBgm(null);
});

function goBack() {
  router.push('/');
}

watch(activeRankingType, (newType) => {
  fetchLeaderboardData(newType);
});
</script>

<style scoped>
.leaderboard-view-container {
  position: relative;
  width: 100vw;
  overflow: hidden;
  background-image: url('/assets/images/back/back_out.png');
  background-repeat: repeat;
}

.leaderboard-screen {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 360px;
  height: 640px;
  display: flex;
  flex-direction: column;
  align-items: center;
  font-family: 'Yuji Syuku', serif;
  color: #333;
  background-image: url('/assets/images/back/ranking.png');
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  box-sizing: border-box;
  touch-action: none !important;
}

.user-stats {
  position: absolute;
  top: 575px;
  left: 60px;
  z-index: 10;
}
.board-image {
  width: 90px;
  height: auto;
  filter: drop-shadow(0 0 10px rgba(255, 255, 255, 1));
  opacity: 0.9;
}
.rating-number-on-board, .cat-coins-number-on-board {
  position: absolute;
  right: 12px;
  font-family: 'Yuji Syuku', serif;
  font-size: 13px;
  color: rgb(255, 255, 255);
  text-shadow: 3px 3px 3px #000000;
}
.rating-number-on-board { top: 5px; }
.cat-coins-number-on-board { top: 37px; }

.top-controls {
  position: absolute;
  top: 567px;
  left: 67%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 10;
}
.top-30-text {
  font-family: 'Yuji Syuku', serif;
  font-size: 1.0em;
  color: #441800;
  text-shadow: 1px 1px 2px rgba(255,255,255,0.5);
  margin: 0;
}
.back-button {
  position: static;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  margin-bottom: 20px;
  z-index: 20;
}
.back-button img {
  width: 90px;
  height: auto;
  filter: drop-shadow(0 0 10px rgba(255, 255, 255, 1));
  transition: all 0.2s ease;
}
.back-button:hover img { transform: translateY(-4px); }

h1 {
  margin-top: 85px;
  margin-bottom: 5px;
  font-size: 1.65em;
  color: #5c4b4b;
}

.cat-coin-toggle-button,
.rating-toggle-button {
  position: absolute;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: 'Yuji Syuku', serif;
  font-size: 1.1em;
  color: #291d17;
  text-shadow: 1px 1px 2px rgba(255,255,255,0.5);
  padding: 5px;
  transition: all 0.2s;
  z-index: 11;
  white-space: nowrap;
}

.cat-coin-toggle-button.vertical {
  writing-mode: vertical-rl;
  top: 68px;
  left: 58px;
}
.rating-toggle-button.vertical {
  writing-mode: vertical-rl;
  top: 72px;
  right: 62px;
}

.cat-coin-toggle-button:not(.vertical) {
  transform: rotate(90deg);
  top: 95px;
  left: 36px;
  font-size: 0.9em;
}
.rating-toggle-button:not(.vertical) {
  transform: rotate(90deg);
  top: 92px;
  right: 40px;
}

.cat-coin-toggle-button.active,
.rating-toggle-button.active {
  font-weight: bold;
  color: #790d0d;
  text-shadow: 0 0 8px #fff;
}

.ranking-list-container {
  width: 100%;
  max-width: 280px;
  height: 442px;
  margin-top: 68px;
  overflow-y: auto;
  padding: 0px;
  box-sizing: border-box;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
  font-family: 'Yuji Syuku', serif;
  text-shadow: 0 0 5px #fff;
}
.ranking-list-container::-webkit-scrollbar {
  width: 5px;
}
.ranking-list-container::-webkit-scrollbar-track {
  background: transparent;
}
.ranking-list-container::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 10px;
}

.ranking-row {
  display: flex;
  align-items: center;
  padding: 4px 0px;
  margin-bottom: 6px;
  margin-left: 11px;
  background-color: transparent;
  border: none;
  border-radius: 0;
  border-bottom: 1px solid rgba(92, 75, 75, 0.4);
  color: #0f0f0f;
}
.ranking-row.is-first-place { border-color: #d4af37; }
.ranking-row.is-second-place { border-color: #a8a8a8; }
.ranking-row.is-third-place { border-color: #cd7f32; }

.rank {
  width: 45px;
  height: 45px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
}

.rank-number {
  position: absolute;
  top: 65%;
  left: 60%;
  transform: translate(-50%, -50%);
  font-size: 1.1em;
  font-weight: bold;
  color: #441800;
}

.rank-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
  margin-left: 10px;
}

.is-first-place .rank {
  width: 65px;
  height: 65px;
  margin-left: -3px;
}

.is-second-place .rank {
  width: 60px;
  height: 60px;
  margin-left: -2px;
}

.is-third-place .rank {
  width: 55px;
  height: 55px;
  margin-left: -1px;
}

.player-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-grow: 1;
  overflow: hidden;
  margin-left: 0px;
}

.player-details {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
  cursor: pointer;
}

.player-icon {
  width: 40px;
  height: 40px;
  margin-right: 20px;
  border-radius: 25%;
  border: 1px solid #200101;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}

.user-name {
  font-weight: 600;
  font-size: 1.2em;
  width: 300px;
  margin-left: 0px;
  overflow: hidden;
  text-overflow: clip;
  white-space: nowrap;
  border-bottom: 1px solid rgba(43, 6, 6, 0.15);
  text-align: center;
}

.score {
  font-size: 1.4em;
  font-weight: bold;
  min-width: 60px;
  text-align: right;
  flex-shrink: 0;
}

.ranking-list-title {
  font-family: 'Yuji Syuku', serif;
  font-size: 2.0em;
  color: #292525;
  margin-bottom: -24px;
  margin-top: -5px;
  text-align: center;
}

.fude-image {
  width: 150px;
  height: 15px;
  margin-top: 22px;
  margin-bottom: -56px;
}

.ranking-list-placeholder {
  width: 100%;
  max-width: 280px;
  height: 442px;
  margin-top: 68px;
  padding: 10px;
  box-sizing: border-box;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
