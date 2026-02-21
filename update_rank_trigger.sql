-- この関数は、ユーザーの現在のランクと新しいレートに基づいて、
-- 新しいランクを計算します。
CREATE OR REPLACE FUNCTION public.update_user_rank()
RETURNS TRIGGER AS $$
DECLARE
    new_rank integer;
BEGIN
    -- UPDATEの場合で、かつratingが変更されていない場合は、何もせず処理を終了
    IF (TG_OP = 'UPDATE' AND NEW.rating IS NOT DISTINCT FROM OLD.rating) THEN
        RETURN NEW;
    END IF;

    -- INSERT (新規ユーザー作成) の場合、レートに基づいて初期ランクを決定
    IF (TG_OP = 'INSERT') THEN
        IF NEW.rating >= 5000 THEN
            new_rank := 3;
        ELSIF NEW.rating >= 2000 THEN
            new_rank := 2;
        ELSE
            new_rank := 1;
        END IF;
    -- UPDATE (レートが変更された) の場合
    ELSE
        -- まず、現在のランクを維持すると仮定
        new_rank := OLD.rank;

        -- 現在のランクが「子猫級(1)」の場合の昇格ロジック
        IF OLD.rank = 1 THEN
            IF NEW.rating >= 2000 THEN
                new_rank := 2; -- 野良猫級に昇格
            END IF;
        
        -- 現在のランクが「野良猫級(2)」の場合の昇降格ロジック
        ELSIF OLD.rank = 2 THEN
            IF NEW.rating >= 5000 THEN
                new_rank := 3; -- ボス猫級に昇格
            ELSIF NEW.rating <= 1799 THEN
                new_rank := 1; -- 子猫級に降格
            END IF;

        -- 現在のランクが「ボス猫級(3)」の場合の降格ロジック
        ELSIF OLD.rank = 3 THEN
            IF NEW.rating <= 4799 THEN
                new_rank := 2; -- 野良猫級に降格
            END IF;
        END IF;
    END IF;

    -- 計算された新しいランクを、保存される行のrankカラムに設定
    NEW.rank := new_rank;

    -- 変更後の行を返す
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 既存の同じ名前のトリガーがあれば削除
DROP TRIGGER IF EXISTS on_user_rating_update ON public.users;

-- usersテーブルでINSERTまたはUPDATEが行われる直前に、上記の関数を実行するトリガーを作成
-- WHEN句を削除し、チェックは関数内で行う
CREATE TRIGGER on_user_rating_update
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.update_user_rank();