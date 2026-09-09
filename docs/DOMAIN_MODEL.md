# Domain Model

## Regole comuni

Ogni entità ha ID stabile, timestamp e audit minimo. Stato critico è server-authoritative. Versioni pubblicate sono immutabili. Relazioni sottostanti assumono ownership del Game e RLS coerente.

| Entity | Responsabilità, lifecycle, relazioni, invarianti |
|---|---|
| Event | Contenitore commerciale; draft→scheduled→completed/aborted; contiene Games; non contiene segreti player. |
| Game | Istanza live; draft→ready→checkin_open→live→paused/completed/aborted; punta a Event e ScenarioVersion; lifecycle unico. |
| GameTable | Tavolo; setup→active→closed; appartiene Game; capienza e assegnazioni coerenti. |
| Player | Identità anonima del partecipante; joined→active→finished; appartiene Game/Table; auth_user_id unico. |
| StaffMember | Identità persistente e membership; invited→active→revoked; accesso solo via membership attiva. |
| Scenario | Identità format; draft→published→retired; possiede versioni; non muta versione usata. |
| ScenarioVersion | Snapshot contenuto; draft→published→retired; una volta published immutabile; Game punta a una sola versione. |
| ScenarioFact | Fatto canonico della versione; immutable in published; distingue verità/falsità/visibility. |
| RoleAssignment | Ruolo segreto Player/Game; assigned→active→revealed; un Player e ruolo V1 unico per Game; reveal controllato. |
| MissionTemplate | Missione di scenario; draft→published; riferita a version; non contiene assegnazione runtime. |
| MissionInstance | Missione assegnata; pending→delivered→acknowledged/completed; Player può vedere solo propria. |
| ClueTemplate | Indizio versionato; draft→published; visibility e condizioni definite; immutabile in uso. |
| ClueDelivery | Consegna runtime; locked→unlocked→delivered; target e unlock atomici; privata per destinatario. |
| CoinLedgerEntry | Movimento append-only; posted→voided solo con compensazione; amount, scope, correlation/idempotency unici. |
| Auction | Asta fisica; scheduled→open→closed/cancelled; Game/Table scope; chiusura una volta. |
| AuctionBid | Offerta registrata dalla Regia; submitted→accepted/rejected; saldo e concorrenza verificati in transaction. |
| Vote | Voto privato; draft→submitted→confirmed; un Player/round, no edit dopo conferma. |
| VoteResult | Snapshot immutabile; pending→finalized→revealed; creato dopo close; non ricalcolato retroattivamente. |
| TimelineEvent | Evento operativo/narrativo ordinato; append-only; sequence per Game monotona. |
| GameDirective | Comando/istruzione Regia; draft→published→expired; audience e phase obbligatorie. |
| GameLog | Audit operativo; append-only; actor, action, target, result, correlation obbligatori. |

## State separation

Lifecycle Game e narrative phase (`lobby`, `role_reveal`, `briefing`, `discovery`, `comparison`, `pressure`, `auction`, `deliberation`, `final_vote`, `reveal`) sono assi distinti. Transizioni valide, autorizzazioni e preconditions restano da formalizzare in Milestone 1.
