create table public.game_narrative_phase_commands (
  command_id uuid not null,
  game_id uuid not null references public.games(id) on delete restrict,
  staff_member_id uuid not null references public.staff_members(id) on delete restrict,
  from_phase text not null check (from_phase in ('lobby', 'role_reveal', 'briefing', 'discovery', 'comparison', 'pressure', 'auction', 'deliberation', 'final_vote', 'reveal')),
  to_phase text not null check (to_phase in ('lobby', 'role_reveal', 'briefing', 'discovery', 'comparison', 'pressure', 'auction', 'deliberation', 'final_vote', 'reveal')),
  created_at timestamptz not null default now(),
  unique (game_id, command_id)
);

alter table public.game_narrative_phase_commands enable row level security;
revoke all on table public.game_narrative_phase_commands from public, anon, authenticated;

create or replace function private.transition_game_narrative_phase_impl(
  p_game_code text,
  p_expected_phase text,
  p_target_phase text,
  p_command_id uuid
)
returns table (
  game_id uuid,
  game_code text,
  previous_phase text,
  phase text,
  command_id uuid,
  changed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games%rowtype;
  v_staff_id uuid;
  v_audit public.game_narrative_phase_commands%rowtype;
  v_code text := upper(btrim(coalesce(p_game_code, '')));
  v_expected text := lower(btrim(coalesce(p_expected_phase, '')));
  v_target text := lower(btrim(coalesce(p_target_phase, '')));
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then
    raise exception 'STAFF_AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select s.id
    into v_staff_id
    from public.staff_members s
   where s.auth_user_id = auth.uid()
     and s.active = true;

  if not found then
    raise exception 'STAFF_ACCESS_DENIED' using errcode = 'P0001';
  end if;

  if p_command_id is null or v_code = '' then
    raise exception 'INVALID_COMMAND' using errcode = 'P0001';
  end if;

  if v_expected not in ('lobby', 'role_reveal', 'briefing', 'discovery', 'comparison', 'pressure', 'auction', 'deliberation', 'final_vote', 'reveal')
     or v_target not in ('lobby', 'role_reveal', 'briefing', 'discovery', 'comparison', 'pressure', 'auction', 'deliberation', 'final_vote', 'reveal') then
    raise exception 'INVALID_PHASE' using errcode = 'P0001';
  end if;

  select g.*
    into v_game
    from public.games g
   where upper(btrim(g.code)) = v_code
   for update;

  if not found then
    raise exception 'GAME_NOT_FOUND' using errcode = 'P0001';
  end if;

  select a.*
    into v_audit
    from public.game_narrative_phase_commands a
   where a.game_id = v_game.id
     and a.command_id = p_command_id;

  if found then
    if v_audit.from_phase <> v_expected or v_audit.to_phase <> v_target then
      raise exception 'CONFLICT' using errcode = 'P0001';
    end if;

    return query
      select v_audit.game_id,
             v_game.code,
             v_audit.from_phase,
             v_audit.to_phase,
             v_audit.command_id,
             v_audit.created_at;
    return;
  end if;

  if v_game.lifecycle <> 'live' then
    raise exception 'GAME_NOT_LIVE' using errcode = 'P0001';
  end if;

  if v_game.narrative_phase <> v_expected then
    raise exception 'STALE_GAME_STATE' using errcode = 'P0001';
  end if;

  if not (
    (v_expected = 'lobby' and v_target = 'role_reveal') or
    (v_expected = 'role_reveal' and v_target = 'briefing') or
    (v_expected = 'briefing' and v_target = 'discovery') or
    (v_expected = 'discovery' and v_target = 'comparison') or
    (v_expected = 'comparison' and v_target = 'pressure') or
    (v_expected = 'pressure' and v_target = 'auction') or
    (v_expected = 'auction' and v_target = 'deliberation') or
    (v_expected = 'deliberation' and v_target = 'final_vote') or
    (v_expected = 'final_vote' and v_target = 'reveal')
  ) then
    raise exception 'INVALID_PHASE_TRANSITION' using errcode = 'P0001';
  end if;

  update public.games g
     set narrative_phase = v_target,
         updated_at = now()
   where g.id = v_game.id;

  insert into public.game_narrative_phase_commands (
    command_id,
    game_id,
    staff_member_id,
    from_phase,
    to_phase
  ) values (
    p_command_id,
    v_game.id,
    v_staff_id,
    v_expected,
    v_target
  )
  returning created_at into v_audit.created_at;

  return query
    select v_game.id,
           v_game.code,
           v_expected,
           v_target,
           p_command_id,
           v_audit.created_at;
end;
$$;

revoke all on function private.transition_game_narrative_phase_impl(text, text, text, uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.transition_game_narrative_phase_impl(text, text, text, uuid) to authenticated;

create or replace function public.transition_game_narrative_phase(
  game_code text,
  expected_phase text,
  target_phase text,
  command_id uuid
)
returns table (
  game_id uuid,
  game_code text,
  previous_phase text,
  phase text,
  command_id uuid,
  changed_at timestamptz
)
language sql
security invoker
as $$
  select * from private.transition_game_narrative_phase_impl($1, $2, $3, $4);
$$;

revoke execute on function public.transition_game_narrative_phase(text, text, text, uuid) from public, anon;
grant execute on function public.transition_game_narrative_phase(text, text, text, uuid) to authenticated;
