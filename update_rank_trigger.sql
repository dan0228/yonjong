-- この関数は、ユーザーの現在のクラスと新しいレートに基づいて、
-- 新しいクラスを計算します。
CREATE OR REPLACE FUNCTION public.update_user_class()
RETURNS TRIGGER AS $$
DECLARE
    new_class integer;
BEGIN
    -- UPDATEの場合で、かつratingが変更されていない場合は、何もせず処理を終了
    IF (TG_OP = 'UPDATE' AND NEW.rating IS NOT DISTINCT FROM OLD.rating) THEN
        RETURN NEW;
    END IF;

    -- INSERT (新規ユーザー作成) の場合、レートに基づいて初期クラスを決定
    IF (TG_OP = 'INSERT') THEN
        IF NEW.rating >= 5000 THEN
            new_class := 3;
        ELSIF NEW.rating >= 2000 THEN
            new_class := 2;
        ELSE
            new_class := 1;
        END IF;
    -- UPDATE (レートが変更された) の場合
    ELSE
        -- まず、現在のクラスを維持すると仮定
        new_class := OLD.class;

        -- 現在のクラスが「子猫級(1)」の場合の昇格ロジック
        IF OLD.class = 1 THEN
            IF NEW.rating >= 2000 THEN
                new_class := 2; -- 野良猫級に昇格
            END IF;
        
        -- 現在のクラスが「野良猫級(2)」の場合の昇降格ロジック
        ELSIF OLD.class = 2 THEN
            IF NEW.rating >= 5000 THEN
                new_class := 3; -- ボス猫級に昇格
            ELSIF NEW.rating <= 1799 THEN
                new_class := 1; -- 子猫級に降格
            END IF;

        -- 現在のクラスが「ボス猫級(3)」の場合の降格ロジック
        ELSIF OLD.class = 3 THEN
            IF NEW.rating <= 4799 THEN
                new_class := 2; -- 野良猫級に降格
            END IF;
        END IF;
    END IF;

    -- 計算された新しいクラスを、保存される行のclassカラムに設定
    NEW.class := new_class;

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
EXECUTE FUNCTION public.update_user_class();