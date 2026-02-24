CREATE OR REPLACE FUNCTION update_user_stats_and_coins(
    p_user_id uuid,
    p_rank integer,
    p_coin_change integer,
    p_rating_change integer
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

    -- 新しいレーティングを計算
    new_rating := current_rating + p_rating_change;

    UPDATE public.users
    SET
        total_games_played = total_games_played + 1,
        -- sum_of_ranks = sum_of_ranks + p_rank, -- ★削除: sum_of_ranks カラムは存在しないため
        cat_coins = cat_coins + p_coin_change,
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