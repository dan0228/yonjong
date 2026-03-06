-- ユーザーアカウントに関連する全てのデータを削除する関数
-- プリセットアバターへの変更に伴い、Storageの削除ロジックを削除しました。

-- 戻り値の型が text から void に変わるため、既存の関数を一度削除します
DROP FUNCTION IF EXISTS public.delete_user_data();

CREATE OR REPLACE FUNCTION public.delete_user_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- この関数は作成者の権限（管理者権限）で実行される
AS $$
DECLARE
    v_user_id uuid;
BEGIN
    -- 現在リクエストを送っているユーザーのIDを取得
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 1. users テーブルからユーザー情報を削除
    -- (テーブル定義で ON DELETE CASCADE が設定されている関連データも一緒に削除されます)
    DELETE FROM public.users WHERE id = v_user_id;

    -- 2. auth.users テーブルからユーザーアカウント(認証情報)を削除
    DELETE FROM auth.users WHERE id = v_user_id;
END;
$$;
