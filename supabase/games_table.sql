create table public.games (
  id uuid not null default gen_random_uuid (),
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  room_tier text not null,
  status text not null default 'waiting'::text,
  game_data jsonb not null default '{}'::jsonb,
  current_turn_user_id uuid null,
  version integer not null default 1,
  avg_rating integer not null default 0,
  constraint games_pkey primary key (id),
  constraint status_check check (
    (
      status = any (
        array[
          'waiting'::text,
          'ready'::text,
          'in_progress'::text,
          'finished'::text,
          'cancelled'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;