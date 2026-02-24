create table public.game_players_history (
  id uuid not null default gen_random_uuid (),
  game_id uuid not null,
  user_id uuid null,
  seat_index integer not null,
  status text not null default 'joined'::text,
  joined_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  final_score integer null,
  final_rank integer null,
  rating_change integer null,
  final_rating integer null,
  constraint game_players_history_pkey primary key (id)
) TABLESPACE pg_default;