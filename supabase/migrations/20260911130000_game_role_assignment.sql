create table public.game_role_assignments (
  player_id uuid primary key references public.players(id) on delete restrict,
  game_id uuid not null references public.games(id) on delete restrict,
  role text not null check (role in ('liar', 'accomplice', 'scapegoat', 'investigator')),
  assigned_at timestamptz not null default now(),
  unique (game_id, player_id)
);

create unique index game_role_assignments_one_special_role
  on public.game_role_assignments (game_id, role)
  where role in ('liar', 'accomplice', 'scapegoat');

alter table public.game_role_assignments enable row level security;
revoke all on table public.game_role_assignments from public, anon, authenticated;

create table public.game_role_assignment_commands (
  game_id uuid not null references public.games(id) on delete restrict,
  command_id uuid not null,
  staff_member_id uuid not null references public.staff_members(id) on delete restrict,
  player_count integer not null check (player_count >= 3),
  created_at timestamptz not null default now(),
  primary key (game_id, command_id)
);

alter table public.game_role_assignment_commands enable row level security;
revoke all on table public.game_role_assignment_commands from public, anon, authenticated;

create or replace function private.assign_game_roles_impl(p_game_code text, p_command_id uuid)
returns table (game_id uuid, game_code text, command_id uuid, player_count integer, assigned_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  v_game public.games%rowtype;
  v_staff_id uuid;
  v_audit public.game_role_assignment_commands%rowtype;
  v_code text := upper(btrim(coalesce(p_game_code, '')));
  v_player_count integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then
    raise exception 'STAFF_AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  select s.id into v_staff_id from public.staff_members s
   where s.auth_user_id = auth.uid() and s.active = true;
  if not found then raise exception 'STAFF_ACCESS_DENIED' using errcode = 'P0001'; end if;
  if p_command_id is null or v_code = '' then raise exception 'INVALID_COMMAND' using errcode = 'P0001'; end if;

  select g.* into v_game from public.games g
   where upper(btrim(g.code)) = v_code for update;
  if not found then raise exception 'GAME_NOT_FOUND' using errcode = 'P0001'; end if;

  select a.* into v_audit from public.game_role_assignment_commands a
   where a.game_id = v_game.id and a.command_id = p_command_id;
  if found then
    return query select v_audit.game_id, v_game.code, v_audit.command_id,
                        v_audit.player_count, v_audit.created_at;
    return;
  end if;

  if v_game.lifecycle <> 'live' then raise exception 'GAME_NOT_LIVE' using errcode = 'P0001'; end if;
  if v_game.narrative_phase <> 'lobby' then raise exception 'GAME_NOT_IN_LOBBY' using errcode = 'P0001'; end if;
  select count(*)::integer into v_player_count from public.players p where p.game_id = v_game.id;
  if v_player_count < 3 then raise exception 'MIN_PLAYERS_REQUIRED' using errcode = 'P0001'; end if;
  if exists (select 1 from public.game_role_assignments r where r.game_id = v_game.id) then
    raise exception 'ROLES_ALREADY_ASSIGNED' using errcode = 'P0001';
  end if;

  with ordered_players as (
    select p.id, row_number() over (order by pg_catalog.md5(p.id::text || v_game.id::text), p.id) as position
      from public.players p where p.game_id = v_game.id
  )
  insert into public.game_role_assignments (player_id, game_id, role)
  select id, v_game.id,
         case position when 1 then 'liar' when 2 then 'accomplice' when 3 then 'scapegoat' else 'investigator' end
    from ordered_players;

  insert into public.game_role_assignment_commands (game_id, command_id, staff_member_id, player_count)
  values (v_game.id, p_command_id, v_staff_id, v_player_count)
  returning * into v_audit;

  perform realtime.send(
    pg_catalog.jsonb_build_object('kind', 'game_state_changed'),
    'game_state_changed', 'game:' || v_game.id::text, true
  );

  return query select v_game.id, v_game.code, p_command_id, v_player_count, v_audit.created_at;
end;
$$;

revoke all on function private.assign_game_roles_impl(text, uuid) from public, anon, authenticated;
grant execute on function private.assign_game_roles_impl(text, uuid) to authenticated;

create or replace function public.assign_game_roles(game_code text, command_id uuid)
returns table (game_id uuid, game_code text, command_id uuid, player_count integer, assigned_at timestamptz)
language sql security invoker
as $$ select * from private.assign_game_roles_impl($1, $2); $$;

revoke execute on function public.assign_game_roles(text, uuid) from public, anon, authenticated;
grant execute on function public.assign_game_roles(text, uuid) to authenticated;

create or replace function private.get_staff_game_roles_impl(p_game_code text)
returns table (player_id uuid, nickname text, table_number integer, seat_number integer, role text)
language plpgsql security definer set search_path = ''
as $$
declare v_game_id uuid; v_code text := upper(btrim(coalesce(p_game_code, '')));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then raise exception 'STAFF_AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.staff_members s where s.auth_user_id = auth.uid() and s.active = true) then raise exception 'STAFF_ACCESS_DENIED' using errcode = 'P0001'; end if;
  select g.id into v_game_id from public.games g where upper(btrim(g.code)) = v_code;
  if not found then raise exception 'GAME_NOT_FOUND' using errcode = 'P0001'; end if;
  return query select p.id, p.nickname, gt.table_number, p.seat_number, r.role
    from public.game_role_assignments r join public.players p on p.id = r.player_id
    join public.game_tables gt on gt.id = p.table_id
   where r.game_id = v_game_id order by gt.table_number, p.seat_number;
end;
$$;

revoke all on function private.get_staff_game_roles_impl(text) from public, anon, authenticated;
grant execute on function private.get_staff_game_roles_impl(text) to authenticated;

create or replace function public.get_staff_game_roles(game_code text)
returns table (player_id uuid, nickname text, table_number integer, seat_number integer, role text)
language sql security invoker
as $$ select * from private.get_staff_game_roles_impl($1); $$;

revoke execute on function public.get_staff_game_roles(text) from public, anon, authenticated;
grant execute on function public.get_staff_game_roles(text) to authenticated;

create or replace function private.require_game_roles_before_reveal()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_players integer; v_roles integer;
begin
  if old.narrative_phase is distinct from new.narrative_phase and new.narrative_phase = 'role_reveal' then
    select count(*)::integer into v_players from public.players p where p.game_id = new.id;
    select count(*)::integer into v_roles from public.game_role_assignments r where r.game_id = new.id;
    if v_roles <> v_players then
      raise exception 'ROLE_ASSIGNMENT_REQUIRED' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.require_game_roles_before_reveal() from public, anon, authenticated;
create trigger games_require_roles_before_reveal
before update of narrative_phase on public.games
for each row execute function private.require_game_roles_before_reveal();
