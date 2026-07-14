-- ============================================================
-- LIAR SYSTEM — SCHEMA V2 (SUPABASE)
-- Esegui questo nel SQL Editor di Supabase
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. STATO GLOBALE
-- ============================================================

CREATE TABLE IF NOT EXISTS game_state (
    id INT PRIMARY KEY DEFAULT 1,
    current_phase INT NOT NULL DEFAULT 1,        -- 1 Antipasto, 2 Primo, 3 Secondo, 4 Dolce
    active_story_id INT,                          -- storia attiva della serata (FK a stories)
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO game_state (id, current_phase) VALUES (1, 1)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. STORIE (NARRATIVA SERATA)
-- ============================================================

CREATE TABLE IF NOT EXISTS stories (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    tagline VARCHAR(255),                         -- sottotitolo breve
    intro TEXT NOT NULL,                          -- narrativa introduttiva
    liar_briefing TEXT,                           -- briefing segreto per il bugiardo
    accomplice_briefing TEXT,                     -- briefing segreto per il complice
    difficulty VARCHAR(20) DEFAULT 'medium',      -- easy | medium | hard
    min_players INT DEFAULT 3,
    cover_emoji VARCHAR(10) DEFAULT '🎭',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================
-- 3. MISSIONI (COLLEGATE ALLE STORIE)
-- ============================================================

CREATE TABLE IF NOT EXISTS missions (
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

-- ============================================================
-- 4. FAZIONI / TAVOLI
-- ============================================================

CREATE TABLE IF NOT EXISTS factions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    bbl_coins INT NOT NULL DEFAULT 100,
    group_secret TEXT,
    table_code VARCHAR(50) NOT NULL UNIQUE,
    story_id INT REFERENCES stories(id),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================
-- 5. TICKET & PRENOTAZIONI
-- ============================================================

CREATE TABLE IF NOT EXISTS tickets (
    ticket_code VARCHAR(100) PRIMARY KEY,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
    ticket_code VARCHAR(100) PRIMARY KEY REFERENCES tickets(ticket_code) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    paid BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================
-- 6. PARTECIPANTI
-- ============================================================

CREATE TABLE IF NOT EXISTS participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_code VARCHAR(100) REFERENCES tickets(ticket_code) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    table_code VARCHAR(50) REFERENCES factions(table_code) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending | validated | seated
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================
-- 7. SESSIONI DI GIOCO (PER TAVOLO)
-- ============================================================

CREATE TABLE IF NOT EXISTS game_sessions (
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

-- ============================================================
-- 8. GIOCATORI AL TAVOLO
-- ============================================================

CREATE TABLE IF NOT EXISTS game_players (
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

-- ============================================================
-- 9. MISSIONI ATTIVE (ASSEGNATE DALLA REGIA PER SESSIONE)
-- ============================================================

CREATE TABLE IF NOT EXISTS session_missions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_code VARCHAR(50) REFERENCES game_sessions(table_code) ON DELETE CASCADE,
    mission_id INT REFERENCES missions(id) ON DELETE CASCADE,
    is_completed BOOLEAN DEFAULT FALSE,
    completed_by VARCHAR(100),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(table_code, mission_id)
);

-- ============================================================
-- 10. TRANSAZIONI BBL COIN
-- ============================================================

CREATE TABLE IF NOT EXISTS coin_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_faction_id INT REFERENCES factions(id),
    to_faction_id INT REFERENCES factions(id),
    amount INT NOT NULL,
    reason VARCHAR(255),                           -- 'transfer' | 'mission_reward' | 'auction' | 'penalty' | 'admin_grant'
    table_code VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================
-- 11. VOTI & LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS game_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_code VARCHAR(50) REFERENCES game_sessions(table_code) ON DELETE CASCADE,
    voter VARCHAR(100) NOT NULL,
    candidate VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(table_code, voter)
);

CREATE TABLE IF NOT EXISTS game_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_code VARCHAR(50) REFERENCES game_sessions(table_code) ON DELETE CASCADE,
    log_text TEXT NOT NULL,
    log_type VARCHAR(30) DEFAULT 'info',           -- info | warning | action | system
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================================
-- 12. STORED PROCEDURES
-- ============================================================

-- Trasferimento BBL Coin tra fazioni (con log transazione)
CREATE OR REPLACE FUNCTION transfer_tokens(
    from_faction_id INT,
    to_faction_id INT,
    amount INT,
    p_reason VARCHAR DEFAULT 'transfer',
    p_table_code VARCHAR DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_balance INT;
BEGIN
    IF amount <= 0 THEN
        RAISE EXCEPTION 'Importo non valido';
    END IF;

    SELECT bbl_coins INTO current_balance FROM factions WHERE id = from_faction_id;
    IF current_balance IS NULL THEN RAISE EXCEPTION 'Fazione mittente non trovata'; END IF;
    IF current_balance < amount THEN RAISE EXCEPTION 'Saldo BBL insufficiente'; END IF;

    UPDATE factions SET bbl_coins = bbl_coins - amount WHERE id = from_faction_id;
    UPDATE factions SET bbl_coins = bbl_coins + amount WHERE id = to_faction_id;

    INSERT INTO coin_transactions(from_faction_id, to_faction_id, amount, reason, table_code)
    VALUES (from_faction_id, to_faction_id, amount, p_reason, p_table_code);

    RETURN TRUE;
END;
$$;

-- Accredito diretto BBL Coin (admin/reward)
CREATE OR REPLACE FUNCTION grant_coins(
    p_faction_id INT,
    p_amount INT,
    p_reason VARCHAR DEFAULT 'admin_grant',
    p_table_code VARCHAR DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_amount = 0 THEN RAISE EXCEPTION 'Importo non valido'; END IF;

    UPDATE factions SET bbl_coins = GREATEST(0, bbl_coins + p_amount) WHERE id = p_faction_id;

    INSERT INTO coin_transactions(to_faction_id, amount, reason, table_code)
    VALUES (p_faction_id, p_amount, p_reason, p_table_code);

    RETURN TRUE;
END;
$$;

-- Completa una missione e accredita il reward
CREATE OR REPLACE FUNCTION complete_mission(
    p_table_code VARCHAR,
    p_mission_id INT,
    p_player_name VARCHAR
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_reward INT;
    v_faction_id INT;
BEGIN
    SELECT reward_coins INTO v_reward FROM missions WHERE id = p_mission_id;
    SELECT id INTO v_faction_id FROM factions WHERE table_code = p_table_code;

    UPDATE session_missions
    SET is_completed = TRUE, completed_by = p_player_name, completed_at = now()
    WHERE table_code = p_table_code AND mission_id = p_mission_id;

    IF v_reward > 0 AND v_faction_id IS NOT NULL THEN
        PERFORM grant_coins(v_faction_id, v_reward, 'mission_reward', p_table_code);
    END IF;

    RETURN TRUE;
END;
$$;

-- ============================================================
-- 13. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE game_state         ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories            ENABLE ROW LEVEL SECURITY;
ALTER TABLE missions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE factions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players       ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_missions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE coin_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_votes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_logs          ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        auth.role() = 'authenticated' AND
        coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- game_state
CREATE POLICY "read_game_state"   ON game_state FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "write_game_state"  ON game_state FOR ALL    TO authenticated        USING (is_admin());
CREATE POLICY "anon_write_gs"     ON game_state FOR UPDATE TO anon                 USING (true);

-- stories
CREATE POLICY "read_stories"      ON stories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "write_stories"     ON stories FOR ALL    TO authenticated        USING (is_admin());

-- missions
CREATE POLICY "read_missions"     ON missions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "write_missions"    ON missions FOR ALL    TO authenticated        USING (is_admin());

-- factions
CREATE POLICY "read_factions"     ON factions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "write_factions"    ON factions FOR ALL    TO authenticated        USING (is_admin());
CREATE POLICY "update_coins"      ON factions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- tickets & bookings
CREATE POLICY "admin_tickets"     ON tickets  FOR ALL TO authenticated USING (is_admin());
CREATE POLICY "read_tickets"      ON tickets  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_tickets"    ON tickets  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admin_bookings"    ON bookings FOR ALL TO authenticated USING (is_admin());

-- participants
CREATE POLICY "read_participants" ON participants FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_part"       ON participants FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "update_part"       ON participants FOR UPDATE TO anon USING (true);
CREATE POLICY "admin_part"        ON participants FOR ALL TO authenticated USING (is_admin());

-- game_sessions
CREATE POLICY "read_sessions"     ON game_sessions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "update_sessions"   ON game_sessions FOR UPDATE TO anon USING (true);
CREATE POLICY "insert_sessions"   ON game_sessions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "admin_sessions"    ON game_sessions FOR ALL    TO authenticated USING (is_admin());

-- game_players
CREATE POLICY "read_players"      ON game_players FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_players"    ON game_players FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "update_players"    ON game_players FOR UPDATE TO anon USING (true);
CREATE POLICY "admin_players"     ON game_players FOR ALL    TO authenticated USING (is_admin());

-- session_missions
CREATE POLICY "read_smissions"    ON session_missions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "update_smissions"  ON session_missions FOR UPDATE TO anon USING (true);
CREATE POLICY "admin_smissions"   ON session_missions FOR ALL    TO authenticated USING (is_admin());

-- coin_transactions
CREATE POLICY "read_ctxs"         ON coin_transactions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin_ctxs"        ON coin_transactions FOR ALL    TO authenticated USING (is_admin());

-- game_votes
CREATE POLICY "read_votes"        ON game_votes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_votes"      ON game_votes FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "admin_votes"       ON game_votes FOR ALL    TO authenticated USING (is_admin());

-- game_logs
CREATE POLICY "read_logs"         ON game_logs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_logs"       ON game_logs FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "admin_logs"        ON game_logs FOR ALL    TO authenticated USING (is_admin());

-- ============================================================
-- 14. REALTIME (abilita le tabelle chiave)
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE game_state;
ALTER PUBLICATION supabase_realtime ADD TABLE game_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE game_players;
ALTER PUBLICATION supabase_realtime ADD TABLE game_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE game_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE factions;
ALTER PUBLICATION supabase_realtime ADD TABLE session_missions;
ALTER PUBLICATION supabase_realtime ADD TABLE coin_transactions;
