begin;
select plan(29);

select has_table('public', 'game_reset_commands', 'reset audit exists');
select has_function('public', 'reset_game_for_testing', array['text', 'uuid'], 'test reset RPC exists');
select ok((select prosecdef from pg_proc where oid = 'private.reset_game_for_testing_impl(text,uuid)'::regprocedure), 'reset implementation is definer');
select ok(not (select prosecdef from pg_proc where oid = 'public.reset_game_for_testing(text,uuid)'::regprocedure), 'reset wrapper is invoker');
select ok((select relrowsecurity from pg_class where oid = 'public.game_reset_commands'::regclass), 'reset audit has RLS');
select ok(not has_table_privilege('authenticated', 'public.game_reset_commands', 'INSERT'), 'browser cannot insert reset audit');
select is((select reset_enabled from public.games where code = 'TEST01'), true, 'TEST01 reset is enabled');

insert into auth.users (id, aud, role, email, is_anonymous) values
  ('00000000-0000-0000-0000-000000000901', 'authenticated', 'authenticated', 'reset-staff@example.test', false),
  ('00000000-0000-0000-0000-000000000902', 'authenticated', 'authenticated', 'reset-other@example.test', false),
  ('00000000-0000-0000-0000-000000000903', 'authenticated', 'authenticated', 'reset-player-one@example.test', true),
  ('00000000-0000-0000-0000-000000000904', 'authenticated', 'authenticated', 'reset-player-two@example.test', true),
  ('00000000-0000-0000-0000-000000000905', 'authenticated', 'authenticated', 'reset-player-three@example.test', true);
insert into public.staff_members (id, auth_user_id, display_name, active) values
  ('40000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000901', 'Reset Staff', true);
insert into public.players (id, game_id, auth_user_id, table_id, seat_number, nickname) values
  ('20000000-0000-0000-0000-000000000901', 'a0000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000903', 'b0000000-0000-0000-0000-000000000051', 1, 'Reset One'),
  ('20000000-0000-0000-0000-000000000902', 'a0000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000904', 'b0000000-0000-0000-0000-000000000052', 1, 'Reset Two'),
  ('20000000-0000-0000-0000-000000000903', 'a0000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000905', 'b0000000-0000-0000-0000-000000000053', 1, 'Reset Three');
insert into public.game_role_assignments (player_id, game_id, role) values
  ('20000000-0000-0000-0000-000000000901', 'a0000000-0000-0000-0000-000000000050', 'liar'),
  ('20000000-0000-0000-0000-000000000902', 'a0000000-0000-0000-0000-000000000050', 'accomplice'),
  ('20000000-0000-0000-0000-000000000903', 'a0000000-0000-0000-0000-000000000050', 'scapegoat');
insert into public.game_role_acknowledgements (player_id, game_id) values
  ('20000000-0000-0000-0000-000000000901', 'a0000000-0000-0000-0000-000000000050');
insert into public.game_auctions (id, game_id, scenario_auction_item_id, status) values
  ('f0000000-0000-0000-0000-000000000901', 'a0000000-0000-0000-0000-000000000050', 'f0000000-0000-0000-0000-000000000211', 'open');
insert into public.game_auction_bids (id, game_auction_id, game_table_id, amount, command_id, created_by_staff_user_id) values
  ('f0000000-0000-0000-0000-000000000902', 'f0000000-0000-0000-0000-000000000901', 'b0000000-0000-0000-0000-000000000051', 5, '90000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000901');
insert into public.game_auction_commands (game_id, command_id, command_kind, game_auction_id, status) values
  ('a0000000-0000-0000-0000-000000000050', '90000000-0000-0000-0000-000000000902', 'open', 'f0000000-0000-0000-0000-000000000901', 'open');
update public.games set lifecycle = 'live', narrative_phase = 'auction' where code = 'TEST01';
delete from realtime.messages where topic = 'game:a0000000-0000-0000-0000-000000000050' and event = 'game_state_changed';
create temporary table reset_message_baseline (id integer primary key, message_count bigint not null);
grant select on reset_message_baseline to authenticated;
insert into reset_message_baseline select 1, count(*) from realtime.messages where topic = 'game:a0000000-0000-0000-0000-000000000050' and event = 'game_state_changed';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000902', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000902","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select * from public.reset_game_for_testing('TEST01', '90000000-0000-0000-0000-000000000903')$$, 'P0001', 'STAFF_ACCESS_DENIED', 'non-Staff denied');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000901","role":"authenticated","is_anonymous":false}', true);
select is((select lifecycle from public.reset_game_for_testing('TEST01', '90000000-0000-0000-0000-000000000903')), 'checkin_open', 'reset from live succeeds');
reset role;
select is((select narrative_phase from public.games where code = 'TEST01'), 'lobby', 'reset returns lobby');
select is((select count(*) from public.game_role_assignments where game_id = 'a0000000-0000-0000-0000-000000000050'), 0::bigint, 'roles cleared');
select is((select count(*) from public.game_role_acknowledgements where game_id = 'a0000000-0000-0000-0000-000000000050'), 0::bigint, 'acknowledgements cleared');
select is((select count(*) from public.game_auctions where game_id = 'a0000000-0000-0000-0000-000000000050'), 0::bigint, 'auctions cleared');
select is((select count(*) from public.game_auction_bids), 0::bigint, 'bids cleared');
select is((select count(*) from public.players where game_id = 'a0000000-0000-0000-0000-000000000050'), 0::bigint, 'all Player memberships are removed');
select is((select count(*) from auth.users where id in ('00000000-0000-0000-0000-000000000903'::uuid, '00000000-0000-0000-0000-000000000904'::uuid, '00000000-0000-0000-0000-000000000905'::uuid)), 3::bigint, 'Player Auth users are preserved');
select is((select count(*) from public.game_tables where game_id = 'a0000000-0000-0000-0000-000000000050'), 5::bigint, 'game tables are preserved');
select is((select scenario_version_id from public.games where code = 'TEST01'), 'e0000000-0000-0000-0000-000000000015'::uuid, 'scenario binding preserved');
select is((select count(*) from realtime.messages where topic = 'game:a0000000-0000-0000-0000-000000000050' and event = 'game_state_changed'), (select message_count + 1 from reset_message_baseline where id = 1), 'first reset emits one wake-up');
select is((select count(*) from public.game_reset_commands), 1::bigint, 'one reset audit exists');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000901","role":"authenticated","is_anonymous":false}', true);
select is((select count(*) from public.reset_game_for_testing('TEST01', '90000000-0000-0000-0000-000000000903')), 1::bigint, 'reset retry is idempotent');
select is((select count(*) from realtime.messages where topic = 'game:a0000000-0000-0000-0000-000000000050' and event = 'game_state_changed'), (select message_count + 1 from reset_message_baseline where id = 1), 'reset retry emits no wake-up');

reset role;
select is((select count(*) from (select sum(delta) total from public.table_coin_ledger where game_id = 'a0000000-0000-0000-0000-000000000050' group by game_table_id) balances where total <> 20), 0::bigint, 'all balances are exactly twenty after reset');
insert into public.table_coin_ledger (game_id, game_table_id, delta, reason, correlation_id) values
  ('a0000000-0000-0000-0000-000000000050', 'b0000000-0000-0000-0000-000000000051', -7, 'Second run debit', '90000000-0000-0000-0000-000000000904');
update public.games set lifecycle = 'live', narrative_phase = 'auction' where code = 'TEST01';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000901","role":"authenticated","is_anonymous":false}', true);
select is((select status from public.open_game_auction('TEST01', '90000000-0000-0000-0000-000000000907')), 'open', 'same auction can be opened again');
reset role;
update public.games set lifecycle = 'completed', narrative_phase = 'reveal' where code = 'TEST01';
insert into reset_message_baseline select 2, count(*) from realtime.messages where topic = 'game:a0000000-0000-0000-0000-000000000050' and event = 'game_state_changed';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000901","role":"authenticated","is_anonymous":false}', true);
select is((select lifecycle from public.reset_game_for_testing('TEST01', '90000000-0000-0000-0000-000000000905')), 'checkin_open', 'reset from completed succeeds');
reset role;
select is((select sum(delta) from public.table_coin_ledger where game_id = 'a0000000-0000-0000-0000-000000000050' and game_table_id = 'b0000000-0000-0000-0000-000000000051'), 20::bigint, 'compensation restores balance to twenty');
select is((select count(*) from public.table_coin_ledger where game_id = 'a0000000-0000-0000-0000-000000000050'), 7::bigint, 'ledger remains append-only with compensation');
select is((select count(*) from realtime.messages where topic = 'game:a0000000-0000-0000-0000-000000000050' and event = 'game_state_changed'), (select message_count + 1 from reset_message_baseline where id = 2), 'second reset emits one wake-up');

insert into public.events (id, name) values ('e0000000-0000-0000-0000-000000000901', 'Reset disabled event');
insert into public.games (id, event_id, code, reset_enabled) values ('a0000000-0000-0000-0000-000000000901', 'e0000000-0000-0000-0000-000000000901', 'NO-RESET', false);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000901","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select * from public.reset_game_for_testing('NO-RESET', '90000000-0000-0000-0000-000000000906')$$, 'P0001', 'GAME_RESET_DISABLED', 'reset-disabled game denied');

reset role;
select * from finish();
rollback;
