CREATE OR REPLACE FUNCTION update_user_stats_and_coins(
    p_user_id uuid,
    p_rank integer,
    p_coin_change integer,
    p_rating_change integer,
    p_total_rounds_played integer DEFAULT 0,
    p_win_count integer DEFAULT 0,
    p_deal_in_count integer DEFAULT 0,
    p_call_count integer DEFAULT 0,
    p_stock_count integer DEFAULT 0,
    p_riichi_count integer DEFAULT 0,
    p_tsumo_count integer DEFAULT 0,
    p_ron_count integer DEFAULT 0
)
RETURNS void AS $$
DECLARE
    current_rating integer;
    current_class integer;
    current_highest_rating integer;
    current_highest_class integer;
    new_rating integer;
    -- new_class integer; -- class はトリガーで更新されるため不要
BEGIN
    -- 現在のユーザー情報を取得
    SELECT rating, class, highest_rating, highest_class
    INTO current_rating, current_class, current_highest_rating, current_highest_class
    FROM public.users
    WHERE id = p_user_id;

    -- 新しいレーティングを計算 (0未満にならないように調整)
    new_rating := GREATEST(0, current_rating + p_rating_change);

    UPDATE public.users
    SET
        total_games_played = total_games_played + 1,
        total_rounds_played = total_rounds_played + COALESCE(p_total_rounds_played, 0),
        win_count = win_count + COALESCE(p_win_count, 0),
        deal_in_count = deal_in_count + COALESCE(p_deal_in_count, 0),
        call_count = call_count + COALESCE(p_call_count, 0),
        stock_count = stock_count + COALESCE(p_stock_count, 0),
        riichi_count = riichi_count + COALESCE(p_riichi_count, 0),
        tsumo_count = tsumo_count + COALESCE(p_tsumo_count, 0),
        ron_count = ron_count + COALESCE(p_ron_count, 0),
        -- 猫コインを更新 (0未満にならないように調整)
        cat_coins = GREATEST(0, cat_coins + p_coin_change),
        rating = new_rating,
        -- highest_rating を更新
        highest_rating = GREATEST(current_highest_rating, new_rating),
        -- highest_class を更新 (class はトリガーで更新されるため、ここでは current_class を使用)
        highest_class = GREATEST(current_highest_class, current_class),
        -- 順位カウントを更新
        first_place_count = CASE WHEN p_rank = 1 THEN first_place_count + 1 ELSE first_place_count END,
        second_place_count = CASE WHEN p_rank = 2 THEN second_place_count + 1 ELSE second_place_count END,
        third_place_count = CASE WHEN p_rank = 3 THEN third_place_count + 1 ELSE third_place_count END,
        fourth_place_count = CASE WHEN p_rank = 4 THEN fourth_place_count + 1 ELSE fourth_place_count END
    WHERE
        id = p_user_id;
END;
$$ LANGUAGE plpgsql;