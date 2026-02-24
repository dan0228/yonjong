create table public.users (
  id uuid not null,
  username text not null,
  created_at timestamp with time zone not null default now(),
  yaku_achievements jsonb not null default '{}'::jsonb,
  revealed_sayings jsonb not null default '{}'::jsonb,
  cat_coins integer not null default 0,
  avatar_url text null,
  daily_free_omikuji_count integer not null default 3,
  last_omikuji_draw_date date null,
  email text null,
  rating integer not null default 1500,
  total_games_played integer not null default 0,
  class integer not null default 1,
  highest_rating integer not null default 1500,
  highest_class integer not null default 1,
  first_place_count integer not null default 0,
  second_place_count integer not null default 0,
  third_place_count integer not null default 0,
  fourth_place_count integer not null default 0,
  constraint users_pkey primary key (id),
  constraint users_id_fkey foreign KEY (id) references auth.users (id) on delete CASCADE,
  constraint cat_coins_range_check check (
    (
      (cat_coins >= 0)
      and (cat_coins <= 999999)
    )
  ),
  constraint highest_class_check check ((highest_class = any (array[1, 2, 3]))),
  constraint rank_check check ((class = any (array[1, 2, 3])))
) TABLESPACE pg_default;

create trigger on_user_rating_update BEFORE INSERT
or
update on users for EACH row
execute FUNCTION update_user_class ();