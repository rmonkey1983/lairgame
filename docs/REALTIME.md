# Realtime Plan

## Topics

- `game:{game_id}:player:{player_id}:out`: wake-up privato Player.
- `game:{game_id}:staff:out`: wake-up privato Staff autorizzato.

Producer: RPC/transaction dopo commit. Consumer: rispettivo terminale/control room. Payload: event type, scope minimo, schema version e invalidation hint; mai ruolo, clue, voto o dati personali.

## Flow

RPC command commit → Broadcast → client deduplica → refetch snapshot autorizzato → aggiorna UI. Eventi persi non cambiano autorità: reconnect esegue refetch completo bounded.

## Authorization and resilience

Private channels autorizzati secondo membership/Player ownership. Unsubscribe su unmount/game change/logout; una subscription per topic/key; backoff reconnect con limite e health indicator. Duplicati innocui tramite event id/client dedupe, ma command idempotency resta server-side.

Realtime comunica cambiamento, non stato. Fallback operativo: refresh manuale e refetch/polling limitato, da calibrare prima del live.
