-- Keep the Data API boundary invoker-only. Privileged database work lives in
-- this unexposed schema and is callable only through the stable public RPCs.
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create or replace function private.join_game_impl(
  p_game_code text,
  p_nickname text,
  p_table_number integer,
  p_seat_number integer
)
returns table (player_id uuid, game_id uuid, game_code text, nickname text, table_number integer, seat_number integer, join_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games%rowtype;
  v_table public.game_tables%rowtype;
  v_player public.players%rowtype;
  v_existing public.players%rowtype;
  v_code text := upper(btrim(coalesce(p_game_code, '')));
  v_nickname text := btrim(coalesce(p_nickname, ''));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then
    raise exception 'AUTH_ANONYMOUS_REQUIRED' using errcode = 'P0001';
  end if;
  if v_code = '' then raise exception 'GAME_NOT_FOUND' using errcode = 'P0001'; end if;

  select * into v_game from public.games where upper(btrim(public.games.code)) = v_code;
  if not found then raise exception 'GAME_NOT_FOUND' using errcode = 'P0001'; end if;

  select * into v_existing from public.players
    where public.players.game_id = v_game.id and public.players.auth_user_id = auth.uid();
  if found then
    select public.game_tables.table_number into v_table.table_number from public.game_tables
      where public.game_tables.id = v_existing.table_id;
    if v_existing.nickname <> v_nickname or v_table.table_number <> p_table_number
      or v_existing.seat_number <> p_seat_number then
      raise exception 'CONFLICT' using errcode = 'P0001';
    end if;
    return query select v_existing.id, v_existing.game_id, v_game.code, v_existing.nickname,
      v_table.table_number, v_existing.seat_number, 'joined'::text;
    return;
  end if;

  if v_game.lifecycle <> 'checkin_open' then raise exception 'GAME_NOT_OPEN' using errcode = 'P0001'; end if;
  if p_table_number is null or p_table_number <= 0 or p_seat_number is null or p_seat_number <= 0 then
    raise exception 'SEAT_INVALID' using errcode = 'P0001';
  end if;
  if v_nickname = '' then raise exception 'NICKNAME_INVALID' using errcode = 'P0001'; end if;

  select * into v_table from public.game_tables
    where public.game_tables.game_id = v_game.id and public.game_tables.table_number = p_table_number;
  if not found then raise exception 'TABLE_NOT_FOUND' using errcode = 'P0001'; end if;

  begin
    insert into public.players (game_id, auth_user_id, table_id, seat_number, nickname)
      values (v_game.id, auth.uid(), v_table.id, p_seat_number, v_nickname) returning * into v_player;
  exception when unique_violation then
    select * into v_existing from public.players
      where public.players.game_id = v_game.id and public.players.auth_user_id = auth.uid();
    if found then raise exception 'CONFLICT' using errcode = 'P0001'; end if;
    raise exception 'SEAT_TAKEN' using errcode = 'P0001';
  end;

  return query select v_player.id, v_player.game_id, v_game.code, v_player.nickname,
    v_table.table_number, v_player.seat_number, 'joined'::text;
end;
$$;

create or replace function private.get_my_join_state_impl(p_game_code text)
returns table (player_id uuid, game_id uuid, game_code text, nickname text, table_number integer, seat_number integer, join_status text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then
    raise exception 'AUTH_ANONYMOUS_REQUIRED' using errcode = 'P0001';
  end if;
  return query select p.id, p.game_id, g.code, p.nickname, gt.table_number, p.seat_number, 'joined'::text
    from public.players p
    join public.games g on g.id = p.game_id
    join public.game_tables gt on gt.id = p.table_id and gt.game_id = p.game_id
    where p.auth_user_id = auth.uid()
      and upper(btrim(g.code)) = upper(btrim(coalesce(p_game_code, '')));
end;
$$;

create or replace function private.get_my_staff_access_impl()
returns table (staff_member_id uuid, display_name text, active boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then
    raise exception 'STAFF_AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  return query select s.id, s.display_name, s.active
    from public.staff_members s
    where s.auth_user_id = auth.uid() and s.active = true;
  if not found then raise exception 'STAFF_ACCESS_DENIED' using errcode = 'P0001'; end if;
end;
$$;

-- The wrapper is deliberately invoker-owned; the private function performs
-- the only privileged reads/writes. authenticated needs only call privileges.
revoke execute on function private.join_game_impl(text, text, integer, integer),
  private.get_my_join_state_impl(text), private.get_my_staff_access_impl()
  from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.join_game_impl(text, text, integer, integer),
  private.get_my_join_state_impl(text), private.get_my_staff_access_impl()
  to authenticated;

create or replace function public.join_game(p_game_code text, p_nickname text, p_table_number integer, p_seat_number integer)
returns table (player_id uuid, game_id uuid, game_code text, nickname text, table_number integer, seat_number integer, join_status text)
language sql
security invoker
as $$
  select * from private.join_game_impl($1, $2, $3, $4);
$$;

create or replace function public.get_my_join_state(p_game_code text)
returns table (player_id uuid, game_id uuid, game_code text, nickname text, table_number integer, seat_number integer, join_status text)
language sql
security invoker
as $$
  select * from private.get_my_join_state_impl($1);
$$;

create or replace function public.get_my_staff_access()
returns table (staff_member_id uuid, display_name text, active boolean)
language sql
security invoker
as $$
  select * from private.get_my_staff_access_impl();
$$;

revoke execute on function public.join_game(text, text, integer, integer),
  public.get_my_join_state(text), public.get_my_staff_access()
  from public, anon;
grant execute on function public.join_game(text, text, integer, integer),
  public.get_my_join_state(text), public.get_my_staff_access()
  to authenticated;
