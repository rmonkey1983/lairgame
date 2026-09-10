begin;

select plan(16);

select ok(to_regprocedure('public.get_my_staff_access()') is not null, 'staff access RPC exists');
select ok(not exists (
  select 1 from pg_proc p, aclexplode(p.proacl) a
  where p.oid = 'public.get_my_staff_access()'::regprocedure
    and a.grantee = 0 and a.privilege_type = 'EXECUTE'
), 'PUBLIC cannot execute staff access RPC');
select ok(not has_function_privilege('anon', 'public.get_my_staff_access()', 'execute'), 'anon cannot execute staff access RPC');
select ok(has_function_privilege('authenticated', 'public.get_my_staff_access()', 'execute'), 'authenticated can execute staff access RPC');

insert into auth.users (id, aud, role, email, is_anonymous)
values
  ('00000000-0000-0000-0000-000000000021', 'authenticated', 'authenticated', 'staff-active@example.test', false),
  ('00000000-0000-0000-0000-000000000022', 'authenticated', 'authenticated', 'staff-inactive@example.test', false),
  ('00000000-0000-0000-0000-000000000023', 'authenticated', 'authenticated', 'staff-anonymous@example.test', true),
  ('00000000-0000-0000-0000-000000000024', 'authenticated', 'authenticated', 'staff-none@example.test', false);
insert into public.staff_members (id, auth_user_id, display_name, active)
values
  ('40000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000021', 'Active Staff', true),
  ('40000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000022', 'Inactive Staff', false);

set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$select * from public.get_my_staff_access()$$, 'P0001', 'AUTH_REQUIRED', 'null auth uid rejected');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000023', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000023","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$select * from public.get_my_staff_access()$$, 'P0001', 'STAFF_AUTH_REQUIRED', 'anonymous authenticated user rejected');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000024', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000024","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select * from public.get_my_staff_access()$$, 'P0001', 'STAFF_ACCESS_DENIED', 'user without membership rejected');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000022', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select * from public.get_my_staff_access()$$, 'P0001', 'STAFF_ACCESS_DENIED', 'inactive staff rejected');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000021', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated","is_anonymous":false}', true);
select is((select count(*) from public.get_my_staff_access()), 1::bigint, 'active staff allowed');
select is((select display_name from public.get_my_staff_access()), 'Active Staff', 'active staff gets own safe identity');
select is((select count(*) from public.get_my_staff_access() where staff_member_id <> '40000000-0000-0000-0000-000000000021'), 0::bigint, 'staff access returns no other staff');

reset role;
select ok(not has_table_privilege('authenticated', 'public.staff_members', 'SELECT'), 'staff_members has no direct select');
select ok(not has_table_privilege('authenticated', 'public.players', 'SELECT'), 'players remains deny-by-default');
select ok(not has_table_privilege('authenticated', 'public.games', 'SELECT'), 'games remains deny-by-default');
select ok(not has_table_privilege('anon', 'public.staff_members', 'SELECT'), 'anon cannot select staff_members');
select ok(not exists (select 1 from pg_proc where proname = 'staff_signup'), 'no staff signup function');

select * from finish();
rollback;
