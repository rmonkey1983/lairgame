begin;

select plan(14);

select ok(to_regprocedure('private.broadcast_brain_state_changed()') is not null, 'Brain broadcast helper exists');
select ok(to_regprocedure('private.can_receive_brain_topic()') is not null, 'Brain topic authorization helper exists');
select ok((select prosecdef from pg_proc where oid = 'private.broadcast_brain_state_changed()'::regprocedure), 'Brain broadcast helper is definer');
select ok((select 'search_path=""' = any(proconfig) from pg_proc where oid = 'private.broadcast_brain_state_changed()'::regprocedure), 'Brain broadcast helper has empty search path');
select ok((select polcmd = 'r' from pg_policy where polrelid = 'realtime.messages'::regclass and polname = 'active staff can receive brain broadcasts'), 'Brain realtime policy is receive-only');
select ok(not has_table_privilege('authenticated', 'public.brain_events', 'SELECT'), 'Brain event table remains closed to direct browser reads');
select is((select count(*) from pg_trigger where tgrelid = 'public.brain_events'::regclass and tgname = 'brain_events_broadcast_state_change'), 1::bigint, 'Brain event trigger exists');
select is((select count(*) from pg_trigger where tgrelid = 'public.brain_trust_state'::regclass and tgname = 'brain_trust_broadcast_state_change'), 1::bigint, 'Trust trigger exists');
select is((select count(*) from pg_trigger where tgrelid = 'public.brain_suspicion_state'::regclass and tgname = 'brain_suspicion_broadcast_state_change'), 1::bigint, 'Suspicion trigger exists');
select is((select count(*) from pg_trigger where tgrelid = 'public.brain_regia_proposals'::regclass and tgname = 'brain_regia_broadcast_state_change'), 1::bigint, 'Regia trigger exists');

insert into auth.users (id, aud, role, email, is_anonymous)
values
  ('00000000-0000-0000-0000-000000000981', 'authenticated', 'authenticated', 'brain-realtime-staff@example.test', false),
  ('00000000-0000-0000-0000-000000000982', 'authenticated', 'authenticated', 'brain-realtime-player@example.test', true);
insert into public.staff_members (id, auth_user_id, display_name, active)
values ('40000000-0000-0000-0000-000000000981', '00000000-0000-0000-0000-000000000981', 'Brain Realtime Staff', true);
insert into public.players (id, game_id, auth_user_id, nickname)
values ('20000000-0000-0000-0000-000000000981', (select id from public.games where code = 'TEST01'), '00000000-0000-0000-0000-000000000982', 'Brain Realtime Player');

select set_config('realtime.topic', 'brain:' || (select id::text from public.games where code = 'TEST01'), true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000981', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000981","role":"authenticated","is_anonymous":false}', true);
select ok(private.can_receive_brain_topic(), 'Active Staff can receive the Brain topic');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000982', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000982","role":"authenticated","is_anonymous":true}', true);
select ok(not private.can_receive_brain_topic(), 'Player cannot receive the private Brain topic');
reset role;

insert into public.brain_events (event_id, session_id, sequence, event_type, phase, payload)
select 'realtime-brain-event-1', id, 1, 'PHASE_ENTERED', 'lobby', '{"newPhase":"LOBBY"}'::jsonb
from public.games where code = 'TEST01';
select is((select count(*) from realtime.messages where topic = 'brain:' || (select id::text from public.games where code = 'TEST01') and event = 'brain_state_changed'), 1::bigint, 'Brain mutation emits one wake-up');
select is((select payload - 'id' from realtime.messages where topic = 'brain:' || (select id::text from public.games where code = 'TEST01') and event = 'brain_state_changed' limit 1), '{"kind":"brain_state_changed"}'::jsonb, 'Brain wake-up payload contains no persisted state');

select * from finish();
rollback;
