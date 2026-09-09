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
