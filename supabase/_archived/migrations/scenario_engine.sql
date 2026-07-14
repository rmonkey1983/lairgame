-- ============================================================
-- SCENARIO ENGINE — Migrazione Database
-- Esegui nel SQL Editor di Supabase
-- ============================================================

-- 1. Estensione tabella stories (non-breaking)
ALTER TABLE stories ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft';
ALTER TABLE stories ADD COLUMN IF NOT EXISTS author_name VARCHAR(100);
ALTER TABLE stories ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
ALTER TABLE stories ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Aggiorna storie esistenti a "published"
UPDATE stories SET status = 'published' WHERE status = 'draft' OR status IS NULL;

-- 2. Tabella scenario_phases
CREATE TABLE IF NOT EXISTS scenario_phases (
    id SERIAL PRIMARY KEY,
    story_id INT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    phase_number INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    subtitle VARCHAR(255),
    duration_seconds INT DEFAULT 600,
    description TEXT,
    mc_script TEXT,
    actor_script TEXT,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(story_id, phase_number)
);

-- 3. Tabella scenario_hints
CREATE TABLE IF NOT EXISTS scenario_hints (
    id SERIAL PRIMARY KEY,
    story_id INT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    phase_number INT NOT NULL,
    hint_text TEXT NOT NULL,
    target VARCHAR(50) DEFAULT 'all',
    trigger_type VARCHAR(30) DEFAULT 'manual',
    trigger_delay_seconds INT DEFAULT 0,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. RLS per nuove tabelle
ALTER TABLE scenario_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario_hints  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_scenario_phases"  ON scenario_phases FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "write_scenario_phases" ON scenario_phases FOR ALL    TO authenticated        USING (is_admin());

CREATE POLICY "read_scenario_hints"   ON scenario_hints  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "write_scenario_hints"  ON scenario_hints  FOR ALL    TO authenticated        USING (is_admin());

-- 5. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE scenario_phases;
ALTER PUBLICATION supabase_realtime ADD TABLE scenario_hints;

-- 6. Inserire fasi di default per le storie esistenti
INSERT INTO scenario_phases (story_id, phase_number, name, subtitle, duration_seconds, sort_order)
SELECT s.id, 1, 'Antipasto', 'Avvia Ricatti', 300, 1
FROM stories s
WHERE NOT EXISTS (SELECT 1 FROM scenario_phases sp WHERE sp.story_id = s.id AND sp.phase_number = 1)
ON CONFLICT DO NOTHING;

INSERT INTO scenario_phases (story_id, phase_number, name, subtitle, duration_seconds, sort_order)
SELECT s.id, 2, 'Primo Piatto', 'Asta Indizi', 600, 2
FROM stories s
WHERE NOT EXISTS (SELECT 1 FROM scenario_phases sp WHERE sp.story_id = s.id AND sp.phase_number = 2)
ON CONFLICT DO NOTHING;

INSERT INTO scenario_phases (story_id, phase_number, name, subtitle, duration_seconds, sort_order)
SELECT s.id, 3, 'Secondo Piatto', 'Interrogatorio', 600, 3
FROM stories s
WHERE NOT EXISTS (SELECT 1 FROM scenario_phases sp WHERE sp.story_id = s.id AND sp.phase_number = 3)
ON CONFLICT DO NOTHING;

INSERT INTO scenario_phases (story_id, phase_number, name, subtitle, duration_seconds, sort_order)
SELECT s.id, 4, 'Dolce & Fine', 'Votazione Finale', 300, 4
FROM stories s
WHERE NOT EXISTS (SELECT 1 FROM scenario_phases sp WHERE sp.story_id = s.id AND sp.phase_number = 4)
ON CONFLICT DO NOTHING;
