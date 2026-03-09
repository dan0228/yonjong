/**
 * アプリケーションのエントリーポイントです。
 * Vueインスタンスの作成、Pinia（状態管理）、Vue I18n（国際化）、
 * Vue Router（ルーティング）のセットアップ、およびVercel Analyticsの初期化を行います。
 * また、ページリロード時にゲームが意図せず継続されるのを防ぐための処理も含まれています。
 */

// --- ライブラリのインポート ---
import { createApp } from 'vue'; // Vueアプリケーションを作成するためのコア機能
import { createPinia } from 'pinia'; // 状態管理ライブラリ
import { inject } from '@vercel/analytics'; // Vercelアナリティクス

// --- 内部モジュールのインポート ---
import App from './App.vue'; // ルートコンポーネント
import router from './router'; // ルーター設定
import i18n from './i18n'; // 国際化(i18n)設定
import { useGameStore, GAME_PHASES } from './stores/gameStore'; // ゲーム状態ストア
import './styles/main.css'; // グローバルCSS

// Vercelアナリティクスを有効化
inject();

// --- Vueアプリケーションのインスタンス化とプラグインの適用 ---
const app = createApp(App);
const pinia = createPinia();

app.use(pinia); // PiniaをVueアプリケーションに登録
app.use(i18n); // Vue I18nを登録

// --- ルーターの準備完了後の初期化処理 ---
// この処理は、ページのリロード時にゲームが不正な状態で再開されることを防ぐためのものです。
router.isReady().then(() => {
  const gameStore = useGameStore();

  // ページリロード時にURLが'/game'であり、かつゲームが開始待機状態でない場合
  // (例: ゲームプレイ中や結果表示中にリロードされたケース)
  if (
    router.currentRoute.value.path === '/game' &&
    gameStore.gamePhase !== GAME_PHASES.WAITING_TO_START
  ) {
    // ゲームセッションをリセットし、ユーザーを安全にタイトル画面へリダイレクトします。
    gameStore.resetGameForNewSession();
    router.replace('/');
  }
});

// --- ルーターの適用とアプリケーションのマウント ---
app.use(router);
app.mount('#app');
