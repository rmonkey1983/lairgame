# Database Plan

## Schema proposto

Domini: identity/access (`staff_members`, memberships, `players`), event/game (`events`, `games`, `game_tables`), scenario (`scenarios`, `scenario_versions`, facts/templates), runtime (`role_assignments`, mission instances, clue deliveries, directives), decision (`votes`, `vote_results`), audit (`timeline_events`, `game_logs`). Nomi definitivi e colonne vanno approvati con contratti.

## Keys, constraints, indexes

UUID PK per runtime; version/code pubblici con unique constraint scoped correttamente. FK obbligatorie verso parent; `games.scenario_version_id` NOT NULL da `ready`; check su enum/state, amount non nullo e quantità valide; unique su player auth identity, ruolo per game, vote player/round, idempotency/correlation. Index su game/state, table/game, player/game, topic lookup, timeline sequence, ledger scope/time.

## RLS boundaries

Default deny. Player legge solo snapshot/RPC che filtrano `auth.uid()` e game membership; mai select diretto su segreti altrui. Staff legge e comanda solo con membership attiva e game esplicito. Insert/update critici negati al client e mediati da RPC `SECURITY DEFINER` con `search_path` sicuro, controlli auth e ownership.

## RPC boundaries

Read: player/admin snapshot bounded, roster sanitizzato, vote turnout, health. Commands: join/rebind, lifecycle/phase, delivery, vote confirm, reveal. Ogni command valida preconditions, authorization, idempotency e transaction; ritorna risultato minimo o errore tipizzato.

## Migration order

1. extensions/enums e timestamp policy; 2. identity/access; 3. Event/Game/Table/Scenario; 4. version content; 5. runtime secret domains; 6. vote; 7. audit; 8. RLS; 9. RPC; 10. Realtime authorization; 11. controlled seed/test fixtures.

Nessuna migration SQL in Milestone 0. Decidere prima retention, soft-delete, enum strategy, session recovery e granularità membership.

## Core foundation (Milestone 4)

La migration `create_core_game_schema` crea esclusivamente `events`, `games`, `game_tables`, `players` e `staff_members`. Lifecycle e narrative phase sono `text` con `CHECK`: i valori restano leggibili e una futura migration può estenderli senza dipendere da enum PostgreSQL.

La migration è l’unica fonte dello schema: niente modifiche manuali via Studio. Tutte le tabelle hanno RLS attiva e grants espliciti; la baseline non concede accesso a `anon` o `authenticated`. `players.id` è l’identità logica stabile, distinta dal binding `auth_user_id`.

La FK composta `(players.game_id, players.table_id)` verso `game_tables` impedisce assegnazioni di un player a un tavolo di un altro game. I tipi DB generati dal database locale sono in `src/lib/supabase/database.types.ts` e non sostituiscono i domain types.

## Player anonymous join (Milestone 5)

`secure_player_join` aggiunge lookup case-insensitive del game code e due RPC: `join_game` crea o riusa un Player usando solo `auth.uid()`; `get_my_join_state` restituisce solo il Player corrente. Entrambe verificano claim `is_anonymous`; `join_game` accetta nuovi ingressi solo con lifecycle `checkin_open`.

Le RPC mantengono il contratto pubblico ma usano un wrapper `SECURITY INVOKER` in `public` che delega a un'implementazione `SECURITY DEFINER` nello schema non esposto `private`. Ogni implementazione privata usa `search_path = ''`, riferimenti schema-qualified e deriva l'identità da Auth; `EXECUTE` è concesso solo ad `authenticated`, mai a `PUBLIC` o `anon`. Tabelle restano senza grant CRUD: Player creation passa dalla RPC. Unique `(game_id, auth_user_id)` e `(game_id, table_id, seat_number)` proteggono retry e seat race.

## Staff membership gate (Milestone 6)

`staff_auth_gate` aggiunge `get_my_staff_access()`, senza parametri client. La RPC restituisce solo membership corrente attiva; `auth.uid()` e claim `is_anonymous` sono verificati server-side. `staff_members` resta senza `SELECT` diretto e nessuna modifica a games è inclusa.

Le funzioni `SECURITY DEFINER` privilegiate non devono vivere in schemi esposti dalla Data API: il pattern è `public` wrapper invoker → `private` implementation definer con `SET search_path = ''`. Lo schema `private` non va aggiunto a `api.schemas` in `config.toml`.

## Staff game read model (Milestone 7)

`list_staff_games()` e `get_staff_game_overview(text)` restituiscono unicamente il contesto operativo Staff e conteggi server-side da `games`, `events`, `game_tables` e `players`. Le tabelle core restano senza `SELECT` diretto; ogni RPC verifica `auth.uid()`, non-anonymous Auth e membership attiva. Il `gameCode` nell'URL è il contesto esplicito della pagina, senza auto-selezione.

## Staff game roster (Milestone 11)

`get_staff_game_roster(text)` restituisce allo Staff attivo solo `player_id`, nickname, tavolo, posto e `joined_at`, ordinati per tavolo/posto; non espone `auth_user_id`. Un inserimento reale in `players` emette il wake-up Broadcast `game_state_changed` sul topic privato del Game; il retry idempotente non inserisce e non emette.

## Staff role assignment (Milestone 12)

`assign_game_roles(text, uuid)` congela atomicamente i ruoli nel solo stato `live`/`lobby`, con un Bugiardo, un Complice, un Capro espiatorio e Investigatori per i restanti Player. Il comando Staff attivo è idempotente per `command_id`, auditato e protetto da lock sul Game; `get_staff_game_roles(text)` restituisce i ruoli solo alla Regia. Le righe ruolo non sono leggibili o modificabili dal browser.

## Lifecycle command (Milestone 8)

`transition_game_lifecycle(text, text, text, uuid)` è l'unico comando Staff della milestone. L'implementazione privata usa `FOR UPDATE`, confronta lo stato atteso e applica la matrice lifecycle approvata; la modifica a `games.lifecycle` e l'inserimento in `game_lifecycle_commands` sono atomici. La tabella audit è append-only, con RLS e nessun grant browser.

## Narrative phase command (Milestone 9)

`transition_game_narrative_phase(text, text, text, uuid)` consente allo Staff attivo di avanzare `games.narrative_phase` solo mentre il lifecycle è `live`. La matrice è strettamente sequenziale da `lobby` a `reveal`, senza skip o backward transition; `reveal` non ha successori. `FOR UPDATE`, `expected_phase` e `command_id` proteggono concorrenza, stale state e retry. `game_narrative_phase_commands` registra una riga append-only per comando compatibile nella stessa transazione della mutazione, senza accesso CRUD browser.

## Post-game data foundation (Milestone 24)

`brain_snapshots` conserva punti temporali significativi per l'analisi Staff: fase, motivo, fingerprint idempotente e metriche aggregate limitate. La sequence è assegnata sotto lock del Game; i retry dello stesso fingerprint restituiscono la riga esistente. Un trigger server-side registra gli ingressi di fase; gli altri motivi possono essere registrati dal command layer con `append_brain_snapshot`.

La tabella non concede CRUD al browser. `load_brain_snapshots` e `append_brain_snapshot` seguono il wrapper pubblico invoker e l'implementazione privata definer con `search_path = ''`, e sono disponibili solo a Staff attivo. ScenarioTruth, grafi raw, prompt AI e report completo non sono persistiti.
