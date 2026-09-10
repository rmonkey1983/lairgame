begin;

select plan(38);

select has_function('public', 'transition_game_narrative_phase', array['text', 'text', 'text', 'uuid'], 'narrative phase command exists');
select ok(not (select prosecdef from pg_proc where oid = 'public.transition_game_narrative_phase(text,text,text,uuid)'::regprocedure), 'public phase command is invoker');
select ok((select prosecdef from pg_proc where oid = 'private.transition_game_narrative_phase_impl(text,text,text,uuid)'::regprocedure), 'private phase command is definer');
select ok((select 'search_path=""' = any(proconfig) from pg_proc where oid = 'private.transition_game_narrative_phase_impl(text,text,text,uuid)'::regprocedure), 'private phase command has empty search path');
select ok(not has_function_privilege('public', 'public.transition_game_narrative_phase(text,text,text,uuid)', 'execute'), 'PUBLIC cannot execute phase command');
select ok(not has_function_privilege('anon', 'public.transition_game_narrative_phase(text,text,text,uuid)', 'execute'), 'anon cannot execute phase command');
select ok(has_function_privilege('authenticated', 'public.transition_game_narrative_phase(text,text,text,uuid)', 'execute'), 'authenticated can execute phase command');
select ok((select relrowsecurity from pg_class where oid = 'public.game_narrative_phase_commands'::regclass), 'phase audit has RLS enabled');

insert into auth.users (id, aud, role, email, is_anonymous)
values
  ('00000000-0000-0000-0000-000000000061', 'authenticated', 'authenticated', 'phase-active@example.test', false),
  ('00000000-0000-0000-0000-000000000062', 'authenticated', 'authenticated', 'phase-inactive@example.test', false),
  ('00000000-0000-0000-0000-000000000063', 'authenticated', 'authenticated', 'phase-anon@example.test', true),
  ('00000000-0000-0000-0000-000000000064', 'authenticated', 'authenticated', 'phase-none@example.test', false);
insert into public.staff_members (id, auth_user_id, display_name, active)
values
  ('40000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000061', 'Phase Staff', true),
  ('40000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000062', 'Inactive Phase Staff', false);

set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$select * from public.transition_game_narrative_phase('TEST01', 'lobby', 'role_reveal', '70000000-0000-0000-0000-000000000061')$$, 'P0001', 'AUTH_REQUIRED', 'missing auth uid rejected');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000063', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000063","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$select * from public.transition_game_narrative_phase('TEST01', 'lobby', 'role_reveal', '70000000-0000-0000-0000-000000000062')$$, 'P0001', 'STAFF_AUTH_REQUIRED', 'anonymous player rejected');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000064', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000064","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select * from public.transition_game_narrative_phase('TEST01', 'lobby', 'role_reveal', '70000000-0000-0000-0000-000000000063')$$, 'P0001', 'STAFF_ACCESS_DENIED', 'non-staff rejected');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000062', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000062","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select * from public.transition_game_narrative_phase('TEST01', 'lobby', 'role_reveal', '70000000-0000-0000-0000-000000000064')$$, 'P0001', 'STAFF_ACCESS_DENIED', 'inactive staff rejected');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000061', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000061","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select * from public.transition_game_narrative_phase('MISSING', 'lobby', 'role_reveal', '70000000-0000-0000-0000-000000000065')$$, 'P0001', 'GAME_NOT_FOUND', 'missing game rejected');
select throws_ok($$select * from public.transition_game_narrative_phase('TEST01', 'lobby', 'unknown', '70000000-0000-0000-0000-000000000066')$$, 'P0001', 'INVALID_PHASE', 'invalid phase rejected');
select throws_ok($$select * from public.transition_game_narrative_phase('TEST01', 'lobby', 'role_reveal', '70000000-0000-0000-0000-000000000067')$$, 'P0001', 'GAME_NOT_LIVE', 'non-live game rejected');

reset role;
update public.games set lifecycle = 'live' where code = 'TEST01';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000061', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000061","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select * from public.transition_game_narrative_phase('TEST01', 'lobby', 'briefing', '70000000-0000-0000-0000-000000000068')$$, 'P0001', 'INVALID_PHASE_TRANSITION', 'skip transition rejected');
select is((select phase from public.transition_game_narrative_phase('TEST01', 'lobby', 'role_reveal', '70000000-0000-0000-0000-000000000069')), 'role_reveal', 'lobby advances to role reveal');
select throws_ok($$select * from public.transition_game_narrative_phase('TEST01', 'role_reveal', 'lobby', '70000000-0000-0000-0000-000000000070')$$, 'P0001', 'INVALID_PHASE_TRANSITION', 'backward transition rejected');
reset role;
select is((select narrative_phase from public.games where code = 'TEST01'), 'role_reveal', 'first phase mutation is authoritative');
select is((select count(*) from public.game_narrative_phase_commands where game_id = 'a0000000-0000-0000-0000-000000000050'), 1::bigint, 'audit is written exactly once');
select is((select staff_member_id from public.game_narrative_phase_commands), '40000000-0000-0000-0000-000000000061'::uuid, 'audit identifies active Staff');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000061', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000061","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select * from public.transition_game_narrative_phase('TEST01', 'lobby', 'briefing', '70000000-0000-0000-0000-000000000071')$$, 'P0001', 'STALE_GAME_STATE', 'stale phase rejected');
reset role;
select is((select narrative_phase from public.games where code = 'TEST01'), 'role_reveal', 'stale phase does not mutate');
select is((select count(*) from public.game_narrative_phase_commands), 1::bigint, 'stale phase creates no audit');

set local role authenticated;
select is((select phase from public.transition_game_narrative_phase('TEST01', 'lobby', 'role_reveal', '70000000-0000-0000-0000-000000000069')), 'role_reveal', 'identical retry returns established phase');
select throws_ok($$select * from public.transition_game_narrative_phase('TEST01', 'lobby', 'briefing', '70000000-0000-0000-0000-000000000069')$$, 'P0001', 'CONFLICT', 'incompatible command reuse rejected');
reset role;
select is((select count(*) from public.game_narrative_phase_commands), 1::bigint, 'idempotent retry creates no duplicate audit');

set local role authenticated;
select is((select phase from public.transition_game_narrative_phase('TEST01', 'role_reveal', 'briefing', '70000000-0000-0000-0000-000000000072')), 'briefing', 'role reveal advances to briefing');
select is((select phase from public.transition_game_narrative_phase('TEST01', 'briefing', 'discovery', '70000000-0000-0000-0000-000000000073')), 'discovery', 'briefing advances to discovery');
select is((select phase from public.transition_game_narrative_phase('TEST01', 'discovery', 'comparison', '70000000-0000-0000-0000-000000000074')), 'comparison', 'discovery advances to comparison');
select is((select phase from public.transition_game_narrative_phase('TEST01', 'comparison', 'pressure', '70000000-0000-0000-0000-000000000075')), 'pressure', 'comparison advances to pressure');
select is((select phase from public.transition_game_narrative_phase('TEST01', 'pressure', 'auction', '70000000-0000-0000-0000-000000000076')), 'auction', 'pressure advances to auction');
select is((select phase from public.transition_game_narrative_phase('TEST01', 'auction', 'deliberation', '70000000-0000-0000-0000-000000000077')), 'deliberation', 'auction advances to deliberation');
select is((select phase from public.transition_game_narrative_phase('TEST01', 'deliberation', 'final_vote', '70000000-0000-0000-0000-000000000078')), 'final_vote', 'deliberation advances to final vote');
select is((select phase from public.transition_game_narrative_phase('TEST01', 'final_vote', 'reveal', '70000000-0000-0000-0000-000000000079')), 'reveal', 'final vote advances to reveal');
reset role;
select is((select count(*) from public.game_narrative_phase_commands), 9::bigint, 'all sequential transitions have one audit each');

select ok(not has_table_privilege('authenticated', 'public.games', 'UPDATE'), 'browser cannot update games directly');
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'graphql_public') and p.prosecdef), 'exposed schemas contain no definer functions');

select * from finish();
rollback;
