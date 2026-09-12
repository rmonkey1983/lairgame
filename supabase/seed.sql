-- Local development seed only. No players, auth users, staff, or gameplay data.

insert into public.events (id, name, status)
values (
  'e0000000-0000-0000-0000-000000000050',
  'Liar System Local Development',
  'scheduled'
);

insert into public.games (id, event_id, code, lifecycle, narrative_phase, scenario_version_id)
values (
  'a0000000-0000-0000-0000-000000000050',
  'e0000000-0000-0000-0000-000000000050',
  'TEST01',
  'checkin_open',
  'lobby',
  'e0000000-0000-0000-0000-000000000015'
);

insert into public.game_tables (id, game_id, table_number, label)
values
  ('b0000000-0000-0000-0000-000000000051', 'a0000000-0000-0000-0000-000000000050', 1, 'Local table 1'),
  ('b0000000-0000-0000-0000-000000000052', 'a0000000-0000-0000-0000-000000000050', 2, 'Local table 2'),
  ('b0000000-0000-0000-0000-000000000053', 'a0000000-0000-0000-0000-000000000050', 3, 'Local table 3'),
  ('b0000000-0000-0000-0000-000000000054', 'a0000000-0000-0000-0000-000000000050', 4, 'Local table 4'),
  ('b0000000-0000-0000-0000-000000000055', 'a0000000-0000-0000-0000-000000000050', 5, 'Local table 5');
