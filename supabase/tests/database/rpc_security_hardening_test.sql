begin;

select plan(25);

select ok(to_regnamespace('private') is not null, 'private schema exists');
select ok(position('private' in coalesce(current_setting('pgrst.db_schemas', true), '')) = 0,
  'private schema is not in the PostgREST exposed schema setting');

select ok(to_regprocedure('public.join_game(text,text,integer,integer)') is not null,
  'public join_game contract exists');
select ok(to_regprocedure('public.get_my_join_state(text)') is not null,
  'public get_my_join_state contract exists');
select ok(to_regprocedure('public.get_my_staff_access()') is not null,
  'public get_my_staff_access contract exists');

select ok(not p.prosecdef, 'public.join_game is SECURITY INVOKER')
from pg_proc p where p.oid = 'public.join_game(text,text,integer,integer)'::regprocedure;
select ok(not p.prosecdef, 'public.get_my_join_state is SECURITY INVOKER')
from pg_proc p where p.oid = 'public.get_my_join_state(text)'::regprocedure;
select ok(not p.prosecdef, 'public.get_my_staff_access is SECURITY INVOKER')
from pg_proc p where p.oid = 'public.get_my_staff_access()'::regprocedure;

select ok(p.prosecdef, 'private.join_game_impl is SECURITY DEFINER')
from pg_proc p where p.oid = 'private.join_game_impl(text,text,integer,integer)'::regprocedure;
select ok(p.prosecdef, 'private.get_my_join_state_impl is SECURITY DEFINER')
from pg_proc p where p.oid = 'private.get_my_join_state_impl(text)'::regprocedure;
select ok(p.prosecdef, 'private.get_my_staff_access_impl is SECURITY DEFINER')
from pg_proc p where p.oid = 'private.get_my_staff_access_impl()'::regprocedure;

select ok(p.proconfig @> array['search_path=""'], 'private.join_game_impl has empty search_path')
from pg_proc p where p.oid = 'private.join_game_impl(text,text,integer,integer)'::regprocedure;
select ok(p.proconfig @> array['search_path=""'], 'private.get_my_join_state_impl has empty search_path')
from pg_proc p where p.oid = 'private.get_my_join_state_impl(text)'::regprocedure;
select ok(p.proconfig @> array['search_path=""'], 'private.get_my_staff_access_impl has empty search_path')
from pg_proc p where p.oid = 'private.get_my_staff_access_impl()'::regprocedure;

select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'graphql_public') and p.prosecdef
), 'no SECURITY DEFINER function remains in public');
select ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'anon cannot use private schema');
select ok(has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated has only the schema usage needed by wrappers');
select ok(not has_function_privilege('anon', 'private.join_game_impl(text,text,integer,integer)', 'execute'),
  'anon cannot execute private join implementation');
select ok(not has_function_privilege('anon', 'private.get_my_join_state_impl(text)', 'execute'),
  'anon cannot execute private state implementation');
select ok(not has_function_privilege('anon', 'private.get_my_staff_access_impl()', 'execute'),
  'anon cannot execute private staff implementation');

select ok(not has_function_privilege('public', 'public.join_game(text,text,integer,integer)', 'execute'),
  'PUBLIC cannot execute join_game');
select ok(not has_function_privilege('anon', 'public.join_game(text,text,integer,integer)', 'execute'),
  'anon cannot execute join_game');
select ok(has_function_privilege('authenticated', 'public.join_game(text,text,integer,integer)', 'execute'),
  'authenticated can execute join_game wrapper');
select ok(has_function_privilege('authenticated', 'public.get_my_join_state(text)', 'execute'),
  'authenticated can execute state wrapper');
select ok(has_function_privilege('authenticated', 'public.get_my_staff_access()', 'execute'),
  'authenticated can execute staff wrapper');

select * from finish();
rollback;
