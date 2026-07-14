-- ============================================================
-- LIAR SYSTEM - MIGRATION: DROP UNIQUE SEAT CONSTRAINT
-- Consente a più giocatori di registrarsi allo stesso tavolo.
-- ============================================================

ALTER TABLE players DROP CONSTRAINT IF EXISTS unique_game_seat;
