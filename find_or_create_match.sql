CREATE OR REPLACE FUNCTION public.find_or_create_match(
    p_user_id uuid,
    p_user_rating integer,
    p_username text,
    p_avatar_url text
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
    v_new_game_id uuid;
    v_user_profile RECORD; -- ユーザー情報を格納する変数をRECORD型に変更
    v_game_id uuid; -- 内部で使用するゲームID
    v_room_tier text; -- room_tier を格納する変数
    v_adjacent_room_tiers text[]; -- 隣接する room_tier を格納する配列
    v_existing_player_count integer; -- ★修正: ここに宣言を移動
BEGIN
    -- トランザクションレベルのアドバイザリロックを取得して競合状態を防ぐ
    PERFORM pg_advisory_xact_lock(1);

    -- 参加するプレイヤーの完全なプロフィールを取得
    SELECT id, username, avatar_url, rating, cat_coins, total_games_played,
           first_place_count, second_place_count, third_place_count, fourth_place_count, -- ★修正: 順位カウントカラムを追加
           class as user_class
    INTO v_user_profile
    FROM public.users
    WHERE id = p_user_id;

    -- ユーザーのレーティングに基づいて room_tier を決定
    IF v_user_profile.rating >= 5000 THEN
        v_room_tier := 'Boss';
        v_adjacent_room_tiers := ARRAY['Alley']; -- Bossの隣はAlley
    ELSIF v_user_profile.rating >= 2000 THEN
        v_room_tier := 'Alley';
        v_adjacent_room_tiers := ARRAY['Kitten', 'Boss']; -- Alleyの隣はKittenとBoss
    ELSE
        v_room_tier := 'Kitten';
        v_adjacent_room_tiers := ARRAY['Alley']; -- Kittenの隣はAlley
    END IF;

    -- ===第一段階: 同じ階級の部屋で、平均レートが近い順に探す===
    SELECT g.id, g.avg_rating, g.game_data, g.version -- ★修正: version も取得
    INTO v_game_record
    FROM public.games g
    WHERE
        g.status = 'waiting'
        AND g.room_tier = v_room_tier -- 同じ room_tier のゲームを探す
        AND NOT EXISTS (SELECT 1 FROM public.game_players gp WHERE gp.game_id = g.id AND gp.user_id = p_user_id)
        AND (SELECT count(*) FROM public.game_players gp WHERE gp.game_id = g.id) < 4
    ORDER BY abs(g.avg_rating - p_user_rating) -- ★修正: 平均レートが近い順
    LIMIT 1
    FOR UPDATE;

    -- ===第二段階: 同じ階級で見つからなかった場合、隣接する階級の部屋で平均レートが近い順に探す ===
    IF NOT FOUND THEN
        SELECT g.id, g.avg_rating, g.game_data, g.version -- ★修正: version も取得
        INTO v_game_record
        FROM public.games g
        WHERE
            g.status = 'waiting'
            AND g.room_tier = ANY(v_adjacent_room_tiers) -- 隣接する room_tier のゲームを探す
            AND NOT EXISTS (SELECT 1 FROM public.game_players gp WHERE gp.game_id = g.id AND gp.user_id = p_user_id)
            AND (SELECT count(*) FROM public.game_players gp WHERE gp.game_id = g.id) < 4
        ORDER BY abs(g.avg_rating - p_user_rating) -- ★修正: 平均レートが近い順
        LIMIT 1
        FOR UPDATE;
    END IF;

    -- ゲームが見つかった場合 (第一段階 or 第二段階)
    IF FOUND THEN
        -- ★修正: 現在のゲームで空いている最小の seat_index (0, 1, 2, 3) を見つける
        SELECT s.idx
        INTO v_player_count
        FROM generate_series(0, 3) AS s(idx)
        LEFT JOIN public.game_players gp ON gp.game_id = v_game_record.id AND gp.seat_index = s.idx
        WHERE gp.seat_index IS NULL
        ORDER BY s.idx
        LIMIT 1;

        -- もし空いている seat_index が見つからなければエラー (4人部屋なので通常は発生しないはず)
        IF v_player_count IS NULL THEN
            RAISE EXCEPTION 'No available seat_index found for game %', v_game_record.id;
        END IF;

        -- 既存のプレイヤー数を取得 (平均レート計算用)
        -- DECLARE v_existing_player_count integer; -- ★修正: 宣言を移動したため削除
        SELECT count(*)
        INTO v_existing_player_count
        FROM public.game_players
        WHERE game_id = v_game_record.id;

        v_new_avg_rating := ((v_game_record.avg_rating * v_existing_player_count) + p_user_rating) / (v_existing_player_count + 1);

        -- 新しいプレイヤーを game_players テーブルに追加
        INSERT INTO public.game_players (game_id, user_id, seat_index, status)
        VALUES (v_game_record.id, p_user_id, v_player_count, 'joined'); -- 新しい v_player_count (seat_index) を使用

        -- 参加するプレイヤーのJSONBオブジェクトを作成（新しいカラムを含む）
        v_players_data := jsonb_build_object(
            'id', p_user_id,
            'name', p_username,
            'username', p_username,
            'avatar_url', COALESCE(p_avatar_url, '/assets/images/info/hito_icon_1.png'),
            'rating', p_user_rating,
            'cat_coins', v_user_profile.cat_coins,
            'total_games_played', v_user_profile.total_games_played,
            'first_place_count', v_user_profile.first_place_count,   -- ★修正
            'second_place_count', v_user_profile.second_place_count, -- ★修正
            'third_place_count', v_user_profile.third_place_count,   -- ★修正
            'fourth_place_count', v_user_profile.fourth_place_count, -- ★修正
            'user_rank_class', v_user_profile.user_class,
            'score', 50000,
            'isAi', false
        );

        -- games テーブルを更新
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
            version = v_game_record.version + 1 -- ★追加: version をインクリメント
        WHERE id = v_game_record.id AND version = v_game_record.version; -- ★追加: 楽観的ロックの条件

        SELECT game_data INTO v_current_game_data FROM public.games WHERE id = v_game_record.id;
        v_game_id := v_game_record.id;
        out_is_full := (v_player_count + 1) = 4;

    -- ゲームが見つからなかった場合 (第一段階も第二段階も見つからなかった場合)
    ELSE
        v_new_game_id := gen_random_uuid();
        INSERT INTO public.games (id, room_tier, status, avg_rating, game_data)
        VALUES (
            v_new_game_id,
            v_room_tier, -- 決定された room_tier を使用
            'waiting',
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
                        'first_place_count', v_user_profile.first_place_count,   -- ★修正
                        'second_place_count', v_user_profile.second_place_count, -- ★修正
                        'third_place_count', v_user_profile.third_place_count,   -- ★修正
                        'fourth_place_count', v_user_profile.fourth_place_count, -- ★修正
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
            )
        )
        RETURNING id, game_data INTO v_game_id, v_current_game_data;

        -- 新しいゲームに最初のプレイヤーを追加
        INSERT INTO public.game_players (game_id, user_id, seat_index, status)
        VALUES (v_game_id, p_user_id, 0, 'joined');

        out_is_full := false;
    END IF;

    -- 最終的なプレイヤーリストを game_players と users から取得して返す
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', u.id,
            'name', u.username,
            'username', u.username,
            'avatar_url', COALESCE(u.avatar_url, '/assets/images/info/hito_icon_1.png'),
            'rating', u.rating,
            'cat_coins', u.cat_coins,
            'total_games_played', u.total_games_played,
            'first_place_count', u.first_place_count,   -- ★追加
            'second_place_count', u.second_place_count, -- ★追加
            'third_place_count', u.third_place_count,   -- ★追加
            'fourth_place_count', u.fourth_place_count, -- ★追加
            'user_rank_class', u.class,
            'score', 50000, -- ゲーム開始時の初期スコア
            'isAi', false,
            'seat_index', gp.seat_index -- seat_index を追加
        ) ORDER BY gp.seat_index
    )
    INTO out_players
    FROM public.game_players gp
    JOIN public.users u ON gp.user_id = u.id
    WHERE gp.game_id = v_game_id;

    out_game_id := v_game_id; -- 戻り値の game_id に内部変数の値を明示的に割り当てる
    RETURN NEXT;
END;
$function$;