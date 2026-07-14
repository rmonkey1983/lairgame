import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { mockDb } from '../lib/mockDb';
import type { TimelineEvent } from '../types/database.types';

interface UseAdminMetronomeResult {
  isActive: boolean;
  isTicking: boolean;
  lastTickTime: Date | null;
  error: string | null;
  start: () => void;
  stop: () => void;
}

/**
 * Custom Hook React per l'Admin Dashboard.
 * Gestisce il tempo trascorso ed esegue il calcolo dei tick del metronomo lato client,
 * interrogando ed inserendo i dati direttamente su Supabase (senza API serverless).
 */
export function useAdminMetronome(
  gameId: string | null,
  startedAt: string | null,
  gameStatus: string | undefined,
  intervalMs: number = 10000
): UseAdminMetronomeResult {
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isTicking, setIsTicking] = useState<boolean>(false);
  const [lastTickTime, setLastTickTime] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isProcessingRef = useRef<boolean>(false);
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef<boolean>(true);

  // Forza l'impostazione di montaggio
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Esegue il calcolo del tick temporale direttamente sul client Supabase
  const triggerTick = useCallback(async () => {
    if (!gameId || !startedAt || gameStatus !== 'started') return;
    if (isProcessingRef.current) return; // Anti-sovrapposizione in caso di connessione instabile

    isProcessingRef.current = true;
    if (isMountedRef.current) setIsTicking(true);

    try {
      // 1. Calcola i minuti passati
      const startTime = new Date(startedAt).getTime();
      const now = new Date().getTime();
      const elapsedMinutes = Math.floor((now - startTime) / 60000);

      // Supporto modalità MOCK
      if (mockDb.isMock) {
        console.log(`[Metronomo Mock] Minuto: ${elapsedMinutes}. Ricerca eventi...`);
        // Simula il trigger locale se necessario
        isProcessingRef.current = false;
        if (isMountedRef.current) {
          setIsTicking(false);
          setLastTickTime(new Date());
        }
        return;
      }

      // 2. Cerca se ci sono template di eventi registrati per questo minuto esatto (game_id è nullo)
      const { data: templateEvents, error: templateError } = await supabase
        .from('timeline_events')
        .select('*')
        .eq('minute_trigger', elapsedMinutes)
        .is('game_id', null);

      if (templateError) throw templateError;

      if (templateEvents && templateEvents.length > 0) {
        for (const template of templateEvents) {
          // 3. Verifica se l'evento è già stato attivato per questa partita
          const { data: alreadySent, error: checkError } = await supabase
            .from('timeline_events')
            .select('id')
            .eq('game_id', gameId)
            .eq('minute_trigger', elapsedMinutes)
            .maybeSingle();

          if (checkError) throw checkError;

          if (!alreadySent) {
            // 4. Clona l'evento associandolo a questo gameId per attivare il Realtime dei client
            const { error: insertError } = await supabase
              .from('timeline_events')
              .insert({
                game_id: gameId,
                minute_trigger: elapsedMinutes,
                target_logic: template.target_logic,
                payload: template.payload
              });

            if (insertError) {
              // Salta l'errore se dovuto a vincolo di unicità concorrente
              if (insertError.code === '23505') continue;
              throw insertError;
            }

            // 5. Scrive il log di avvenuto innesco nella tabella game_logs
            await supabase.from('game_logs').insert({
              game_id: gameId,
              action_type: 'timeline_event_triggered',
              action_data: {
                minute: elapsedMinutes,
                event_id: template.id,
                type: template.payload?.type || 'unknown'
              }
            });
          }
        }
      }

      if (isMountedRef.current) {
        setLastTickTime(new Date());
        setError(null);
      }
    } catch (err: any) {
      console.error('Errore durante il ciclo del metronomo:', err);
      if (isMountedRef.current) {
        setError(err.message || 'Errore di connessione a Supabase');
      }
    } finally {
      isProcessingRef.current = false;
      if (isMountedRef.current) setIsTicking(false);
    }
  }, [gameId, startedAt, gameStatus]);

  // Avvio manuale
  const start = useCallback(() => {
    if (isActive) return;
    setIsActive(true);
  }, [isActive]);

  // Arresto manuale
  const stop = useCallback(() => {
    setIsActive(false);
  }, []);

  // Gestione dell'innesco automatico del loop ad intervalli regolari
  useEffect(() => {
    if (!isActive || gameStatus !== 'started') {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
      return;
    }

    // Esegue il primo tick immediato all'innesco
    triggerTick();

    intervalIdRef.current = setInterval(() => {
      triggerTick();
    }, intervalMs);

    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
    };
  }, [isActive, gameStatus, intervalMs, triggerTick]);

  return {
    isActive,
    isTicking,
    lastTickTime,
    error,
    start,
    stop,
  };
}
