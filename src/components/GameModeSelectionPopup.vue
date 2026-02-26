<template>
  <div
    v-if="show"
    class="popup-overlay"
    @click.self="closePopup"
  >
    <div
      class="popup-container"
      :style="containerStyle"
    >
      <button
        class="close-button"
        @click="closePopup"
      >
        ×
      </button>
      <div class="popup-content">
        <!-- ボタンをループ処理 -->
                  <div
                    v-for="button in buttons"
                    :key="button.id"
                    class="mode-option"
                    :class="[button.customClass, { 'clickable': !button.isForm }]"
                    @click="!button.isForm && selectOption(button.id, null)"
                  >
                    <!-- 通常の選択肢 -->
                    <div v-if="!button.isForm">
                      <!-- @clickイベントは親要素に移動 -->
                      <div class="mode-title">
                        {{ button.title }}
                      </div>
                      <div class="mode-description">
                        {{ button.description }}
                      </div>
                    </div>
          <!-- 友人対戦フォーム -->
          <div v-if="button.isForm">
            <div class="mode-title form-title">
              {{ button.title }}
            </div>
            <div class="friend-match-form">
              <div
                class="passcode-wrapper"
                @paste.prevent="handlePaste"
              >
                <input
                  v-for="i in 4"
                  :key="i"
                  :ref="el => (inputRefs[i - 1] = el)"
                  v-model="passcode[i - 1]"
                  type="tel"
                  maxlength="1"
                  class="passcode-input"
                  @input="handleInput(i - 1, $event)"
                  @keydown="handleKeydown(i - 1, $event)"
                  @focus="handleFocus(i-1)"
                  @click.stop
                >
              </div>
              <div class="form-buttons">
                <button
                  class="form-button enter-room-btn"
                  @click="selectOption('enter_room')"
                >
                  {{ t('gameModeSelection.enterRoom') }}
                </button>
                <button
                  class="form-button create-room-btn"
                  @click="selectOption('create_room')"
                >
                  {{ t('gameModeSelection.createRoom') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, defineProps, defineEmits } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  show: {
    type: Boolean,
    required: true,
  },
  backgroundImage: {
    type: String,
    required: true,
  },
  buttons: {
    type: Array,
    required: true,
  },
});

const emit = defineEmits(['close', 'select']);

// --- パスコード入力ロジック ---
const passcode = ref(['', '', '', '']);
const inputRefs = ref([]);

const handleInput = (index, event) => {
  const value = event.target.value;
  // 半角数字以外を削除
  passcode.value[index] = value.replace(/[^0-9]/g, '');

  // 1文字入力されたら次の入力欄にフォーカスを移動
  if (passcode.value[index] && index < 3) {
    inputRefs.value[index + 1].focus();
  }
};

const handleKeydown = (index, event) => {
  // Backspaceキーが押され、入力欄が空の場合、前の入力欄にフォーカスを移動
  if (event.key === 'Backspace' && !passcode.value[index] && index > 0) {
    inputRefs.value[index - 1].focus();
  }
};

const handleFocus = (index) => {
  // フォーカス時に中身を選択状態にする
  inputRefs.value[index].select();
};

const handlePaste = (event) => {
  const pasteData = event.clipboardData.getData('text').replace(/[^0-9]/g, '');
  if (pasteData.length === 4) {
    passcode.value = pasteData.split('');
    inputRefs.value[3].focus(); // 最後の入力欄にフォーカス
  }
};

// --- ポップアップロジック ---
const containerStyle = computed(() => ({
  backgroundImage: `url(${props.backgroundImage})`,
}));

const closePopup = () => {
  emit('close');
};

const selectOption = (action) => {
  const fullPasscode = passcode.value.join('');
  if (action === 'enter_room' || action === 'create_room') {
    emit('select', { action, passcode: fullPasscode });
  } else {
    emit('select', { action });
  }
};
</script>

<style scoped>
.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.popup-container {
  background-size: cover;
  background-position: center;
  border-radius: 0px;
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
  width: 650px;
  height: 180px;
  position: relative;
  font-family: 'Yuji Syuku', serif;
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  animation: slap-in 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.close-button {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(122, 106, 83, 0.6);
  color: rgba(255, 255, 255, 0.8);
  border: 0px solid rgba(255, 255, 255, 0.5);
  border-radius: 50%;
  width: 24px;
  height: 24px;
  font-size: 1.2em;
  line-height: 22px;
  cursor: pointer;
  box-shadow: none;
  z-index: 10;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
}

.close-button:hover {
  background: rgba(122, 106, 83, 0.8);
  color: white;
}

.popup-content {
  position: relative;
  width: 100%;
  height: 100%;
}

.mode-option {
  width: 130px;
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  font-family: 'Yuji Syuku', serif;
  color: #4a2c1a;
  text-shadow: 1px 1px 2px rgba(255, 255, 255, 0.8);
  padding: 10px 0px;
  transition: transform 0.2s, color 0.2s;
  text-align: center;
  box-shadow: none;
}

.mode-option.clickable {
  cursor: pointer;
}

.mode-left {
  left: 10px;
  top: 80px;
}

.mode-right {
  right: 18px;
  top: 85px;
}

.mode-right.online-ranked-button {
  top: 90px;
  padding-bottom: 50px; /* 下方向のクリック領域を拡大 */
}

.mode-option.clickable:hover {
  transform: translateY(-50%) scale(1.05);
  color: #7a6a53;
  text-shadow: 0px 0px 8px rgba(255, 255, 255, 1);
}

.mode-title {
  font-size: 1.5em;
  font-weight: bold;
  margin-bottom: 5px;
  color: #4a2c1a;
}

.mode-description {
  font-size: 0.9em;
  line-height: 1.2;
  color: #6d5f4b;
  white-space: pre-line;
}

/* 友人対戦フォーム用のスタイル */
.form-title {
  margin-bottom: 10px;
  margin-left: 10px;
  transform: translateY(5px); /* タイトルを上に移動 */
}

.friend-match-form {
  display: flex;
  flex-direction: column; /* 縦並びに変更 */
  align-items: center;
  justify-content: center;
  gap: 0px; /* パーツ間の隙間を調整 */
  transform: translateY(-10px);
}

.passcode-wrapper {
  display: flex;
  gap: 3px;
  margin-left: 10px;
}

.passcode-input {
  width: 20px; /* 幅を調整 */
  height: 20px;
  padding: 0;
  font-size: 1.0em; /* フォントサイズを小さく */
  text-align: center;
  border: none;
  border-bottom: 2px solid #8a745b; /* 下線のみに */
  background: transparent; /* 背景を透明に */
  border-radius: 0; /* 角丸をなくす */
  font-family: 'Yuji Syuku', serif;
  color: #4a2c1a;
}

.passcode-input:focus {
  outline: none;
  border-bottom-color: #4a2c1a;
}

.form-buttons {
  display: flex;
  flex-direction: row; /* 横並びに変更 */
  justify-content: center;
  gap: 5px; /* ボタン間の隙間 */
  margin-top: 3px;
  margin-left: 13px;
}

.form-button {
  /* テキストを中央に配置するための設定 */
  display: flex;
  justify-content: center;
  align-items: center; 
  width: 55px; /* ボタンの幅 */
  height: 21px; /* ボタンの高さ */
  font-size: 0.8em; /* 文字サイズ調整 */
  color: #4a2c1a;
  /* 背景画像用の設定 */
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  
  /* デフォルトのボタンスタイルをリセット */
  background-color: transparent;
  border: none;
  padding: 0;
  
  cursor: pointer;
  font-family: 'Yuji Syuku', serif;
  transition: transform 0.1s ease-out;
}

.form-button:hover {
  transform: scale(1.05); /* ホバー時に少し拡大 */
}

.enter-room-btn {
  background-image: url('/assets/images/button/board_ori.png');
}

.create-room-btn {
  background-image: url('/assets/images/button/board_hand.png');
}


@keyframes slap-in {
  0% {
    opacity: 0;
    transform: scale(1.5);
  }
  60% {
    opacity: 1;
    transform: scale(0.95);
  }
  80% {
    transform: scale(1.02);
  }
  100% {
    transform: scale(1);
  }
}
</style>