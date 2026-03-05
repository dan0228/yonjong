CREATE OR REPLACE FUNCTION public.create_friend_match_with_passcode(
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
    v_game_id uuid;
    v_user_profile RECORD;
    v_current_game_data jsonb;
BEGIN
    PERFORM pg_advisory_xact_lock(1);

    -- 参加するプレイヤーの完全なプロフィールを取得
    SELECT id, username, avatar_id, rating, cat_coins, total_games_played,
           first_place_count, second_place_count, third_place_count, fourth_place_count,
           class as user_class
    INTO v_user_profile
    FROM public.users
    WHERE id = p_user_id;

    -- 同じパスコードの待機中のゲームが既に存在するか確認
    IF EXISTS (
        SELECT 1
        FROM public.games g
        WHERE g.status = 'waiting' AND g.passcode = p_passcode
    ) THEN
        RAISE EXCEPTION 'Room with passcode % already exists.', p_passcode;
    END IF;

    -- 新しいゲームを作成
    v_game_id := gen_random_uuid();
    INSERT INTO public.games (id, room_tier, status, avg_rating, game_data, passcode)
    VALUES (
        v_game_id,
        'Kitten', -- 友人対戦ではroom_tierは必須ではないが、スキーマに合わせて設定
        'waiting',
        p_user_rating,
        jsonb_build_object(
            'onlineGameId', v_game_id,
            'isGameOnline', true,
            'localPlayerId', p_user_id,
            'players', jsonb_build_array(
                jsonb_build_object(
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
                )
            ),
            'gameMode', 'online',
            'ruleMode', 'stock',
            'gamePhase', 'waitingToStart',
            'isGameReady', false,
            'hasGameStarted', false,
            'playersReadyForNextRound', '[]'::jsonb
        ),
        p_passcode -- パスコードを設定
    )
    RETURNING id, game_data INTO v_game_id, v_current_game_data;

    -- 新しいゲームに最初のプレイヤーを追加
    INSERT INTO public.game_players (game_id, user_id, seat_index, status)
    VALUES (v_game_id, p_user_id, 0, 'joined');

    out_is_full := false;

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
