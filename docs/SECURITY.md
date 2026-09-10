# Security

## Threat model

Assumere player curioso, sessione anonima rubata, client manipolato, replay/doppio click, tab duplicata, staff revocato e Realtime intercettato. PostgreSQL resta autorità; UI non è confine di sicurezza.

## Controls

- RLS deny-by-default e membership/ownership esplicite.
- Anonymous Auth per Player; `auth_user_id` vincola identità.
- Staff Auth persistente + membership attiva + game selector esplicito.
- Ruoli, mission private, clue, voti e dati Regia restituiti solo da RPC audience-scoped.
- Service-role key e secret mai nel browser.
- Commands transazionali con preconditions, idempotency e audit.
- Ledger append-only; compensazione per correzioni, mai overwrite.
- Broadcast privato, payload minimo, nessun segreto.

## Privacy and recovery

Non usare localStorage per ruoli o autorità. Session recovery/rebind deve verificare prova di possesso e intervento Regia senza rivelare segreti. Retention, export/delete e modello threat dettagliato restano decisioni da approvare.

## Security gates

Test matrix RLS anonimo/player/staff/revoked; RPC authorization e replay; leak scans snapshot/Broadcast/log; secret scan; browser storage inspection; headers e configurazione deploy. Build verde non equivale a security validation.

## Client environment and recovery

Ogni `VITE_*` è pubblico nel browser. Nessun secret, token o credenziale entra in env client. Errori tecnici non sono messaggi UI. Recovery/rebind Player conserva identity logica, game, tavolo/posto e ruolo; approvazione futura Staff, enforcement server-side e audit restano obbligatori.

## Database baseline

Lo schema è migration-first e ricostruibile con `supabase db reset`; non sono ammesse modifiche manuali via Studio. Le tabelle core hanno RLS obbligatoria e grants espliciti: `anon` e `authenticated` non hanno CRUD diretto. Il Join usa solo RPC `SECURITY DEFINER` con `search_path = ''`, grant `EXECUTE` esclusivo ad `authenticated` e verifica obbligatoria del claim `is_anonymous`.

Anonymous Auth usa ruolo Postgres `authenticated`, non ruolo `anon`. La sessione nasce solo su submit Join; refresh senza sessione non crea una nuova identity e richiede nuovo join/recovery. CAPTCHA/Turnstile, rate-limit review e cleanup anonymous sono production gate/deferred: Supabase non elimina automaticamente anonymous users, mentre FK `players.auth_user_id` è `RESTRICT` per preservare history.

Staff usa storage Auth separato dal Player, login esclusivamente email/password e autorizzazione server-side tramite `staff_members.auth_user_id = auth.uid()` con `active = true`. Authentication non equivale a Staff authorization. Logout Staff usa scope locale; credenziali Admin API restano solo in helper/dev server-side, mai in `VITE_*` o browser.

Le funzioni privilegiate `SECURITY DEFINER` non risiedono in schemi esposti alla Data API. Join e access gate espongono wrapper `SECURITY INVOKER` in `public`, delegando a implementazioni nello schema `private`, con `SET search_path = ''`, riferimenti qualificati e grant `EXECUTE` minimo. `private` non è esposto in `supabase/config.toml` e non concede usage a `anon`.

Il read model Staff mantiene lo stesso confine: wrapper pubblici invoker, implementazioni private definer con `search_path = ''`, execute solo ad `authenticated`. Nessun roster, auth ID o dato gameplay è restituito; gli errori RPC sono mappati in messaggi user-safe.

Il lifecycle command autorizza nuovamente la membership Staff attiva nel database, non accetta identità privilegiate dal browser e non concede `UPDATE` diretto su `games`. Il lock di riga protegge la verifica dello stato atteso; `command_id` impedisce duplicati e il record audit viene scritto nella stessa transazione della mutazione.
