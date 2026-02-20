# よんじゃん！ - 猫と一緒に楽しむ新感覚麻雀ゲーム

<p align="center">
  <img src="https://mahjong-vue-app.vercel.app/assets/images/info/OGP.png" alt="よんじゃん！ゲーム画面のスクリーンショット" width="600">
</p>

<p align="center">
  <strong>よんじゃん！ - シンプルだけど奥深い４牌麻雀</strong>
</p>

<p align="center">
  <a href="https://mahjong-vue-app.vercel.app/"><strong>👉 ゲームをプレイする</strong></a>
</p>

---

## 🎯 ゲームの概要

「よんじゃん！」は、**手牌 4 枚**から始める超スピーディーな四人麻雀ゲームです。Vue.js 3 を使用して構築されており、PWA (Progressive Web App) としても動作するため、スマートフォンにインストールしてネイティブアプリのように遊ぶことも可能です。

3 人の個性的な CPU 対戦相手と、東場のみの短期決戦で腕を競いましょう！

### 🀄 新感覚の四牌麻雀 (ストックルール対応)

手牌が 4 枚でテンパイ、5 枚で和了（あがり）となる特殊ルール。初心者でもすぐに楽しめます。
さらに、**「ストックルール」**を導入！

#### ストックルールとは？

自分のターンに牌を引いた後、手牌とツモ牌の合計5枚の中から1枚を選んで「ストック」することができます。ストックした牌は他のプレイヤーにも公開され、次の自分のターンで山から牌をツモる代わりに、ストックした牌を手牌に加える選択が可能です。

**ストックアクションの条件:**

- 自分のターンに牌を引いた後。
- ストック牌をまだ持っていない。
- 鳴いていない、またはリーチ中でない。

**ストック牌の使用:**

- 自分のターンが来た時、山から牌をツモるか、ストックした牌を手牌に加えるかを選択できます。
- ストック牌を手牌に加えた場合、その牌でツモ和了やカンはできません。

## ✨ 主な特徴

- **🀄 新感覚の四牌麻雀:** 手牌が 4 枚でテンパイ、5 枚で和了（あがり）となる特殊ルール。初心者でもすぐに楽しめます。
- **🐈 個性的なキャラクター:** かわいい猫たちが対戦相手として登場し、ゲームを盛り上げます。
- **⚡ スピーディーなゲーム展開:** 東場のみの短期決戦なので、短い時間でサクッと遊べます。
- **🏆 ランキング機能:** 全国のプレイヤーとレートを競い合うことができます。
- **⛩️ お告げ集め:** ゲームで集めた「猫コイン」を使って、神社でありがたい（？）お告げを集めるコレクション要素。
- **🌐 多言語対応:** UI は日本語と英語に対応しており、動的に切り替えが可能です。
- **📱 PWA 対応:** スマートフォンのホーム画面に追加すれば、オフラインでも快適にプレイできます。
- **🎵 心地よい BGM:** ゲームの世界観に合わせた、懐かしさを感じるオリジナル BGM。

## 🛠️ 技術スタック

このプロジェクトは、以下のモダンな技術を使用して構築されています。

<p align="left">
  <img src="https://img.shields.io/badge/Vue.js-4FC08D?style=for-the-badge&logo=vue.js&logoColor=white" alt="Vue.js">
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/Pinia-FFD859?style=for-the-badge&logo=pinia&logoColor=black" alt="Pinia">
  <img src="https://img.shields.io/badge/Vue_Router-4FC08D?style=for-the-badge&logo=vue.js&logoColor=white" alt="Vue Router">
  <img src="https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase">
  <img src="https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel">
</p>

- **フレームワーク:** Vue.js 3 (Composition API)
- **ビルドツール:** Vite
- **状態管理:** Pinia
- **ルーティング:** Vue Router
- **BaaS:** Supabase (ランキング機能等)
- **国際化:** Vue I18n
- **デプロイ & 分析:** Vercel, Vercel Analytics

## 📂 プロジェクト構造

```
mahjong-vue-app/
├── public/              # 画像、音声、manifest.jsonなどの静的アセット
├── src/
│   ├── components/      # 再利用可能なVueコンポーネント
│   ├── composables/     # 再利用可能なコンポジション関数
│   ├── locales/         # en.json, ja.json などの言語ファイル
│   ├── router/          # ルーティング設定
│   ├── services/        # 麻雀のコアロジック
│   ├── stores/          # Piniaストア（グローバルな状態管理）
│   ├── styles/          # グローバルなCSSスタイル
│   ├── utils/           # 汎用的なユーティリティ関数
│   ├── views/           # 各画面（ページ）のコンポーネント
│   ├── App.vue          # アプリケーションのルートコンポーネント
│   ├── i18n.js          # Vue I18n の設定ファイル
│   ├── main.js          # アプリケーションのエントリーポイント
│   └── supabaseClient.js  # Supabaseクライアントの初期化
├── .env.example         # 環境変数のサンプルファイル
├── index.html           # メインのHTMLファイル
├── package.json         # プロジェクトの依存関係とスクリプト
└── vite.config.js       # Viteの設定ファイル
```

## 🚀 セットアップと実行方法

1.  **リポジトリをクローン:**

    ```bash
    git clone https://github.com/your-username/mahjong-vue-app.git
    cd mahjong-vue-app
    ```

2.  **依存関係のインストール:**

    ```bash
    npm install
    ```

3.  **環境変数の設定:**
    プロジェクトのルートに `.env` ファイルを作成し、Supabase プロジェクトの URL と Anon Key を設定します。

    ```
    VITE_SUPABASE_URL="YOUR_SUPABASE_URL"
    VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
    ```

    これらの値は、Supabase プロジェクトの `Settings` > `API` ページで確認できます。

4.  **開発サーバーの起動:**

    ```bash
    npm run dev
    ```

    `vite.config.js` の設定により、HTTPS 対応の開発サーバーが起動します。ブラウザで `https://localhost:5173` などにアクセスしてください。

5.  **本番用のビルド:**
    ```bash
    npm run build
    ```
    `dist` ディレクトリに最適化された本番用ファイルが生成されます。

## 📈 SEO 対策について

このプロジェクトでは、SPA でありながら検索エンジンに正しく認識されるよう、以下の基本的な SEO 対策を実装しています。

- **メタタグの動的更新:** Vue Router のナビゲーションガードを利用し、ページごとに最適な `title` と `description` を動的に設定。
- **OGP タグの設定:** SNS でシェアされた際に、適切なタイトルや画像が表示されるよう `index.html` に OGP タグを記述。
- **`robots.txt` と `sitemap.xml`:** クローラーの巡回を助けるためのファイルを `public` ディレクトリに設置。

---

開発者: [dan]
