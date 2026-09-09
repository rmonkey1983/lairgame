-- Player-only anonymous join boundary. Gameplay and staff access remain deferred.

create unique index games_code_normalized_uidx on public.games (upper(btrim(code)));

create or replace function public.join_game(p_game_code text, p_nickname text, p_table_number integer, p_seat_number integer)
returns table (player_id uuid, game_id uuid, game_code text, nickname text, table_number integer, seat_number integer, join_status text)
language plpgsql security definer set search_path = ''
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

create or replace function public.get_my_join_state(p_game_code text)
returns table (player_id uuid, game_id uuid, game_code text, nickname text, table_number integer, seat_number integer, join_status text)
language plpgsql security definer set search_path = ''
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

revoke execute on function public.join_game(text, text, integer, integer) from public, anon;
revoke execute on function public.get_my_join_state(text) from public, anon;
grant execute on function public.join_game(text, text, integer, integer) to authenticated;
grant execute on function public.get_my_join_state(text) to authenticated;
