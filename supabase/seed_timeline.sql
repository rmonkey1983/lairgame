-- ============================================================
-- LIAR SYSTEM — SEED TIMELINE EVENTS (SUPABASE)
-- Esegui questo script nel SQL Editor di Supabase per caricare gli eventi di test
-- ============================================================

INSERT INTO timeline_events (minute_trigger, target_logic, payload) VALUES
(
    1,
    'all',
    '{
        "type": "message",
        "title": "Benvenuto nel Liar System",
        "message": "La partita è iniziata. Presta attenzione a ogni minimo dettaglio e diffida di chiunque.",
        "duration_seconds": 15
    }'::jsonb
),
(
    5,
    'all',
    '{
        "type": "dilemma",
        "title": "Tradimento Rapido",
        "message": "Un complice segreto ha nascosto delle informazioni cruciali. Vuoi accusare pubblicamente un sospettato o proteggere il tavolo?",
        "buttons": [
            {"label": "Accusa", "action": "accuse"},
            {"label": "Proteggi", "action": "protect"}
        ],
        "duration_seconds": 45
    }'::jsonb
),
(
    10,
    'target_player',
    '{
        "type": "alert",
        "title": "Isolamento Target",
        "message": "Sei stato isolato dal canale di comunicazione principale. Mantieni la calma e attendi istruzioni.",
        "duration_seconds": 30
    }'::jsonb
);
