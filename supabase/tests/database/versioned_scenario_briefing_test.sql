begin;
select plan(14);

select ok((select scenario_version_id = 'e0000000-0000-0000-0000-000000000015' from public.games where code = 'TEST01'), 'TEST01 is bound to the deterministic scenario version');
select is((select status from public.scenario_versions where id = 'e0000000-0000-0000-0000-000000000015'), 'published', 'seeded version is published');
select ok(not has_table_privilege('authenticated', 'public.scenarios', 'SELECT'), 'scenario table is not directly readable');
select ok(not has_table_privilege('authenticated', 'public.scenario_versions', 'SELECT'), 'scenario versions are not directly readable');
select throws_ok($$update public.scenario_versions set briefing_body = 'changed' where id = 'e0000000-0000-0000-0000-000000000015'$$, 'P0001', 'PUBLISHED_SCENARIO_IMMUTABLE', 'published version cannot be modified');
select throws_ok($$delete from public.scenario_versions where id = 'e0000000-0000-0000-0000-000000000015'$$, 'P0001', 'PUBLISHED_SCENARIO_IMMUTABLE', 'published version cannot be deleted');

insert into auth.users (id, aud, role, email, is_anonymous)
values ('00000000-0000-0000-0000-000000000315', 'authenticated', 'authenticated', 'briefing-player@example.test', true),
       ('00000000-0000-0000-0000-000000000316', 'authenticated', 'authenticated', 'briefing-staff@example.test', false);
insert into public.staff_members (auth_user_id, active) values ('00000000-0000-0000-0000-000000000316', true);
insert into public.events (id, name) values ('10000000-0000-0000-0000-000000000315', 'Briefing event');
insert into public.games (id, event_id, code, lifecycle, narrative_phase, scenario_version_id)
values ('a0000000-0000-0000-0000-000000000315', '10000000-0000-0000-0000-000000000315', 'BRIEF-TEST', 'live', 'role_reveal', 'e0000000-0000-0000-0000-000000000015');
insert into public.game_tables (id, game_id, table_number) values ('b0000000-0000-0000-0000-000000000315', 'a0000000-0000-0000-0000-000000000315', 1);
insert into public.players (id, game_id, auth_user_id, table_id, seat_number, nickname)
values ('20000000-0000-0000-0000-000000000315', 'a0000000-0000-0000-0000-000000000315', '00000000-0000-0000-0000-000000000315', 'b0000000-0000-0000-0000-000000000315', 1, 'Briefing Player');
insert into public.game_role_assignments (player_id, game_id, role)
values ('20000000-0000-0000-0000-000000000315', 'a0000000-0000-0000-0000-000000000315', 'investigator');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000315', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000315","role":"authenticated","is_anonymous":true}', true);
select is((select briefing_title from public.get_my_player_state('BRIEF-TEST')), null::text, 'Player does not see briefing before briefing phase');
select is((select scenario_title from public.get_my_player_state('BRIEF-TEST')), null::text, 'Player does not see scenario title before briefing phase');
reset role;
insert into public.game_role_acknowledgements (player_id, game_id)
values ('20000000-0000-0000-0000-000000000315', 'a0000000-0000-0000-0000-000000000315');
update public.games set narrative_phase = 'briefing' where id = 'a0000000-0000-0000-0000-000000000315';
set local role authenticated;
select is((select scenario_title from public.get_my_player_state('BRIEF-TEST')), 'A Cena Con Il Bugiardo', 'Player sees safe scenario title during briefing');
select is((select briefing_title from public.get_my_player_state('BRIEF-TEST')), 'Benvenuti a cena', 'Player sees selected briefing title');
select ok((select briefing_body is not null from public.get_my_player_state('BRIEF-TEST')), 'Player sees selected briefing body');
select ok(pg_get_function_result('public.get_my_player_state(text)'::regprocedure) !~* 'scenario_id|version_number|status|published_at', 'Player projection omits internal scenario fields');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000316', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000316","role":"authenticated","is_anonymous":false}', true);
select is((select scenario_title from public.get_staff_game_overview('BRIEF-TEST')), 'A Cena Con Il Bugiardo', 'Staff sees selected scenario');
select is((select scenario_version_number from public.get_staff_game_overview('BRIEF-TEST')), 1, 'Staff sees selected version');
select * from finish();
rollback;
