-- public.archive_disconnected_game(game_uuid uuid)
CREATE OR REPLACE FUNCTION public.archive_disconnected_game(game_uuid uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- 1. gamesテーブルからgames_historyテーブルへデータをコピー
    --    ステータスを'cancelled'に設定
    INSERT INTO public.games_history (id, room_tier, status, avg_rating, game_data, created_at, updated_at, current_turn_user_id, version)
    SELECT id, room_tier, 'cancelled', avg_rating, game_data, created_at, now(), current_turn_user_id, version
    FROM public.games
    WHERE id = game_uuid;

    -- 2. game_playersテーブルからgame_players_historyテーブルへデータをコピー
    --    最終スコアやランクは不明のため、NULLで埋める
    INSERT INTO public.game_players_history (game_id, user_id, seat_index, status, joined_at, updated_at, final_score, final_rank, rating_change, final_rating)
    SELECT game_id, user_id, seat_index, 'disconnected', joined_at, now(), NULL, NULL, NULL, NULL
    FROM public.game_players
    WHERE game_id = game_uuid;

    -- 3. 元のgamesテーブルからデータを削除
    --    (game_playersのデータはCASCADE制約により自動的に削除される)
    DELETE FROM public.games
    WHERE id = game_uuid;

END;
$$;