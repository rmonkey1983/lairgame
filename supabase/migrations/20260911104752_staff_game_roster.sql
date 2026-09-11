-- Staff-only operational roster and Player-join wake-up.

create or replace function private.broadcast_player_join_game_state_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('kind', 'game_state_changed'),
    'game_state_changed',
    'game:' || new.game_id::text,
    true
  );
  return new;
end;
$$;

revoke all on function private.broadcast_player_join_game_state_changed() from public, anon, authenticated;

create trigger players_broadcast_game_state_change
after insert on public.players
for each row
execute function private.broadcast_player_join_game_state_changed();

create or replace function private.get_staff_game_roster_impl(p_game_code text)
returns table (
  player_id uuid,
  nickname text,
  table_number integer,
  seat_number integer,
  joined_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(btrim(coalesce(p_game_code, '')));
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then
    raise exception 'STAFF_AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.staff_members s
    where s.auth_user_id = auth.uid()
      and s.active = true
  ) then
    raise exception 'STAFF_ACCESS_DENIED' using errcode = 'P0001';
  end if;

  return query
  select p.id, p.nickname, gt.table_number, p.seat_number, p.created_at
  from public.players p
  join public.games g on g.id = p.game_id
  join public.game_tables gt on gt.id = p.table_id and gt.game_id = p.game_id
  where upper(btrim(g.code)) = v_code
  order by gt.table_number, p.seat_number, p.id;

  if not found then
    if not exists (
      select 1 from public.games g where upper(btrim(g.code)) = v_code
    ) then
      raise exception 'GAME_NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;
end;
$$;

revoke all on function private.get_staff_game_roster_impl(text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.get_staff_game_roster_impl(text) to authenticated;

create or replace function public.get_staff_game_roster(game_code text)
returns table (
  player_id uuid,
  nickname text,
  table_number integer,
  seat_number integer,
  joined_at timestamptz
)
language sql
security invoker
as $$
  select * from private.get_staff_game_roster_impl($1);
$$;

revoke execute on function public.get_staff_game_roster(text) from public, anon;
grant execute on function public.get_staff_game_roster(text) to authenticated;
