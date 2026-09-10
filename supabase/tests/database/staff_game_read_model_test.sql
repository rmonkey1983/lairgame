begin;

select plan(31);

select has_function('public', 'list_staff_games', array[]::text[], 'list staff games exists');
select has_function('public', 'get_staff_game_overview', array['text'], 'staff overview exists');
select ok(not (select prosecdef from pg_proc where oid = 'public.list_staff_games()'::regprocedure), 'list wrapper is invoker');
select ok(not (select prosecdef from pg_proc where oid = 'public.get_staff_game_overview(text)'::regprocedure), 'overview wrapper is invoker');
select ok((select prosecdef from pg_proc where oid = 'private.list_staff_games_impl()'::regprocedure), 'list implementation is definer');
select ok((select prosecdef from pg_proc where oid = 'private.get_staff_game_overview_impl(text)'::regprocedure), 'overview implementation is definer');
select ok((select 'search_path=""' = any(proconfig) from pg_proc where oid = 'private.list_staff_games_impl()'::regprocedure), 'list implementation has empty search path');
select ok((select 'search_path=""' = any(proconfig) from pg_proc where oid = 'private.get_staff_game_overview_impl(text)'::regprocedure), 'overview implementation has empty search path');
select ok(not has_function_privilege('public', 'public.list_staff_games()', 'execute'), 'PUBLIC cannot execute list');
select ok(not has_function_privilege('anon', 'public.list_staff_games()', 'execute'), 'anon cannot execute list');
select ok(has_function_privilege('authenticated', 'public.list_staff_games()', 'execute'), 'authenticated can execute list');
select ok(not has_function_privilege('public', 'public.get_staff_game_overview(text)', 'execute'), 'PUBLIC cannot execute overview');
select ok(not has_function_privilege('anon', 'public.get_staff_game_overview(text)', 'execute'), 'anon cannot execute overview');
select ok(has_function_privilege('authenticated', 'public.get_staff_game_overview(text)', 'execute'), 'authenticated can execute overview');

insert into auth.users (id, aud, role, email, is_anonymous)
values
  ('00000000-0000-0000-0000-000000000031', 'authenticated', 'authenticated', 'read-active@example.test', false),
  ('00000000-0000-0000-0000-000000000032', 'authenticated', 'authenticated', 'read-inactive@example.test', false),
  ('00000000-0000-0000-0000-000000000033', 'authenticated', 'authenticated', 'read-anon@example.test', true),
  ('00000000-0000-0000-0000-000000000034', 'authenticated', 'authenticated', 'read-none@example.test', false);
insert into public.staff_members (auth_user_id, active)
values ('00000000-0000-0000-0000-000000000031', true), ('00000000-0000-0000-0000-000000000032', false);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000033', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000033","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$select * from public.list_staff_games()$$, 'P0001', 'STAFF_AUTH_REQUIRED', 'anonymous player rejected');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000034', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000034","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select * from public.list_staff_games()$$, 'P0001', 'STAFF_ACCESS_DENIED', 'non-staff rejected');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000032', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000032","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select * from public.list_staff_games()$$, 'P0001', 'STAFF_ACCESS_DENIED', 'inactive staff rejected');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000031', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000031","role":"authenticated","is_anonymous":false}', true);
select is((select count(*) from public.list_staff_games() where game_code = 'TEST01'), 1::bigint, 'active staff sees TEST01');
select is((select lifecycle from public.list_staff_games() where game_code = 'TEST01'), 'checkin_open', 'list lifecycle is authoritative');
select is((select narrative_phase from public.list_staff_games() where game_code = 'TEST01'), 'lobby', 'list phase is authoritative');
select is((select table_count from public.list_staff_games() where game_code = 'TEST01'), 5, 'table count is calculated');
select is((select player_count from public.list_staff_games() where game_code = 'TEST01'), 0, 'player count is calculated');
select is((select code from public.get_staff_game_overview(' test01 ')), 'TEST01', 'overview normalizes code');
select is((select table_count from public.get_staff_game_overview('TEST01')), 5, 'overview table count is calculated');
select is((select player_count from public.get_staff_game_overview('TEST01')), 0, 'overview player count is calculated');
select throws_ok($$select * from public.get_staff_game_overview('MISSING')$$, 'P0001', 'GAME_NOT_FOUND', 'missing game is controlled');

reset role;
select ok(not has_table_privilege('authenticated', 'public.games', 'SELECT'), 'games direct select remains closed');
select ok(not has_table_privilege('authenticated', 'public.game_tables', 'SELECT'), 'game tables direct select remains closed');
select ok(not has_table_privilege('authenticated', 'public.players', 'SELECT'), 'players direct select remains closed');
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'graphql_public') and p.prosecdef), 'exposed schemas contain no definer functions');
select ok(coalesce(current_setting('pgrst.db_schemas', true), '') not like '%private%', 'private schema remains unexposed');

select * from finish();
rollback;
