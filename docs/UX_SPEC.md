# UX Specification

## Player Terminal

Mobile-first 360–430px. Flusso: QR → `/play/:gameCode` → join → waiting → role/briefing → directive/mission → clue → waiting → final vote → reveal. Una decisione primaria per schermata; testo leggibile in pochi secondi; CTA chiara; telefono si chiude dopo missione. Niente dashboard, timeline completa, chat, statistiche inutili o gaming infantile.

## Control Room

Desktop-first, orientata a operazioni live: login, game selector obbligatorio, preflight, roster, lifecycle, phase, master clock, ruoli, mission, clue, turnout/vote monitor, reveal, timeline, log, Realtime health, alert, danger zone. Mostrare sempre game corrente, stato, ultima sincronizzazione e azione primaria. Azioni distruttive richiedono conferma chiara.

## Accessibilità e failure states

Keyboard flow, focus visibile, label semantiche, contrasto, target touch adeguati, messaggi non basati solo sul colore, reduced motion. Distinguere loading, stale, offline, errore, conflict e completed. Non mostrare dettagli segreti in errori, toast o notifiche.

## Routes

Target: `/admin/login`, `/admin/games`, `/admin/games/:gameCode`, `/play/:gameCode`. Routing finale, guard e recovery contract da validare in Milestone 1.
