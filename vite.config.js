import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import fs from 'fs'; // fs モジュールをインポート

// Viteの設定
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // 使用するプラグインのリスト
  plugins: [
    vue(), // Vue 3のシングルファイルコンポーネントをサポート
  ],
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
  // 本番ビルド時に console.log と console.debug を自動的に削除する設定
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
    // または、特定のものだけ消したい場合は pure を使用
    // pure: mode === 'production' ? ['console.log', 'console.debug'] : [],
  },
}));
