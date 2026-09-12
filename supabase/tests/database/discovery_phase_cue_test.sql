begin;
select plan(9);

select is((select discovery_title from public.scenario_versions where id = 'e0000000-0000-0000-0000-000000000015'), 'Guardatevi intorno', 'Discovery title belongs to the selected scenario version');
select is((select discovery_body from public.scenario_versions where id = 'e0000000-0000-0000-0000-000000000015'), 'Alzate gli occhi dal telefono e parlate con chi è al vostro tavolo.', 'Discovery body is deterministic and scenario-driven');
select ok(pg_get_function_result('public.get_my_player_state(text)'::regprocedure) !~* 'scenario_id|version_number|status|published_at|secret|clue|mission', 'Player projection omits hidden scenario fields');
select throws_ok($$update public.scenario_versions set discovery_body = 'changed' where id = 'e0000000-0000-0000-0000-000000000015'$$, 'P0001', 'PUBLISHED_SCENARIO_IMMUTABLE', 'published scenario remains immutable');

insert into auth.users (id, aud, role, email, is_anonymous)
values ('00000000-0000-0000-0000-000000000316', 'authenticated', 'authenticated', 'discovery-player@example.test', true);
insert into public.events (id, name) values ('10000000-0000-0000-0000-000000000316', 'Discovery event');
insert into public.games (id, event_id, code, lifecycle, narrative_phase, scenario_version_id)
values ('a0000000-0000-0000-0000-000000000316', '10000000-0000-0000-0000-000000000316', 'DISCOVERY-TEST', 'live', 'briefing', 'e0000000-0000-0000-0000-000000000015');
insert into public.game_tables (id, game_id, table_number)
values ('b0000000-0000-0000-0000-000000000316', 'a0000000-0000-0000-0000-000000000316', 1);
insert into public.players (id, game_id, auth_user_id, table_id, seat_number, nickname)
values ('20000000-0000-0000-0000-000000000316', 'a0000000-0000-0000-0000-000000000316', '00000000-0000-0000-0000-000000000316', 'b0000000-0000-0000-0000-000000000316', 1, 'Discovery Player');
insert into public.game_role_assignments (player_id, game_id, role)
values ('20000000-0000-0000-0000-000000000316', 'a0000000-0000-0000-0000-000000000316', 'investigator');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000316', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000316","role":"authenticated","is_anonymous":true}', true);
select is((select discovery_title from public.get_my_player_state('DISCOVERY-TEST')), null::text, 'Player cannot receive Discovery before Discovery phase');
select is((select discovery_body from public.get_my_player_state('DISCOVERY-TEST')), null::text, 'Player cannot receive Discovery body before Discovery phase');
reset role;
update public.games set narrative_phase = 'discovery' where id = 'a0000000-0000-0000-0000-000000000316';
set local role authenticated;
select is((select scenario_title from public.get_my_player_state('DISCOVERY-TEST')), 'A Cena Con Il Bugiardo', 'Player receives the public scenario title during Discovery');
select is((select discovery_title from public.get_my_player_state('DISCOVERY-TEST')), 'Guardatevi intorno', 'Player receives Discovery title during Discovery');
select is((select briefing_title from public.get_my_player_state('DISCOVERY-TEST')), null::text, 'Briefing content is not stale during Discovery');
select * from finish();
rollback;
