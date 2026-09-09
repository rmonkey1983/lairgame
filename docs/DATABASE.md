# Database Plan

## Schema proposto

Domini: identity/access (`staff_members`, memberships, `players`), event/game (`events`, `games`, `game_tables`), scenario (`scenarios`, `scenario_versions`, facts/templates), runtime (`role_assignments`, mission instances, clue deliveries, directives), economy (`coin_ledger_entries`, auctions, bids), decision (`votes`, `vote_results`), audit (`timeline_events`, `game_logs`). Nomi definitivi e colonne vanno approvati con contratti.

## Keys, constraints, indexes

UUID PK per runtime; version/code pubblici con unique constraint scoped correttamente. FK obbligatorie verso parent; `games.scenario_version_id` NOT NULL da `ready`; check su enum/state, amount non nullo e quantità valide; unique su player auth identity, ruolo per game, vote player/round, idempotency/correlation. Index su game/state, table/game, player/game, topic lookup, timeline sequence, ledger scope/time.

## RLS boundaries

Default deny. Player legge solo snapshot/RPC che filtrano `auth.uid()` e game membership; mai select diretto su segreti altrui. Staff legge e comanda solo con membership attiva e game esplicito. Insert/update critici negati al client e mediati da RPC `SECURITY DEFINER` con `search_path` sicuro, controlli auth e ownership.

## RPC boundaries

Read: player/admin snapshot bounded, roster sanitizzato, vote turnout, health. Commands: join/rebind, lifecycle/phase, delivery, reward, auction bid/close, vote confirm, reveal. Ogni command valida preconditions, authorization, idempotency e transaction; ritorna risultato minimo o errore tipizzato.

## Migration order

1. extensions/enums e timestamp policy; 2. identity/access; 3. Event/Game/Table/Scenario; 4. version content; 5. runtime secret domains; 6. ledger/auction/vote; 7. audit; 8. RLS; 9. RPC; 10. Realtime authorization; 11. controlled seed/test fixtures.

Nessuna migration SQL in Milestone 0. Decidere prima retention, soft-delete, enum strategy, session recovery e granularità membership.

## Core foundation (Milestone 4)

La migration `create_core_game_schema` crea esclusivamente `events`, `games`, `game_tables`, `players` e `staff_members`. Lifecycle e narrative phase sono `text` con `CHECK`: i valori restano leggibili e una futura migration può estenderli senza dipendere da enum PostgreSQL.

La migration è l’unica fonte dello schema: niente modifiche manuali via Studio. Tutte le tabelle hanno RLS attiva e grants espliciti; la baseline non concede accesso a `anon` o `authenticated`. `players.id` è l’identità logica stabile, distinta dal binding `auth_user_id`.

La FK composta `(players.game_id, players.table_id)` verso `game_tables` impedisce assegnazioni di un player a un tavolo di un altro game. I tipi DB generati dal database locale sono in `src/lib/supabase/database.types.ts` e non sostituiscono i domain types.

## Player anonymous join (Milestone 5)

`secure_player_join` aggiunge lookup case-insensitive del game code e due RPC: `join_game` crea o riusa un Player usando solo `auth.uid()`; `get_my_join_state` restituisce solo il Player corrente. Entrambe verificano claim `is_anonymous`; `join_game` accetta nuovi ingressi solo con lifecycle `checkin_open`.

Le RPC sono `SECURITY DEFINER` con `search_path = ''`, riferimenti schema-qualified, `EXECUTE` solo ad `authenticated`, mai a `PUBLIC` o `anon`. Tabelle restano senza grant CRUD: Player creation passa dalla RPC. Unique `(game_id, auth_user_id)` e `(game_id, table_id, seat_number)` proteggono retry e seat race.
