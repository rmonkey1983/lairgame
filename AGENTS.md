# AGENTS.md — Liar System

## Contratto

Leggere questo file prima di ogni modifica. Prodotto: **Black Bulls Lab → Liar System → A Cena Con Il Bugiardo**. Liar System è un motore riutilizzabile per esperienze sociali live, non una semplice app per cena.

## Principi

- Tecnologia fa alzare occhi dal telefono.
- Un sottosistema alla volta.
- 90–95% esperienza offline; interazione umana prima della UI.
- Nessun claim o requisito non documentato.

## Autorità

`PostgreSQL = source of truth` → `RPC/transaction = command layer` → `Realtime Broadcast = wake-up` → `React = presentation`. Client non modifica stato critico direttamente. Broadcast non è database; dopo evento, refetch autorizzato.

## Stack target

Node 22.12+, React 19.2.x, TypeScript, Vite 8.x, Tailwind 4.x, React Router con `BrowserRouter`, Vitest, Testing Library, Supabase JS/PostgreSQL/Auth Anonymous/Realtime/RLS/RPC, Netlify SPA. No Next.js, ORM o framework backend alternativo.

## Invarianti architetturali

- Player e Staff hanno confini, route e dati separati.
- Scenario versionato e pubblicato è immutabile; Game punta a una `ScenarioVersion`.
- Lifecycle e narrative phase sono distinti.
- Operazioni critiche atomiche e idempotenti lato server.
- Ruoli segreti non persistono in localStorage.
- Game selector Regia sempre esplicito.

## Sicurezza

RLS deny-by-default. Player anonimo vincolato a `players.auth_user_id = auth.uid()`. Staff richiede Auth persistente e membership attiva. Nessun secret/service-role key nel browser. Dati privati: ruolo, missioni, clue, voti altrui, dati Regia e assegnazioni globali.

## Database e migrazioni

Prima progettare e approvare decisioni. Migrazioni additive, ordinate, reversibili quando possibile; mai modificare migrazione già applicata. Nessun `db push`, deploy o operazione Supabase remota senza richiesta esplicita. Ledger Coin append-only; saldo derivato; idempotency/correlation key obbligatoria.

## Realtime

Solo private Broadcast, payload minimo e non sensibile. Topic autorizzati per game/ruolo. Deduplicare subscription, gestire reconnect e cleanup. Evento segnala cambiamento; snapshot RPC resta autoritativo.

## Metodo e gate

Ispezionare stato corrente e worktree. Cambiare solo scope autorizzato. Test mirati prima, suite ampia dopo stabilità. Gate: typecheck/lint, unit, integration, DB/RLS/RPC, Realtime, concurrency, resilience, UI/accessibility, E2E e simulazione 30-player quando applicabile.

## Git e divieti

No commit, push, reset distruttivo o cleanup non richiesto. No installazioni casuali, codice legacy, feature premature, editor scenario, chat, statistiche inutili, HashRouter, client-side authority, `USING(true)` su dati privati.

## Done

Scope completo, invarianti preservate, test proporzionati passati, diff minimale, documentazione aggiornata, nessun effetto remoto non autorizzato e report con rischi/deferred espliciti.
