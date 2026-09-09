# Product PRD

## Visione e problema

Liar System rende ripetibili esperienze di deduzione sociale live. Problema: Regia, contenuti segreti, tempi, economia e risultati sono difficili da coordinare senza trasformare l’evento in un’app da guardare.

## North star

Partecipanti che parlano, osservano e decidono fisicamente; telefono usato solo per stimolo, conferma o voto necessario.

## V1 scope

Un format canonico: 30 partecipanti, 5 tavoli, 6 per tavolo, 1 MC, 120 minuti. Ruoli: 1 Bugiardo, 1 Complice, 1 Capro Espiatorio inconsapevole, 27 Investigatori. Player Terminal; Control Room; ruoli, missioni, clue, Coin, asta fisica registrata, voto privato, reveal, timeline e log.

## Non-goals

Nessun altro ruolo V1, chat, social network, videogioco, teatro, murder mystery, roleplay, quiz, scenario editor grafico, bidding live di 30 persone, backend alternativo o Next.js.

## Personas e journey

- **Player**: QR → join → waiting → briefing/ruolo → directive/mission → clue → waiting → final vote → reveal.
- **MC/Regia**: login → game selector → preflight → roster → lifecycle/clock → controlli narrativi/economia → vote monitor → reveal → log/chiusura.

## Requisiti funzionali

FR-01 route Player per game code e route Regia autenticata.
FR-02 join concorrente senza doppio posto e recovery/rebind gestibile.
FR-03 assegnazione ruoli unica e privata.
FR-04 mission/clue consegnati secondo scenario version.
FR-05 Coin da ledger append-only, reward idempotenti.
FR-06 MC registra asta fisica; validazione saldo e charge atomici.
FR-07 voto privato: target, motivazione breve, review, conferma irreversibile.
FR-08 Regia vede turnout, stato, alert, health e reveal autorizzato.

## Requisiti gioco, resilienza, sicurezza, performance

Stimolo → interazione → conseguenza → dubbio → decisione. Verità centrale, 5–7 fatti immutabili, falsità protetta, false piste scagionabili, reveal coerente. Refresh, reconnect, Realtime perso, doppio click/tab, duplicate submission, concurrent join/bid/reward/vote devono essere sicuri. RLS deny-by-default, dati segreti isolati, nessun secret client. UI mobile 360–430px, una decisione primaria, snapshot rapidi e bounded.

## Acceptance criteria

Un game selezionato esplicitamente; 30 join su 5 tavoli; ruoli unici; nessun leak; mission/clue corretti; ledger senza doppio movimento; asta e voto idempotenti; reveal immutabile; refresh/reconnect recuperabili; Regia vede stato reale; test V1 completo passa.

## Definition of done

Implementazione scope approvato, schema/RPC/RLS verificati, test unit-to-E2E e simulazione 30-player passati, accessibilità mobile/desktop verificata, failure modes documentati, nessun deploy o effetto remoto implicito.
