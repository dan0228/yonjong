create table public.games_history (
  id uuid not null,
  room_tier text not null,
  status text not null,
  avg_rating integer not null,
  game_data jsonb not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  current_turn_user_id uuid null,
  version integer not null default 1,
  constraint games_history_pkey primary key (id)
) TABLESPACE pg_default;