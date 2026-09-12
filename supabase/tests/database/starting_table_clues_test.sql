begin;
select plan(13);

select is((select count(*) from public.scenario_table_clues where scenario_version_id = 'e0000000-0000-0000-0000-000000000015'), 5::bigint, 'published scenario has one starting clue per table');
select is((select count(distinct table_number) from public.scenario_table_clues where scenario_version_id = 'e0000000-0000-0000-0000-000000000015'), 5::bigint, 'clue table number is unique per scenario version');
select ok(not has_table_privilege('authenticated', 'public.scenario_table_clues', 'SELECT'), 'clues are not directly readable');
select ok(pg_get_function_result('public.get_my_player_state(text)'::regprocedure) !~* 'scenario_id|version_number|status|published_at|secret|mission|scapegoat', 'Player projection omits internal scenario fields');
select throws_ok($$update public.scenario_table_clues set body = 'changed' where id = 'f0000000-0000-0000-0000-000000000171'$$, 'P0001', 'PUBLISHED_SCENARIO_IMMUTABLE', 'published clue cannot be modified');
select throws_ok($$delete from public.scenario_table_clues where id = 'f0000000-0000-0000-0000-000000000171'$$, 'P0001', 'PUBLISHED_SCENARIO_IMMUTABLE', 'published clue cannot be deleted');

insert into auth.users (id, aud, role, email, is_anonymous)
values
  ('00000000-0000-0000-0000-000000000317', 'authenticated', 'authenticated', 'clue-player@example.test', true),
  ('00000000-0000-0000-0000-000000000318', 'authenticated', 'authenticated', 'clue-staff@example.test', false),
  ('00000000-0000-0000-0000-000000000319', 'authenticated', 'authenticated', 'clue-outsider@example.test', true);
insert into public.staff_members (id, auth_user_id, display_name, active)
values ('40000000-0000-0000-0000-000000000317', '00000000-0000-0000-0000-000000000318', 'Clue Staff', true);
insert into public.events (id, name) values ('10000000-0000-0000-0000-000000000317', 'Clue event');
insert into public.games (id, event_id, code, lifecycle, narrative_phase, scenario_version_id)
values ('a0000000-0000-0000-0000-000000000317', '10000000-0000-0000-0000-000000000317', 'CLUE-TEST', 'live', 'briefing', 'e0000000-0000-0000-0000-000000000015');
insert into public.game_tables (id, game_id, table_number)
values
  ('b0000000-0000-0000-0000-000000000317', 'a0000000-0000-0000-0000-000000000317', 1),
  ('b0000000-0000-0000-0000-000000000318', 'a0000000-0000-0000-0000-000000000317', 2);
insert into public.players (id, game_id, auth_user_id, table_id, seat_number, nickname)
values ('20000000-0000-0000-0000-000000000317', 'a0000000-0000-0000-0000-000000000317', '00000000-0000-0000-0000-000000000317', 'b0000000-0000-0000-0000-000000000317', 1, 'Clue Player');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000317', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000317","role":"authenticated","is_anonymous":true}', true);
select is((select clue_title from public.get_my_player_state('CLUE-TEST')), null::text, 'Player cannot receive clues before Discovery');
reset role;
update public.games set narrative_phase = 'discovery' where id = 'a0000000-0000-0000-0000-000000000317';
set local role authenticated;
select is((select count(*) from public.get_my_player_state('CLUE-TEST')), 1::bigint, 'Player receives one state row');
select is((select clue_title from public.get_my_player_state('CLUE-TEST')), 'Il bicchiere', 'Player receives own table clue');
select is((select clue_body from public.get_my_player_state('CLUE-TEST')), 'Un bicchiere è stato spostato prima dell’inizio della cena.', 'Player receives own clue body only');
select throws_ok($$select * from public.get_staff_game_clues('CLUE-TEST')$$, 'P0001', 'STAFF_AUTH_REQUIRED', 'Player cannot read Staff clues');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000318', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000318","role":"authenticated","is_anonymous":false}', true);
select is((select string_agg(table_number || ':' || title, ',' order by table_number) from public.get_staff_game_clues('CLUE-TEST')), '1:Il bicchiere,2:La sedia vuota,3:Il biglietto,4:La luce,5:Il rumore', 'Staff reads all scenario table clues');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000319', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000319","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$select * from public.get_staff_game_clues('CLUE-TEST')$$, 'P0001', 'STAFF_AUTH_REQUIRED', 'non-Staff cannot read all clues');

reset role;
select * from finish();
rollback;
