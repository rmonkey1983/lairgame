export type GameStatus = 'waiting' | 'started' | 'running' | 'finished';

export interface Game {
  id: string; // UUID
  status: GameStatus;
  started_at: string | null; // TIMESTAMPTZ (ISO String) o null se non avviato
  join_code: string; // Codice unico per unirsi alla partita
  scenario_id: string | null; // UUID del set di regole collegato a events_engine
  current_liar: string | null; // Nome del Bugiardo attivo (aggiornato dalla Regia)
  phase: string | null; // Fase corrente della partita (es. 'liar_selection', 'game', ecc.)
  created_at: string; // TIMESTAMPTZ (ISO String)
}

export interface Player {
  id: string; // UUID
  game_id: string; // UUID (Foreign Key a games)
  nickname: string;
  posto_tavola: number;
  is_target: boolean;
  is_liar: boolean;
  is_accomplice: boolean;
  created_at: string; // TIMESTAMPTZ (ISO String)
}

export interface Vote {
  id: string;
  game_id: string;
  player_id: string | null;
  motivazione: string;
  created_at: string;
}

export interface TimelineEventButton {
  label: string;
  action: string;
}

export type TimelineEventType = 'message' | 'dilemma' | 'vote' | string;

export interface TimelineEventPayload {
  type: TimelineEventType;
  title: string;
  message: string;
  buttons?: TimelineEventButton[]; // Array opzionale di bottoni
  duration_seconds?: number; // Durata opzionale dell'evento
}

export interface TimelineEvent {
  id: string; // UUID
  game_id: string | null; // UUID (Foreign Key a games, null per eventi globali di template)
  minute_trigger: number; // Minuto in cui scatta l'evento
  target_logic: string; // Logica di target (es. 'all', 'target_player', ecc.)
  payload: TimelineEventPayload; // Struttura flessibile tipizzata
  created_at: string; // TIMESTAMPTZ (ISO String)
}

export interface EngineRule {
  id: string;
  scenario_id: string;
  trigger_logic: Record<string, unknown>;
  action_logic: TimelineEventPayload;
  target_logic: Record<string, unknown>;
  created_at: string;
}

export interface GameLog {
  id: string; // UUID
  game_id: string; // UUID (Foreign Key a games)
  player_id: string | null; // UUID (Foreign Key a players, null se azione di sistema o giocatore rimosso)
  action_type: string; // Tipo di azione (es. 'join', 'vote_cast', 'dilemma_resolved')
  action_data: Record<string, unknown>; // Payload flessibile dell'azione
  created_at: string; // TIMESTAMPTZ (ISO String)
}
