<template>
  <transition name="scroll">
    <div
      v-if="show"
      class="popup-overlay"
      @click.self="$emit('close')"
    >
      <div class="popup-content">
        <h2>{{ $t('yakuListPopup.title') }}</h2>
        <p class="achievement-note">
          {{ $t('yakuListPopup.achievementNote') }}
        </p>
        <div class="popup-body">
          <div class="yaku-section">
            <table class="yaku-table">
              <thead>
                <tr>
                  <th>{{ $t('yakuListPopup.yakuNameHeader') }}</th>
                  <th>{{ $t('yakuListPopup.hanHeader') }}</th>
                  <th class="example-column">
                    {{ $t('yakuListPopup.exampleHeader') }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="yaku in normalYakuList"
                  :key="yaku.key"
                  :class="{ 'achieved-yaku': isAchieved(yaku.key) }"
                >
                  <td>{{ $t(`yaku.${yaku.key}.name`) }}</td>
                  <td>
                    {{ $t('yakuListPopup.han', { n: yaku.fans }) }}
                    <span v-if="yaku.menzenOnly"> {{ $t('yakuListPopup.menzenOnly') }}</span>
                    <span v-if="yaku.kuisagari"> {{ $t('yakuListPopup.kuisagari', { n: yaku.fans - yaku.kuisagari }) }}</span>
                  </td>
                  <td class="example-column">
                    <div class="yaku-example">
                      <span v-if="yaku.exampleTiles && yaku.exampleTiles.length > 0">
                        <img
                          v-for="(tile, index) in yaku.exampleTiles"
                          :key="index"
                          :src="determineTileImage(yaku, tile, index)"
                          :alt="determineTileAlt(yaku, tile, index)"
                          :class="['tile-image-small', getTileSpecificClass(yaku, index, yaku.exampleTiles.length)]"
                        >
                      </span>
                      <span v-else>-</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="yaku-section">
            <table class="yaku-table">
              <thead>
                <tr>
                  <th>{{ $t('yakuListPopup.yakumanNameHeader') }}</th>
                  <th>{{ $t('yakuListPopup.yakumanValueHeader') }}</th>
                  <th class="example-column">
                    {{ $t('yakuListPopup.exampleHeader') }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="yakuman in yakumanList"
                  :key="yakuman.key"
                  :class="{ 'achieved-yaku': isAchieved(yakuman.key) }"
                >
                  <td>{{ $t(`yaku.${yakuman.key}.name`) }}</td>
                  <td>{{ yakuman.power === 1 ? $t('yakuListPopup.yakuman') : $t('yakuListPopup.multipleYakuman', { n: yakuman.power }) }}</td>
                  <td class="example-column">
                    <div class="yaku-example">
                      <span v-if="yakuman.exampleTiles && yakuman.exampleTiles.length > 0">
                        <img
                          v-for="(tile, index) in yakuman.exampleTiles"
                          :key="index"
                          :src="determineTileImage(yakuman, tile, index)"
                          :alt="determineTileAlt(yakuman, tile, index)"
                          :class="['tile-image-small', getTileSpecificClass(yakuman, index, yakuman.exampleTiles.length)]"
                        >
                      </span>
                      <span v-else>-</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="close-button-container">
          <button
            class="close-button"
            @click="$emit('close')"
          >
            {{ $t('yakuListPopup.closeButton') }}
          </button>
        </div>
        <img
          src="/assets/images/back/fude.png"
          class="close-fude-image"
          alt="fude"
        >
      </div>
    </div>
  </transition>
</template>

<script setup>
  import { computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getTileImageUrl, tileToString } from '@/utils/tileUtils'; // 画像表示用ユーティリティ
import { YONHAI_YAKU, YONHAI_YAKUMAN } from '@/services/mahjongLogic'; // 役定義をインポート
import { useUserStore } from '@/stores/userStore'; // userStoreをインポート
import { useAudioStore } from '@/stores/audioStore'; // audioStoreをインポート

/**
 * 役一覧ポップアップコンポーネント。
 * 通常役と役満の一覧を表示し、達成済みの役をハイライトします。
 */
const props = defineProps({
  show: Boolean
});
defineEmits(['close']);

const { t } = useI18n();
const userStore = useUserStore(); // userStoreを使用
const audioStore = useAudioStore(); // audioStoreを使用

// achievedYakuはuserStoreから取得するため、refは不要

// コンポーネントがマウントされた時に実行
onMounted(() => {
  // userStoreがデータを読み込むのを待つ
  // achievedYakuはcomputedでuserStore.profileから直接参照するため、ここでは特別な処理は不要
});

watch(() => props.show, (newValue) => {
  if (newValue) {
    audioStore.playSound('Flyer02-1(Take).mp3');
  } else {
    audioStore.playSound('Flyer02-1(Take).mp3');
  }
});

/**
 * 指定された役が達成済みかどうかを判定します。
 * @param {string} yakuKey - 役のキー。
 * @returns {boolean} 達成済みであればtrue。
 */
const isAchieved = (yakuKey) => {
  return !!userStore.profile?.yaku_achievements?.[yakuKey];
};

/**
 * ドラと裏ドラを除いた通常の役のリストを返します。
 */
const normalYakuList = computed(() => {
  return Object.values(YONHAI_YAKU).filter(yaku =>
    yaku.key !== 'dora' && yaku.key !== 'uraDora'
  );
});
/**
 * 役満のリストを返します。
 */
const yakumanList = computed(() => Object.values(YONHAI_YAKUMAN));

/**
 * 役の例示牌の画像URLを決定します。
 * 特定の役（例: 一暗槓単騎）では裏向きの牌を表示します。
 * @param {Object} yaku - 役オブジェクト。
 * @param {Object} tile - 牌オブジェクト。
 * @param {number} index - 牌のインデックス。
 * @returns {string} 牌の画像URL。
 */
function determineTileImage(yaku, tile, index) {
  if (yaku.key === 'iiankanTanki' && (index === 2 || index === 5)) {
    return '/assets/images/tiles/ura.png'; // 裏向きの牌
  }
  return getTileImageUrl(tile);
}

/**
 * 役の例示牌のaltテキストを決定します。
 * 特定の役（例: 一暗槓単騎）では裏向きの牌であることを示します。
 * @param {Object} yaku - 役オブジェクト。
 * @param {Object} tile - 牌オブジェクト。
 * @param {number} index - 牌のインデックス。
 * @returns {string} 牌のaltテキスト。
 */
function determineTileAlt(yaku, tile, index) {
  if (yaku.key === 'iiankanTanki' && (index === 2 || index === 5)) {
    return t('yakuListPopup.facedownTile');
  }
  return tileToString(tile);
}

/**
 * 役の例示牌に適用するCSSクラスを決定します。
 * 特定の役（例: 一槓子）では牌の配置や回転を調整します。
 * @param {Object} yaku - 役オブジェクト。
 * @param {number} index - 牌のインデックス。
 * @param {number} exampleLength - 例示牌の総数。
 * @returns {Array<string>} 適用するCSSクラスの配列。
 */
function getTileSpecificClass(yaku, index, exampleLength) {
  const classes = [];
  // 通常の5枚和了の4枚目と5枚目の間のスペース
  if (index === 3 && yaku.key !== 'iikantsu' && yaku.key !== 'iiankanTanki' && exampleLength === 5) {
    classes.push('last-drawn-tile-spacer');
  }

  // 一槓子と一暗槓単騎の1枚目と2枚目、2枚目と3枚目の間のスペース
  if ((yaku.key === 'iikantsu' || yaku.key === 'iiankanTanki') && (index === 0 || index === 1)) {
    classes.push('kan-tile-spacer');
  }

  // 一槓子の6枚目を横向きにする
  if (yaku.key === 'iikantsu' && index === 5) {
    classes.push('tile-rotated');
  }
  return classes;
}

</script>

<style scoped>
.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.popup-content {
  background-image: url('/assets/images/back/rule.png');
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  padding: 20px 38px;
  border-radius: 8px;
  width: 90%;
  max-width: 500px; /* 最大幅を調整 */
  height: 90%;
  max-height: 700px; /* 最大高さを調整 */
  text-align: center;
  font-family: 'Yuji Syuku', serif;
  color: #3a2417; /* テキストの基本色 */
  text-shadow: 1px 1px 1px rgba(255, 255, 255, 0.2);
  display: flex;
  flex-direction: column;
  position: relative; /* close-buttonの基準点 */
}
.popup-body { /* 新しく追加するクラス */
  width: 89%;
  margin-left: 25px;
  margin-top: -5px; /* achievement-noteとの間隔を調整 */
  margin-bottom: 25px;
  text-align: left;
  font-size: 12px;
  line-height: 1.2;
  flex-grow: 1; /* 内容部分が残りの高さを埋めるように */
  overflow-y: auto; /* 内容が多い場合にスクロール */
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
}
.popup-body::-webkit-scrollbar {
  width: 5px;
}
.popup-body::-webkit-scrollbar-track {
  background: transparent;
}
.popup-body::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 10px;
}
h2 {
  font-size: 2em;
  margin-top: 30px;
  color: #4a2c1a;
}
.achievement-note {
  font-size: 0.8em;
  color: #4a2c1a;
  margin-top: -20px;
  margin-bottom: 10px;
  text-shadow: 1px 1px 1px rgba(255, 255, 255, 0.2);
}

.yaku-section {
  margin-bottom: 15px;
}

.yaku-table {
  width: 94%;
  margin-left: 0px;
  border-collapse: collapse;
  margin-top: 0px;
  font-size: 0.8em;
  color: #3a2417;
}
.yaku-table th, .yaku-table td {
  border: 1px solid #8a6d3b;
  padding: 0px;
  text-align: left;
  vertical-align: middle;
}
.yaku-table th {
  background-color: #d8c8a0;
  color: #4a2c1a;
  font-weight: bold;
}
.achieved-yaku {
  background-color: #f0e68c; /* 達成済みの役の背景色を少し明るい黄色に */
}
.example-column {
  width: 98px;
}
.yaku-example {
  display: flex;
  align-items: center;
  margin-left: 3px;
  gap: 1px;
  min-width: 0;
}
.tile-image-small {
  width: 14px;
  height: 19px;
  vertical-align: middle;
}
.last-drawn-tile-spacer {
  margin-right: 5px;
}
.kan-tile-spacer {
  margin-right: 3px;
}
.tile-rotated {
  transform: rotate(90deg);
  margin-left: 3px;
  margin-top: 6px;
}

.close-button-container {
  text-align: center;
  margin-top: 20px;
}
.close-button {
  position: absolute;
  bottom: 42px;
  right: 55px;
  background: none;
  border: none;
  font-family: 'Yuji Syuku', serif;
  font-size: 1.0em;
  color: white;
  cursor: pointer;
  padding: 5px;
  opacity: 0.9;
  text-shadow: 0 0 5px #4d2c1c, 0 0 8px #4d2c1c;
  transition: text-shadow 0.3s ease, color 0.3s ease;
}

.close-button:hover {
  color: #fffde7;
  text-shadow: 0 0 8px #4d2c1c, 0 0 12px #4d2c1c;
}

.close-fude-image {
  position: absolute;
  bottom: 40px;
  right: 58px;
  width: 60px;
  opacity: 0.8;
  pointer-events: none;
}

/* --- 巻物アニメーション --- */

/* 表示アニメーション */
.scroll-enter-active {
  transition: background-color 0.3s ease;
}
.scroll-enter-from {
  background-color: rgba(0,0,0,0);
}
.scroll-enter-active .popup-content {
  animation: unroll 0.6s cubic-bezier(0.25, 1, 0.5, 1);
}

/* 非表示アニメーション */
.scroll-leave-active {
  transition: background-color 0.3s ease 0.4s;
}
.scroll-leave-to {
  background-color: rgba(0,0,0,0);
}
.scroll-leave-active .popup-content {
  animation: unroll 0.4s cubic-bezier(0.25, 1, 0.5, 1) reverse forwards;
}

@keyframes unroll {
  0% {
    clip-path: inset(0 0 100% 0);
  }
  100% {
    clip-path: inset(0 0 0 0);
  }
}
</style>