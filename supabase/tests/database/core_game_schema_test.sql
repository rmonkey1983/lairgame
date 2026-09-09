begin;

select plan(25);

select has_table('public', 'events', 'events exists');
select has_table('public', 'games', 'games exists');
select has_table('public', 'game_tables', 'game_tables exists');
select has_table('public', 'players', 'players exists');
select has_table('public', 'staff_members', 'staff_members exists');

select has_pk('public', 'events', 'events has primary key');
select has_pk('public', 'games', 'games has primary key');
select has_pk('public', 'game_tables', 'game_tables has primary key');
select has_pk('public', 'players', 'players has primary key');
select has_pk('public', 'staff_members', 'staff_members has primary key');

select ok((select relrowsecurity from pg_class where oid = 'public.events'::regclass), 'events RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.games'::regclass), 'games RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.game_tables'::regclass), 'game_tables RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.players'::regclass), 'players RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.staff_members'::regclass), 'staff_members RLS enabled');

select ok(not exists (
  select 1 from unnest(array['events', 'games', 'game_tables', 'players', 'staff_members']) as table_name
  where has_table_privilege('anon', 'public.' || table_name, 'SELECT')
), 'anon cannot select core tables');
select ok(not exists (
  select 1 from unnest(array['events', 'games', 'game_tables', 'players', 'staff_members']) as table_name
  where has_table_privilege('authenticated', 'public.' || table_name, 'SELECT')
), 'authenticated cannot select core tables');

insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'one@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'two@example.test');
insert into public.events (id, name) values ('10000000-0000-0000-0000-000000000001', 'Test event');
insert into public.games (id, event_id, code) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'GAME-ONE'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'GAME-TWO');
insert into public.game_tables (id, game_id, table_number) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 1);

select throws_ok(
  $$insert into public.games (event_id, code) values ('10000000-0000-0000-0000-000000000001', 'GAME-ONE')$$,
  '23505', null, 'duplicate game code rejected'
);
select throws_ok(
  $$insert into public.game_tables (game_id, table_number) values ('20000000-0000-0000-0000-000000000001', 1)$$,
  '23505', null, 'duplicate game table number rejected'
);
insert into public.players (game_id, auth_user_id, table_id, seat_number, nickname)
values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1, 'First');
select throws_ok(
  $$insert into public.players (game_id, auth_user_id, nickname) values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'First')$$,
  '23505', null, 'duplicate player auth in game rejected'
);

select throws_ok(
  $$insert into public.players (game_id, auth_user_id, table_id, seat_number, nickname) values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 1, 'Second')$$,
  '23505', null, 'duplicate seat rejected'
);
select throws_ok(
  $$insert into public.players (game_id, auth_user_id, seat_number, nickname) values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 0, 'Invalid seat')$$,
  '23514', null, 'invalid seat rejected'
);
select throws_ok(
  $$insert into public.players (game_id, auth_user_id, table_id, nickname) values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'Cross game')$$,
  '23503', null, 'cross-game table assignment rejected'
);
select throws_ok(
  $$insert into public.games (event_id, code, lifecycle) values ('10000000-0000-0000-0000-000000000001', 'BAD-LIFE', 'unknown')$$,
  '23514', null, 'invalid lifecycle rejected'
);
select throws_ok(
  $$insert into public.games (event_id, code, narrative_phase) values ('10000000-0000-0000-0000-000000000001', 'BAD-PHASE', 'unknown')$$,
  '23514', null, 'invalid narrative phase rejected'
);

select * from finish();
rollback;
