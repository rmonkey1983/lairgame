-- ============================================================
-- AGGIORNAMENTO POLICY RLS PER TABELLA 'players'
-- Consente l'inserimento/registrazione dei giocatori anche se la partita è avviata (status = 'started')
-- ============================================================

DROP POLICY IF EXISTS "Anon read/insert players of own game" ON players;

CREATE POLICY "Anon read/insert players of own game" ON players 
    FOR ALL TO anon 
    USING (true)
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM games 
            WHERE games.id = players.game_id AND games.status IN ('waiting', 'started')
        )
    );
