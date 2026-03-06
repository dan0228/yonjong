-- 指定されたメールアドレスが users テーブルに存在するか確認する関数
CREATE OR REPLACE FUNCTION public.check_email_exists(email_address text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER -- 管理者権限で実行（一般ユーザーが他人のメールを検索できないようにするため）
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.users
    WHERE email = email_address
  );
END;
$$;
