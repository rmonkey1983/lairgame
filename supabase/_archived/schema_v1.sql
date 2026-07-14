-- SCHEMA SQL PER LIAR SYSTEM (SUPABASE)

-- Abilita estensioni necessarie
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================================================================
-- 1. MODELLO EVENTO / FAZIONI (STATO GLOBALE)
-- =========================================================================

-- Stato globale dell'evento
CREATE TABLE IF NOT EXISTS game_state (
    id INT PRIMARY KEY DEFAULT 1,
    current_phase INT NOT NULL DEFAULT 1, -- 1: Antipasto, 2: Primo, 3: Secondo, 4: Dolce & Fine
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT single_row CHECK (id = 1)
);

-- Storie e narrativa della serata
CREATE TABLE IF NOT EXISTS stories (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    intro TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tavoli / Fazioni
CREATE TABLE IF NOT EXISTS factions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    bbl_coins INT NOT NULL DEFAULT 100,
    group_secret TEXT,
    table_code VARCHAR(50) NOT NULL UNIQUE,
    story_id INT REFERENCES stories(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ticket emessi
CREATE TABLE IF NOT EXISTS tickets (
    ticket_code VARCHAR(100) PRIMARY KEY,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Prenotazioni (bookings)
CREATE TABLE IF NOT EXISTS bookings (
    ticket_code VARCHAR(100) PRIMARY KEY REFERENCES tickets(ticket_code) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    paid BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Partecipanti registrati alla serata
CREATE TABLE IF NOT EXISTS participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_code VARCHAR(100) REFERENCES tickets(ticket_code) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    table_code VARCHAR(50) REFERENCES factions(table_code) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, validated, seated
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =========================================================================
-- 2. MODELLO TAVOLO / BUGIARDO (SESSIONE GIOCO)
-- =========================================================================

-- Sessione di gioco legata a un tavolo
CREATE TABLE IF NOT EXISTS game_sessions (
    table_code VARCHAR(50) PRIMARY KEY REFERENCES factions(table_code) ON DELETE CASCADE,
    phase VARCHAR(50) NOT NULL DEFAULT 'waiting', -- waiting, liar_selection, accomplice_selection, mission, vote, result
    current_liar VARCHAR(100),
    current_candidate VARCHAR(100),
    current_accomplice VARCHAR(100),
    active_story TEXT,
    admin_hint JSONB DEFAULT 'null'::jsonb, -- JSON: {targetType, targetId, text}
    timer_duration INT DEFAULT 0,
    course_stage INT DEFAULT 1, -- 1: Antipasto, 2: Primo, 3: Secondo
    auction_bid INT DEFAULT 0,
    auction_leader VARCHAR(100),
    -- Fallbacks non normalizzati (usati se VITE_USE_NORMALIZED_SCHEMA=false)
    players JSONB DEFAULT '[]'::jsonb,
    votes JSONB DEFAULT '{}'::jsonb,
    logs JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Giocatori al tavolo (normalizzato)
CREATE TABLE IF NOT EXISTS game_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_code VARCHAR(50) REFERENCES game_sessions(table_code) ON DELETE CASCADE,
    player_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) DEFAULT 'innocent', -- innocent, liar, accomplice, candidate
    status VARCHAR(50) DEFAULT 'seated', -- seated, disconnected
    ticket_code VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(table_code, player_name)
);

-- Voti espressi durante la fase di voto (normalizzato)
CREATE TABLE IF NOT EXISTS game_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_code VARCHAR(50) REFERENCES game_sessions(table_code) ON DELETE CASCADE,
    voter VARCHAR(100) NOT NULL,
    candidate VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(table_code, voter)
);

-- Log della sessione di gioco (normalizzato)
CREATE TABLE IF NOT EXISTS game_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_code VARCHAR(50) REFERENCES game_sessions(table_code) ON DELETE CASCADE,
    log_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =========================================================================
-- 3. STORED PROCEDURES (RPC)
-- =========================================================================

-- RPC per trasferire gettoni BBL tra fazioni
CREATE OR REPLACE FUNCTION transfer_tokens(
    from_faction_id INT,
    to_faction_id INT,
    amount INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_balance INT;
BEGIN
    -- Validità importo
    IF amount <= 0 THEN
        RAISE EXCEPTION 'Importo del trasferimento non valido';
    END IF;

    -- Controllo saldo mittente
    SELECT bbl_coins INTO current_balance
    FROM factions
    WHERE id = from_faction_id;

    IF current_balance IS NULL THEN
        RAISE EXCEPTION 'Fazione mittente non trovata';
    END IF;

    IF current_balance < amount THEN
        RAISE EXCEPTION 'Saldo BBL insufficiente';
    END IF;

    -- Sottrazione saldo mittente
    UPDATE factions
    SET bbl_coins = bbl_coins - amount
    WHERE id = from_faction_id;

    -- Aggiunta saldo destinatario
    UPDATE factions
    SET bbl_coins = bbl_coins + amount
    WHERE id = to_faction_id;

    RETURN TRUE;
END;
$$;

-- =========================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================

-- Abilita RLS su tutte le tabelle
ALTER TABLE game_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE factions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_logs ENABLE ROW LEVEL SECURITY;

-- Helper function per verificare se l'utente loggato è un Admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        auth.role() = 'authenticated' AND 
        coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policy per game_state
CREATE POLICY "Lettura pubblica game_state" ON game_state FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Scrittura riservata admin game_state" ON game_state FOR ALL TO authenticated USING (is_admin());

-- Policy per stories
CREATE POLICY "Lettura pubblica stories" ON stories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Scrittura riservata admin stories" ON stories FOR ALL TO authenticated USING (is_admin());

-- Policy per factions
CREATE POLICY "Lettura pubblica factions" ON factions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Modifica riservata admin factions" ON factions FOR ALL TO authenticated USING (is_admin());
-- Permettiamo aggiornamento token anonimo se avviene tramite RPC (SECURITY DEFINER bypassa RLS per quella query se necessario, ma diamo anche il permesso all'utente anonimo di ricevere token se serve)
CREATE POLICY "Aggiornamento gettoni fazioni" ON factions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Policy per tickets
CREATE POLICY "Lettura e scrittura riservata admin tickets" ON tickets FOR ALL TO authenticated USING (is_admin());
CREATE POLICY "Lettura pubblica tickets" ON tickets FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Inserimento pubblico tickets" ON tickets FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Policy per bookings
CREATE POLICY "Lettura e scrittura riservata admin bookings" ON bookings FOR ALL TO authenticated USING (is_admin());

-- Policy per participants
CREATE POLICY "Lettura pubblica participants" ON participants FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Giocatori inseriscono partecipante" ON participants FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Giocatori aggiornano proprio partecipante" ON participants FOR UPDATE TO anon USING (true);
CREATE POLICY "Scrittura totale admin participants" ON participants FOR ALL TO authenticated USING (is_admin());

-- Policy per game_sessions
CREATE POLICY "Lettura pubblica game_sessions" ON game_sessions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Aggiornamento sessione da giocatori" ON game_sessions FOR UPDATE TO anon USING (true);
CREATE POLICY "Controllo totale admin game_sessions" ON game_sessions FOR ALL TO authenticated USING (is_admin());

-- Policy per game_players
CREATE POLICY "Lettura pubblica game_players" ON game_players FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Registrazione giocatori" ON game_players FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Aggiornamento giocatori" ON game_players FOR UPDATE TO anon USING (true);
CREATE POLICY "Controllo totale admin game_players" ON game_players FOR ALL TO authenticated USING (is_admin());

-- Policy per game_votes
CREATE POLICY "Lettura pubblica game_votes" ON game_votes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Invio voti" ON game_votes FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Controllo totale admin game_votes" ON game_votes FOR ALL TO authenticated USING (is_admin());

-- Policy per game_logs
CREATE POLICY "Lettura pubblica game_logs" ON game_logs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Scrittura log" ON game_logs FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Controllo totale admin game_logs" ON game_logs FOR ALL TO authenticated USING (is_admin());
