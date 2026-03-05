CREATE OR REPLACE FUNCTION public.find_friend_match_by_passcode(
    p_user_id uuid,
    p_user_rating integer,
    p_username text,
    p_avatar_id integer,
    p_passcode text
)
RETURNS TABLE(out_game_id uuid, out_is_full boolean, out_players jsonb)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_game_record RECORD;
    v_player_count integer;
    v_new_avg_rating integer;
    v_players_data jsonb;
    v_current_game_data jsonb;
    v_game_id uuid;
    v_user_profile RECORD;
    v_existing_player_count integer;
BEGIN
    PERFORM pg_advisory_xact_lock(1);

    -- 参加するプレイヤーの完全なプロフィールを取得
    SELECT id, username, avatar_id, rating, cat_coins, total_games_played,
           first_place_count, second_place_count, third_place_count, fourth_place_count,
           class as user_class
    INTO v_user_profile
    FROM public.users
    WHERE id = p_user_id;

    -- パスコードに一致し、待機中のゲームを探す
    SELECT g.id, g.avg_rating, g.game_data, g.version
    INTO v_game_record
    FROM public.games g
    WHERE
        g.status = 'waiting'
        AND g.passcode = p_passcode
        AND NOT EXISTS (SELECT 1 FROM public.game_players gp WHERE gp.game_id = g.id AND gp.user_id = p_user_id)
        AND (SELECT count(*) FROM public.game_players gp WHERE gp.game_id = g.id) < 4
    LIMIT 1
    FOR UPDATE;

    -- ゲームが見つかった場合
    IF FOUND THEN
        SELECT s.idx
        INTO v_player_count
        FROM generate_series(0, 3) AS s(idx)
        LEFT JOIN public.game_players gp ON gp.game_id = v_game_record.id AND gp.seat_index = s.idx
        WHERE gp.seat_index IS NULL
        ORDER BY s.idx
        LIMIT 1;

        IF v_player_count IS NULL THEN
            RAISE EXCEPTION 'No available seat_index found for game %', v_game_record.id;
        END IF;

        SELECT count(*)
        INTO v_existing_player_count
        FROM public.game_players
        WHERE game_id = v_game_record.id;

        v_new_avg_rating := ((v_game_record.avg_rating * v_existing_player_count) + p_user_rating) / (v_existing_player_count + 1);

        INSERT INTO public.game_players (game_id, user_id, seat_index, status)
        VALUES (v_game_record.id, p_user_id, v_player_count, 'joined');

        v_players_data := jsonb_build_object(
            'id', p_user_id,
            'name', p_username,
            'username', p_username,
            'avatar_id', COALESCE(p_avatar_id, '/assets/images/info/hito_icon_1.png'),
            'rating', p_user_rating,
            'cat_coins', v_user_profile.cat_coins,
            'total_games_played', v_user_profile.total_games_played,
            'first_place_count', v_user_profile.first_place_count,
            'second_place_count', v_user_profile.second_place_count,
            'third_place_count', v_user_profile.third_place_count,
            'fourth_place_count', v_user_profile.fourth_place_count,
            'user_rank_class', v_user_profile.user_class,
            'score', 50000,
            'isAi', false
        );

        UPDATE public.games
        SET
            avg_rating = v_new_avg_rating,
            updated_at = now(),
            status = CASE WHEN (v_player_count + 1) = 4 THEN 'ready' ELSE 'waiting' END,
            game_data = jsonb_set(
                v_game_record.game_data,
                '{players}',
                v_game_record.game_data->'players' || v_players_data
            ),
            version = v_game_record.version + 1
        WHERE id = v_game_record.id AND version = v_game_record.version;

        SELECT game_data INTO v_current_game_data FROM public.games WHERE id = v_game_record.id;
        v_game_id := v_game_record.id;
        out_is_full := (v_player_count + 1) = 4;

    -- ゲームが見つからなかった場合
    ELSE
        RAISE EXCEPTION 'Room with passcode % not found or is full.', p_passcode;
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', u.id,
            'name', u.username,
            'username', u.username,
            'avatar_id', COALESCE(u.avatar_id, '/assets/images/info/hito_icon_1.png'),
            'rating', u.rating,
            'cat_coins', u.cat_coins,
            'total_games_played', u.total_games_played,
            'first_place_count', u.first_place_count,
            'second_place_count', u.second_place_count,
            'third_place_count', u.third_place_count,
            'fourth_place_count', u.fourth_place_count,
            'user_rank_class', u.class,
            'score', 50000,
            'isAi', false,
            'seat_index', gp.seat_index
        ) ORDER BY gp.seat_index
    )
    INTO out_players
    FROM public.game_players gp
    JOIN public.users u ON gp.user_id = u.id
    WHERE gp.game_id = v_game_id;

    out_game_id := v_game_id;
    RETURN NEXT;
END;
$function$;
