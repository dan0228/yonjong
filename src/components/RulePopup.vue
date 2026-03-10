<template>
  <transition name="scroll">
    <div
      v-if="show"
      class="popup-overlay"
      @click.self="$emit('close')"
    >
      <div class="popup-content">
        <h2>{{ $t('rulePopup.title') }}</h2>

        <!-- Tab Buttons -->
        <div class="tab-buttons">
          <button
            :class="{ active: activeTab === 'basic' }"
            @click="activeTab = 'basic'"
          >
            {{ $t('rulePopup.tabs.basic') }}
          </button>
          <button
            :class="{ active: activeTab === 'stock' }"
            @click="activeTab = 'stock'"
          >
            {{ $t('rulePopup.tabs.stock') }}
          </button>
        </div>

        <div class="popup-body">
          <!-- Basic Rules Content -->
          <div v-if="activeTab === 'basic'">
            <p class="subtitle">
              {{ $t('rulePopup.subtitle') }}
            </p>
            <div
              v-for="section in basicRuleSections"
              :key="section"
              class="section"
            >
              <h3>{{ $t(`rulePopup.sections.${section}.title`) }}</h3>
              <p>{{ $t(`rulePopup.sections.${section}.description`) }}</p>
            </div>
            
            <!-- レートと階級 セクション -->
            <div class="section rating-system-section">
              <h3>{{ $t('rulePopup.sections.ratingSystem.title') }}</h3>
              <p>{{ $t('rulePopup.sections.ratingSystem.description') }}</p>
              
              <div class="class-info-list">
                <div class="class-info-item">
                  <img
                    :src="`/assets/images/info/kitten${langSuffix}.png`"
                    alt="Kitten Class"
                    class="class-badge"
                  >
                  <div class="class-details">
                    <span
                      class="class-condition"
                      style="white-space: pre-wrap;"
                    >{{ $t('rulePopup.sections.ratingSystem.class1.condition') }}</span>
                  </div>
                </div>
                
                <div class="class-info-item">
                  <img
                    :src="`/assets/images/info/alley${langSuffix}.png`"
                    alt="Alley Class"
                    class="class-badge"
                  >
                  <div class="class-details">
                    <span
                      class="class-condition"
                      style="white-space: pre-wrap;"
                    >{{ $t('rulePopup.sections.ratingSystem.class2.condition') }}</span>
                  </div>
                </div>
                
                <div class="class-info-item">
                  <img
                    :src="`/assets/images/info/boss${langSuffix}.png`"
                    alt="Boss Class"
                    class="class-badge"
                  >
                  <div class="class-details">
                    <span
                      class="class-condition"
                      style="white-space: pre-wrap;"
                    >{{ $t('rulePopup.sections.ratingSystem.class3.condition') }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Stock Rules Content -->
          <div v-if="activeTab === 'stock'">
            <div class="section">
              <h3>{{ $t('rulePopup.stockTitle') }}</h3>
              <p>{{ $t('rulePopup.stockDescription') }}</p>
            </div>
            <div class="section">
              <h3>{{ $t('rulePopup.stockConditionsTitle') }}</h3>
              <ul>
                <li
                  v-for="item in $tm('rulePopup.stockConditions')"
                  :key="item"
                >
                  {{ item }}
                </li>
              </ul>
            </div>
            <div class="section">
              <h3>{{ $t('rulePopup.stockUsageTitle') }}</h3>
              <ul>
                <li
                  v-for="item in $tm('rulePopup.stockUsage')"
                  :key="item"
                >
                  {{ item }}
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div class="close-button-container">
          <button
            class="close-button"
            @click="$emit('close')"
          >
            {{ $t('rulePopup.closeButton') }}
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
import { ref, watch, computed } from 'vue';
import { useAudioStore } from '@/stores/audioStore';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  show: Boolean
});
defineEmits(['close']);

const { locale } = useI18n();
const langSuffix = computed(() => locale.value === 'en' ? '_en' : '');

const activeTab = ref('basic'); // 'basic' or 'stock'

// 表示するルールセクションのキーリスト
const basicRuleSections = ref([
  'basics',
  'scoring',
  'dora',
  'calls',
  'riichi',
  'draws',
  'priority',
  'points',
  'endCondition'
]);

const audioStore = useAudioStore();

watch(() => props.show, (newValue) => {
  if (newValue) {
    audioStore.playSound('Flyer02-1(Take).mp3');
  } else {
    audioStore.playSound('Flyer02-1(Take).mp3');
  }
});
</script>

<style scoped>
/* HowToPlayPopup.vue のスタイルをベースに適用 */
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
  overflow-y: auto;
  text-align: center;
  font-family: 'Yuji Syuku', serif;
  color: #3a2417; /* テキストの基本色 */
  text-shadow: 1px 1px 1px rgba(255, 255, 255, 0.2);
  display: flex;
  flex-direction: column;
  position: relative; /* close-buttonの基準点 */
}
.popup-body {
  width: 85%;
  margin-left: 25px;
  margin-top: -10px;
  margin-bottom: 28px;
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
.section {
  margin-bottom: 5px;
}
.section h3 {
  font-size: 1.5em;
  text-align: center;
  margin-bottom: 15px;
  color: #4a2c1a;
  border-bottom: 1px solid #8a6d3b;
  padding-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.section p, .section ul, .section ol, .section dl {
  margin-left: 3px;
  margin-right: 3px;
}
.section ul, .section ol {
  padding-left: 25px;
}
.section strong {
  color: #a94442;
}
.section dt {
  font-weight: bold;
  margin-top: 15px;
  color: #4a2c1a;
}
.section dd {
  margin-left: 1.5em;
}
.conclusion {
  text-align: center;
  font-weight: bold;
  margin-top: 25px;
  font-size: 1.4em;
  color: #4a2c1a;
}

.close-button-container {
  text-align: center;
  margin-top: 20px;
}
.close-button {
  position: absolute;
  bottom: 42px; /* fude.pngを配置するため少し上に調整 */
  right: 55px;
  background: none;
  border: none;
  font-family: 'Yuji Syuku', serif;
  font-size: 1.0em;
  color: white; /* テキストを白に変更 */
  cursor: pointer;
  padding: 5px;
  opacity: 0.9;
  /* 暗い色のシャドウで、白いテキストの周りにグロー効果を作成 */
  text-shadow: 0 0 5px #4d2c1c, 0 0 8px #4d2c1c;
  transition: text-shadow 0.3s ease, color 0.3s ease;
}

.close-button:hover {
  color: #fffde7; /* 少し黄色がかった白 */
  text-shadow: 0 0 8px #4d2c1c, 0 0 12px #4d2c1c; /* ホバーで発光を強く */
}

.close-fude-image {
  position: absolute;
  bottom: 40px;
  right: 58px; /* ボタンの位置に合わせて調整 */
  width: 60px; /* 小さく表示 */
  opacity: 0.8;
  pointer-events: none; /* 画像がクリックイベントを妨げないように */
}

/* Tab styles */
.tab-buttons {
  display: flex;
  justify-content: center; /* 中央寄せ */
  border-bottom: 1px solid #8a6d3b; /* 線の色を調整 */
  margin-bottom: 10px;
  margin-left: 25px;
  margin-right: 25px;
  padding-bottom: 5px; /* 線とボタンの間に少しスペース */
}
.tab-buttons button {
  padding: 8px 12px; /* パディングを調整 */
  border: none;
  background-color: transparent;
  cursor: pointer;
  font-size: 0.9em; /* フォントサイズを調整 */
  font-family: 'Yuji Syuku', serif; /* フォントを合わせる */
  color: #4a2c1a; /* テキスト色を合わせる */
  border-bottom: 3px solid transparent;
  margin: 0 0px; /* ボタン間のマージン */
  transition: all 0.2s ease;
}
.tab-buttons button.active {
  color: #a94442; /* アクティブなタブの色 */
  font-weight: bold;
  border-bottom-color: #a94442; /* アクティブなタブの下線色 */
}
.tab-buttons button:hover:not(.active) {
  color: #7a3c2a; /* ホバー時の色 */
}

/* Rating System Styles */
.rating-system-section {
  margin-top: 15px;
  padding-top: 5px;
  border-top: 1px dashed rgba(138, 109, 59, 0.5);
}
.class-info-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 5px;
}
.class-info-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background-color: rgba(255, 255, 255, 0.4);
  padding: 2px 0px;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
.class-badge {
  width: 70px;
  height: 70px;
  object-fit: contain;
}
.class-details {
  display: flex;
  flex-direction: column;
}
.class-condition {
  font-size: 1.0em;
  font-weight: bold;
  color: #4a2c1a;
  line-height: 1.4;
}

/* --- 巻物アニメーション --- */

/* 表示アニメーション */
.scroll-enter-active {
  transition: background-color 0.3s ease; /* 背景のフェードイン */
}
.scroll-enter-from {
  background-color: rgba(0,0,0,0);
}
.scroll-enter-active .popup-content {
  animation: unroll 0.6s cubic-bezier(0.25, 1, 0.5, 1); /* 巻物コンテンツが開く */
}

/* 非表示アニメーション */
.scroll-leave-active {
  /* 背景のフェードアウト。巻物が閉じるアニメーション(0.4s)が終わってから開始 */
  transition: background-color 0.3s ease 0.4s;
}
.scroll-leave-to {
  background-color: rgba(0,0,0,0);
}
.scroll-leave-active .popup-content {
  animation: unroll 0.4s cubic-bezier(0.25, 1, 0.5, 1) reverse forwards; /* 巻物コンテンツが閉じる & 最終状態で停止 */
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
