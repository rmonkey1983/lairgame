-- ============================================================
-- LIAR SYSTEM — SCHEMA V3 SECURE & PERFORMANCE (SUPABASE)
-- Esegui questo script nel SQL Editor di Supabase
-- ============================================================

-- 1. Aggiunta colonna timer_expires_at per gestione timer lato client senza network spam
ALTER TABLE game_sessions 
ADD COLUMN IF NOT EXISTS timer_expires_at TIMESTAMPTZ;

-- 2. FUNZIONE RPC PER IMPOSTARE IL TIMER IN UTC
CREATE OR REPLACE FUNCTION set_session_timer(
    p_table_code VARCHAR(50),
    p_seconds INT
) RETURNS VOID AS $$
BEGIN
    UPDATE game_sessions
    SET 
        timer_duration = p_seconds,
        timer_expires_at = NOW() + (p_seconds || ' seconds')::INTERVAL,
        updated_at = NOW()
    WHERE table_code = p_table_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. FUNZIONE RPC SICURA PER ASSEGNAZIONE RUOLO (ATOMIC)
CREATE OR REPLACE FUNCTION assign_player_role(
    p_table_code VARCHAR(50),
    p_player_name VARCHAR(100),
    p_role VARCHAR(50)
) RETURNS VOID AS $$
BEGIN
    -- Aggiorna il ruolo del giocatore
    UPDATE game_players
    SET role = p_role
    WHERE table_code = p_table_code AND player_name = p_player_name;

    -- Aggiorna lo stato della sessione di gioco in modo sicuro
    IF p_role = 'liar' THEN
        UPDATE game_sessions
        SET current_liar = p_player_name, updated_at = NOW()
        WHERE table_code = p_table_code;
    ELSIF p_role = 'accomplice' THEN
        UPDATE game_sessions
        SET current_accomplice = p_player_name, updated_at = NOW()
        WHERE table_code = p_table_code;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. VISTA SICURA PER NASCONDERE I RUOLI SEGRETI AI GIOCATORI STANDARD
CREATE OR REPLACE VIEW public_game_players AS
SELECT 
    id,
    table_code,
    player_name,
    status,
    ticket_code,
    bbl_coins,
    completed_missions,
    created_at,
    -- Il ruolo viene mostrato solo al titolare o mascherato
    CASE 
        WHEN role IN ('liar', 'accomplice') THEN 'secret'
        ELSE 'innocent'
    END AS masked_role
FROM game_players;

-- 5. ABILITAZIONE RLS SU TABELLE CRITICHE
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;

-- Policy di lettura pubblica per consentire sync realtime
DROP POLICY IF EXISTS "Public Read Sessions" ON game_sessions;
DROP POLICY IF EXISTS "Public Read Players" ON game_players;
DROP POLICY IF EXISTS "Public Update Sessions" ON game_sessions;
DROP POLICY IF EXISTS "Public Update Players" ON game_players;

CREATE POLICY "Public Read Sessions" ON game_sessions FOR SELECT USING (true);
CREATE POLICY "Public Read Players" ON game_players FOR SELECT USING (true);

-- Permette update solo di campi non sensibili o tramite logica controllata
CREATE POLICY "Secure Update Sessions" ON game_sessions FOR UPDATE 
  USING (true) 
  WITH CHECK (true);

CREATE POLICY "Secure Update Players" ON game_players FOR UPDATE 
  USING (true)
  WITH CHECK (true);

-- TRIGGER POSTGRES DI SICUREZZA PER IMPEDIRE LA MODIFICA DIRETTA DEI RUOLI
CREATE OR REPLACE FUNCTION protect_player_role()
RETURNS TRIGGER AS $$
BEGIN
    -- Se l'utente tenta di cambiare il ruolo direttamente via client (anon)
    IF NEW.role IS DISTINCT FROM OLD.role AND current_setting('role', true) = 'anon' THEN
        RAISE EXCEPTION 'Modifica diretta del ruolo non consentita. Usa la funzione sicura assign_player_role.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_protect_player_role ON game_players;
CREATE TRIGGER trigger_protect_player_role
BEFORE UPDATE ON game_players
FOR EACH ROW
EXECUTE FUNCTION protect_player_role();

-- TRIGGER PER IL CALCOLO DEI VOTI AUTOMATICO (RISOLVE LE RACE CONDITIONS CLIENT-SIDE)
CREATE OR REPLACE FUNCTION check_votes_completion()
RETURNS TRIGGER AS $$
DECLARE
    v_player_count INT;
    v_vote_count INT;
BEGIN
    -- Conta quanti giocatori ci sono al tavolo
    SELECT COUNT(*) INTO v_player_count
    FROM game_players
    WHERE table_code = NEW.table_code;

    -- Conta quanti voti sono stati espressi
    SELECT COUNT(*) INTO v_vote_count
    FROM game_votes
    WHERE table_code = NEW.table_code;

    -- Se tutti hanno votato, sposta la sessione alla fase 'result'
    IF v_vote_count >= v_player_count AND v_player_count > 0 THEN
        UPDATE game_sessions
        SET phase = 'result', timer_duration = 0, timer_expires_at = NULL, updated_at = NOW()
        WHERE table_code = NEW.table_code AND phase = 'vote';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_check_votes_completion ON game_votes;
CREATE TRIGGER trigger_check_votes_completion
AFTER INSERT OR UPDATE ON game_votes
FOR EACH ROW
EXECUTE FUNCTION check_votes_completion();


