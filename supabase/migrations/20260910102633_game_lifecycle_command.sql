create table public.game_lifecycle_commands (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null,
  game_id uuid not null references public.games(id) on delete restrict,
  staff_member_id uuid not null references public.staff_members(id) on delete restrict,
  from_lifecycle text not null check (from_lifecycle in ('draft', 'ready', 'checkin_open', 'live', 'paused', 'completed', 'aborted')),
  to_lifecycle text not null check (to_lifecycle in ('draft', 'ready', 'checkin_open', 'live', 'paused', 'completed', 'aborted')),
  created_at timestamptz not null default now(),
  unique (game_id, command_id)
);

alter table public.game_lifecycle_commands enable row level security;
revoke all on table public.game_lifecycle_commands from public, anon, authenticated;

create or replace function private.transition_game_lifecycle_impl(
  p_game_code text,
  p_expected_lifecycle text,
  p_target_lifecycle text,
  p_command_id uuid
)
returns table (
  game_id uuid,
  game_code text,
  previous_lifecycle text,
  lifecycle text,
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
  v_audit public.game_lifecycle_commands%rowtype;
  v_code text := upper(btrim(coalesce(p_game_code, '')));
  v_expected text := lower(btrim(coalesce(p_expected_lifecycle, '')));
  v_target text := lower(btrim(coalesce(p_target_lifecycle, '')));
  v_changed_at timestamptz;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then
    raise exception 'STAFF_AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  select s.id into v_staff_id from public.staff_members s
    where s.auth_user_id = auth.uid() and s.active = true;
  if not found then raise exception 'STAFF_ACCESS_DENIED' using errcode = 'P0001'; end if;
  if p_command_id is null or v_code = '' then
    raise exception 'INVALID_COMMAND' using errcode = 'P0001';
  end if;
  if v_expected not in ('draft', 'ready', 'checkin_open', 'live', 'paused', 'completed', 'aborted')
    or v_target not in ('draft', 'ready', 'checkin_open', 'live', 'paused', 'completed', 'aborted') then
    raise exception 'INVALID_LIFECYCLE' using errcode = 'P0001';
  end if;

  select g.* into v_game from public.games g
    where upper(btrim(g.code)) = v_code
    for update;
  if not found then raise exception 'GAME_NOT_FOUND' using errcode = 'P0001'; end if;

  select a.* into v_audit from public.game_lifecycle_commands a
    where a.game_id = v_game.id and a.command_id = p_command_id;
  if found then
    if v_audit.from_lifecycle <> v_expected or v_audit.to_lifecycle <> v_target then
      raise exception 'CONFLICT' using errcode = 'P0001';
    end if;
    return query select v_audit.game_id, v_game.code, v_audit.from_lifecycle,
      v_audit.to_lifecycle, v_audit.command_id, v_audit.created_at;
    return;
  end if;

  if v_game.lifecycle <> v_expected then
    raise exception 'STALE_GAME_STATE' using errcode = 'P0001';
  end if;

  if not (
    (v_expected = 'draft' and v_target in ('ready', 'aborted')) or
    (v_expected = 'ready' and v_target in ('checkin_open', 'aborted')) or
    (v_expected = 'checkin_open' and v_target in ('live', 'aborted')) or
    (v_expected = 'live' and v_target in ('paused', 'completed', 'aborted')) or
    (v_expected = 'paused' and v_target in ('live', 'aborted'))
  ) then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;

  update public.games g
    set lifecycle = v_target, updated_at = now()
    where g.id = v_game.id
    returning g.updated_at into v_changed_at;

  insert into public.game_lifecycle_commands (
    command_id, game_id, staff_member_id, from_lifecycle, to_lifecycle
  ) values (
    p_command_id, v_game.id, v_staff_id, v_expected, v_target
  ) returning created_at into v_changed_at;

  return query select v_game.id, v_game.code, v_expected, v_target, p_command_id, v_changed_at;
end;
$$;

revoke all on function private.transition_game_lifecycle_impl(text, text, text, uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.transition_game_lifecycle_impl(text, text, text, uuid) to authenticated;

create or replace function public.transition_game_lifecycle(
  game_code text,
  expected_lifecycle text,
  target_lifecycle text,
  command_id uuid
)
returns table (
  game_id uuid,
  game_code text,
  previous_lifecycle text,
  lifecycle text,
  command_id uuid,
  changed_at timestamptz
)
language sql
security invoker
as $$
  select * from private.transition_game_lifecycle_impl($1, $2, $3, $4);
$$;

revoke execute on function public.transition_game_lifecycle(text, text, text, uuid) from public, anon;
grant execute on function public.transition_game_lifecycle(text, text, text, uuid) to authenticated;
