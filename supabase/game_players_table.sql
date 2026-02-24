create table public.game_players (
  id uuid not null default gen_random_uuid (),
  game_id uuid not null,
  user_id uuid not null,
  seat_index integer not null,
  status text not null default 'joined'::text,
  joined_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint game_players_pkey primary key (id),
  constraint game_players_unique_seat unique (game_id, seat_index),
  constraint game_players_unique_user unique (game_id, user_id),
  constraint game_players_game_id_fkey foreign KEY (game_id) references games (id) on delete CASCADE,
  constraint game_players_user_id_fkey foreign KEY (user_id) references users (id) on delete CASCADE
) TABLESPACE pg_default;