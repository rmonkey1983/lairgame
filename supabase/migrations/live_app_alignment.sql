-- ============================================================
-- LIVE APP ALIGNMENT HOTFIX
-- Allinea il DB remoto alle schermate attive:
-- src/pages/AdminDashboard.tsx + src/pages/PlayerTerminal.tsx
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT NOT NULL DEFAULT 'waiting',
    started_at TIMESTAMPTZ,
    join_code TEXT NOT NULL UNIQUE,
    scenario_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE games
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'waiting',
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS join_code TEXT,
    ADD COLUMN IF NOT EXISTS scenario_id UUID,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE games DROP CONSTRAINT IF EXISTS check_status;
ALTER TABLE games ADD CONSTRAINT check_status CHECK (status IN ('waiting', 'started', 'running', 'finished'));

UPDATE games SET scenario_id = gen_random_uuid() WHERE scenario_id IS NULL;
ALTER TABLE games ALTER COLUMN scenario_id SET DEFAULT gen_random_uuid();
ALTER TABLE games ALTER COLUMN scenario_id SET NOT NULL;

CREATE TABLE IF NOT EXISTS players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    nickname TEXT NOT NULL,
    posto_tavola INTEGER NOT NULL,
    is_target BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE players
    ADD COLUMN IF NOT EXISTS game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS nickname TEXT,
    ADD COLUMN IF NOT EXISTS posto_tavola INTEGER,
    ADD COLUMN IF NOT EXISTS is_target BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'name'
    ) THEN
        EXECUTE 'UPDATE players SET nickname = name WHERE nickname IS NULL';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'seat_number'
    ) THEN
        EXECUTE 'UPDATE players SET posto_tavola = seat_number WHERE posto_tavola IS NULL';
    END IF;
END $$;

ALTER TABLE players ALTER COLUMN nickname SET NOT NULL;
ALTER TABLE players ALTER COLUMN posto_tavola SET NOT NULL;

ALTER TABLE players DROP CONSTRAINT IF EXISTS unique_game_seat;
ALTER TABLE players DROP CONSTRAINT IF EXISTS unique_game_player_name;
ALTER TABLE players ADD CONSTRAINT unique_game_seat UNIQUE (game_id, posto_tavola);
ALTER TABLE players ADD CONSTRAINT unique_game_player_name UNIQUE (game_id, nickname);

CREATE TABLE IF NOT EXISTS votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id) ON DELETE SET NULL,
    motivazione TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS timeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    minute_trigger INTEGER NOT NULL CHECK (minute_trigger >= 0),
    target_logic TEXT NOT NULL DEFAULT 'all',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_game_minute UNIQUE (game_id, minute_trigger)
);

CREATE TABLE IF NOT EXISTS events_engine (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_id UUID NOT NULL,
    trigger_logic JSONB NOT NULL DEFAULT '{}'::jsonb,
    action_logic JSONB NOT NULL DEFAULT '{}'::jsonb,
    target_logic JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL,
    action_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_games_join_code ON games(join_code);
CREATE INDEX IF NOT EXISTS idx_games_scenario_id ON games(scenario_id);
CREATE INDEX IF NOT EXISTS idx_players_game_id ON players(game_id);
CREATE INDEX IF NOT EXISTS idx_votes_game_id ON votes(game_id);
CREATE INDEX IF NOT EXISTS idx_votes_player_id ON votes(player_id);
CREATE INDEX IF NOT EXISTS idx_events_engine_scenario_id ON events_engine(scenario_id);
CREATE INDEX IF NOT EXISTS idx_game_logs_game_id ON game_logs(game_id);
CREATE INDEX IF NOT EXISTS idx_game_logs_player_id ON game_logs(player_id);
CREATE INDEX IF NOT EXISTS idx_timeline_events_game_id ON timeline_events(game_id);
CREATE INDEX IF NOT EXISTS idx_timeline_events_minute_trigger ON timeline_events(minute_trigger);

ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE events_engine ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access on games" ON games;
DROP POLICY IF EXISTS "Anon select game by join_code" ON games;
DROP POLICY IF EXISTS "Anon app access on games" ON games;
CREATE POLICY "Anon app access on games" ON games FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admin full access on players" ON players;
DROP POLICY IF EXISTS "Anon read/insert players of own game" ON players;
DROP POLICY IF EXISTS "Anon app access on players" ON players;
CREATE POLICY "Anon app access on players" ON players
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM games
            WHERE games.id = players.game_id
              AND games.status IN ('waiting', 'started', 'running')
        )
    );

DROP POLICY IF EXISTS "Anon app access on votes" ON votes;
CREATE POLICY "Anon app access on votes" ON votes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admin full access on timeline_events" ON timeline_events;
DROP POLICY IF EXISTS "Anon read timeline_events" ON timeline_events;
DROP POLICY IF EXISTS "Anon app access on timeline_events" ON timeline_events;
CREATE POLICY "Anon app access on timeline_events" ON timeline_events FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon app access on events_engine" ON events_engine;
CREATE POLICY "Anon app access on events_engine" ON events_engine FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admin full access on game_logs" ON game_logs;
DROP POLICY IF EXISTS "Anon insert game_logs" ON game_logs;
DROP POLICY IF EXISTS "Anon app access on game_logs" ON game_logs;
CREATE POLICY "Anon app access on game_logs" ON game_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['games', 'players', 'votes', 'timeline_events', 'events_engine', 'game_logs']
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = table_name
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
        END IF;
    END LOOP;
END $$;
