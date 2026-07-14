-- ============================================================
-- MIGRATION: RLS Hardening (Policy Granulari)
-- Sostituisce le policy permissive "Anon app access on ..." (FOR ALL USING(true))
-- con regole basate su operazioni specifiche (SELECT, INSERT, UPDATE, DELETE).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabella: games
-- ------------------------------------------------------------
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon app access on games" ON games;

-- SELECT: Permesso a chiunque (necessario per trovare partite tramite join_code)
CREATE POLICY "games_select" ON games
    FOR SELECT TO anon, authenticated
    USING (true);

-- INSERT: Solo creazione partite in stato 'waiting'
CREATE POLICY "games_insert" ON games
    FOR INSERT TO anon, authenticated
    WITH CHECK (status = 'waiting');

-- UPDATE: Modifiche permesse solo a stati validi
CREATE POLICY "games_update" ON games
    FOR UPDATE TO anon, authenticated
    USING (true)
    WITH CHECK (status IN ('waiting', 'started', 'running', 'finished'));

-- DELETE: Nessuna policy di delete da client -> non eliminabile tramite anon key

-- ------------------------------------------------------------
-- 2. Tabella: players
-- ------------------------------------------------------------
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon app access on players" ON players;

-- SELECT: Chiunque può vedere i partecipanti
CREATE POLICY "players_select" ON players
    FOR SELECT TO anon, authenticated
    USING (true);

-- INSERT: Permesso solo se la partita è in lobby ('waiting' o 'started')
CREATE POLICY "players_insert" ON players
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM games
            WHERE games.id = players.game_id
              AND games.status IN ('waiting', 'started')
        )
    );

-- UPDATE: Modifiche ammesse solo se la partita è attiva (waiting, started o running)
CREATE POLICY "players_update" ON players
    FOR UPDATE TO anon, authenticated
    USING (true)
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM games
            WHERE games.id = players.game_id
              AND games.status IN ('waiting', 'started', 'running')
        )
    );

-- DELETE: Rimozione giocatore permessa solo se la partita non è ancora running/finished
CREATE POLICY "players_delete" ON players
    FOR DELETE TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1 FROM games
            WHERE games.id = players.game_id
              AND games.status IN ('waiting', 'started')
        )
    );

-- ------------------------------------------------------------
-- 3. Tabella: votes
-- ------------------------------------------------------------
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon app access on votes" ON votes;

-- SELECT: Chiunque può vedere i voti
CREATE POLICY "votes_select" ON votes
    FOR SELECT TO anon, authenticated
    USING (true);

-- INSERT: Permesso solo se il gioco è 'running', il voter appartiene allo stesso gioco
CREATE POLICY "votes_insert" ON votes
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM games
            WHERE games.id = votes.game_id
              AND games.status = 'running'
        ) AND EXISTS (
            SELECT 1 FROM players
            WHERE players.id = votes.player_id
              AND players.game_id = votes.game_id
        )
    );

-- UPDATE: Disabilitato (i voti sono definitivi)

-- DELETE: Rimozione voti consentita solo se la partita viene resettata (waiting/started)
CREATE POLICY "votes_delete" ON votes
    FOR DELETE TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1 FROM games
            WHERE games.id = votes.game_id
              AND games.status IN ('waiting', 'started')
        )
    );

-- ------------------------------------------------------------
-- 4. Tabella: timeline_events
-- ------------------------------------------------------------
ALTER TABLE timeline_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon app access on timeline_events" ON timeline_events;

CREATE POLICY "timeline_events_select" ON timeline_events
    FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY "timeline_events_insert" ON timeline_events
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

-- UPDATE/DELETE: Disabilitato per la sicurezza degli eventi

-- ------------------------------------------------------------
-- 5. Tabella: events_engine
-- ------------------------------------------------------------
ALTER TABLE events_engine ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon app access on events_engine" ON events_engine;

CREATE POLICY "events_engine_select" ON events_engine
    FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY "events_engine_insert" ON events_engine
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

CREATE POLICY "events_engine_delete" ON events_engine
    FOR DELETE TO anon, authenticated
    USING (true);

-- ------------------------------------------------------------
-- 6. Tabella: game_logs
-- ------------------------------------------------------------
ALTER TABLE game_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon app access on game_logs" ON game_logs;

CREATE POLICY "game_logs_select" ON game_logs
    FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY "game_logs_insert" ON game_logs
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM games
            WHERE games.id = game_logs.game_id
        )
    );

-- UPDATE/DELETE: Disabilitato (i log sono append-only e non modificabili)
