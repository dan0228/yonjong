CREATE OR REPLACE FUNCTION update_user_stats_and_coins(
    p_user_id uuid,
    p_rank integer,
    p_coin_change integer,
    p_rating_change integer
)
RETURNS void AS $$
BEGIN
    UPDATE public.users
    SET
        total_games_played = total_games_played + 1,
        sum_of_ranks = sum_of_ranks + p_rank,
        cat_coins = cat_coins + p_coin_change,
        rating = rating + p_rating_change
    WHERE
        id = p_user_id;
END;
$$ LANGUAGE plpgsql;