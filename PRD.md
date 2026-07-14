# PRD — Liar System / A Cena Col Bugiardo

**Versione:** 1.0  
**Data:** 17 giugno 2026  
**Stato:** Basato su implementazione corrente del codebase  
**Prodotto:** Black Bulls Lab

---

## 1. Executive Summary

**Liar System** è una piattaforma web per serate di **deduzione sociale a tema cena**. Combina un gioco da tavolo digitale (individuazione del “Bugiardo”) con strumenti operativi per staff (regia, reception, MC, attore) e un pannello mobile per fazioni/tavoli con economia a gettoni BBL.

L’app è **mobile-first**, realtime via Supabase, deployata su **Netlify**, con routing hash (`/#/...`).

### Obiettivi prodotto

| Obiettivo | Metrica di successo |
|-----------|---------------------|
| Check-in fluido in serata | Ticket validato in < 30s via QR o manuale |
| Sincronia regia ↔ giocatori | Fase/hint visibili in < 2s (realtime) |
| Esperienza giocabile anche in piccolo gruppo | Partita avviabile con 1 giocatore |
| Controllo serata da più ruoli | Regia, MC, attore, reception operativi in parallelo |

---

## 2. Problema e opportunità

### Problema

Serate “cena con il bugiardo” richiedono coordinamento tra:
- accoglienza e validazione ticket,
- facilitazione narrativa a sala,
- gestione tavoli/fazioni con segreti e gettoni,
- flusso di gioco sincronizzato (bugiardo, complice, missione, voto).

Senza strumenti digitali, regia e MC gestiscono tutto manualmente con rischio di disallineamento tra dispositivi.

### Opportunità

Un’unica web app che:
- guida i giocatori fase per fase,
- dà alla regia controllo live,
- integra reception QR e pannello fazione,
- supporta meccaniche premium (cena a portate, asta indizi).

---

## 3. Personas e ruoli

| Persona | Ruolo | Interfaccia principale |
|---------|-------|----------------------|
| **Giocatore** | Partecipa al gioco del bugiardo | `/#/t/:tableCode/game` |
| **Ospite / solo** | Entra senza ticket pre-acquistato | Join → “GIOCA SUBITO” |
| **Regia / Admin** | Controlla sessione tavolo, hint, asta, reception | `/#/t/:tableCode/admin` |
| **Reception** | Scansiona QR ticket, valida ingresso | `/#/t/:tableCode/scanner-reception` |
| **MC (presentatore)** | Gestisce fasi evento globali, monitora fazioni | `/#/admin` |
| **Attore** | Facilita narrazione, avanza fasi evento | `/#/t/:tableCode/actor` |
| **Giocatore fazione** | Segreti, gettoni, trasferimenti tra tavoli | `/#/t/:tableCode/player-panel` |

---

## 4. Scope prodotto

### In scope (v1 attuale)

- Splash e onboarding join (ticket + ospite)
- Gioco Bugiardo completo (6 fasi)
- Dashboard regia con hint, storia, timer, asta cena
- Pannello MC e attore (fasi evento)
- Player panel fazioni (gettoni, segreti, trasferimenti)
- Scanner reception con edge function `redeem-ticket`
- Icone brand SVG + UI premium
- Modalità solitaria (1 giocatore)
- Sync realtime Supabase

### Out of scope (v1)

- App native iOS/Android
- Pagamenti in-app
- Chat tra giocatori
- Unificazione automatica `game_sessions` ↔ `game_state`
- Login admin con form dedicato (parzialmente documentato, non implementato in UI)

---

## 5. Architettura prodotto (dual system)

L’app gestisce **due modelli di stato paralleli**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    LIAR SYSTEM — DUAL MODEL                      │
├────────────────────────────┬────────────────────────────────────┤
│  TAVOLO BUGIARDO           │  EVENTO / FAZIONI                   │
│  game_sessions             │  game_state (id=1)                  │
│  game_players / votes /    │  factions, stories                  │
│  logs (normalizzato)       │  participants, bookings, tickets    │
├────────────────────────────┼────────────────────────────────────┤
│  GameScreen, Dashboard     │  MCPanel, ActorPanel, PlayerPanel   │
│  useGameSession hook       │  Query dirette Supabase             │
└────────────────────────────┴────────────────────────────────────┘
```

**Nota critica:** cambiare fase su `game_sessions` non aggiorna `game_state` e viceversa. La serata può usare entrambi i sistemi in parallelo per scopi diversi.

---

## 6. User journeys

### 6.1 Giocatore — serata standard

1. Abre `/#/` → “Inizia partita”
2. `/#/t/BBL-QR-7/join` → inserisce ticket
3. Stato `pending` → attende validazione regia/reception
4. `validated` → scansione QR tavolo → `seated`
5. Entra in `/#/t/BBL-QR-7/game` (lobby)
6. Regia o giocatore avvia → fasi bugiardo → missione → voto → risultati

### 6.2 Giocatore — ospite / solo

1. Join → sezione “GIOCA SUBITO” (nome opzionale)
2. Registrazione immediata su Supabase (`GUEST-*`)
3. Lobby con 1 giocatore → “Avvia la sessione”
4. Scelta ruolo bugiardo (60s accetta/rifiuta) → missione → voto saltato se solo → risultati

### 6.3 Regia

1. `/#/t/:tableCode/admin`
2. Tab **Game**: fasi, candidati, hint mirati, storia, timer, asta portate
3. Tab **Reception**: lista partecipanti, validazione ticket, forza inizio
4. Link rapidi: Gioco, Utente, Reception, MC, Attore

### 6.4 Reception

1. Login Supabase admin (JWT con `app_metadata.role = admin`)
2. Scanner QR → `redeem-ticket` edge function
3. Ticket marcato usato, partecipante validato

### 6.5 MC

1. `/#/admin` — pannello presentatore
2. Cambio fase evento (4 portate) con conferma
3. Monitor saldi BBL e segreti fazione (solo MC)
4. Link “Vista Utente” → player-panel

### 6.6 Fazione (tavolo)

1. QR con `?story=...&faction=...` o localStorage
2. `/#/t/:tableCode/player-panel`
3. Segreto (hold-to-reveal), fase evento, trasferimento gettoni
4. Link ritorno MC

---

## 7. Funzionalità dettagliate

### 7.1 Splash (`SplashScreen`)

- Branding “A Cena Col Bugiardo”
- Logo, feature pills con `BrandIcon`
- CTA “Inizia partita” → join flow
- Footer Black Bulls Lab

### 7.2 Join (`JoinGame`)

| Flusso | Descrizione |
|--------|-------------|
| **Ticket** | Upsert `participants` → pending / validated / seated |
| **Attesa** | Realtime su UPDATE partecipante |
| **Tavolo** | Simulazione scan QR → seated |
| **Ospite** | “GIOCA SUBITO” — bypass ticket, registrazione diretta |

Persistenza join: `sessionStorage.liar_join_state`

### 7.3 Gioco — Fasi (`GameScreen`)

| Fase | ID | Comportamento |
|------|-----|---------------|
| Lobby | `waiting` | Lista giocatori; min 1; avvio sessione |
| Scelta bugiardo | `liar_selection` | Candidato random; 60s accetta/rifiuta; passa ad altro se rifiuta/timeout |
| Scelta complice | `accomplice_selection` | Stessa logica 60s; skip auto se nessun eleggibile |
| Missione | `mission` | Storia attiva, hint regia, timer, portate/asta |
| Voto | `vote` | Voto per altro giocatore; skip UI se solo |
| Risultato | `result` | Tally voti, reveal bugiardo |

**Ruoli:** innocente, bugiardo, complice

**Regole scelta ruolo:**
- Durata decisione: **60 secondi** (`ROLE_CHOICE_DURATION`)
- Rifiuto o timeout → `pickNextCandidate()` esclude candidato corrente
- Accetta bugiardo → `currentLiar` + fase complice
- Accetta complice → `currentAccomplice` + missione

### 7.4 Dashboard Regia (`Dashboard`)

**Tab Game**
- Lista giocatori con azioni: proponi candidato, imposta bugiardo
- Editor storia + timer missione
- Hint mirati: tutti / tavolo / giocatore (`adminHint`)
- Controllo portate (`course_stage`) e asta (`auction_bid`, `auction_leader`)
- Cambio fase manuale
- Log live sessione
- Reset sessione

**Tab Reception**
- Conteggio prenotazioni pagate (`bookings`)
- Lista `participants` con validazione (nome + tavolo)
- Forza inizio game

**Navigazione:** Gioco, Utente, Reception, MC, Attore

### 7.5 MC Panel (`MCPanel`)

| Fase MC | Sottotitolo |
|---------|-------------|
| 1 Antipasto | Avvia Ricatti |
| 2 Primo Piatto | Asta Indizi |
| 3 Secondo Piatto | Interrogatorio |
| 4 Dolce & Fine | Votazione Finale |

- Scrive `game_state.current_phase` (row id=1)
- Monitor `factions`: saldo BBL, `group_secret`
- Modal conferma cambio fase
- Link Regia + Vista Utente

### 7.6 Actor Panel (`ActorPanel`)

- 5 fasi narrative (diverse numerazione da MC — stesso campo DB)
- Avanzamento fase + stepper
- Realtime `game_state`

### 7.7 Player Panel (`PlayerPanel`)

**Prerequisiti:** `story` + `faction` in URL o localStorage

- Story title/intro da tabella `stories`
- Obiettivi per fase (`game_state.current_phase`)
- Segreto fazione (press-and-hold reveal)
- Saldo BBL con toast su accredito
- Bottom sheet trasferimento gettoni → RPC `transfer_tokens`
- Link pannello MC

### 7.8 Reception Scanner (`ReceptionScanner`)

- `BarcodeDetector` camera o input manuale
- Invoke `redeem-ticket` con bearer token admin
- Aggiorna ticket/participant/session

---

## 8. Modello dati

### 8.1 Sessione tavolo (`game_sessions`)

| Campo (DB) | Campo app | Descrizione |
|------------|-----------|-------------|
| `table_code` | `table_code` | Identificativo tavolo (default `BBL-QR-7`) |
| `phase` | `phase` | Fase corrente gioco |
| `current_liar` | `currentLiar` | Giocatore bugiardo |
| `current_candidate` | `currentCandidate` | Candidato scelta ruolo |
| `current_accomplice` | `currentAccomplice` | Complice |
| `active_story` | `activeStory` | Testo missione |
| `admin_hint` | `adminHint` | Hint JSON (targetType, targetId, text) |
| `timer_duration` | `timer_duration` | Secondi timer |
| `course_stage` | `course_stage` | Portata cena (1–3) |
| `auction_bid` | `auction_bid` | Offerta asta corrente |
| `auction_leader` | `auction_leader` | Leader asta |
| `players` | `players` | Array JSON (fallback) |
| `votes` | `votes` | Mappa voti (fallback) |
| `logs` | `logs` | Array log (fallback) |

**Schema normalizzato** (`VITE_USE_NORMALIZED_SCHEMA=true`):
- `game_players`, `game_votes`, `game_logs` per `table_code`

### 8.2 Evento / fazioni

| Tabella | Uso |
|---------|-----|
| `game_state` | Fase evento globale (`current_phase`, id=1) |
| `factions` | Tavoli/fazioni: nome, gettoni, segreto |
| `stories` | Narrativa serata |
| `participants` | Check-in: ticket, nome, tavolo, status |
| `bookings` | Prenotazioni pagate |
| `tickets` | Master ticket |

### 8.3 Stati partecipante

```
pending → validated → seated
```

Ospite: direttamente `seated` con `ticket_id` `GUEST-*`

---

## 9. Requisiti non funzionali

| Area | Requisito |
|------|-----------|
| **Performance** | First paint < 3s su 4G; lazy route loading |
| **Realtime** | Supabase channels per session, players, votes, factions |
| **Mobile** | `min-h-dvh`, touch targets ≥ 48px, bottom sheet iOS-style |
| **Accessibilità** | `aria-label` su controlli principali; focus visible |
| **Sicurezza** | CSP Netlify; camera solo per scanner; RLS Supabase |
| **i18n** | UI in italiano (v1) |
| **Offline** | Non supportato (richiega connessione) |

---

## 10. Stack tecnico

| Layer | Tecnologia |
|-------|------------|
| Frontend | React 19, Vite 8, Tailwind 3, Framer Motion |
| Routing | react-router-dom 7, HashRouter |
| Backend | Supabase (Postgres, Realtime, Auth, Edge Functions) |
| Deploy | Netlify (`npm run build` → `dist`) |
| Test | Vitest, Testing Library |
| Icons | BrandIcon (SVG custom) + Lucide via AppIcon |

### Variabili ambiente

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_USE_NORMALIZED_SCHEMA=true
```

Edge function secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGINS`

### Migrazioni SQL (repo)

- `phase2_normalized_schema.sql` — tabelle normalizzate
- `phase3_rls.sql` / `phase4_hardened_rls.sql` — permessi
- `phase5_dinner_auction.sql` — colonne asta/portate

---

## 11. Design system

### Token CSS (`index.css`)

- Background scuro `#0b0f14`
- Accent rosso `#dc2626`
- Gold premium `#f5c542`
- Font: Inter (body), Syne (display), Roboto Mono (dati)

### Componenti chiave

- `BentoCard`, `PowerButton`, `BackgroundEffects`
- `BrandIcon` — icone oro/rosso/noir
- `AppIcon` — wrapper Lucide premium
- `LiarChoiceScreen` — accetta/rifiuta ruolo + timer
- `TimerBar` — countdown visuale

---

## 12. Route map

```
/#/                                    Splash
/#/t/:tableCode/join                   Join (ticket / ospite)
/#/t/:tableCode/game                   Gioco bugiardo
/#/t/:tableCode/admin                  Dashboard regia
/#/t/:tableCode/admin/login            Redirect → admin
/#/t/:tableCode/scanner-reception       Scanner QR
/#/t/:tableCode/player-panel           Pannello fazione
/#/t/:tableCode/actor                  Pannello attore
/#/admin                               Pannello MC
```

---

## 13. Criteri di accettazione (release)

### Gioco

- [ ] Ospite può entrare e giocare da solo end-to-end
- [ ] Candidato bugiardo vede Accetta/Rifiuta con timer 60s
- [ ] Rifiuto/timeout passa a altro giocatore
- [ ] Fasi sincronizzate realtime tra 2+ browser stesso `table_code`
- [ ] Hint regia visibili ai target corretti

### Operazioni

- [ ] Reception scansiona ticket con admin autenticato
- [ ] Regia valida partecipante pending
- [ ] MC cambia fase con conferma
- [ ] Player panel trasferisce gettoni

### Qualità

- [ ] `npm run lint` senza errori
- [ ] `npm run test:run` passa
- [ ] `npm run build` successo
- [ ] Deploy Netlify con env configurate

---

## 14. Roadmap suggerita

### P0 — Stabilità

- Implementare login admin reale (form + guard su Dashboard)
- Unificare o documentare mapping `table_code` ↔ `faction_id`
- Allineare fasi MC (4) vs Attore (5)

### P1 — UX

- Notifiche push/in-app su cambio fase
- Storico partite e classifica (`leaderboard` brand icon)
- Prenotazione tavolo integrata

### P2 — Piattaforma

- Bridge `game_sessions.phase` ↔ `game_state.current_phase`
- Analytics serata (partecipanti, durata fasi)
- PWA / installabile

---

## 15. Rischi e limitazioni note

| Rischio | Impatto | Mitigazione |
|---------|---------|-------------|
| Dual system non sincronizzato | Confusione staff | Training + roadmap unificazione |
| Dashboard senza auth UI | Accesso non autorizzato | P0 login + RLS |
| `faction_id` ≠ `table_code` | Dati missione errati | Convenzione naming o mapping table |
| Schema parziale in repo | Deploy incompleto | Documentare SQL mancante in Supabase |
| Hash routing | SEO limitato | Accettabile per app evento |

---

## 16. Glossario

| Termine | Significato |
|---------|-------------|
| **BBL Coins** | Gettoni virtuali fazione |
| **Regia** | Operatore tavolo / game master |
| **MC** | Presentatore sala |
| **Bugiardo** | Giocatore che mente sulla storia |
| **Complice** | Alleato del bugiardo |
| **Portata** | Fase cena in-game (`course_stage`) |
| **Hint** | Messaggio dalla regia ai giocatori |

---

## 17. Riferimenti codice

| Area | Path |
|------|------|
| Entry + routes | `src/App.jsx` |
| Session hook | `src/hooks/useGameSession.js`, `useSupabaseSession.js` |
| Fasi gioco | `src/lib/constants.js` |
| Scelta ruolo | `src/utils/roleSelection.js` |
| Normalizzazione DB | `src/lib/sessionShape.js` |
| Brand icons | `src/components/icons/BrandIcon.jsx` |
| Deploy | `netlify.toml` |
| Edge ticket | `supabase/functions/redeem-ticket/` |
| Agent memory | `CLAUDE.md` |
