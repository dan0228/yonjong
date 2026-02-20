CREATE OR REPLACE FUNCTION public.find_or_create_match(
    p_user_id uuid,
    p_user_rating integer,
    p_username text,
    p_avatar_url text
)
RETURNS TABLE(game_id uuid, is_full boolean, players jsonb)
LANGUAGE plpgsql
AS $$
DECLARE
    v_game_record RECORD;
    v_player_count integer;
    v_new_avg_rating integer;
    v_players_data jsonb;
    v_current_game_data jsonb;
    v_new_game_id uuid;
    v_user_profile RECORD; -- ユーザー情報を格納する変数をRECORD型に変更
BEGIN
    -- トランザクションレベルのアドバイザリロックを取得して競合状態を防ぐ
    PERFORM pg_advisory_xact_lock(1);

    -- 参加するプレイヤーの完全なプロフィールを取得
    SELECT id, username, avatar_url, rating, cat_coins, total_games_played, sum_of_ranks
    INTO v_user_profile
    FROM public.users
    WHERE id = p_user_id;

    -- ===第一段階:レーティングが近い参加可能なゲームを探す===
    SELECT gs.id, gs.player_1_id, gs.player_2_id,
           gs.player_3_id, gs.player_4_id,
           gs.avg_rating, gs.game_data
    INTO v_game_record
    FROM public.game_states gs
    WHERE
        gs.status = 'waiting'
        AND gs.player_4_id IS NULL
        AND gs.avg_rating BETWEEN (p_user_rating - 200) AND (p_user_rating + 200)
        AND (gs.player_1_id IS NULL OR gs.player_1_id <> p_user_id)
        AND (gs.player_2_id IS NULL OR gs.player_2_id <> p_user_id)
        AND (gs.player_3_id IS NULL OR gs.player_3_id <> p_user_id)
        AND (gs.player_4_id IS NULL OR gs.player_4_id <> p_user_id)
    ORDER BY abs(gs.avg_rating - p_user_rating)
    LIMIT 1
    FOR UPDATE;

    -- ===第二段階:レーティングマッチで見つからなかった場合、空いているゲームを探す ===
    IF NOT FOUND THEN
        SELECT gs.id, gs.player_1_id, gs.player_2_id,
               gs.player_3_id, gs.player_4_id,
               gs.avg_rating, gs.game_data
        INTO v_game_record
        FROM public.game_states gs
        WHERE
            gs.status = 'waiting'
            AND gs.player_4_id IS NULL
            AND (gs.player_1_id IS NULL OR gs.player_1_id <> p_user_id)
            AND (gs.player_2_id IS NULL OR gs.player_2_id <> p_user_id)
            AND (gs.player_3_id IS NULL OR gs.player_3_id <> p_user_id)
            AND (gs.player_4_id IS NULL OR gs.player_4_id <> p_user_id)
        ORDER BY gs.created_at ASC
        LIMIT 1
        FOR UPDATE;
    END IF;

    -- ゲームが見つかった場合 (第一段階 or 第二段階)
    IF FOUND THEN
        v_player_count := (CASE WHEN v_game_record.player_1_id IS NOT NULL THEN 1 ELSE 0 END) +
                          (CASE WHEN v_game_record.player_2_id IS NOT NULL THEN 1 ELSE 0 END) +
                          (CASE WHEN v_game_record.player_3_id IS NOT NULL THEN 1 ELSE 0 END) +
                          (CASE WHEN v_game_record.player_4_id IS NOT NULL THEN 1 ELSE 0 END);

        v_new_avg_rating := ((v_game_record.avg_rating * v_player_count) + p_user_rating) / (v_player_count + 1);

        -- 参加するプレイヤーのJSONBオブジェクトを作成（新しいカラムを含む）
        v_players_data := jsonb_build_object(
            'id', p_user_id,
            'name', p_username,
            'username', p_username,
            'avatar_url', COALESCE(p_avatar_url, '/assets/images/info/hito_icon_1.png'),
            'rating', p_user_rating,
            'cat_coins', v_user_profile.cat_coins,
            'total_games_played', v_user_profile.total_games_played,
            'sum_of_ranks', v_user_profile.sum_of_ranks,
            'score', 50000,
            'isAi', false
        );

        IF v_game_record.player_2_id IS NULL THEN
            UPDATE public.game_states
            SET player_2_id = p_user_id, avg_rating = v_new_avg_rating, game_data = jsonb_set(game_data, '{players}', game_data->'players' || v_players_data)
            WHERE id = v_game_record.id;
        ELSIF v_game_record.player_3_id IS NULL THEN
            UPDATE public.game_states
            SET player_3_id = p_user_id, avg_rating = v_new_avg_rating, game_data = jsonb_set(game_data, '{players}', game_data->'players' || v_players_data)
            WHERE id = v_game_record.id;
        ELSIF v_game_record.player_4_id IS NULL THEN
            UPDATE public.game_states
            SET player_4_id = p_user_id, avg_rating = v_new_avg_rating, status = 'ready', game_data = jsonb_set(jsonb_set(game_data, '{players}', game_data->'players' || v_players_data), '{isGameReady}', 'true'::jsonb)
            WHERE id = v_game_record.id;
        END IF;

        SELECT game_data INTO v_current_game_data FROM public.game_states WHERE id = v_game_record.id;
        game_id := v_game_record.id;
        is_full := (v_player_count + 1) = 4;

    -- ゲームが見つからなかった場合
    ELSE
        v_new_game_id := gen_random_uuid();
        INSERT INTO public.game_states (id, player_1_id, avg_rating, game_data, status)
        VALUES (
            v_new_game_id,
            p_user_id,
            p_user_rating,
            jsonb_build_object(
                'onlineGameId', v_new_game_id,
                'isGameOnline', true,
                'localPlayerId', p_user_id,
                'players', jsonb_build_array(
                    jsonb_build_object(
                        'id', p_user_id,
                        'name', p_username,
                        'username', p_username,
                        'avatar_url', COALESCE(p_avatar_url, '/assets/images/info/hito_icon_1.png'),
                        'rating', p_user_rating,
                        'cat_coins', v_user_profile.cat_coins,
                        'total_games_played', v_user_profile.total_games_played,
                        'sum_of_ranks', v_user_profile.sum_of_ranks,
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
            'waiting'
        )
        RETURNING id, game_data INTO game_id, v_current_game_data;
        is_full := false;
    END IF;

    -- 最終的なプレイヤーリストを game_data から取得して返す
    -- ★★★ 修正: players 配列の各要素に最新のプロフィール情報を反映させる ★★★
    SELECT jsonb_agg(
        CASE
            WHEN (p->>'id')::uuid = p_user_id THEN p || jsonb_build_object(
                'total_games_played', v_user_profile.total_games_played,
                'sum_of_ranks', v_user_profile.sum_of_ranks
            )
            ELSE p
        END
    )
    INTO players
    FROM jsonb_array_elements(v_current_game_data->'players') AS p;

    RETURN NEXT;
END;
$$;
