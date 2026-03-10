CREATE OR REPLACE FUNCTION public.handle_auth_user_email_sync()
RETURNS TRIGGER
SECURITY DEFINER -- ★ここが一番重要です！管理者権限で実行させます
SET search_path = public -- ★セキュリティ対策のおまじない
AS $$
BEGIN
  -- public.users テーブルに NEW.id のユーザーが存在するか確認
  IF EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN
    -- 存在する場合は email を更新
    UPDATE public.users
    SET email = NEW.email
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;