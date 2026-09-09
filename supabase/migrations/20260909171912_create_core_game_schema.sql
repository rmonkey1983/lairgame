-- Core domain foundation. Gameplay tables and access policies are deferred.

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  starts_at timestamptz,
  venue_name text,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'completed', 'aborted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  code text not null unique check (btrim(code) <> ''),
  lifecycle text not null default 'draft'
    check (lifecycle in ('draft', 'ready', 'checkin_open', 'live', 'paused', 'completed', 'aborted')),
  narrative_phase text not null default 'lobby'
    check (narrative_phase in ('lobby', 'role_reveal', 'briefing', 'discovery', 'comparison', 'pressure', 'auction', 'deliberation', 'final_vote', 'reveal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.game_tables (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete restrict,
  table_number integer not null check (table_number > 0),
  label text,
  created_at timestamptz not null default now(),
  unique (game_id, id),
  unique (game_id, table_number)
);

create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  table_id uuid,
  seat_number integer check (seat_number is null or seat_number > 0),
  nickname text not null check (btrim(nickname) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, auth_user_id),
  unique (game_id, table_id, seat_number),
  foreign key (game_id, table_id) references public.game_tables(game_id, id) on delete restrict
);

create index games_event_id_idx on public.games (event_id);
create index game_tables_game_id_idx on public.game_tables (game_id);
create index players_game_id_idx on public.players (game_id);
create index players_game_auth_user_id_idx on public.players (game_id, auth_user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger events_set_updated_at before update on public.events
  for each row execute function public.set_updated_at();
create trigger games_set_updated_at before update on public.games
  for each row execute function public.set_updated_at();
create trigger staff_members_set_updated_at before update on public.staff_members
  for each row execute function public.set_updated_at();
create trigger players_set_updated_at before update on public.players
  for each row execute function public.set_updated_at();

alter table public.events enable row level security;
alter table public.games enable row level security;
alter table public.game_tables enable row level security;
alter table public.players enable row level security;
alter table public.staff_members enable row level security;

revoke all on table public.events, public.games, public.game_tables, public.players, public.staff_members from anon, authenticated;
revoke execute on function public.set_updated_at() from anon, authenticated;
