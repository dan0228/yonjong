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
    v_all_player_ids uuid[];
    v_current_game_data jsonb;
    v_new_game_id uuid;
BEGIN
    -- トランザクションレベルのアドバイザリロックを取得して競合状態を防ぐ
    PERFORM pg_advisory_xact_lock(1);

    -- ===第一段階:参加可能なゲームを探す (レート検索を一時的に無効化) ===
    SELECT gs.id, gs.player_1_id, gs.player_2_id,
           gs.player_3_id, gs.player_4_id,
           gs.avg_rating, gs.game_data
    INTO v_game_record
    FROM public.game_states gs
    WHERE
        gs.status = 'waiting'
        AND gs.player_4_id IS NULL -- 4人未満の部屋を探す
        -- AND gs.avg_rating BETWEEN (p_user_rating - 200) AND (p_user_rating + 200) -- ★★★ デバッグのため一時的に無効化 ★★★
        AND p_user_id NOT IN (gs.player_1_id, gs.player_2_id, gs.player_3_id, gs.player_4_id) -- 自分が参加していない部屋
    ORDER BY gs.created_at ASC -- 古い部屋から順にソート
    LIMIT 1
    FOR UPDATE;

    -- ゲームが見つかった場合
    IF FOUND THEN
        -- プレイヤー数を計算
        v_player_count := (CASE WHEN v_game_record.player_1_id IS NOT NULL THEN 1 ELSE 0 END) +
                          (CASE WHEN v_game_record.player_2_id IS NOT NULL THEN 1 ELSE 0 END) +
                          (CASE WHEN v_game_record.player_3_id IS NOT NULL THEN 1 ELSE 0 END) +
                          (CASE WHEN v_game_record.player_4_id IS NOT NULL THEN 1 ELSE 0 END);

        -- 新しい平均レーティングを計算
        v_new_avg_rating := ((v_game_record.avg_rating * v_player_count) + p_user_rating) / (v_player_count + 1);

        -- 参加するプレイヤーのJSONBオブジェクト
        v_players_data := jsonb_build_object(
            'id', p_user_id,
            'name', p_username,
            'username', p_username,
            'avatar_url', COALESCE(p_avatar_url, '/assets/images/info/hito_icon_1.png'),
            'rating', p_user_rating,
            'score', 50000,
            'isAi', false
        );

        --空いているスロットにプレイヤーを追加し、game_dataも更新
        IF v_game_record.player_2_id IS NULL THEN
            UPDATE public.game_states
            SET
                player_2_id = p_user_id,
                avg_rating = v_new_avg_rating,
                game_data = jsonb_set(game_data, '{players}', game_data->'players' || v_players_data)
            WHERE id = v_game_record.id
            RETURNING game_data INTO v_current_game_data;
            v_all_player_ids := ARRAY[v_game_record.player_1_id, p_user_id];
        ELSIF v_game_record.player_3_id IS NULL THEN
            UPDATE public.game_states
            SET
                player_3_id = p_user_id,
                avg_rating = v_new_avg_rating,
                game_data = jsonb_set(game_data, '{players}', game_data->'players' || v_players_data)
            WHERE id = v_game_record.id
            RETURNING game_data INTO v_current_game_data;
            v_all_player_ids := ARRAY[v_game_record.player_1_id, v_game_record.player_2_id, p_user_id];
        ELSIF v_game_record.player_4_id IS NULL THEN
            -- 4人目なので、ステータスも'ready'に更新
            UPDATE public.game_states
            SET
                player_4_id = p_user_id,
                avg_rating = v_new_avg_rating,
                status = 'ready',
                game_data = jsonb_set(game_data, '{players}', game_data->'players' || v_players_data)
            WHERE id = v_game_record.id
            RETURNING game_data INTO v_current_game_data;
            v_all_player_ids := ARRAY[v_game_record.player_1_id, v_game_record.player_2_id, v_game_record.player_3_id, p_user_id];
        END IF;

        -- 戻り値のデータを準備
        game_id := v_game_record.id;
        is_full := (v_player_count + 1) = 4;

    -- ゲームが見つからなかった場合 (最終手段)
    ELSE
        -- 新しいゲームIDを生成
        v_new_game_id := gen_random_uuid();

        -- 新しいゲームを作成
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
        v_all_player_ids := ARRAY[p_user_id];
    END IF;

    -- 最終的なプレイヤーリストを game_dataから取得して返す
    players := v_current_game_data->'players';

    RETURN NEXT;
END;
$$;