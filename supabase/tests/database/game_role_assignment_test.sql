begin;
select plan(20);
select has_function('public', 'assign_game_roles', array['text', 'uuid'], 'assignment RPC exists');
select has_function('public', 'get_staff_game_roles', array['text'], 'role read RPC exists');
select ok((select prosecdef from pg_proc where oid = 'private.assign_game_roles_impl(text,uuid)'::regprocedure), 'assignment implementation is definer');
select ok(not (select prosecdef from pg_proc where oid = 'public.assign_game_roles(text,uuid)'::regprocedure), 'assignment wrapper is invoker');
select ok(not has_table_privilege('authenticated', 'public.game_role_assignments', 'SELECT'), 'roles are not directly readable');
select ok(not has_table_privilege('authenticated', 'public.game_role_assignments', 'INSERT'), 'roles are not directly writable');
select ok(pg_get_function_result('public.get_staff_game_roles(text)'::regprocedure) !~* 'auth_user_id', 'role read omits auth user id');

insert into auth.users (id, aud, role, email, is_anonymous) values
 ('00000000-0000-0000-0000-000000000101','authenticated','authenticated','role-staff@example.test',false),
 ('00000000-0000-0000-0000-000000000102','authenticated','authenticated','role-other@example.test',false),
 ('00000000-0000-0000-0000-000000000103','authenticated','authenticated','role-three@example.test',false),
 ('00000000-0000-0000-0000-000000000104','authenticated','authenticated','role-four@example.test',false);
insert into public.staff_members (id, auth_user_id, display_name, active) values
 ('40000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000101','Role Staff',true);
insert into public.players (id, game_id, auth_user_id, table_id, seat_number, nickname) values
 ('20000000-0000-0000-0000-000000000101','a0000000-0000-0000-0000-000000000050','00000000-0000-0000-0000-000000000101','b0000000-0000-0000-0000-000000000051',1,'One'),
 ('20000000-0000-0000-0000-000000000102','a0000000-0000-0000-0000-000000000050','00000000-0000-0000-0000-000000000102','b0000000-0000-0000-0000-000000000051',2,'Two');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000101',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated","is_anonymous":false}',true);
select throws_ok($$select * from public.assign_game_roles('TEST01','60000000-0000-0000-0000-000000000101')$$,'P0001','GAME_NOT_LIVE','live is required');
reset role;
update public.games set lifecycle = 'live' where code = 'TEST01';
set local role authenticated;
select throws_ok($$select * from public.assign_game_roles('TEST01','60000000-0000-0000-0000-000000000101')$$,'P0001','MIN_PLAYERS_REQUIRED','minimum players enforced');
reset role;
insert into public.players (id, game_id, auth_user_id, table_id, seat_number, nickname) values
 ('20000000-0000-0000-0000-000000000103','a0000000-0000-0000-0000-000000000050','00000000-0000-0000-0000-000000000103','b0000000-0000-0000-0000-000000000051',3,'Three'),
 ('20000000-0000-0000-0000-000000000104','a0000000-0000-0000-0000-000000000050','00000000-0000-0000-0000-000000000104','b0000000-0000-0000-0000-000000000051',4,'Four');
set local role authenticated;
select is((select player_count from public.assign_game_roles('TEST01','60000000-0000-0000-0000-000000000101')),4,'assignment returns player count');
reset role;
select is((select narrative_phase from public.games where code = 'TEST01'),'lobby','assignment does not advance narrative phase');
select is((select count(*) from public.game_role_assignments),4::bigint,'every player assigned');
select is((select count(*) from public.game_role_assignments where role='liar'),1::bigint,'one liar');
select is((select count(*) from public.game_role_assignments where role='accomplice'),1::bigint,'one accomplice');
select is((select count(*) from public.game_role_assignments where role='scapegoat'),1::bigint,'one scapegoat');
select is((select count(*) from public.game_role_assignments where role='investigator'),1::bigint,'remaining investigators');
set local role authenticated;
select is((select count(*) from public.assign_game_roles('TEST01','60000000-0000-0000-0000-000000000101')),1::bigint,'same command is idempotent');
select throws_ok($$select * from public.assign_game_roles('TEST01','60000000-0000-0000-0000-000000000102')$$,'P0001','ROLES_ALREADY_ASSIGNED','different command conflicts');
select is((select count(*) from public.get_staff_game_roles('TEST01')),4::bigint,'Staff reads role roster');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000102',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000102","role":"authenticated","is_anonymous":false}',true);
select throws_ok($$select * from public.get_staff_game_roles('TEST01')$$,'P0001','STAFF_ACCESS_DENIED','non Staff denied');
reset role;
select * from finish();
rollback;
