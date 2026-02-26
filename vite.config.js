import { defineConfig, loadEnv } from 'vite'; // loadEnv をインポート
import vue from '@vitejs/plugin-vue';
import path from 'path';
import fs from 'fs'; // fs モジュールをインポート

// Viteの設定
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => { // `mode` を引数として受け取る
  // 環境変数をロード
  const env = loadEnv(mode, process.cwd(), '');

  return {
    // 使用するプラグインのリスト
    plugins: [
      vue(), // Vue 3のシングルファイルコンポーネントをサポート
    ],
    // ★修正: 環境変数を import.meta.env 経由で定義してビルド時にインライン化
    define: {
      'import.meta.env.VITE_APP_GAME_SERVER_URL': JSON.stringify(env.VITE_APP_GAME_SERVER_URL),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY),
    },
    // モジュールの解決方法を設定
    resolve: {
      // エイリアスの設定
      alias: {
        // '@' を 'src' ディレクトリへの絶対パスにマッピング
        '@': path.resolve(__dirname, './src'),
      },
    },
    // 開発サーバーの設定を追加
    server: {
      host: true, // すべてのネットワークインターフェースでリッスン
      https: {
        key: fs.readFileSync(path.resolve(__dirname, 'localhost+1-key.pem')),
        cert: fs.readFileSync(path.resolve(__dirname, 'localhost+1.pem')),
      },
    },
  };
});
