-- ============================================================
-- REALTIME BRIDGE — Migrazione Database
-- Esegui nel SQL Editor di Supabase per attivare la tabella 'stato_tavoli'
-- e la replica in tempo reale via WebSockets
-- ============================================================

-- 1. Creazione tabella stato_tavoli
CREATE TABLE IF NOT EXISTS stato_tavoli (
    id VARCHAR(100) PRIMARY KEY,
    missione_attiva_id INT,
    bbl_coin INT DEFAULT 0,
    notifica_testo TEXT,
    tipo_evento VARCHAR(50),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Abilitazione RLS (Row Level Security)
ALTER TABLE stato_tavoli ENABLE ROW LEVEL SECURITY;

-- 3. Policy di accesso
-- Consenti la lettura (Select) a tutti (giocatori anonimi o autenticati)
CREATE POLICY "Consenti lettura stato_tavoli a tutti" 
    ON stato_tavoli 
    FOR SELECT 
    USING (true);

-- Consenti la scrittura (Insert/Update) solo agli utenti autenticati (Staff / Regia)
-- NOTA: Se si utilizza una chiave anonima anche in Regia, cambiare TO authenticated a TO anon, authenticated
CREATE POLICY "Consenti scrittura stato_tavoli solo a staff autenticato" 
    ON stato_tavoli 
    FOR ALL 
    TO authenticated 
    USING (true) 
    WITH CHECK (true);

-- 4. Abilitazione al canale di pubblicazione Realtime via WebSockets
ALTER PUBLICATION supabase_realtime ADD TABLE stato_tavoli;
