# よんじゃん！ - 猫と一緒に楽しむ新感覚麻雀ゲーム

<p align="center">
  <img src="https://www.yonjong.com/assets/images/info/OGP.png" alt="よんじゃん！ゲーム画面のスクリーンショット" width="600">
</p>

<p align="center">
  <strong>よんじゃん！ - シンプルだけど奥深い、超高速四牌麻雀</strong><br>
  <a href="https://www.yonjong.com/"><strong>👉 ゲームをプレイする</strong></a>
</p>

---

## 🎯 ゲームの概要

「よんじゃん！」は、**手牌4枚**から始める超スピーディーな四人麻雀ゲームです。Vue.js 3で構築されたWebアプリケーションでありながら、PWA (Progressive Web App) としても動作し、スマートフォンにインストールしてネイティブアプリのように遊ぶことも可能です。

個性的な猫AIとの対戦はもちろん、全国のプレイヤーとレートを競う**オンライン対戦**や、パスコードを使った**友人対戦**にも対応しています。

## ✨ 主な特徴

- **🀄 新感覚の四牌麻雀:** 手牌が4枚でテンパイ、5枚で和了（あがり）となる特殊ルール。独自の**ストックルール**も搭載。
- **🤖 猫AI対戦:** 個性豊かな3匹の猫AIといつでも対戦可能。
- **🌐 オンライン対戦:**
  - **レート戦:** 全国のプレイヤーと実力を競い合い、レートと階級を賭けて戦う真剣勝負。
  - **友人対戦:** 4桁のパスコードを共有し、友達と気軽に対戦。
- **🏆 ランキング機能:** レートと猫コインの所持数で全プレイヤー中の上位30名を表示。
- **⛩️ じゃんねこ神社:** ゲーム内通貨「猫コイン」を使い、お告げ（コレクションアイテム）を集める「おみくじ」機能。
- **📈 戦績と役コレクション:** これまでの順位や達成した役を記録し、いつでも確認可能。
- **🌍 多言語対応:** UIは日本語と英語に対応しており、動的に切り替えが可能。

## 🛠️ 技術スタック

このプロジェクトは、以下のモダンな技術を使用して構築されています。

#### フロントエンド
<p>
  <img src="https://img.shields.io/badge/Vue.js-4FC08D?style=for-the-badge&logo=vue.js&logoColor=white" alt="Vue.js">
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/Pinia-FFD859?style=for-the-badge&logo=pinia&logoColor=black" alt="Pinia">
</p>

- **フレームワーク:** Vue.js 3 (Composition API)
- **ビルドツール:** Vite
- **状態管理:** Pinia
- **ルーティング:** Vue Router
- **国際化:** Vue I18n

#### バックエンド & データベース
<p>
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio&logoColor=white" alt="Socket.io">
  <img src="https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase">
</p>

- **サーバー:** Node.js, Express
- **リアルタイム通信:** Socket.IO
- **BaaS (Database & Auth):** Supabase

#### デプロイ & インフラ
<p>
  <img src="https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel">
  <img src="https://img.shields.io/badge/Render-46E3B7?style=for-the-badge&logo=render&logoColor=white" alt="Render">
</p>

- **フロントエンド:** Vercel
- **バックエンド:** Render
- **分析:** Vercel Analytics

## 🏛️ アーキテクチャ概要

このアプリケーションは、フロントエンド、バックエンド、データベースが連携して動作する構成になっています。

```mermaid
graph TD
    subgraph "ユーザー (ブラウザ)"
        A[Vue.js (Vite/Pinia)]
    end

    subgraph "Vercel"
        B[静的ホスティング]
    end

    subgraph "Render"
        C[Node.js / Socket.IO サーバー]
    end

    subgraph "Supabase"
        D[PostgreSQL データベース]
        E[認証 (Auth)]
        F[DB関数 (RPC)]
        G[トリガー]
    end

    A -- HTTPリクエスト --> B
    A -- WebSocket接続 --> C
    A -- APIリクエスト (RPC) --> F
    A -- 認証 --> E

    C -- DB操作 --> D
    C -- RPC呼び出し --> F

    D -- トリガー実行 --> G

    linkStyle 0 stroke-width:2px,stroke:blue,fill:none;
    linkStyle 1 stroke-width:2px,stroke:red,fill:none;
    linkStyle 2 stroke-width:2px,stroke:green,fill:none;
    linkStyle 3 stroke-width:2px,stroke:green,fill:none;
    linkStyle 4 stroke-width:2px,stroke:purple,fill:none;
    linkStyle 5 stroke-width:2px,stroke:purple,fill:none;
    linkStyle 6 stroke-width:2px,stroke:orange,fill:none;
```

- **フロントエンド (Vue.js):** Vercelから配信される静的ファイル。UIの描画とユーザーインタラクションを担当します。AI対戦は完全にクライアントサイドで完結します。オンライン対戦時には、バックエンドサーバーとWebSocketで接続します。
- **バックエンド (Node.js):** Render上で稼働する権威サーバー。オンライン対戦のゲームロジック、リアルタイムな状態同期、Supabaseとのデータ連携を担います。
- **Supabase:**
  - **データベース:** ユーザー情報、ゲーム履歴、ランキングなどを永続化します。
  - **認証:** メールOTP認証と匿名認証（ゲスト）を提供します。
  - **DB関数 (RPC):** マッチング処理 (`find_or_create_match`) やデータ更新 (`update_user_stats_and_coins`) といった複雑なロジックをデータベース層にカプセル化し、サーバーから安全に呼び出せるようにしています。
  - **トリガー:** レート更新時に自動で階級を再計算するなど、データの整合性を保つためのロジックを実行します。
  - **RLS (Row Level Security):** ユーザーが自分のデータにしかアクセスできないように、厳格なセキュリティポリシーを定義しています。

## 📂 プロジェクト構造

```
mahjong-vue-app/
├── server/              # Node.js + Socket.IO のバックエンドサーバー
│   ├── src/
│   │   └── mahjongLogic.js # 麻雀のコアロジック（クライアントと共有）
│   └── index.js         # サーバーのエントリーポイント
├── src/                 # Vue.js フロントエンド
│   ├── components/      # 再利用可能なVueコンポーネント
│   ├── stores/          # Piniaストア (gameStore, userStore, audioStore)
│   ├── views/           # 各画面（ページ）のコンポーネント
│   ├── main.js          # アプリケーションのエントリーポイント
│   └── supabaseClient.js  # Supabaseクライアントの初期化
├── supabase/            # Supabaseのデータベース定義
│   ├── functions/       # Edge Functions (CORS設定など)
│   ├── migrations/      # DBマイグレーションファイル
│   └── *.sql            # テーブル定義, 関数(RPC), トリガー, RLSポリシー
└── public/              # 静的アセット (画像, 音声, sitemap.xmlなど)
```

## 🚀 ローカルでの実行方法

#### 1. 前提条件
- Node.js (v18以降)
- Supabase アカウント, または Supabase CLI (ローカル開発用)

#### 2. 環境変数の設定
プロジェクトのルートと`server`ディレクトリにそれぞれ`.env`ファイルを作成します。

**ルートディレクトリ (`./.env`):**
```
VITE_SUPABASE_URL="YOUR_SUPABASE_URL"
VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
```

**サーバーディレクトリ (`./server/.env`):**
```
SUPABASE_URL="YOUR_SUPABASE_URL"
SUPABASE_SERVICE_KEY="YOUR_SUPABASE_SERVICE_KEY"
PORT=3000
```
- `URL`と`ANON_KEY`はSupabaseプロジェクトの `Settings > API` で確認できます。
- `SERVICE_KEY`は同ページにありますが、取り扱いには十分注意してください。

#### 3. Supabaseデータベースのセットアップ
`/supabase`ディレクトリ内の`.sql`ファイルを順に実行し、テーブル、関数、トリガー、RLSポリシーをセットアップします。

#### 4. フロントエンドの起動
```bash
# ルートディレクトリで実行
npm install
npm run dev
```
`vite.config.js`の設定により、HTTPS対応の開発サーバーが `https://localhost:5173` などで起動します。

#### 5. バックエンドの起動
```bash
# 別のターミナルで実行
cd server
npm install
npm start
```
バックエンドサーバーが `http://localhost:3000` で起動します。

---

開発者: dan
