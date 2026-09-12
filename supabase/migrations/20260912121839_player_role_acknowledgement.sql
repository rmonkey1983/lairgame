create table public.game_role_acknowledgements (
  player_id uuid primary key references public.players(id) on delete restrict,
  game_id uuid not null references public.games(id) on delete restrict,
  acknowledged_at timestamptz not null default now(),
  unique (game_id, player_id)
);

alter table public.game_role_acknowledgements enable row level security;
revoke all on table public.game_role_acknowledgements from public, anon, authenticated;

create or replace function private.acknowledge_my_role_impl(p_game_code text)
returns table (game_id uuid, acknowledged_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  v_game public.games%rowtype;
  v_player public.players%rowtype;
  v_ack public.game_role_acknowledgements%rowtype;
  v_code text := upper(btrim(coalesce(p_game_code, '')));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then
    raise exception 'PLAYER_AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select g.* into v_game from public.games g
   where upper(btrim(g.code)) = v_code;
  if not found then raise exception 'GAME_NOT_FOUND' using errcode = 'P0001'; end if;

  select p.* into v_player from public.players p
   where p.game_id = v_game.id and p.auth_user_id = auth.uid();
  if not found then raise exception 'PLAYER_NOT_FOUND' using errcode = 'P0001'; end if;

  select a.* into v_ack from public.game_role_acknowledgements a
   where a.game_id = v_game.id and a.player_id = v_player.id;
  if found then
    return query select v_ack.game_id, v_ack.acknowledged_at;
    return;
  end if;

  if v_game.lifecycle <> 'live' then raise exception 'GAME_NOT_LIVE' using errcode = 'P0001'; end if;
  if v_game.narrative_phase <> 'role_reveal' then raise exception 'GAME_NOT_IN_ROLE_REVEAL' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.game_role_assignments r where r.game_id = v_game.id and r.player_id = v_player.id) then
    raise exception 'ROLE_ASSIGNMENT_REQUIRED' using errcode = 'P0001';
  end if;

  insert into public.game_role_acknowledgements (player_id, game_id)
  values (v_player.id, v_game.id)
  on conflict on constraint game_role_acknowledgements_pkey do nothing
  returning * into v_ack;

  if v_ack.player_id is not null then
    perform realtime.send(
      pg_catalog.jsonb_build_object('kind', 'role_acknowledgement_changed'),
      'role_acknowledgement_changed', 'game:' || v_game.id::text, true
    );
  else
    select a.* into v_ack from public.game_role_acknowledgements a
     where a.game_id = v_game.id and a.player_id = v_player.id;
  end if;

  return query select v_ack.game_id, v_ack.acknowledged_at;
end;
$$;

revoke all on function private.acknowledge_my_role_impl(text) from public, anon, authenticated;
grant execute on function private.acknowledge_my_role_impl(text) to authenticated;

create or replace function public.acknowledge_my_role(game_code text)
returns table (game_id uuid, acknowledged_at timestamptz)
language sql security invoker
as $$ select * from private.acknowledge_my_role_impl($1); $$;

revoke execute on function public.acknowledge_my_role(text) from public, anon, authenticated;
grant execute on function public.acknowledge_my_role(text) to authenticated;

drop function if exists public.get_my_player_state(text);
drop function if exists private.get_my_player_state_impl(text);

create or replace function private.get_my_player_state_impl(p_game_code text)
returns table (game_id uuid, lifecycle text, narrative_phase text, nickname text, table_number integer, seat_number integer, role text, role_acknowledged boolean)
language plpgsql security definer set search_path = ''
as $$
declare v_game_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then raise exception 'AUTH_ANONYMOUS_REQUIRED' using errcode = 'P0001'; end if;
  select g.id into v_game_id from public.games g where upper(btrim(g.code)) = upper(btrim(coalesce(p_game_code, '')));
  if not found then raise exception 'GAME_NOT_FOUND' using errcode = 'P0001'; end if;
  return query
  select g.id, g.lifecycle, g.narrative_phase, p.nickname, gt.table_number, p.seat_number,
    case when g.narrative_phase = 'lobby' then null when r.role in ('liar','accomplice','investigator') then r.role when r.role = 'scapegoat' then 'investigator' else null end,
    (a.player_id is not null)
  from public.players p join public.games g on g.id = p.game_id
  join public.game_tables gt on gt.id = p.table_id and gt.game_id = p.game_id
  left join public.game_role_assignments r on r.player_id = p.id and r.game_id = p.game_id
  left join public.game_role_acknowledgements a on a.player_id = p.id and a.game_id = p.game_id
  where p.auth_user_id = auth.uid() and p.game_id = v_game_id;
end;
$$;

create or replace function public.get_my_player_state(game_code text)
returns table (game_id uuid, lifecycle text, narrative_phase text, nickname text, table_number integer, seat_number integer, role text, role_acknowledged boolean)
language sql security invoker
as $$ select * from private.get_my_player_state_impl($1); $$;

drop function if exists public.get_staff_game_roles(text);
drop function if exists private.get_staff_game_roles_impl(text);

create or replace function private.get_staff_game_roles_impl(p_game_code text)
returns table (player_id uuid, nickname text, table_number integer, seat_number integer, role text, role_acknowledged boolean)
language plpgsql security definer set search_path = ''
as $$
declare v_game_id uuid; v_code text := upper(btrim(coalesce(p_game_code, '')));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then raise exception 'STAFF_AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.staff_members s where s.auth_user_id = auth.uid() and s.active = true) then raise exception 'STAFF_ACCESS_DENIED' using errcode = 'P0001'; end if;
  select g.id into v_game_id from public.games g where upper(btrim(g.code)) = v_code;
  if not found then raise exception 'GAME_NOT_FOUND' using errcode = 'P0001'; end if;
  return query select p.id, p.nickname, gt.table_number, p.seat_number, r.role, (a.player_id is not null)
    from public.game_role_assignments r join public.players p on p.id = r.player_id
    join public.game_tables gt on gt.id = p.table_id left join public.game_role_acknowledgements a on a.player_id = p.id and a.game_id = p.game_id
   where r.game_id = v_game_id order by gt.table_number, p.seat_number;
end;
$$;

create or replace function public.get_staff_game_roles(game_code text)
returns table (player_id uuid, nickname text, table_number integer, seat_number integer, role text, role_acknowledged boolean)
language sql security invoker
as $$ select * from private.get_staff_game_roles_impl($1); $$;

create or replace function private.require_game_roles_before_reveal()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_players integer; v_roles integer; v_acknowledged integer;
begin
  if old.narrative_phase is distinct from new.narrative_phase and new.narrative_phase in ('role_reveal','briefing') then
    select count(*)::integer into v_players from public.players p where p.game_id = new.id;
    select count(*)::integer into v_roles from public.game_role_assignments r where r.game_id = new.id;
    if v_roles <> v_players then raise exception 'ROLE_ASSIGNMENT_REQUIRED' using errcode = 'P0001'; end if;
    if new.narrative_phase = 'briefing' then
      select count(*)::integer into v_acknowledged from public.game_role_acknowledgements a where a.game_id = new.id;
      if v_acknowledged <> v_roles then raise exception 'ROLE_ACKNOWLEDGEMENT_REQUIRED' using errcode = 'P0001'; end if;
    end if;
  end if;
  return new;
end;
$$;
