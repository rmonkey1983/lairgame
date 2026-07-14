import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Game, GameStatus, TimelineEvent, TimelineEventPayload } from '../types/database.types';

export interface UseGameEngineResult {
  game: Game | null;
  currentEvent: TimelineEventPayload | null;
  loading: boolean;
  error: string | null;
}

/**
 * Custom Hook per gestire lo stato in tempo reale di una partita (Client Component).
 * Si iscrive ai cambiamenti della partita e ai nuovi eventi della timeline.
 */
export function useGameEngine(gameId: string, playerId: string): UseGameEngineResult {
  const [game, setGame] = useState<Game | null>(null);
  const [currentEvent, setCurrentEvent] = useState<TimelineEventPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gameId) return;

    let isMounted = true;

    // 1. Carica lo stato iniziale della partita e l'ultimo evento della timeline
    const loadInitialState = async () => {
      try {
        setLoading(true);

        // Fetch dati partita
        const { data: gameData, error: gameError } = await supabase
          .from('games')
          .select('*')
          .eq('id', gameId)
          .single();

        if (gameError) throw gameError;

        if (isMounted) {
          setGame(gameData as Game);
        }

        // Fetch ultimo evento scattato per questa partita
        const { data: eventData, error: eventError } = await supabase
          .from('timeline_events')
          .select('*')
          .eq('game_id', gameId)
          .order('created_at', { ascending: false })
          .limit(1);

        // Non lanciamo errore se non ci sono ancora eventi
        if (!eventError && eventData && eventData.length > 0 && isMounted) {
          setCurrentEvent((eventData[0] as TimelineEvent).payload);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Errore nel caricamento dei dati di gioco');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadInitialState();

    // 2. Setup Canale Realtime Supabase
    // Utilizza filtri specifici a livello di database per limitare il traffico di rete
    const channel = supabase
      .channel(`game_channel:${gameId}`)
      // Sottoscrizione agli UPDATE della partita corrente
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          if (isMounted) {
            setGame(payload.new as Game);
          }
        }
      )
      // Sottoscrizione ai nuovi eventi timeline (INSERT) per la partita corrente
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'timeline_events',
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          if (isMounted) {
            const newEvent = payload.new as TimelineEvent;
            setCurrentEvent(newEvent.payload);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error(`Errore di connessione realtime per la partita: ${gameId}`);
        }
      });

    // Cleanup: Disconnette il canale e previene memory leak al blocco schermo/unmount
    return () => {
      isMounted = false;
      channel.unsubscribe();
    };
  }, [gameId, playerId]);

  return {
    game,
    currentEvent,
    loading,
    error,
  };
}
