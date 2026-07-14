# Liar System - Developer Guide & Agent Memory

## Comandi di Sviluppo
- Build: `npm run build`
- Dev Server: `npm run dev`
- Test: `npm run test` / `npm run test:run`
- Lint: `npm run lint`

## Stack Tecnologico
- Frontend: React 19, Vite 8, Tailwind 3, Framer Motion
- Routing: HashRouter (`react-router-dom` v7) -> `/#/...`
- Database & Realtime: Supabase (Postgres RLS, Realtime Channels)

## Regole Supreme di Black Bulls Lab
1. **Zero Accondiscendenza & Aggiornamento Continuo**:
   - Se un'idea o il codice ha falle logiche/scalabilità/costi, dillo.
   - Correggi o proponi direttamente modifiche nei file se trovi errori.
2. **Stress Test**:
   - Valuta scalabilità (1000 utenti), costi, potenziale rottura del sistema da parte degli utenti.
3. **Caveman Compressor**:
   - Frasi brevi, dirette, stile a proiettile. No convenevoli.
4. **UI/UX Max**:
   - Design premium, umano, gerarchia visiva maniacale, accessibilità prima di estetica fine a se stessa.

## Struttura & Routing
- `/` → PlayerTerminal (splash/join)
- `/t/:tableCode/join` → PlayerTerminal (join con codice)
- `/t/:tableCode/player-panel` → PlayerTerminal
- `/t/:tableCode/game` → PlayerTerminal (flusso di gioco)
- `/admin` → AdminDashboard (regia)
- `/t/:tableCode/admin` → AdminDashboard (regia con codice tavolo)

## Database (Schema Unico — Live App)
- **Schema canonico**: `supabase/schema.sql`
- **Tipi TS**: `src/types/database.types.ts`
- **FK pattern**: `game_id UUID`
- **Tabelle**: `games`, `players`, `votes`, `timeline_events`, `events_engine`, `game_logs`
- **Colonne chiave players**: `nickname`, `posto_tavola`, `is_target`, `is_liar`, `is_accomplice`
- **Colonne chiave games**: `join_code`, `status`, `scenario_id`, `current_liar`, `phase`
- **Legacy archiviato**: `supabase/_archived/` (schema Fazioni v1/v2/v3, non più usato)
