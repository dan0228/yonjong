import { createRouter, createWebHashHistory } from 'vue-router';
import TitleView from '../views/TitleView.vue';
import GameView from '../views/GameView.vue';
import JannekoShrineView from '../views/JannekoShrineView.vue';
import MatchmakingView from '../views/MatchmakingView.vue';
import { useAudioStore } from '../stores/audioStore';

const routes = [
  {
    path: '/email-confirmed',
    name: 'EmailConfirmed',
    component: () => import('../views/EmailUpdateConfirmationView.vue'),
    meta: {
      title: 'メールアドレス更新完了 | よんじゃん！',
      description: 'メールアドレスの更新が完了しました。',
    },
  },
  {
    path: '/',
    name: 'Title',
    component: TitleView,
    meta: {
      title: 'よんじゃん！ - シンプルだけど奥深い４牌麻雀',
      description: 'かわいい猫たちとオンラインで楽しめる麻雀ゲーム。初心者から上級者まで、いつでもどこでも手軽にプレイ！',
      bgm: 'NES-JP-A01-2(Title-Loop115).mp3'
    },
  },
  {
    path: '/game',
    name: 'Game',
    component: GameView,
    meta: {
      title: '対局画面 | よんじゃん！',
      description: '猫たちとの麻雀対局が楽しめるプレイ画面です。',
      bgm: 'NES-JP-A03-2(Stage2-Loop140).mp3'
    },
  },
  {
    path: '/shrine',
    name: 'JannekoShrine',
    component: JannekoShrineView,
    meta: {
      title: 'じゃんねこ神社 | よんじゃん！',
      description: 'ゲームで集めた「猫コイン」を使って、たくさんのお告げを集めよう！',
      bgm: 'GB-JP-A02-2(Menu-Loop105).mp3'
    },
  },
  {
    path: '/leaderboard',
    name: 'Leaderboard',
    component: () => import('../views/LeaderboardView.vue'),
    meta: {
      title: 'ランキング | よんじゃん！',
      description: '猫コインとレートのランキングです。',
      bgm: 'GB-JP-A02-2(Menu-Loop105).mp3'
    },
  },
  {
    path: '/matchmaking',
    name: 'Matchmaking',
    component: MatchmakingView,
    meta: {
      title: '対戦待機中 | よんじゃん！',
      description: 'オンライン対戦のマッチングを行っています。',
      bgm: 'NES-JP-A02-2(Stage1-Loop110).mp3',
      loopingSounds: ['takibi.mp3']
    },
  },
];

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes,
});

// SEO: メタタグを更新するためのデフォルト値
const DEFAULT_TITLE = 'よんじゃん！';

/**
 * 各ルート遷移後に実行されるグローバルアフターフック。
 * ページのタイトルとメタディスクリプションを更新し、SEO対策を行います。
 * @param {RouteLocationNormalized} to - 遷移先のルートオブジェクト
 */
router.afterEach((to) => {
  // ページのタイトルを更新 (ルートメタ情報にタイトルがあればそれを使用、なければデフォルトタイトル)
  document.title = to.meta.title || DEFAULT_TITLE;

  // メタディスクリプションを更新
  const description = document.querySelector('meta[name="description"]');
  if (description) {
    description.setAttribute('content', to.meta.description || '');
  }
});






/**
 * 各ルート遷移前に実行されるグローバルビフォーフック。
 * BGMの切り替えと、アプリケーションの初回ロード時のリダイレクトを処理します。
 * @param {RouteLocationNormalized} to - 遷移先のルートオブジェクト
 * @param {RouteLocationNormalized} from - 遷移元のルートオブジェクト
 * @param {NavigationGuardNext} next - ナビゲーションを解決するための関数
 */
router.beforeEach((to, from, next) => {
  const audioStore = useAudioStore();

  // Stop any previously looping sounds
  audioStore.stopAllLoopingSounds();

  // Set new BGM if it's different
  if (to.meta.bgm !== from.meta.bgm) {
    audioStore.setBgm(to.meta.bgm);
  }

  // Play any new looping sounds
  if (to.meta.loopingSounds) {
    to.meta.loopingSounds.forEach(soundName => {
      audioStore.playSound(soundName, { loop: true });
    });
  }

  // タイトル画面から「ブラウザの戻る/進む」等で直接ゲームやマッチング画面に侵入するのを防ぐ
  if (from.name === 'Title' && (to.name === 'Game' || to.name === 'Matchmaking')) {
    // router.push 等の正常なプログラム遷移以外（ポップステート等）を弾きたいが、
    // 確実にするため、ここは Store の状態も見てガードするのが安全。
    // 今回はシンプルに Title からの予期せぬ戻る/進む遷移をリセットする。
    // ※ 正常な遷移（ボタンクリック等）はルーターフックよりもコンポーネント内で replace を使うことで対応する。
  }

  // ゲーム画面やマッチング画面から予期せず離脱する場合の切断処理とリダイレクト
  if (from.name === 'Game' || from.name === 'Matchmaking') {
    // 正常な「タイトルへ戻る」ボタン等による遷移の場合
    if (to.name === 'Title') {
      import('../stores/gameStore').then(({ useGameStore }) => {
        const gameStore = useGameStore();
        gameStore.disconnectOnlineGame();
      });
      return next(); // 通常のVueルーターによる遷移を許可（猫は起きない）
    }

    // ブラウザの戻るボタンや不正なURL直打ちなど、タイトル以外への意図しない遷移の場合
    import('../stores/gameStore').then(({ useGameStore }) => {
      const gameStore = useGameStore();
      gameStore.disconnectOnlineGame();
      // 完全なリロードを行って初期起動画面（猫を起こす）へ戻す
      window.location.replace(window.location.origin + '/#/');
      window.location.reload();
    });
    return;
  }
// 既に切断されている状態（タイトル画面等）で、ブラウザの戻る/進むボタン等により
// 不正にゲームやマッチング画面に戻ろうとするのを防ぐ
if ((to.name === 'Game' || to.name === 'Matchmaking') && from.name !== 'Matchmaking') {
  // Vue Routerの非同期フック内でPiniaストアに安全にアクセス
  import('../stores/gameStore').then(({ useGameStore }) => {
      const gameStore = useGameStore();
      // マッチングを要求していない、またはゲームが開始されていないのに遷移しようとした場合はブロック
      if (!gameStore.isMatchmakingRequested && !gameStore.isGameOnline && gameStore.gameMode !== 'vsCPU') {
         // 不正侵入時は完全にリロードして WakeUpCatScreen を強制
         window.location.replace(window.location.origin + '/#/');
         window.location.reload();
      }
  });
}

  // 意図しない画面遷移や初期ロード時は、必ずタイトル（猫を起こす画面）にリダイレクトする
  if (from.name === undefined && to.name !== 'Title' && to.name !== 'EmailConfirmed') {
    window.location.replace(window.location.origin + '/#/');
    window.location.reload();
    return;
  }

  next();
});

export default router;