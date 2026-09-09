# Test Strategy

## Layers

- **Unit**: state transition predicates, idempotency, selectors, content contracts.
- **Integration**: auth/session, snapshots, command-result flows.
- **Database**: constraints, transactions, ledger, immutability.
- **RLS/RPC**: anonymous, Player, Staff, revoked, cross-game denial and replay.
- **Realtime**: private authorization, payload minimization, reconnect, dedupe, cleanup.
- **Concurrency**: join same slot, role collision, bid close, reward, vote duplicate.
- **Resilience**: refresh, offline, lost Broadcast, duplicate tab/submission, recovery.
- **UI/accessibility**: viewport 360–430, keyboard, focus, screen reader semantics, stale/error states.
- **Frontend foundation**: Error Boundary fallback, root error hooks, Result/Error, session/recovery contracts, semantic queries and route regressions.
- **E2E**: admin lifecycle plus Player journey.

## Final V1 simulation

1 Staff, 30 Player, 5 tavoli, 30 join concorrenti/controllati, ruoli unici, mission, clue, Coin, asta, voto, reveal, refresh, reconnect e finish. Assert no secret leak, no duplicate charge/reward/vote, immutable result, authoritative snapshots and complete audit.

## Gates

Ogni milestone usa test mirati del sottosistema. Prima del live: typecheck, lint, unit, integration, DB/RLS/RPC, Realtime, concurrency, resilience, UI/accessibility, E2E e 30-player simulation. Test live/remote solo con autorizzazione esplicita e fixture isolate. Reportare failure riproducibile, ambiente e limiti; non confondere build pass con sicurezza o DB live validation.
