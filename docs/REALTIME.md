# Realtime Plan

## Topics

- `game:{game_id}`: wake-up privato condiviso per lo stato lifecycle/phase del Game.

Producer: trigger PostgreSQL dopo una modifica reale a lifecycle, narrative phase o inserimento Player. Consumer: Regia collegata. Evento `game_state_changed`; payload `{ "kind": "game_state_changed" }`, senza valori autoritativi.

## Flow

RPC command commit → Broadcast → Regia refetch `get_staff_game_overview()` → aggiorna UI. Eventi persi non cambiano autorità: reconnect/refetch iniziale riallinea lo snapshot.

## Authorization and resilience

Il topic è private e il receive è autorizzato su `realtime.messages`: Staff attivo per ogni Game; Player corrente solo per il proprio Game. Non esiste policy client `INSERT`, quindi i client non possono broadcastare. Unsubscribe su unmount/game change/logout; una subscription per topic/key.

Realtime comunica cambiamento, non stato. Nessun polling o Presence in questa milestone; il fallback è il refetch iniziale/azione manuale della Regia.
