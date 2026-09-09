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
