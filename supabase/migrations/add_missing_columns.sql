-- ============================================================
-- MIGRATION: Aggiunge colonne mancanti a games e players
-- Allinea lo schema SQL con database.types.ts e il codice attivo
-- (AdminDashboard.tsx, PlayerTerminal.tsx).
-- Idempotente: usa IF NOT EXISTS, safe per ri-esecuzione.
-- ============================================================

-- 1. games: current_liar (nome del Bugiardo attivo, gestito dalla Regia)
ALTER TABLE games ADD COLUMN IF NOT EXISTS current_liar TEXT;

-- 2. games: phase (fase corrente: lobby, liar_selection, game, voting, result, ecc.)
ALTER TABLE games ADD COLUMN IF NOT EXISTS phase TEXT;

-- 3. players: is_liar (assegnato dalla Regia)
ALTER TABLE players ADD COLUMN IF NOT EXISTS is_liar BOOLEAN NOT NULL DEFAULT FALSE;

-- 4. players: is_accomplice (assegnato dalla Regia)
ALTER TABLE players ADD COLUMN IF NOT EXISTS is_accomplice BOOLEAN NOT NULL DEFAULT FALSE;
