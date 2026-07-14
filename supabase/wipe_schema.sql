-- ============================================================
-- LIAR SYSTEM — SCRIPT DI PULIZIA TOTALE SCHEMA PUBLIC
-- Esegui questo script nel SQL Editor di Supabase
-- ============================================================

-- Disabilita temporaneamente i trigger per evitare interferenze durante l'eliminazione
SET session_replication_role = 'replica';

-- 1. ELIMINAZIONE DELLE VISTE (se presenti)
DROP VIEW IF EXISTS public_game_players CASCADE;

-- 2. ELIMINAZIONE DELLE TABELLE SPECIFICATE (DROP TABLE IF EXISTS ... CASCADE)
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS coin_transactions CASCADE;
DROP TABLE IF EXISTS dinner_tables CASCADE;
DROP TABLE IF EXISTS factions CASCADE;
DROP TABLE IF EXISTS game_logs CASCADE;
DROP TABLE IF EXISTS game_players CASCADE;
DROP TABLE IF EXISTS game_sessions CASCADE;
DROP TABLE IF EXISTS game_state CASCADE;
DROP TABLE IF EXISTS game_votes CASCADE;
DROP TABLE IF EXISTS lore_clues CASCADE;
DROP TABLE IF EXISTS missions CASCADE;
DROP TABLE IF EXISTS participants CASCADE;
DROP TABLE IF EXISTS player_missions CASCADE;
DROP TABLE IF EXISTS players CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS scenarios CASCADE;
DROP TABLE IF EXISTS session_missions CASCADE;
DROP TABLE IF EXISTS stato_tavoli CASCADE;
DROP TABLE IF EXISTS stories CASCADE;
DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS votes CASCADE;

-- 3. DOPPIO CONTROLLO / PULIZIA DINAMICA DI TUTTE LE TABELLE RIMANENTI NELLO SCHEMA PUBLIC
-- Rileva e droppa qualsiasi tabella non specificata sopra per garantire tabula rasa.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END $$;

-- 4. ELIMINAZIONE DI FUNZIONI E TRIGGER CUSTOMIZZATI
-- Droppa le funzioni create negli schemi precedenti per evitare conflitti o funzioni orfane.
DROP FUNCTION IF EXISTS transfer_tokens(INT, INT, INT);
DROP FUNCTION IF EXISTS transfer_tokens(INT, INT, INT, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS grant_coins(INT, INT, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS complete_mission(VARCHAR, INT, VARCHAR);
DROP FUNCTION IF EXISTS is_admin();
DROP FUNCTION IF EXISTS set_session_timer(VARCHAR, INT);
DROP FUNCTION IF EXISTS assign_player_role(VARCHAR, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS protect_player_role();
DROP FUNCTION IF EXISTS check_votes_completion();

-- Ripristina il comportamento standard dei trigger
SET session_replication_role = 'origin';
