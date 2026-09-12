create table public.table_coin_ledger (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete restrict,
  game_table_id uuid not null,
  delta integer not null check (delta <> 0),
  reason text not null check (btrim(reason) <> ''),
  correlation_id uuid not null,
  created_by_staff_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (game_id, game_table_id) references public.game_tables(game_id, id) on delete restrict,
  unique (game_id, correlation_id)
);

create index table_coin_ledger_table_idx on public.table_coin_ledger (game_id, game_table_id);
alter table public.table_coin_ledger enable row level security;
revoke all on table public.table_coin_ledger from public, anon, authenticated;

create or replace function private.prevent_table_coin_ledger_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'TABLE_COIN_LEDGER_IMMUTABLE' using errcode = 'P0001';
end;
$$;
revoke all on function private.prevent_table_coin_ledger_mutation() from public, anon, authenticated;

create trigger table_coin_ledger_immutable
before update or delete on public.table_coin_ledger
for each row execute function private.prevent_table_coin_ledger_mutation();

create or replace function private.adjust_table_coins_impl(
  p_game_code text, p_table_number integer, p_delta integer, p_reason text, p_command_id uuid
)
returns table (game_id uuid, game_code text, table_number integer, delta integer, reason text, correlation_id uuid, balance bigint, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_game public.games%rowtype;
  v_table public.game_tables%rowtype;
  v_existing public.table_coin_ledger%rowtype;
  v_balance bigint;
  v_code text := upper(btrim(coalesce(p_game_code, '')));
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then raise exception 'STAFF_AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.staff_members s where s.auth_user_id = auth.uid() and s.active) then raise exception 'STAFF_ACCESS_DENIED' using errcode = 'P0001'; end if;
  if v_code = '' or p_table_number is null or p_delta is null or p_delta = 0 or v_reason = '' or p_command_id is null then
    raise exception 'INVALID_COIN_ADJUSTMENT' using errcode = 'P0001';
  end if;
  select g.* into v_game from public.games g where upper(btrim(g.code)) = v_code for update;
  if not found then raise exception 'GAME_NOT_FOUND' using errcode = 'P0001'; end if;
  select gt.* into v_table from public.game_tables gt where gt.game_id = v_game.id and gt.table_number = p_table_number;
  if not found then raise exception 'TABLE_NOT_FOUND' using errcode = 'P0001'; end if;
  select l.* into v_existing from public.table_coin_ledger l where l.game_id = v_game.id and l.correlation_id = p_command_id;
  if found then
    if v_existing.game_table_id <> v_table.id or v_existing.delta <> p_delta or v_existing.reason <> v_reason then
      raise exception 'COIN_COMMAND_CONFLICT' using errcode = 'P0001';
    end if;
    select coalesce(sum(l.delta), 0)::bigint into v_balance from public.table_coin_ledger l where l.game_id = v_game.id and l.game_table_id = v_table.id;
    return query select v_game.id, v_game.code, p_table_number, v_existing.delta, v_existing.reason, v_existing.correlation_id, v_balance, v_existing.created_at;
    return;
  end if;
  select coalesce(sum(l.delta), 0)::bigint into v_balance from public.table_coin_ledger l where l.game_id = v_game.id and l.game_table_id = v_table.id;
  if p_delta < 0 and v_balance + p_delta < 0 then raise exception 'INSUFFICIENT_TABLE_COINS' using errcode = 'P0001'; end if;
  insert into public.table_coin_ledger (game_id, game_table_id, delta, reason, correlation_id, created_by_staff_user_id)
  values (v_game.id, v_table.id, p_delta, v_reason, p_command_id, auth.uid()) returning * into v_existing;
  v_balance := v_balance + p_delta;
  perform realtime.send(pg_catalog.jsonb_build_object('kind', 'table_coin_changed'), 'table_coin_changed', 'game:' || v_game.id::text, true);
  return query select v_game.id, v_game.code, p_table_number, v_existing.delta, v_existing.reason, v_existing.correlation_id, v_balance, v_existing.created_at;
end;
$$;
revoke all on function private.adjust_table_coins_impl(text, integer, integer, text, uuid) from public, anon, authenticated;
grant execute on function private.adjust_table_coins_impl(text, integer, integer, text, uuid) to authenticated;

create or replace function public.adjust_table_coins(game_code text, table_number integer, delta integer, reason text, command_id uuid)
returns table (game_id uuid, game_code text, table_number integer, delta integer, reason text, correlation_id uuid, balance bigint, created_at timestamptz)
language sql security invoker as $$ select * from private.adjust_table_coins_impl($1, $2, $3, $4, $5); $$;
revoke execute on function public.adjust_table_coins(text, integer, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.adjust_table_coins(text, integer, integer, text, uuid) to authenticated;

create or replace function private.get_staff_game_coins_impl(p_game_code text)
returns table (table_number integer, balance bigint)
language plpgsql security definer set search_path = '' as $$
declare v_game_id uuid; v_code text := upper(btrim(coalesce(p_game_code, '')));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then raise exception 'STAFF_AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.staff_members s where s.auth_user_id = auth.uid() and s.active) then raise exception 'STAFF_ACCESS_DENIED' using errcode = 'P0001'; end if;
  select g.id into v_game_id from public.games g where upper(btrim(g.code)) = v_code;
  if not found then raise exception 'GAME_NOT_FOUND' using errcode = 'P0001'; end if;
  return query select gt.table_number, coalesce(sum(l.delta), 0)::bigint from public.game_tables gt left join public.table_coin_ledger l on l.game_id = gt.game_id and l.game_table_id = gt.id where gt.game_id = v_game_id group by gt.table_number order by gt.table_number;
end;
$$;
revoke all on function private.get_staff_game_coins_impl(text) from public, anon, authenticated;
grant execute on function private.get_staff_game_coins_impl(text) to authenticated;
create or replace function public.get_staff_game_coins(game_code text) returns table (table_number integer, balance bigint) language sql security invoker as $$ select * from private.get_staff_game_coins_impl($1); $$;
revoke execute on function public.get_staff_game_coins(text) from public, anon, authenticated;
grant execute on function public.get_staff_game_coins(text) to authenticated;

drop function if exists public.get_my_player_state(text);
drop function if exists private.get_my_player_state_impl(text);
create or replace function private.get_my_player_state_impl(p_game_code text)
returns table (game_id uuid,lifecycle text,narrative_phase text,nickname text,table_number integer,seat_number integer,role text,role_acknowledged boolean,scenario_title text,briefing_title text,briefing_body text,discovery_title text,discovery_body text,clue_title text,clue_body text,comparison_title text,comparison_body text,comparison_target_table_number integer,comparison_instruction text,pressure_title text,pressure_body text,pressure_target_table_number integer,pressure_route_title text,pressure_instruction text,table_coin_balance bigint)
language plpgsql security definer set search_path = '' as $$
declare v_game_id uuid; begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='P0001'; end if;
  if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) is not true then raise exception 'AUTH_ANONYMOUS_REQUIRED' using errcode='P0001'; end if;
  select g.id into v_game_id from public.games g where upper(btrim(g.code))=upper(btrim(coalesce(p_game_code,''))); if not found then raise exception 'GAME_NOT_FOUND' using errcode='P0001'; end if;
  return query select g.id,g.lifecycle,g.narrative_phase,p.nickname,gt.table_number,p.seat_number,case when g.narrative_phase='lobby' then null when ra.role in ('liar','accomplice','investigator') then ra.role when ra.role='scapegoat' then 'investigator' else null end,(ack.player_id is not null),case when g.narrative_phase in ('briefing','discovery','comparison','pressure','auction','deliberation','final_vote','reveal') then s.title else null end,case when g.narrative_phase='briefing' then sv.briefing_title else null end,case when g.narrative_phase='briefing' then sv.briefing_body else null end,case when g.narrative_phase='discovery' then sv.discovery_title else null end,case when g.narrative_phase='discovery' then sv.discovery_body else null end,case when g.narrative_phase in ('discovery','comparison','pressure','auction','deliberation','final_vote','reveal') then clue.title else null end,case when g.narrative_phase in ('discovery','comparison','pressure','auction','deliberation','final_vote','reveal') then clue.body else null end,case when g.narrative_phase='comparison' then sv.comparison_title else null end,case when g.narrative_phase='comparison' then sv.comparison_body else null end,case when g.narrative_phase='comparison' then cmp.target_table_number else null end,case when g.narrative_phase='comparison' then cmp.instruction else null end,case when g.narrative_phase='pressure' then sv.pressure_title else null end,case when g.narrative_phase='pressure' then sv.pressure_body else null end,case when g.narrative_phase='pressure' then pr.target_table_number else null end,case when g.narrative_phase='pressure' then pr.title else null end,case when g.narrative_phase='pressure' then pr.instruction else null end,coalesce((select sum(l.delta)::bigint from public.table_coin_ledger l where l.game_id=p.game_id and l.game_table_id=gt.id),0)::bigint from public.players p join public.games g on g.id=p.game_id join public.game_tables gt on gt.id=p.table_id and gt.game_id=p.game_id left join public.game_role_assignments ra on ra.player_id=p.id and ra.game_id=p.game_id left join public.game_role_acknowledgements ack on ack.player_id=p.id and ack.game_id=p.game_id left join public.scenario_versions sv on sv.id=g.scenario_version_id left join public.scenarios s on s.id=sv.scenario_id left join public.scenario_table_clues clue on clue.scenario_version_id=g.scenario_version_id and clue.table_number=gt.table_number left join public.scenario_table_comparisons cmp on cmp.scenario_version_id=g.scenario_version_id and cmp.source_table_number=gt.table_number left join public.scenario_table_pressure_routes pr on pr.scenario_version_id=g.scenario_version_id and pr.source_table_number=gt.table_number where p.auth_user_id=auth.uid() and p.game_id=v_game_id;
end; $$;
create or replace function public.get_my_player_state(game_code text) returns table (game_id uuid,lifecycle text,narrative_phase text,nickname text,table_number integer,seat_number integer,role text,role_acknowledged boolean,scenario_title text,briefing_title text,briefing_body text,discovery_title text,discovery_body text,clue_title text,clue_body text,comparison_title text,comparison_body text,comparison_target_table_number integer,comparison_instruction text,pressure_title text,pressure_body text,pressure_target_table_number integer,pressure_route_title text,pressure_instruction text,table_coin_balance bigint) language sql security invoker as $$ select * from private.get_my_player_state_impl($1); $$;
revoke execute on function public.get_my_player_state(text) from public,anon,authenticated; grant execute on function public.get_my_player_state(text) to authenticated;
