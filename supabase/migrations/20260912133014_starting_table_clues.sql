create table public.scenario_table_clues (
  id uuid primary key default gen_random_uuid(),
  scenario_version_id uuid not null references public.scenario_versions(id) on delete restrict,
  table_number integer not null check (table_number between 1 and 5),
  title text not null check (btrim(title) <> ''),
  body text not null check (btrim(body) <> ''),
  created_at timestamptz not null default now(),
  unique (scenario_version_id, table_number)
);

alter table public.scenario_table_clues enable row level security;
revoke all on table public.scenario_table_clues from public, anon, authenticated;

create or replace function private.prevent_published_scenario_table_clue_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.scenario_versions sv
    where sv.id = coalesce(new.scenario_version_id, old.scenario_version_id)
      and sv.status = 'published'
  ) then
    raise exception 'PUBLISHED_SCENARIO_IMMUTABLE' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_published_scenario_table_clue_mutation() from public, anon, authenticated;

insert into public.scenario_table_clues (id, scenario_version_id, table_number, title, body)
values
  ('f0000000-0000-0000-0000-000000000171', 'e0000000-0000-0000-0000-000000000015', 1, 'Il bicchiere', 'Un bicchiere è stato spostato prima dell’inizio della cena.'),
  ('f0000000-0000-0000-0000-000000000172', 'e0000000-0000-0000-0000-000000000015', 2, 'La sedia vuota', 'Una sedia è rimasta vuota per qualche minuto durante i preparativi.'),
  ('f0000000-0000-0000-0000-000000000173', 'e0000000-0000-0000-0000-000000000015', 3, 'Il biglietto', 'Un biglietto senza firma è stato trovato vicino ai piatti.'),
  ('f0000000-0000-0000-0000-000000000174', 'e0000000-0000-0000-0000-000000000015', 4, 'La luce', 'La luce del corridoio si è spenta per un breve istante.'),
  ('f0000000-0000-0000-0000-000000000175', 'e0000000-0000-0000-0000-000000000015', 5, 'Il rumore', 'Qualcuno ha sentito un rumore arrivare dalla sala prima dell’accoglienza.');

create trigger scenario_table_clues_published_immutable
before insert or update or delete on public.scenario_table_clues
for each row execute function private.prevent_published_scenario_table_clue_mutation();

drop function if exists public.get_my_player_state(text);
drop function if exists private.get_my_player_state_impl(text);

create or replace function private.get_my_player_state_impl(p_game_code text)
returns table (game_id uuid, lifecycle text, narrative_phase text, nickname text, table_number integer, seat_number integer, role text, role_acknowledged boolean, scenario_title text, briefing_title text, briefing_body text, discovery_title text, discovery_body text, clue_title text, clue_body text)
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
    (a.player_id is not null),
    case when g.narrative_phase in ('briefing','discovery','comparison','pressure','auction','deliberation','final_vote','reveal') then s.title else null end,
    case when g.narrative_phase = 'briefing' then sv.briefing_title else null end,
    case when g.narrative_phase = 'briefing' then sv.briefing_body else null end,
    case when g.narrative_phase = 'discovery' then sv.discovery_title else null end,
    case when g.narrative_phase = 'discovery' then sv.discovery_body else null end,
    case when g.narrative_phase in ('discovery','comparison','pressure','auction','deliberation','final_vote','reveal') then c.title else null end,
    case when g.narrative_phase in ('discovery','comparison','pressure','auction','deliberation','final_vote','reveal') then c.body else null end
  from public.players p join public.games g on g.id = p.game_id
  join public.game_tables gt on gt.id = p.table_id and gt.game_id = p.game_id
  left join public.game_role_assignments r on r.player_id = p.id and r.game_id = p.game_id
  left join public.game_role_acknowledgements a on a.player_id = p.id and a.game_id = p.game_id
  left join public.scenario_versions sv on sv.id = g.scenario_version_id
  left join public.scenarios s on s.id = sv.scenario_id
  left join public.scenario_table_clues c on c.scenario_version_id = g.scenario_version_id and c.table_number = gt.table_number
  where p.auth_user_id = auth.uid() and p.game_id = v_game_id;
end;
$$;

create or replace function public.get_my_player_state(game_code text)
returns table (game_id uuid, lifecycle text, narrative_phase text, nickname text, table_number integer, seat_number integer, role text, role_acknowledged boolean, scenario_title text, briefing_title text, briefing_body text, discovery_title text, discovery_body text, clue_title text, clue_body text)
language sql security invoker
as $$ select * from private.get_my_player_state_impl($1); $$;
revoke execute on function public.get_my_player_state(text) from public, anon, authenticated;
grant execute on function public.get_my_player_state(text) to authenticated;

create or replace function private.get_staff_game_clues_impl(p_game_code text)
returns table (table_number integer, title text, body text)
language plpgsql security definer set search_path = ''
as $$
declare v_code text := upper(btrim(coalesce(p_game_code, '')));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then raise exception 'STAFF_AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.staff_members s where s.auth_user_id = auth.uid() and s.active = true) then raise exception 'STAFF_ACCESS_DENIED' using errcode = 'P0001'; end if;
  return query
  select c.table_number, c.title, c.body
  from public.games g join public.scenario_table_clues c on c.scenario_version_id = g.scenario_version_id
  where upper(btrim(g.code)) = v_code
  order by c.table_number;
  if not found and not exists (select 1 from public.games g where upper(btrim(g.code)) = v_code) then
    raise exception 'GAME_NOT_FOUND' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function private.get_staff_game_clues_impl(text) from public, anon, authenticated;
grant execute on function private.get_staff_game_clues_impl(text) to authenticated;

create or replace function public.get_staff_game_clues(game_code text)
returns table (table_number integer, title text, body text)
language sql security invoker
as $$ select * from private.get_staff_game_clues_impl($1); $$;
revoke execute on function public.get_staff_game_clues(text) from public, anon, authenticated;
grant execute on function public.get_staff_game_clues(text) to authenticated;
