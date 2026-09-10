-- Read-only Staff game discovery. Public wrappers stay invoker-only; all
-- privileged reads are isolated in the unexposed private schema.

create or replace function private.list_staff_games_impl()
returns table (
  game_id uuid,
  game_code text,
  lifecycle text,
  narrative_phase text,
  event_name text,
  starts_at timestamptz,
  venue_name text,
  table_count integer,
  player_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then
    raise exception 'STAFF_AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.staff_members s
    where s.auth_user_id = auth.uid() and s.active = true
  ) then raise exception 'STAFF_ACCESS_DENIED' using errcode = 'P0001'; end if;

  return query
  select g.id, g.code, g.lifecycle, g.narrative_phase, e.name, e.starts_at, e.venue_name,
    (select count(*)::integer from public.game_tables gt where gt.game_id = g.id),
    (select count(*)::integer from public.players p where p.game_id = g.id)
  from public.games g
  join public.events e on e.id = g.event_id
  order by e.starts_at is null, e.starts_at, g.created_at desc, g.id;
end;
$$;

create or replace function private.get_staff_game_overview_impl(p_game_code text)
returns table (
  id uuid,
  code text,
  lifecycle text,
  narrative_phase text,
  created_at timestamptz,
  event_name text,
  starts_at timestamptz,
  venue_name text,
  table_count integer,
  player_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(btrim(coalesce(p_game_code, '')));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then
    raise exception 'STAFF_AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.staff_members s
    where s.auth_user_id = auth.uid() and s.active = true
  ) then raise exception 'STAFF_ACCESS_DENIED' using errcode = 'P0001'; end if;

  return query
  select g.id, g.code, g.lifecycle, g.narrative_phase, g.created_at,
    e.name, e.starts_at, e.venue_name,
    (select count(*)::integer from public.game_tables gt where gt.game_id = g.id),
    (select count(*)::integer from public.players p where p.game_id = g.id)
  from public.games g
  join public.events e on e.id = g.event_id
  where upper(btrim(g.code)) = v_code;

  if not found then raise exception 'GAME_NOT_FOUND' using errcode = 'P0001'; end if;
end;
$$;

revoke all on function private.list_staff_games_impl(), private.get_staff_game_overview_impl(text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.list_staff_games_impl(), private.get_staff_game_overview_impl(text) to authenticated;

create or replace function public.list_staff_games()
returns table (
  game_id uuid,
  game_code text,
  lifecycle text,
  narrative_phase text,
  event_name text,
  starts_at timestamptz,
  venue_name text,
  table_count integer,
  player_count integer
)
language sql
security invoker
as $$ select * from private.list_staff_games_impl(); $$;

create or replace function public.get_staff_game_overview(p_game_code text)
returns table (
  id uuid,
  code text,
  lifecycle text,
  narrative_phase text,
  created_at timestamptz,
  event_name text,
  starts_at timestamptz,
  venue_name text,
  table_count integer,
  player_count integer
)
language sql
security invoker
as $$ select * from private.get_staff_game_overview_impl($1); $$;

revoke execute on function public.list_staff_games(), public.get_staff_game_overview(text) from public, anon;
grant execute on function public.list_staff_games(), public.get_staff_game_overview(text) to authenticated;
