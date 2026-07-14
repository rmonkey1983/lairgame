-- Fix per schema parziale: Droppa le tabelle con colonne mancanti/errate e ricreale
-- Da eseguire nel SQL Editor di Supabase

-- 1. Rimuovi le tabelle vecchie con cascade per eliminare i vincoli pendenti
DROP TABLE IF EXISTS session_missions CASCADE;
DROP TABLE IF EXISTS game_players CASCADE;
DROP TABLE IF EXISTS game_votes CASCADE;
DROP TABLE IF EXISTS game_logs CASCADE;
DROP TABLE IF EXISTS game_sessions CASCADE;
DROP TABLE IF EXISTS missions CASCADE;

-- 2. Ricrea tabella "missions"
CREATE TABLE missions (
    id SERIAL PRIMARY KEY,
    story_id INT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    phase INT NOT NULL DEFAULT 1,                 -- fase cena in cui appare (1-4)
    type VARCHAR(20) NOT NULL DEFAULT 'primary',  -- primary | secondary | bonus
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    target VARCHAR(50) DEFAULT 'all',             -- all | faction | liar | accomplice | innocent
    reward_coins INT DEFAULT 0,                   -- BBL Coin reward al completamento
    is_revealed BOOLEAN DEFAULT FALSE,            -- se visibile ai giocatori
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3. Ricrea tabella "game_sessions"
CREATE TABLE game_sessions (
    table_code VARCHAR(50) PRIMARY KEY REFERENCES factions(table_code) ON DELETE CASCADE,
    phase VARCHAR(50) NOT NULL DEFAULT 'waiting',  -- waiting | liar_selection | accomplice_selection | mission | vote | result
    current_liar VARCHAR(100),
    current_candidate VARCHAR(100),
    current_accomplice VARCHAR(100),
    active_story INT REFERENCES stories(id),       -- storia attiva per questa sessione
    active_story_text TEXT,                        -- testo missione custom della regia (override)
    admin_hint JSONB DEFAULT 'null'::jsonb,
    timer_duration INT DEFAULT 0,
    course_stage INT DEFAULT 1,
    auction_bid INT DEFAULT 0,
    auction_leader VARCHAR(100),
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 4. Ricrea tabella "game_players"
CREATE TABLE game_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_code VARCHAR(50) REFERENCES game_sessions(table_code) ON DELETE CASCADE,
    player_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) DEFAULT 'innocent',           -- innocent | liar | accomplice
    status VARCHAR(50) DEFAULT 'seated',           -- seated | disconnected
    ticket_code VARCHAR(100),
    bbl_coins INT DEFAULT 0,                       -- coin personali (opzionale)
    completed_missions UUID[] DEFAULT '{}',        -- missioni completate
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(table_code, player_name)
);

-- 5. Ricrea tabella "session_missions"
CREATE TABLE session_missions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_code VARCHAR(50) REFERENCES game_sessions(table_code) ON DELETE CASCADE,
    mission_id INT REFERENCES missions(id) ON DELETE CASCADE,
    is_completed BOOLEAN DEFAULT FALSE,
    completed_by VARCHAR(100),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(table_code, mission_id)
);

-- 6. Ricrea tabella "game_votes"
CREATE TABLE game_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_code VARCHAR(50) REFERENCES game_sessions(table_code) ON DELETE CASCADE,
    voter VARCHAR(100) NOT NULL,
    candidate VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(table_code, voter)
);

-- 7. Ricrea tabella "game_logs"
CREATE TABLE game_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_code VARCHAR(50) REFERENCES game_sessions(table_code) ON DELETE CASCADE,
    log_text TEXT NOT NULL,
    log_type VARCHAR(30) DEFAULT 'info',           -- info | warning | action | system
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 8. Reimposta le policy RLS per le tabelle ricreate
ALTER TABLE game_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players       ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_missions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_votes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE missions           ENABLE ROW LEVEL SECURITY;

-- Policy missions
CREATE POLICY "read_missions"     ON missions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "write_missions"    ON missions FOR ALL    TO authenticated        USING (is_admin());

-- Policy game_sessions
CREATE POLICY "read_sessions"     ON game_sessions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "update_sessions"   ON game_sessions FOR UPDATE TO anon USING (true);
CREATE POLICY "insert_sessions"   ON game_sessions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "admin_sessions"    ON game_sessions FOR ALL    TO authenticated USING (is_admin());

-- Policy game_players
CREATE POLICY "read_players"      ON game_players FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_players"    ON game_players FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "update_players"    ON game_players FOR UPDATE TO anon USING (true);
CREATE POLICY "admin_players"     ON game_players FOR ALL    TO authenticated USING (is_admin());

-- Policy session_missions
CREATE POLICY "read_smissions"    ON session_missions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "update_smissions"  ON session_missions FOR UPDATE TO anon USING (true);
CREATE POLICY "admin_smissions"   ON session_missions FOR ALL    TO authenticated USING (is_admin());

-- Policy game_votes
CREATE POLICY "read_votes"        ON game_votes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_votes"      ON game_votes FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "admin_votes"       ON game_votes FOR ALL    TO authenticated USING (is_admin());

-- Policy game_logs
CREATE POLICY "read_logs"         ON game_logs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_logs"       ON game_logs FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "admin_logs"        ON game_logs FOR ALL    TO authenticated USING (is_admin());

-- 9. Riabilita Supabase Realtime per le tabelle ricreate
ALTER PUBLICATION supabase_realtime ADD TABLE game_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE game_players;
ALTER PUBLICATION supabase_realtime ADD TABLE game_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE game_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE session_missions;
