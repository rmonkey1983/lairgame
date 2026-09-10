begin;

select plan(30);

select has_function('public', 'transition_game_lifecycle', array['text', 'text', 'text', 'uuid'], 'lifecycle command exists');
select ok(not (select prosecdef from pg_proc where oid = 'public.transition_game_lifecycle(text,text,text,uuid)'::regprocedure), 'public command is invoker');
select ok((select prosecdef from pg_proc where oid = 'private.transition_game_lifecycle_impl(text,text,text,uuid)'::regprocedure), 'private command is definer');
select ok((select 'search_path=""' = any(proconfig) from pg_proc where oid = 'private.transition_game_lifecycle_impl(text,text,text,uuid)'::regprocedure), 'private command has empty search path');
select ok(not has_function_privilege('public', 'public.transition_game_lifecycle(text,text,text,uuid)', 'execute'), 'PUBLIC cannot execute lifecycle command');
select ok(not has_function_privilege('anon', 'public.transition_game_lifecycle(text,text,text,uuid)', 'execute'), 'anon cannot execute lifecycle command');
select ok(has_function_privilege('authenticated', 'public.transition_game_lifecycle(text,text,text,uuid)', 'execute'), 'authenticated can execute lifecycle command');

insert into auth.users (id, aud, role, email, is_anonymous)
values
  ('00000000-0000-0000-0000-000000000041', 'authenticated', 'authenticated', 'lifecycle-active@example.test', false),
  ('00000000-0000-0000-0000-000000000042', 'authenticated', 'authenticated', 'lifecycle-inactive@example.test', false),
  ('00000000-0000-0000-0000-000000000043', 'authenticated', 'authenticated', 'lifecycle-anon@example.test', true),
  ('00000000-0000-0000-0000-000000000044', 'authenticated', 'authenticated', 'lifecycle-none@example.test', false);
insert into public.staff_members (id, auth_user_id, display_name, active)
values
  ('40000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000041', 'Lifecycle Staff', true),
  ('40000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000042', 'Inactive Lifecycle Staff', false);

set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$select * from public.transition_game_lifecycle('TEST01', 'checkin_open', 'live', '50000000-0000-0000-0000-000000000041')$$, 'P0001', 'AUTH_REQUIRED', 'missing auth uid rejected');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000043', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000043","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$select * from public.transition_game_lifecycle('TEST01', 'checkin_open', 'live', '50000000-0000-0000-0000-000000000042')$$, 'P0001', 'STAFF_AUTH_REQUIRED', 'anonymous player rejected');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000044', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000044","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select * from public.transition_game_lifecycle('TEST01', 'checkin_open', 'live', '50000000-0000-0000-0000-000000000043')$$, 'P0001', 'STAFF_ACCESS_DENIED', 'non-staff rejected');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000042', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000042","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select * from public.transition_game_lifecycle('TEST01', 'checkin_open', 'live', '50000000-0000-0000-0000-000000000044')$$, 'P0001', 'STAFF_ACCESS_DENIED', 'inactive staff rejected');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000041', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000041","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select * from public.transition_game_lifecycle('MISSING', 'checkin_open', 'live', '50000000-0000-0000-0000-000000000045')$$, 'P0001', 'GAME_NOT_FOUND', 'missing game rejected');
select throws_ok($$select * from public.transition_game_lifecycle('TEST01', 'checkin_open', 'unknown', '50000000-0000-0000-0000-000000000046')$$, 'P0001', 'INVALID_LIFECYCLE', 'invalid lifecycle rejected');
select throws_ok($$select * from public.transition_game_lifecycle('TEST01', 'checkin_open', 'completed', '50000000-0000-0000-0000-000000000047')$$, 'P0001', 'INVALID_TRANSITION', 'invalid transition rejected');

select is((select lifecycle from public.transition_game_lifecycle(' test01 ', 'checkin_open', 'live', '50000000-0000-0000-0000-000000000048')), 'live', 'valid transition succeeds');
reset role;
select is((select lifecycle from public.games where code = 'TEST01'), 'live', 'game lifecycle changes once');
select is((select count(*) from public.game_lifecycle_commands where game_id = 'a0000000-0000-0000-0000-000000000050'), 1::bigint, 'one audit row is created');
select is((select staff_member_id from public.game_lifecycle_commands), '40000000-0000-0000-0000-000000000041'::uuid, 'audit identifies active Staff');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000041', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000041","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select * from public.transition_game_lifecycle('TEST01', 'checkin_open', 'paused', '50000000-0000-0000-0000-000000000049')$$, 'P0001', 'STALE_GAME_STATE', 'stale state rejected');
reset role;
select is((select lifecycle from public.games where code = 'TEST01'), 'live', 'stale command does not mutate');
select is((select count(*) from public.game_lifecycle_commands), 1::bigint, 'stale command creates no audit row');

set local role authenticated;
select is((select lifecycle from public.transition_game_lifecycle('TEST01', 'checkin_open', 'live', '50000000-0000-0000-0000-000000000048')), 'live', 'identical retry returns established result');
reset role;
select is((select count(*) from public.game_lifecycle_commands), 1::bigint, 'identical retry creates no second audit row');

set local role authenticated;
select throws_ok($$select * from public.transition_game_lifecycle('TEST01', 'checkin_open', 'paused', '50000000-0000-0000-0000-000000000048')$$, 'P0001', 'CONFLICT', 'incompatible command reuse rejected');
select throws_ok($$select * from public.transition_game_lifecycle('TEST01', 'checkin_open', 'paused', '50000000-0000-0000-0000-000000000049')$$, 'P0001', 'STALE_GAME_STATE', 'competing expected state cannot mutate');
reset role;
select is((select lifecycle from public.games where code = 'TEST01'), 'live', 'competing command leaves lifecycle unchanged');

select ok((select relrowsecurity from pg_class where oid = 'public.game_lifecycle_commands'::regclass), 'audit table has RLS enabled');
select ok(not has_table_privilege('authenticated', 'public.game_lifecycle_commands', 'INSERT'), 'browser cannot insert audit rows');
select ok(not has_table_privilege('authenticated', 'public.games', 'UPDATE'), 'browser cannot update games');
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'graphql_public') and p.prosecdef), 'exposed schemas contain no definer functions');

select * from finish();
rollback;
