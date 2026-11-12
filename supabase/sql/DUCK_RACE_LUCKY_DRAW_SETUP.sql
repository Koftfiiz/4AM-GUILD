-- Query name: DUCK_RACE_LUCKY_DRAW_SETUP
-- Purpose: Persist completed Duck Race result snapshots and Lucky Draw sessions/winners.
-- Run once in Supabase SQL Editor. Safe to re-run.

create table if not exists public.duck_race_sessions (
  id uuid primary key,
  created_by uuid not null references auth.users(id) on delete restrict,
  game_mode text not null check (game_mode in ('num','name')),
  duration_seconds integer not null check (duration_seconds > 0),
  participant_count integer not null check (participant_count between 2 and 120),
  results jsonb not null,
  finished_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint duck_race_sessions_results_array check (jsonb_typeof(results) = 'array')
);

create index if not exists duck_race_sessions_created_at_idx
  on public.duck_race_sessions (created_at desc);

create table if not exists public.duck_race_lucky_draws (
  id uuid primary key default gen_random_uuid(),
  race_session_id uuid not null references public.duck_race_sessions(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  prize_count integer not null check (prize_count between 1 and 120),
  reveal_mode text not null check (reveal_mode in ('all','sequential')),
  eligible_count integer not null check (eligible_count between 2 and 120),
  created_at timestamptz not null default now()
);

create index if not exists duck_race_lucky_draws_session_idx
  on public.duck_race_lucky_draws (race_session_id, created_at desc);

create table if not exists public.duck_race_lucky_draw_winners (
  id uuid primary key default gen_random_uuid(),
  lucky_draw_id uuid not null references public.duck_race_lucky_draws(id) on delete cascade,
  prize_number integer not null check (prize_number > 0),
  race_rank integer not null check (race_rank > 0),
  duck_label text not null,
  created_at timestamptz not null default now(),
  constraint duck_race_lucky_draw_winners_prize_unique unique (lucky_draw_id, prize_number),
  constraint duck_race_lucky_draw_winners_rank_unique unique (lucky_draw_id, race_rank)
);

create index if not exists duck_race_lucky_draw_winners_draw_idx
  on public.duck_race_lucky_draw_winners (lucky_draw_id, prize_number);

alter table public.duck_race_sessions enable row level security;
alter table public.duck_race_lucky_draws enable row level security;
alter table public.duck_race_lucky_draw_winners enable row level security;

-- No client-side table policies are added. Reads/writes go through the
-- authenticated Edge Function using the service-role key held server-side.

-- Discord publishing audit fields (TEST MODE only until explicitly approved).
alter table public.duck_race_lucky_draws
  add column if not exists discord_message_ids text[] not null default '{}',
  add column if not exists discord_sent_at timestamptz;
