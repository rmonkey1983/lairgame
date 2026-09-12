begin;
select plan(14);

select is((select count(*) from public.scenario_table_comparisons where scenario_version_id = 'e0000000-0000-0000-0000-000000000015'), 5::bigint, 'published scenario has one route per source table');
select is((select count(*) from public.scenario_table_comparisons where scenario_version_id = 'e0000000-0000-0000-0000-000000000015' and source_table_number = target_table_number), 0::bigint, 'routes never target their source table');
select is((select string_agg(source_table_number || '>' || target_table_number, ',' order by source_table_number) from public.scenario_table_comparisons where scenario_version_id = 'e0000000-0000-0000-0000-000000000015'), '1>2,2>3,3>4,4>5,5>1', 'TEST01 uses the directed ring');
select ok(not has_table_privilege('authenticated', 'public.scenario_table_comparisons', 'SELECT'), 'comparison routes are not directly readable');
select throws_ok($$update public.scenario_table_comparisons set instruction = 'changed' where id = 'f0000000-0000-0000-0000-000000000181'$$, 'P0001', 'PUBLISHED_SCENARIO_IMMUTABLE', 'published route cannot be modified');
select throws_ok($$delete from public.scenario_table_comparisons where id = 'f0000000-0000-0000-0000-000000000181'$$, 'P0001', 'PUBLISHED_SCENARIO_IMMUTABLE', 'published route cannot be deleted');
select ok(pg_get_function_result('public.get_my_player_state(text)'::regprocedure) !~* 'scenario_id|version_number|status|published_at|secret|mission|scapegoat', 'Player projection omits hidden fields');

insert into auth.users (id, aud, role, email, is_anonymous)
values
  ('00000000-0000-0000-0000-000000000418', 'authenticated', 'authenticated', 'comparison-player@example.test', true),
  ('00000000-0000-0000-0000-000000000419', 'authenticated', 'authenticated', 'comparison-staff@example.test', false),
  ('00000000-0000-0000-0000-000000000420', 'authenticated', 'authenticated', 'comparison-outsider@example.test', true);
insert into public.staff_members (id, auth_user_id, display_name, active)
values ('40000000-0000-0000-0000-000000000418', '00000000-0000-0000-0000-000000000419', 'Comparison Staff', true);
insert into public.events (id, name) values ('10000000-0000-0000-0000-000000000418', 'Comparison event');
insert into public.games (id, event_id, code, lifecycle, narrative_phase, scenario_version_id)
values ('a0000000-0000-0000-0000-000000000418', '10000000-0000-0000-0000-000000000418', 'COMPARE-TEST', 'live', 'comparison', 'e0000000-0000-0000-0000-000000000015');
insert into public.game_tables (id, game_id, table_number)
values ('b0000000-0000-0000-0000-000000000418', 'a0000000-0000-0000-0000-000000000418', 3);
insert into public.players (id, game_id, auth_user_id, table_id, seat_number, nickname)
values ('20000000-0000-0000-0000-000000000418', 'a0000000-0000-0000-0000-000000000418', '00000000-0000-0000-0000-000000000418', 'b0000000-0000-0000-0000-000000000418', 1, 'Comparison Player');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000418', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000418","role":"authenticated","is_anonymous":true}', true);
select is((select comparison_title from public.get_my_player_state('COMPARE-TEST')), 'Confrontate i frammenti', 'Player receives comparison cue');
select is((select comparison_target_table_number from public.get_my_player_state('COMPARE-TEST')), 4, 'Player receives own target table');
select is((select clue_title from public.get_my_player_state('COMPARE-TEST')), 'Il biglietto', 'Player receives own starting clue');
select is((select comparison_instruction from public.get_my_player_state('COMPARE-TEST')), 'Confrontate a voce il vostro frammento con il Tavolo 4. Non mostrate il telefono.', 'Player receives own instruction');
select is((select count(*) from public.get_my_player_state('COMPARE-TEST')), 1::bigint, 'Player cannot obtain another route or clue');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000419', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000419","role":"authenticated","is_anonymous":false}', true);
select is((select count(*) from public.get_staff_game_comparisons('COMPARE-TEST')), 5::bigint, 'Staff reads all routes');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000420', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000420","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$select * from public.get_staff_game_comparisons('COMPARE-TEST')$$, 'P0001', 'STAFF_AUTH_REQUIRED', 'Player cannot read Staff routes');

reset role;
select * from finish();
rollback;
