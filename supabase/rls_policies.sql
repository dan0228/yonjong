-- 全テーブルの RLS (Row Level Security) 有効化
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_players_history ENABLE ROW LEVEL SECURITY;

-- 1. users テーブルのポリシー
-- 自分のプロフィールのみ参照可能
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- 自分のプロフィールのみ更新可能
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- 2. games / game_players テーブル
-- ゲームサーバー (Node.js) が service_role キーで操作するため、
-- クライアント（ユーザー）からの直接アクセスは一切許可しない（ポリシーを作成しないことで全拒否）

-- 3. 履歴テーブル
-- 将来的に自分の対戦履歴を見れるようにする場合のポリシー例（現在はサーバーのみ）
-- CREATE POLICY "Users can view own game history" ON public.game_players_history
--   FOR SELECT USING (auth.uid() = user_id);
