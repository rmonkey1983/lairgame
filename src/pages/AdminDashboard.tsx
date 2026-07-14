import { useState, useEffect, useRef, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import type { Game, Player } from '../types/database.types';
import { NeuButton } from '../components/NeuButton';
import { storyPresets } from '../data/storyPresets';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Users, 
  Target, 
  Radio, 
  Plus, 
  Trash2, 
  VolumeX, 
  Activity, 
  Terminal, 
  Cpu, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  FileText, 
  Send,
  Skull,
  Shield,
  Eye,
  Settings,
  HelpCircle,
  Clock,
  Sparkles,
  Lock,
  Layers
} from 'lucide-react';

/**
 * AdminDashboard - Plancia di Regia (Next.js Client Component / Vite React)
 * Gestisce l'avvio della partita, il metronomo temporale client-side,
 * l'iniezione manuale di trigger ed il log degli eventi in tempo reale.
 */
const LOCAL_TIMELINE_EVENTS = [
  {
    minute_trigger: 5,
    target_logic: 'all',
    payload: {
      type: 'dilemma',
      title: 'Tradimento Rapido',
      message: 'Un complice segreto ha nascosto delle informazioni cruciali. Vuoi accusare pubblicamente un sospettato o proteggere il tavolo?',
      buttons: [
        { label: 'Accusa', action: 'accuse' },
        { label: 'Proteggi', action: 'protect' }
      ],
      duration_seconds: 45
    }
  },
  {
    minute_trigger: 10,
    target_logic: 'target_player',
    payload: {
      type: 'alert',
      title: 'Isolamento Target',
      message: 'Sei stato isolato dal canale di comunicazione principale. Mantieni la calma e attendi istruzioni.',
      duration_seconds: 30
    }
  }
];

export default function AdminDashboard() {
  const { tableCode } = useParams<{ tableCode?: string }>();
  const routeJoinCode = tableCode?.trim().toUpperCase();

  // Input per selezionare/connettere il codice partita della serata
  const [joinCode, setJoinCode] = useState<string>(routeJoinCode || 'TORINO44');
  const [gameId, setGameId] = useState<string>('');
  const [game, setGame] = useState<Game | null>(null);

  // Stati locali di monitoraggio richiesti
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameStatus, setGameStatus] = useState<string>('waiting');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [elapsedMinutes, setElapsedMinutes] = useState<number>(0);
  const [elapsedTimeStr, setElapsedTimeStr] = useState<string>('00:00');
  const [engineRules, setEngineRules] = useState<any[]>([]);
  const [liveVotes, setLiveVotes] = useState<any[]>([]);

  // Stati per il No-Code Pattern Builder
  const [newRuleMinute, setNewRuleMinute] = useState<string>('');
  const [newRuleTitle, setNewRuleTitle] = useState<string>('');
  const [newRuleMessage, setNewRuleMessage] = useState<string>('');
  const [newRuleButtons, setNewRuleButtons] = useState<string>('');
  const [newRuleTarget, setNewRuleTarget] = useState<string>('all');
  const [targetRole, setTargetRole] = useState<'liar' | 'accomplice'>('liar');
  const [targetPlayerId, setTargetPlayerId] = useState<string>('');
  const [activeLiarId, setActiveLiarId] = useState<string | null>(null);
  const [activeAccompliceId, setActiveAccompliceId] = useState<string | null>(null);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');

  // Stati per l'Interfaccia Neurale (Claudia)
  const [aiProposal, setAiProposal] = useState<{ title: string; message: string; buttons: string[] } | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);

  // Stati per iniezione manuale di trigger
  const [forceTarget, setForceTarget] = useState<string>('all');
  const [forceMessage, setForceMessage] = useState<string>('');

  // Log di sistema
  const [logs, setLogs] = useState<string[]>(['Sistema in attesa di connessione partita...']);
  const [sentMinutes, setSentMinutes] = useState<number[]>([]);

  // Stati di caricamento
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [liarPlayer, setLiarPlayer] = useState<any>(null);
  const [accomplicePlayer, setAccomplicePlayer] = useState<any>(null);
  const [liarReady, setLiarReady] = useState<boolean>(false);

  // Stati per il Dispiego Missioni
  const [truthText, setTruthText] = useState<string>('');
  const [lieText, setLieText] = useState<string>('');

  // Riferimenti per i timer e gli stati locali
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const broadcastChannelRef = useRef<any>(null);
  const channelRef = useRef<any>(null);
  const sentMinutesRef = useRef<number[]>([]);
  // connectedNodesRef: snapshot aggiornato dei giocatori per le funzioni chiamate dentro listener Realtime
  // (evita stale closures). Include is_liar per escludere il Bugiardo dal pool Complici.
  const connectedNodesRef = useRef<{ id: string; name: string; table_number: number; is_liar: boolean }[]>([]);
  const excludedTablesRef = useRef<string[]>([]);
  const accompliceExcludedTablesRef = useRef<string[]>([]);
  // Timer auto-skip: se il giocatore non risponde entro 45s, la Regia passa automaticamente al successivo
  const liarProposalTimerRef = useRef<NodeJS.Timeout | null>(null);
  const accompliceProposalTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (routeJoinCode) {
      setJoinCode(routeJoinCode);
    }
  }, [routeJoinCode]);

  // Sincronizza players con connectedNodesRef, includendo is_liar e is_accomplice per la selezione Complice e filtri target
  useEffect(() => {
    connectedNodesRef.current = players.map(p => ({
      id: p.id,
      name: p.nickname,
      table_number: p.posto_tavola,
      is_liar: p.is_liar,
      is_accomplice: p.is_accomplice
    }));
  }, [players]);

  // Gestione autoscroll Data Log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Aggiunge una riga di testo nel box Data Log
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  };

  // 0. Carica in memoria le regole dall'engine di gioco (events_engine) per lo scenario attivo
  const loadEngineRules = async () => {
    if (!gameId) return;
    try {
      const formattedCode = joinCode.trim().toUpperCase();
      // 1. Query games per trovare lo scenario_id
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('scenario_id')
        .eq('join_code', formattedCode)
        .maybeSingle();

      if (gameError) throw gameError;
      if (!gameData || !gameData.scenario_id) {
        console.warn(`[DEBUG ENGINE] Nessun scenario_id configurato per la partita ${formattedCode}`);
        return;
      }

      setScenarioId(gameData.scenario_id);
      console.log(`[DEBUG ENGINE] Recuperato scenario_id: ${gameData.scenario_id}. Caricamento regole...`);

      // 2. Query events_engine per le regole di quel scenario_id
      const { data: rulesData, error: rulesError } = await supabase
        .from('events_engine')
        .select('*')
        .eq('scenario_id', gameData.scenario_id);

      if (rulesError) throw rulesError;

      setEngineRules(rulesData || []);
      addLog(`ENGINE: Caricate con successo ${rulesData?.length || 0} regole dal motore di gioco.`);
    } catch (err: any) {
      console.error('[DEBUG ENGINE] Errore durante il caricamento delle regole:', err);
      addLog(`ERRORE CARICAMENTO REGOLE: ${err.message || 'connessione'}`);
    }
  };

  // Trigger caricamento delle regole dell'engine
  useEffect(() => {
    if (gameId && (gameStatus === 'running' || gameStatus === 'started')) {
      loadEngineRules();
    }
  }, [gameStatus, gameId]);

  // 1. Carica o Crea la partita basandosi sul join_code
  const handleLoadOrCreateGame = async () => {
    if (!joinCode.trim()) return;
    setLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);

    const formattedCode = joinCode.trim().toUpperCase();

    try {
      // Cerca la partita
      let { data: existingGame, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('join_code', formattedCode)
        .maybeSingle();

      if (gameError) throw gameError;

      if (!existingGame) {
        // Se non esiste, la crea istantaneamente (zero friction)
        const { data: newGame, error: createError } = await supabase
          .from('games')
          .insert({
            join_code: formattedCode,
            status: 'waiting'
          })
          .select()
          .single();

        if (createError) throw createError;
        existingGame = newGame;
        addLog(`Nuova partita ${formattedCode} creata.`);
      } else {
        addLog(`Partita ${formattedCode} connessa.`);
      }

      if (existingGame) {
        // Forza lo stato della partita a waiting e azzera il timer all'inizializzazione/connessione admin
        if (existingGame.status !== 'waiting' || existingGame.started_at !== null) {
          const { data: resetGame, error: resetErr } = await supabase
            .from('games')
            .update({
              status: 'waiting',
              started_at: null
            })
            .eq('id', existingGame.id)
            .select()
            .single();
          if (!resetErr && resetGame) {
            existingGame = resetGame;
          }
        }

        setGame(existingGame as Game);
        setGameId(existingGame.id);
        setGameStatus(existingGame.status);
        setScenarioId(existingGame.scenario_id || null);
        setIsRunning(false);
        setElapsedSeconds(0);
        setElapsedTimeStr('00:00');
        setElapsedMinutes(0);
        
        // Carica i giocatori già iscritti
        const { data: existingPlayers, error: playersError } = await supabase
          .from('players')
          .select('*')
          .eq('game_id', existingGame.id)
          .order('posto_tavola', { ascending: true });

        if (playersError) throw playersError;
        setPlayers((existingPlayers as Player[]) || []);
        addLog(`Caricati ${existingPlayers?.length || 0} nodi connessi.`);

        const checkLiarStatus = async () => {
          const { data } = await supabase
            .from('players')
            .select('id')
            .eq('game_id', existingGame.id)
            .eq('is_liar', true)
            .maybeSingle();
          if (data) setLiarReady(true);
          else setLiarReady(false);
        };
        checkLiarStatus();
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Impossibile connettere la partita.');
    } finally {
      setLoading(false);
    }
  };

  // Connessione automatica all'avvio
  useEffect(() => {
    handleLoadOrCreateGame();
  }, []);

  // 2. Iscrizione Realtime per gli INSERT dei giocatori
  useEffect(() => {
    if (!gameId) return;

    addLog('Attivazione ricevitore realtime nodi...');

    const channel = supabase
      .channel(`admin_realtime_players:${gameId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` },
        (payload) => {
          const newPlayer = payload.new as Player;
          setPlayers((prev) => {
            if (prev.some((p) => p.id === newPlayer.id)) return prev;
            const updated = [...prev, newPlayer].sort((a, b) => a.posto_tavola - b.posto_tavola);
            return updated;
          });
          addLog(`GIOCATORE CONNESSO: ${newPlayer.nickname} (Posto #${newPlayer.posto_tavola})`);
        }
      )
      // Ascolta anche gli update per intercettare l'isolamento (is_target)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` },
        (payload) => {
          const updatedPlayer = payload.new as Player;
          setPlayers((prev) =>
            prev.map((p) => (p.id === updatedPlayer.id ? updatedPlayer : p))
          );
          addLog(`AGGIORNAMENTO NODO: ${updatedPlayer.nickname} - Target: ${updatedPlayer.is_target ? 'SI' : 'NO'}`);
        }
      )
      // Ascolta le risposte dei giocatori salvate in votes
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'votes', filter: `game_id=eq.${gameId}` },
        (payload) => {
          const newVote = payload.new as any;
          const playerObj = connectedNodesRef.current.find((p) => p.id === newVote.player_id);
          const identity = playerObj
            ? `${playerObj.name} (P${playerObj.table_number})`
            : `ID ${newVote.player_id || 'Ignoto'}`;
          addLog(`[FEEDBACK] Il giocatore ${identity} ha scelto: ${newVote.motivazione || 'CONFERMA'}`);
          setLiveVotes((prev) => [...prev, newVote]);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          addLog('Ricevitore nodi e logs connesso con successo.');
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [gameId]);

  // 2.1. Inizializzazione Canale Broadcast Realtime per la partita
  useEffect(() => {
    if (!gameId) return;

    const channelName = `game-${joinCode || 'TORINO44'}`;
    const channel = supabase.channel(channelName);

    channel
      .on('broadcast', { event: 'response' }, ({ payload }) => {
        console.log(`[DEBUG BROADCAST RESPONSE] Ricevuta risposta:`, payload);
        addLog(`${payload.player_name || 'Giocatore'} (Posto #${payload.seat_number || '?'}) ha risposto: ${payload.action_text || 'CONFERMA'}`);
      })
      .on('broadcast', { event: 'LIAR_RESPONSE' }, async ({ payload }) => {
        console.log('[DEBUG BROADCAST LIAR_RESPONSE] Ricevuto:', payload);
        // Il giocatore ha risposto → annulla l'auto-skip
        if (liarProposalTimerRef.current) {
          clearTimeout(liarProposalTimerRef.current);
          liarProposalTimerRef.current = null;
        }
        if (!payload.accepted) {
          addLog(`RIFIUTO BUGIARDO: ${payload.player_name} (Tavolo ${payload.table_number}) ha rifiutato.`);
          excludedTablesRef.current.push(String(payload.table_number));
          setTimeout(() => { startLiarSelection(); }, 500);
        } else {
          addLog(`RUOLI: ${payload.player_name} (Tavolo ${payload.table_number}) ha ACCETTATO il ruolo!`);
          setLiarPlayer({
            player_name: payload.player_name,
            table_number: payload.table_number
          });
          setLiarReady(true);
          setActiveLiarId(payload.player_id || payload.target_id || payload.target || null);
          try {
            const { error: dbErr } = await supabase
              .from('players')
              .update({ is_liar: true })
              .eq('id', payload.player_id);
            if (dbErr) {
              console.error("Errore salvataggio Bugiardo:", dbErr);
              addLog(`Errore salvataggio Bugiardo nel DB: ${dbErr.message}`);
            } else {
              addLog(`RUOLO BUGIARDO SALVATO NEL DB.`);
            }

            if (gameId) {
              await supabase
                .from('games')
                .update({ current_liar: payload.player_name, phase: 'liar_selection' })
                .eq('id', gameId);
            }
          } catch (dbErr) {
            console.error('Errore nel salvare il Bugiardo nel DB:', dbErr);
          }
        }
      })
      .on('broadcast', { event: 'ACCOMPLICE_RESPONSE' }, async ({ payload }) => {
        console.log('[DEBUG BROADCAST ACCOMPLICE_RESPONSE] Ricevuto:', payload);
        // Il giocatore ha risposto → annulla l'auto-skip
        if (accompliceProposalTimerRef.current) {
          clearTimeout(accompliceProposalTimerRef.current);
          accompliceProposalTimerRef.current = null;
        }
        if (!payload.accepted) {
          addLog(`RIFIUTO COMPLICE: ${payload.player_name} (Tavolo ${payload.table_number}) ha rifiutato.`);
          accompliceExcludedTablesRef.current.push(String(payload.table_number));
          setTimeout(() => { startAccompliceSelection(); }, 500);
        } else {
          addLog(`RUOLI: ${payload.player_name} (Tavolo ${payload.table_number}) ha ACCETTATO il ruolo di Complice!`);
          setAccomplicePlayer({
            player_name: payload.player_name,
            table_number: payload.table_number
          });
          setActiveAccompliceId(payload.player_id || payload.target_id || payload.target || null);
          try {
            const { error: dbErr } = await supabase
              .from('players')
              .update({ is_accomplice: true })
              .eq('id', payload.player_id);
            if (dbErr) {
              console.error("Errore salvataggio Complice:", dbErr);
              addLog(`Errore salvataggio Complice nel DB: ${dbErr.message}`);
            } else {
              addLog(`RUOLO COMPLICE SALVATO NEL DB.`);
            }
          } catch (dbErr) {
            console.error('Errore nel salvare il Complice nel DB:', dbErr);
          }
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          addLog(`Canale broadcast radio '${channelName}' operativo.`);
        }
      });

    broadcastChannelRef.current = channel;
    channelRef.current = channel;

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
      broadcastChannelRef.current = null;
      channelRef.current = null;
    };
  }, [gameId, joinCode]);

  // 3. Loop orologio visivo (lato client, 1 secondo)
  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const updateTime = () => {
      setElapsedSeconds((prev) => {
        const next = prev + 1;
        const minutes = Math.floor(next / 60);
        const seconds = next % 60;
        const strMin = minutes < 10 ? `0${minutes}` : `${minutes}`;
        const strSec = seconds < 10 ? `0${seconds}` : `${seconds}`;
        setElapsedTimeStr(`${strMin}:${strSec}`);
        setElapsedMinutes(minutes);
        return next;
      });
    };

    timerRef.current = setInterval(updateTime, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  // Ottiene l'elenco dei nodi bersaglio in base alla tipologia di target ed eventuale ruolo specifico
  const getTargetNodes = (targetType: string, targetRoleVal?: string, targetPlayerIdVal?: string) => {
    const currentNodes = connectedNodesRef.current;
    if (targetType === 'all') {
      return currentNodes;
    }
    if (targetType === 'roles' || targetType === 'liar' || targetType === 'accomplice') {
      const role = targetType === 'roles' ? targetRoleVal : targetType;
      return currentNodes.filter(node => 
        role === 'liar' ? node.is_liar : node.is_accomplice
      );
    }
    if (targetType === 'target_player' || targetType === 'single' || targetType === 'target_player_id') {
      return currentNodes.filter(node => node.id === targetPlayerIdVal);
    }
    if (targetType.startsWith('player_')) {
      const seat = parseInt(targetType.replace('player_', ''), 10);
      return currentNodes.filter(node => node.table_number === seat);
    }
    // Se targetType non corrisponde a nessuna keyword ma corrisponde ad un ID giocatore valido
    const directMatch = currentNodes.filter(node => node.id === targetType);
    if (directMatch.length > 0) {
      return directMatch;
    }
    return currentNodes;
  };

  // 3.1. Metronomo autonomo al cambio del minuto con diagnostiche ed engine in-memory
  useEffect(() => {
    const checkTimeline = async () => {
      const currentMinute = Number(elapsedMinutes);

      if (!isRunning || currentMinute === 0) {
        return;
      }

      if (sentMinutes.includes(currentMinute)) {
        return;
      }

      console.log(`[DEBUG METRONOMO] Scattato minuto puro:`, currentMinute);

      // 1. Filtra le regole in-memory caricate da events_engine
      const matchedRules = engineRules.filter(
        (rule) =>
          rule.trigger_logic?.type === 'time' &&
          Number(rule.trigger_logic?.minute) === currentMinute
      );

      if (matchedRules && matchedRules.length > 0) {
        console.log(`[DEBUG ENGINE] Regole trovate per il minuto ${currentMinute}:`, matchedRules);

        for (const rule of matchedRules) {
          const actionLogic = rule.action_logic;
          if (actionLogic) {
            console.log(`[DEBUG BROADCAST ENGINE] Invio action_logic:`, actionLogic);

            // Spedisci via broadcast realtime mirato per ogni nodo target
            if (broadcastChannelRef.current) {
              const targetNodes = getTargetNodes(
                rule.target_logic?.type || 'all', 
                rule.target_logic?.role,
                rule.target_logic?.target_player_id
              );
              targetNodes.forEach(node => {
                broadcastChannelRef.current.send({
                  type: 'broadcast',
                  event: 'trigger',
                  payload: {
                    ...actionLogic,
                    target_id: node.id
                  }
                });
              });
              console.log(`[DEBUG BROADCAST ENGINE] Spedito broadcast mirato a ${targetNodes.length} nodi per minuto ${currentMinute}`);
            }

            setLogs(prev => [
              ...prev, 
              `[TIMELINE] Innesco automatico pattern per Minuto ${currentMinute}: ${actionLogic.title || 'Evento'}`
            ]);
          }
        }

        // Segna il minuto come inviato
        setSentMinutes(prev => [...prev, currentMinute]);
        sentMinutesRef.current.push(currentMinute);
      } else {
        // Fallback locale per robustezza in assenza di regole nel database
        const matchedEvents = LOCAL_TIMELINE_EVENTS.filter(ev => ev.minute_trigger === currentMinute);
        
        if (matchedEvents && matchedEvents.length > 0) {
          console.log(`[DEBUG FALLBACK LOCALE] Innesco evento di riserva per minuto ${currentMinute}:`, matchedEvents);
          for (const ev of matchedEvents) {
            if (broadcastChannelRef.current) {
              broadcastChannelRef.current.send({
                type: 'broadcast',
                event: 'trigger',
                payload: ev.payload
              });
            }

            setLogs(prev => [...prev, `[TIMELINE] Inviato automaticamente evento di fallback del Minuto ${currentMinute}`]);
          }
          setSentMinutes(prev => [...prev, currentMinute]);
          sentMinutesRef.current.push(currentMinute);
        } else {
          console.log(`[DEBUG ENGINE & FALLBACK] Nessuna regola/evento trovato per il minuto`, currentMinute);
        }
      }
    };

    checkTimeline();
  }, [elapsedMinutes, isRunning, engineRules, sentMinutes]);

  // Calcolo delle statistiche aggregate dei voti in tempo reale (Radar)
  const voteStats = useMemo(() => {
    const counts: Record<string, number> = {};
    liveVotes.forEach((vote) => {
      const choice = (vote.motivazione || 'RISPONDI').trim().toUpperCase();
      counts[choice] = (counts[choice] || 0) + 1;
    });
    const total = liveVotes.length;
    return Object.entries(counts).map(([label, count]) => ({
      label,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0
    }));
  }, [liveVotes]);

  const handleClearRadar = () => {
    setLiveVotes([]);
    addLog('RADAR PSICOLOGICO: Statistiche aggregate azzerate.');
  };

  // Creazione regola No-Code in events_engine
  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gameId) {
      setErrorMessage('Nessuna partita connessa.');
      return;
    }
    
    let activeScenarioId = scenarioId;
    if (!activeScenarioId) {
      try {
        const { data: gameData } = await supabase
          .from('games')
          .select('scenario_id')
          .eq('id', gameId)
          .single();
        if (gameData?.scenario_id) {
          activeScenarioId = gameData.scenario_id;
          setScenarioId(gameData.scenario_id);
        }
      } catch (err) {
        console.error('Errore nel ricavare scenario_id:', err);
      }
    }

    if (!activeScenarioId) {
      setErrorMessage('Nessuno scenario associato a questa partita. Impossibile salvare regole.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);

    const minuteVal = parseInt(newRuleMinute, 10);
    if (isNaN(minuteVal) || minuteVal < 0) {
      setErrorMessage('Inserisci un minuto di innesco valido.');
      setLoading(false);
      return;
    }

    // Split options by comma and trim whitespace
    const buttonsArray = newRuleButtons
      .split(',')
      .map(b => b.trim())
      .filter(b => b.length > 0);

    if (newRuleTarget === 'target_player' && !targetPlayerId) {
      toast.error('Seleziona un giocatore bersaglio prima di salvare!');
      setLoading(false);
      return;
    }

    const trigger_logic = {
      type: 'time',
      minute: minuteVal
    };

    const action_logic = {
      type: 'send_message',
      title: newRuleTitle.trim() || 'COMUNICAZIONE',
      message: newRuleMessage.trim(),
      buttons: buttonsArray
    };

    const target_logic = {
      type: newRuleTarget,
      role: newRuleTarget === 'roles' ? targetRole : undefined,
      target_player_id: newRuleTarget === 'target_player' ? targetPlayerId : undefined
    };

    try {
      const { error } = await supabase
        .from('events_engine')
        .insert({
          scenario_id: activeScenarioId,
          trigger_logic,
          action_logic,
          target_logic
        });

      if (error) throw error;

      addLog(`ENGINE: Nuova regola programmata per il minuto ${minuteVal}.`);
      setStatusMessage(`Regola salvata con successo per il minuto ${minuteVal}!`);

      // Reset form
      setNewRuleMinute('');
      setNewRuleTitle('');
      setNewRuleMessage('');
      setNewRuleButtons('');
      setNewRuleTarget('all');
      setTargetPlayerId('');

      // Ricarica le regole in memoria
      await loadEngineRules();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`Impossibile programmare l'evento: ${err.message || 'Errore database'}`);
    } finally {
      setLoading(false);
    }
  };

  // Caricamento rapido del preset 'Verità Scomode' bulk su events_engine
  const handleLoadPreset = async () => {
    if (!gameId) {
      setErrorMessage('Nessuna partita connessa.');
      return;
    }

    let activeScenarioId = scenarioId;
    if (!activeScenarioId) {
      try {
        const { data: gameData } = await supabase
          .from('games')
          .select('scenario_id')
          .eq('id', gameId)
          .single();
        if (gameData?.scenario_id) {
          activeScenarioId = gameData.scenario_id;
          setScenarioId(gameData.scenario_id);
        }
      } catch (err) {
        console.error('Errore nel ricavare scenario_id:', err);
      }
    }

    if (!activeScenarioId) {
      setErrorMessage('Nessuno scenario associato a questa partita. Impossibile caricare il preset.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);

    const presetData = [
      { trigger_time: 0, message: "Benvenuti nel Liar System. L'illusione di conoscersi è il più grande difetto umano. Tra pochi istanti riceverete un tratto psicologico oscuro. Tutti riceverete lo stesso, tranne il Bugiardo. Il vostro compito è scoprire chi sta fingendo.", buttons: ["SONO PRONTO", "HO QUALCOSA DA NASCONDERE"], target_logic: "ALL" },
      { trigger_time: 1200, message: "Il tempo dell'attesa è finito. Ognuno di voi, a turno, deve raccontare al tavolo come il tratto oscuro che ha ricevuto ha rovinato un rapporto nel suo passato. Chi resta sul vago, mente. Iniziate ora.", buttons: ["PARLO IO PER PRIMO", "ASCOLTO E ANALIZZO"], target_logic: "ALL" },
      { trigger_time: 3000, message: "Ho registrato micro-variazioni nel tono di voce. Qualcuno sta sudando freddo. Il Bugiardo ha evitato il contatto visivo per il 40% del tempo. Indica subito chi ti convince di meno.", buttons: ["IL MIO VICINO DI DESTRA", "IL MIO VICINO DI SINISTRA", "CHI MI STA DI FRONTE"], target_logic: "ALL" },
      { trigger_time: 4800, message: "La fiducia è un'illusione. Ti offro una via d'uscita: se premi il bottone rosso e accusi pubblicamente la persona alla tua destra, riceverai un indizio privato. Oserai farlo davanti a tutti?", buttons: ["ACCUSO PUBBLICAMENTE", "MANTENGO IL SEGRETO"], target_logic: "ALL" },
      { trigger_time: 6600, message: "L'esperimento è concluso. È il momento di emettere la sentenza. Chi ha indossato la maschera migliore stasera? Inserisci il nome del Bugiardo.", buttons: ["VAI AL VOTO"], target_logic: "ALL" }
    ];

    const dbPreset = presetData.map((item) => ({
      scenario_id: activeScenarioId,
      trigger_logic: {
        type: 'time',
        minute: Math.floor(item.trigger_time / 60)
      },
      action_logic: {
        type: 'send_message',
        title: 'VERITÀ SCOMODE',
        message: item.message,
        buttons: item.buttons
      },
      target_logic: {
        type: item.target_logic.toLowerCase()
      }
    }));

    try {
      const { error } = await supabase
        .from('events_engine')
        .insert(dbPreset);

      if (error) throw error;

      addLog(`ENGINE: Caricato preset 'VERITÀ SCOMODE' bulk (${dbPreset.length} eventi).`);
      setStatusMessage("Preset 'VERITÀ SCOMODE' caricato con successo!");
      
      // Ricarica le regole per visualizzarle sulla plancia
      await loadEngineRules();
      toast.success('Preset caricato con successo.');
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`Impossibile caricare il preset: ${err.message || 'Errore database'}`);
    } finally {
      setLoading(false);
    }
  };

  // Caricamento dei preset storia (missioni + regole scaletta eventi)
  const loadPreset = async () => {
    const preset = storyPresets.find(p => p.id === selectedPresetId);
    if (!preset) return;

    // 1. Carica le missioni globali
    setTruthText(preset.missions.truth);
    setLieText(preset.missions.lie);

    // 2. Mappa le regole per il DB / stato locale
    let activeScenarioId = scenarioId;
    if (!activeScenarioId && gameId) {
      try {
        const { data: gameData } = await supabase
          .from('games')
          .select('scenario_id')
          .eq('id', gameId)
          .single();
        if (gameData?.scenario_id) {
          activeScenarioId = gameData.scenario_id;
          setScenarioId(gameData.scenario_id);
        }
      } catch (err) {
        console.error('Errore nel recupero dello scenario_id:', err);
      }
    }

    const dbPreset = preset.events.map((e) => ({
      scenario_id: activeScenarioId || '00000000-0000-0000-0000-000000000000',
      trigger_logic: {
        type: 'time',
        minute: e.minute
      },
      action_logic: {
        type: 'send_message',
        title: e.title,
        message: e.payload,
        buttons: e.options.split(',').map(o => o.trim())
      },
      target_logic: {
        type: e.target === 'roles' ? 'roles' : e.target === 'single' ? 'target_player' : 'all',
        role: e.targetRole
      }
    }));

    if (activeScenarioId && gameId) {
      setLoading(true);
      try {
        // Pulisce regole preesistenti nello scenario
        await supabase
          .from('events_engine')
          .delete()
          .eq('scenario_id', activeScenarioId);

        const { error } = await supabase
          .from('events_engine')
          .insert(dbPreset);

        if (error) throw error;
        
        addLog(`ENGINE: Caricato preset "${preset.name}" nel DB (${dbPreset.length} eventi).`);
        await loadEngineRules();
      } catch (err: any) {
        console.warn("Impossibile salvare nel database, caricamento locale:", err);
        const localRules = dbPreset.map((r, idx) => ({
          ...r,
          id: `local-${idx}-${Date.now()}`
        }));
        setEngineRules(localRules);
      } finally {
        setLoading(false);
      }
    } else {
      const localRules = dbPreset.map((r, idx) => ({
        ...r,
        id: `local-${idx}-${Date.now()}`
      }));
      setEngineRules(localRules);
    }

    toast.success(`Preset "${preset.name}" caricato con successo!`);
  };

  // Eliminazione regola in events_engine
  const handleDeleteRule = async (ruleId: string) => {
    if (!ruleId) return;
    setLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const { error } = await supabase
        .from('events_engine')
        .delete()
        .eq('id', ruleId);

      if (error) throw error;

      addLog(`ENGINE: Regola rimossa con successo.`);
      setStatusMessage('Regola eliminata dalla timeline.');

      // Ricarica le regole in memoria per allineare l'interfaccia
      await loadEngineRules();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`Impossibile eliminare la regola: ${err.message || 'Errore database'}`);
    } finally {
      setLoading(false);
    }
  };

  // Funzioni AI Co-Pilota (Claudia)
  const generateAITrigger = () => {
    setAiLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);

    // Formatta il contesto dei voti
    const voteListStr = voteStats.map(v => `${v.count} ${v.label}`).join(', ');
    const contextInfo = voteListStr ? `La sala ha votato: ${voteListStr}` : 'Nessun voto registrato.';
    console.log(`[DEBUG CLAUDIA] Dati di contesto raccolti:`, contextInfo);

    setTimeout(() => {
      setAiProposal({
        title: "PROVOCAZIONE",
        message: "Vedo che la maggioranza di voi si sta orientando su scelte scontate. Siete davvero sicuri di potervelo permettere?",
        buttons: ["ACCETTO LA SFIDA", "FACCIO UN PASSO INDIETRO"]
      });
      setAiLoading(false);
      addLog("CLAUDIA IA: Proposta neurale elaborata e disponibile in Staging.");
    }, 1500);
  };

  const handleApproveAIProposal = () => {
    if (!aiProposal || !gameId) return;

    try {
      const payload = {
        type: 'send_message',
        title: aiProposal.title,
        message: aiProposal.message,
        buttons: aiProposal.buttons
      };

      // Invia via broadcast
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.send({
          type: 'broadcast',
          event: 'trigger',
          payload
        });
        
        addLog(`[CLAUDIA IA] Trigger inviato con successo: "${aiProposal.title}"`);
        setStatusMessage('Trigger neurale inviato via broadcast.');
      } else {
        throw new Error('Canale broadcast radio scollegato.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Errore durante l\'invio del trigger IA.');
    } finally {
      setAiProposal(null);
    }
  };

  const handleDiscardAIProposal = () => {
    setAiProposal(null);
    addLog('CLAUDIA IA: Proposta neurale scartata dal regista.');
  };

  // Danger Zone - Hard Reset di fine serata
  const handleHardReset = async () => {
    if (!gameId) {
      setErrorMessage('Nessuna partita connessa.');
      return;
    }

    if (!window.confirm("ATTENZIONE: Stai per cancellare TUTTI i giocatori connessi, i voti e la scaletta programmata. L'operazione è irreversibile. Sei sicuro?")) {
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      // 0. Invia broadcast di espulsione ai client
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.send({
          type: 'broadcast',
          event: 'SYSTEM_RESET',
          payload: {}
        });
        addLog('Inviato segnale di reset/espulsione a tutti i nodi.');
      }

      // 1. Cancella le regole dell'engine se c'è uno scenarioId
      if (scenarioId) {
        const { error: engineErr } = await supabase
          .from('events_engine')
          .delete()
          .eq('scenario_id', scenarioId);
        if (engineErr) throw engineErr;
      }

      // 2. Cancella i voti
      const { error: votesErr } = await supabase
        .from('votes')
        .delete()
        .eq('game_id', gameId);
      if (votesErr) throw votesErr;

      // 3. Cancella i giocatori
      const { error: playersErr } = await supabase
        .from('players')
        .delete()
        .eq('game_id', gameId);
      if (playersErr) throw playersErr;

      // 4. Ripristina lo stato della partita nel DB a waiting
      const { error: gameErr } = await supabase
        .from('games')
        .update({
          status: 'waiting',
          started_at: null
        })
        .eq('id', gameId);
      if (gameErr) throw gameErr;

      // 5. Ripristina gli stati locali di React
      setPlayers([]);
      setLiveVotes([]);
      setEngineRules([]);
      setSentMinutes([]);
      sentMinutesRef.current = [];
      setIsRunning(false);
      setElapsedSeconds(0);
      setElapsedTimeStr('00:00');
      setElapsedMinutes(0);
      setGameStatus('waiting');
      setLiarReady(false);
      setLiarPlayer(null);
      setAccomplicePlayer(null);
      setActiveLiarId(null);
      setActiveAccompliceId(null);
      excludedTablesRef.current = [];
      accompliceExcludedTablesRef.current = [];
      // Cancella eventuali timer auto-skip pendenti
      if (liarProposalTimerRef.current) { clearTimeout(liarProposalTimerRef.current); liarProposalTimerRef.current = null; }
      if (accompliceProposalTimerRef.current) { clearTimeout(accompliceProposalTimerRef.current); accompliceProposalTimerRef.current = null; }
      if (game) {
        setGame({ ...game, status: 'waiting', started_at: null });
      }

      addLog('FINE SERATA: Hard Reset completato. Database ed interfaccia ripristinati.');
      toast.success('Sistema ripristinato. Pronto per una nuova serata.');
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`Errore durante l'Hard Reset: ${err.message || 'Errore di rete'}`);
    } finally {
      setLoading(false);
    }
  };

  // Invia le Mission Cards a tutti i giocatori in un unico broadcast
  const dispatchMissions = () => {
    if (!truthText && !lieText) {
      toast.error('Devi compilare almeno la Verità o la Bugia!');
      return;
    }
    if (!channelRef.current) return;

    // 1. Cerca prima negli stati locali, se sono null cerca in connectedNodesRef.current
    const finalLiarId = activeLiarId || connectedNodesRef.current.find(n => n.is_liar)?.id || null;
    const finalAccompliceId = activeAccompliceId || connectedNodesRef.current.find(n => n.is_accomplice)?.id || null;

    // 2. Recupera il nome
    const liarNode = connectedNodesRef.current.find(n => String(n.id) === String(finalLiarId));
    const liarName = liarNode ? liarNode.name : 'Sconosciuto';

    const payloadData = { 
      truth: truthText, 
      lie: lieText, 
      liarName: liarName, 
      liarId: finalLiarId, 
      accompliceId: finalAccompliceId 
    };

    console.log("🚀 PAYLOAD BLINDATO IN PARTENZA:", payloadData);

    channelRef.current.send({
      type: 'broadcast',
      event: 'MISSION_CARDS',
      payload: payloadData
    });
    
    toast.success('Missioni inviate con successo!');
  };

  // Seleziona in modo randomico il Bugiardo e gestisce l'esclusione progressiva dei tavoli
  const startLiarSelection = () => {
    if (!channelRef.current) return;

    // Cancella eventuale timer precedente prima di avviarne uno nuovo
    if (liarProposalTimerRef.current) {
      clearTimeout(liarProposalTimerRef.current);
      liarProposalTimerRef.current = null;
    }

    const currentNodes = connectedNodesRef.current;
    let excluded = excludedTablesRef.current;

    let availablePool = currentNodes.filter(node => !excluded.includes(String(node.table_number)));

    if (availablePool.length === 0 && currentNodes.length > 0) {
      excludedTablesRef.current = [];
      availablePool = currentNodes;
    }

    if (availablePool.length === 0) return;

    const randomPlayer = availablePool[Math.floor(Math.random() * availablePool.length)];

    addLog(`SELEZIONE BUGIARDO: Inviata proposta a ${randomPlayer.name} (Tavolo ${randomPlayer.table_number}).`);

    channelRef.current.send({
      type: 'broadcast',
      event: 'LIAR_PROPOSAL',
      payload: { target_id: randomPlayer.id, table_number: randomPlayer.table_number }
    });
    setStatusMessage(`Proposta inviata a ${randomPlayer.name}. Auto-skip in 45s se nessuna risposta...`);

    // Auto-skip: dopo 45s senza risposta, simula un rifiuto e passa al prossimo
    liarProposalTimerRef.current = setTimeout(() => {
      addLog(`AUTO-SKIP BUGIARDO: Nessuna risposta da Tavolo ${randomPlayer.table_number}. Passo al prossimo.`);
      excludedTablesRef.current.push(String(randomPlayer.table_number));
      liarProposalTimerRef.current = null;
      startLiarSelection();
    }, 45000);
  };

  // Seleziona in modo randomico il Complice e gestisce l'esclusione progressiva dei tavoli
  const startAccompliceSelection = () => {
    if (!channelRef.current) return;

    // Cancella eventuale timer precedente prima di avviarne uno nuovo
    if (accompliceProposalTimerRef.current) {
      clearTimeout(accompliceProposalTimerRef.current);
      accompliceProposalTimerRef.current = null;
    }

    const currentNodes = connectedNodesRef.current;
    let excluded = accompliceExcludedTablesRef.current;

    const liarNode = currentNodes.find(n => n.is_liar);
    const currentLiarTable = liarNode ? String(liarNode.table_number) : null;

    let availablePool = currentNodes.filter(node =>
      !excluded.includes(String(node.table_number)) &&
      String(node.table_number) !== String(currentLiarTable)
    );

    if (availablePool.length === 0 && currentNodes.length > 0) {
      accompliceExcludedTablesRef.current = [];
      availablePool = currentNodes.filter(node => String(node.table_number) !== String(currentLiarTable));
    }

    if (availablePool.length === 0) return;

    const randomPlayer = availablePool[Math.floor(Math.random() * availablePool.length)];
    addLog(`SELEZIONE COMPLICE: Inviata proposta a ${randomPlayer.name} (Tavolo ${randomPlayer.table_number}).`);

    channelRef.current.send({
      type: 'broadcast',
      event: 'ACCOMPLICE_PROPOSAL',
      payload: { target_id: randomPlayer.id, table_number: randomPlayer.table_number }
    });
    setStatusMessage(`Proposta COMPLICE inviata a ${randomPlayer.name}. Auto-skip in 45s se nessuna risposta...`);

    // Auto-skip: dopo 45s senza risposta, simula un rifiuto e passa al prossimo
    accompliceProposalTimerRef.current = setTimeout(() => {
      addLog(`AUTO-SKIP COMPLICE: Nessuna risposta da Tavolo ${randomPlayer.table_number}. Passo al prossimo.`);
      accompliceExcludedTablesRef.current.push(String(randomPlayer.table_number));
      accompliceProposalTimerRef.current = null;
      startAccompliceSelection();
    }, 45000);
  };

  // 4. Avvia / Pausa Partita (cambia status a running/waiting nel database)
  const handleStartGame = async () => {
    if (!gameId) return;
    setLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);

    const nextRunning = !isRunning;

    try {
      // Calcola started_at per mantenere la sincronia in caso di pause/riprendi
      const adjustedStartedAt = nextRunning 
        ? new Date(Date.now() - elapsedSeconds * 1000).toISOString() 
        : game?.started_at;

      const { data, error } = await supabase
        .from('games')
        .update({
          status: nextRunning ? 'running' : 'waiting',
          started_at: adjustedStartedAt
        })
        .eq('join_code', joinCode.trim().toUpperCase())
        .select()
        .single();
      if (error) throw error;

      setIsRunning(nextRunning);
      setGameStatus(data.status);
      setGame(data as Game);
      
      if (nextRunning) {
        addLog('PARTITA AVVIATA. MOTORE TEMPORALE LIVE.');
        if (broadcastChannelRef.current) {
          broadcastChannelRef.current.send({
            type: 'broadcast',
            event: 'trigger',
            payload: {
              type: 'message',
              title: 'Benvenuto nel Liar System',
              message: 'La partita è iniziata. Presta attenzione a ogni minimo dettaglio e diffida di chiunque.',
              duration_seconds: 15
            }
          });
        }
      } else {
        addLog('PARTITA IN PAUSA.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Errore durante la gestione del timer.');
    } finally {
      setLoading(false);
    }
  };

  // 4.1. Reset Timer della partita
  const handleResetTimer = async () => {
    if (!gameId) return;
    setLoading(true);
    const nowIso = new Date().toISOString();

    try {
      const { data, error } = await supabase
        .from('games')
        .update({
          started_at: isRunning ? nowIso : null
        })
        .eq('join_code', joinCode.trim().toUpperCase())
        .select()
        .single();
      if (error) throw error;

      setElapsedSeconds(0);
      setElapsedTimeStr('00:00');
      setElapsedMinutes(0);
      setSentMinutes([]);
      sentMinutesRef.current = [];
      setGameStatus(data.status);
      setGame(data as Game);
      addLog('TIMER RESETTATO. MOTORE TEMPORALE RIPARTITO DA 00:00.');
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Errore durante il reset del timer.');
    } finally {
      setLoading(false);
    }
  };

  // 5. Toggle isolamento target per singolo giocatore (is_target)
  const handleToggleIsolate = async (player: Player) => {
    try {
      const { error } = await supabase
        .from('players')
        .update({ is_target: !player.is_target })
        .eq('id', player.id);

      if (error) throw error;
    } catch (err: any) {
      console.error(err);
      addLog(`Errore isolamento giocatore ${player.nickname}`);
    }
  };

  // 6. Iniezione Manuale (Forza Evento immediato via Broadcast)
  const handleForceTrigger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gameId || !forceMessage.trim()) return;

    setLoading(true);
    setStatusMessage(null);

    try {
      const payload = {
        type: 'alert',
        title: 'COMUNICAZIONE DI SISTEMA',
        message: forceMessage.trim()
      };

      if (broadcastChannelRef.current) {
        const targetNodes = getTargetNodes(forceTarget);
        targetNodes.forEach(node => {
          broadcastChannelRef.current.send({
            type: 'broadcast',
            event: 'trigger',
            payload: {
              ...payload,
              target_id: node.id
            }
          });
        });

        // Salva l'evento manuale sul database in timeline_events per consentire il recupero al refresh
        addLog(`TRIGGER MANUALE INVIATO: "${forceMessage.trim()}" target: ${forceTarget} (${targetNodes.length} nodi)`);
        setForceMessage('');
        setStatusMessage('Trigger psicologico iniettato.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Errore nell\'inviare il trigger.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#000000] text-neutral-100 font-sans p-6 select-none relative overflow-hidden">
      
      {/* Background gradients and glowing effects (Crimson Red / Black theme) */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(220,38,38,0.035)_0%,transparent_60%)] pointer-events-none z-0" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(220,38,38,0.015)_0%,transparent_60%)] pointer-events-none z-0" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.002)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.002)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none z-0" />
      
      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        
        {/* Header Admin */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center p-5 bg-neutral-950/60 backdrop-blur-md border border-neutral-800 rounded-2xl gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
              <Cpu className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h1 className="text-white text-xl font-extrabold tracking-wider uppercase flex items-center gap-2">
                LIAR SYSTEM <span className="text-[10px] text-red-500 font-mono tracking-widest px-2 py-0.5 bg-red-500/10 border border-red-500/20 rounded">REGIA LIVE</span>
              </h1>
              <p className="text-neutral-500 text-xs tracking-wider uppercase font-medium mt-0.5">Control room &bull; Event orchestrator</p>
            </div>
          </div>

          {/* Bar Connessione Partita */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-grow md:flex-grow-0">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500" />
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="TORINO44"
                className="w-full md:w-40 bg-neutral-950 border border-neutral-800 focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 rounded-lg pl-9 pr-3 py-2 text-xs text-white uppercase tracking-wider font-mono outline-none transition-all"
              />
            </div>
            <NeuButton
              onClick={handleLoadOrCreateGame}
              disabled={loading}
              variant="primary"
              className="text-xs px-4 py-2"
            >
              {loading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <Radio className="w-3.5 h-3.5" />
                  CONNETTI
                </>
              )}
            </NeuButton>
          </div>
        </header>

        {/* Notifiche / Errori */}
        {(errorMessage || statusMessage) && (
          <div className={`flex items-start gap-3 p-4 border rounded-xl animate-in fade-in slide-in-from-top-2 duration-300 ${
            errorMessage 
              ? 'border-red-500/20 bg-red-500/5 text-red-400' 
              : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
          }`}>
            {errorMessage ? (
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            <div className="text-xs font-bold uppercase tracking-wider">
              {errorMessage ? `[!] ERRORE: ${errorMessage}` : `[*] NOTIFICA: ${statusMessage}`}
            </div>
          </div>
        )}

        {/* Bento Grid Layout (3 Colonne) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* COLONNA 1: Setup e Giocatori */}
          <div className="space-y-6">
            
            {/* Motore Temporale */}
            <div className={`bg-gradient-to-b from-neutral-900/60 to-neutral-950/80 backdrop-blur-lg border border-neutral-800 rounded-2xl p-5 hover:border-neutral-700 transition-all duration-300 ${!gameId ? 'opacity-40 pointer-events-none' : ''}`}>
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-neutral-400 text-xs font-bold tracking-widest uppercase flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-red-500" />
                  MOTORE TEMPORALE
                </h2>
                <span className={`text-[9px] px-2 py-0.5 rounded font-extrabold tracking-wider ${
                  isRunning 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse' 
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}>
                  {isRunning ? 'RUNNING' : 'PAUSED'}
                </span>
              </div>

              <div className="flex flex-col items-center justify-center py-6 border border-neutral-800/30 bg-neutral-950/30 rounded-xl mb-5">
                <span className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-red-400 to-white tracking-widest font-mono">
                  {elapsedTimeStr}
                </span>
                <span className="text-[9px] text-neutral-500 tracking-widest font-mono uppercase mt-2">
                  tempo trascorso
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <NeuButton 
                  type="button"
                  onClick={handleStartGame}
                  disabled={!gameId || loading || engineRules.length === 0}
                  variant={isRunning ? 'default' : 'primary'}
                  className="w-full"
                >
                  {isRunning ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      PAUSA
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      AVVIA
                    </>
                  )}
                </NeuButton>
                <NeuButton 
                  type="button"
                  onClick={handleResetTimer}
                  disabled={!gameId || loading}
                  variant="default"
                  className="w-full"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  RESET
                </NeuButton>
              </div>

              {engineRules.length === 0 && gameId && (
                <p className="text-[9px] text-red-400 font-mono tracking-widest text-center mt-3 flex items-center justify-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Richiede storia preset
                </p>
              )}
            </div>

            {/* Nodi Connessi */}
            <div className={`bg-gradient-to-b from-neutral-900/60 to-neutral-950/80 backdrop-blur-lg border border-neutral-800 rounded-2xl p-5 hover:border-neutral-700 transition-all duration-300 flex flex-col min-h-[360px] ${!gameId ? 'opacity-40 pointer-events-none' : ''}`}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-neutral-400 text-xs font-bold tracking-widest uppercase flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-red-500" />
                  NODI CONNESSI
                </h2>
                <span className="text-[10px] text-neutral-300 bg-neutral-800 px-2 py-0.5 rounded font-mono font-bold border border-neutral-700">
                  {players.length} PLR
                </span>
              </div>
              
              <div className="flex-grow overflow-y-auto overflow-x-hidden space-y-2.5 max-h-[220px] mb-4 pr-1">
                {players.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-550 border border-dashed border-neutral-800 rounded-xl bg-neutral-950/20">
                    <Users className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-xs uppercase tracking-wider">Nessun giocatore connesso</p>
                  </div>
                ) : (
                  players.map((player) => (
                    <div key={player.id} className="flex items-center justify-between p-3 border border-neutral-800 bg-neutral-950/40 rounded-xl hover:border-neutral-700 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-neutral-400 text-[10px] font-mono font-bold bg-neutral-900 border border-neutral-850 px-1.5 py-0.5 rounded">
                          P{player.posto_tavola < 10 ? `0${player.posto_tavola}` : player.posto_tavola}
                        </span>
                        <span className="text-white text-sm font-semibold truncate">{player.nickname}</span>
                        
                        {/* Badges ruoli */}
                        {player.is_liar && (
                          <span className="text-[8px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-1">
                            <Skull className="w-2.5 h-2.5" />
                            LIAR
                          </span>
                        )}
                        {player.is_accomplice && (
                          <span className="text-[8px] font-bold text-red-300 bg-red-950/30 border border-red-900/30 px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-1">
                            <Shield className="w-2.5 h-2.5" />
                            COMP
                          </span>
                        )}
                      </div>
                      
                      <NeuButton 
                        onClick={() => handleToggleIsolate(player)}
                        variant={player.is_target ? 'danger' : 'default'}
                        className="text-[9px] px-2.5 py-1.5 h-7"
                      >
                        <VolumeX className="w-3 h-3" />
                        {player.is_target ? 'ISOLATO' : 'ISOLA'}
                      </NeuButton>
                    </div>
                  ))
                )}
              </div>

              {players.length > 0 && (
                <div className="space-y-2.5 pt-3 border-t border-neutral-800">
                  <div className="grid grid-cols-1 gap-2">
                    <NeuButton
                      type="button"
                      onClick={startLiarSelection}
                      variant="primary"
                      className="w-full text-xs py-2.5 shadow-[0_0_15px_rgba(239,68,68,0.1)]"
                    >
                      <Skull className="w-3.5 h-3.5" />
                      PROTOCOLLO BUGIARDO
                    </NeuButton>
                    
                    {liarPlayer && (
                      <p className="text-[9px] text-emerald-450 font-mono uppercase tracking-wider text-center bg-emerald-500/5 border border-emerald-500/20 py-1.5 rounded animate-pulse">
                        🟢 Bugiardo: {liarPlayer.player_name} (Tavolo {liarPlayer.table_number})
                      </p>
                    )}

                    <NeuButton
                      type="button"
                      onClick={startAccompliceSelection}
                      disabled={!liarReady}
                      variant={liarReady ? 'primary' : 'default'}
                      className="w-full text-xs py-2.5"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      PROTOCOLLO COMPLICE
                    </NeuButton>

                    {accomplicePlayer && (
                      <p className="text-[9px] text-red-400 font-mono uppercase tracking-wider text-center bg-red-500/5 border border-red-500/20 py-1.5 rounded animate-pulse">
                        🟢 Complice: {accomplicePlayer.player_name} (Tavolo {accomplicePlayer.table_number})
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* SEZIONE DISPIEGO MISSIONI */}
            <div className={`bg-gradient-to-b from-neutral-900/60 to-neutral-950/80 backdrop-blur-lg border border-neutral-800 rounded-2xl p-5 hover:border-neutral-700 transition-all duration-300 ${!gameId ? 'opacity-40 pointer-events-none' : ''}`}>
              <h3 className="text-neutral-400 text-xs font-bold tracking-widest text-white mb-4 uppercase flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-red-500" />
                DISPIEGO MISSIONI
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] text-neutral-450 uppercase tracking-wider mb-1.5 font-bold">Verità (Tutti i giocatori)</label>
                  <textarea 
                    value={truthText}
                    onChange={(e) => setTruthText(e.target.value)}
                    className="w-full bg-neutral-950 text-white p-3 rounded-lg border border-neutral-800 focus:border-red-500/50 focus:ring-1 focus:ring-red-500/10 outline-none text-xs resize-none transition-all placeholder-neutral-800"
                    rows={2}
                    placeholder="Es: Il tema di discussione è..."
                  />
                </div>
                
                <div>
                  <label className="block text-[10px] text-neutral-450 uppercase tracking-wider mb-1.5 font-bold">Bugia (Bugiardo & Complice)</label>
                  <textarea 
                    value={lieText}
                    onChange={(e) => setLieText(e.target.value)}
                    className="w-full bg-neutral-950 text-white p-3 rounded-lg border border-neutral-800 focus:border-red-500/50 focus:ring-1 focus:ring-red-500/10 outline-none text-xs resize-none transition-all placeholder-neutral-800"
                    rows={2}
                    placeholder="Es: La finta verità da sostenere..."
                  />
                </div>

                <NeuButton onClick={dispatchMissions} className="w-full">
                  <Send className="w-3.5 h-3.5" />
                  INVIA MISSIONI
                </NeuButton>
              </div>
            </div>

          </div>

          {/* COLONNA 2: Regia e Iniezione */}
          <div className="space-y-6">
            
            {/* Iniezione Manuale */}
            <form onSubmit={handleForceTrigger} className={`bg-gradient-to-b from-neutral-900/60 to-neutral-950/80 backdrop-blur-lg border border-neutral-800 rounded-2xl p-5 hover:border-neutral-700 transition-all duration-300 flex flex-col justify-between min-h-[300px] ${!gameId ? 'opacity-40 pointer-events-none' : ''}`}>
              <div className="space-y-4">
                <h2 className="text-neutral-400 text-xs font-bold tracking-widest uppercase flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-red-500" />
                  INIEZIONE MANUALE
                </h2>
                
                <div className="space-y-1">
                  <label className="text-[9px] text-neutral-450 uppercase block tracking-wider font-bold">Target di iniezione</label>
                  <select 
                    value={forceTarget}
                    onChange={(e) => setForceTarget(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 text-neutral-200 p-2.5 text-xs outline-none focus:border-red-500/50 rounded-lg font-mono transition-all"
                  >
                    <option value="all">Tutti i giocatori</option>
                    {players.map((p) => (
                      <option key={p.id} value={`player_${p.posto_tavola}`}>
                        P{p.posto_tavola < 10 ? `0${p.posto_tavola}` : p.posto_tavola} - {p.nickname}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] text-neutral-450 uppercase block tracking-wider font-bold">Messaggio trigger</label>
                  <textarea 
                    required
                    value={forceMessage}
                    onChange={(e) => setForceMessage(e.target.value)}
                    className="w-full h-24 bg-neutral-950 border border-neutral-800 text-neutral-200 p-3 text-xs resize-none outline-none focus:border-red-500/50 rounded-lg font-mono placeholder-neutral-800 transition-all"
                    placeholder="Testo del trigger psicologico immediato..."
                  />
                </div>
              </div>

              <NeuButton 
                type="submit"
                disabled={loading || !gameId || !forceMessage.trim()}
                variant="primary"
                className="w-full mt-4"
              >
                <Send className="w-3.5 h-3.5" />
                INVIA TRIGGER IMMEDIATO
              </NeuButton>
            </form>

            {/* Preset Narrativo Quick Load */}
            <div className={`bg-gradient-to-b from-neutral-900/60 to-neutral-950/80 backdrop-blur-lg border border-neutral-800 rounded-2xl p-5 hover:border-neutral-700 transition-all duration-300 ${!gameId ? 'opacity-40 pointer-events-none' : ''}`}>
              <h3 className="text-neutral-400 text-xs font-bold tracking-widest mb-4 uppercase flex justify-between items-center">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-red-500" />
                  PRESET STORIA
                </span>
                <span className="text-[8px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 font-mono tracking-widest">AUTO_RULES</span>
              </h3>
              <div className="space-y-4">
                <select 
                  value={selectedPresetId}
                  onChange={(e) => setSelectedPresetId(e.target.value)}
                  className="w-full bg-neutral-950 text-neutral-200 p-3 rounded-lg border border-neutral-800 focus:border-red-500/50 outline-none text-xs transition-all"
                >
                  <option value="" disabled>-- Seleziona una Storia --</option>
                  {storyPresets.map(preset => (
                    <option key={preset.id} value={preset.id}>{preset.name}</option>
                  ))}
                </select>
                <NeuButton 
                  onClick={loadPreset} 
                  disabled={!selectedPresetId || loading} 
                  className="w-full text-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  CARICA EVENTI IN REGIA
                </NeuButton>
              </div>
            </div>

            {/* Costruttore di Eventi */}
            <form onSubmit={handleCreateRule} className={`bg-gradient-to-b from-neutral-900/60 to-neutral-950/80 backdrop-blur-lg border border-neutral-800 rounded-2xl p-5 hover:border-neutral-700 transition-all duration-300 flex flex-col justify-between min-h-[380px] ${!gameId ? 'opacity-40 pointer-events-none' : ''}`}>
              <div className="space-y-3">
                <h2 className="text-neutral-400 text-xs font-bold tracking-widest uppercase flex items-center gap-1.5">
                  <Settings className="w-3.5 h-3.5 text-red-500" />
                  COSTRUTTORE DI EVENTI
                </h2>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] text-neutral-450 uppercase block tracking-wider font-bold">Minuto</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={newRuleMinute}
                      onChange={(e) => setNewRuleMinute(e.target.value)}
                      placeholder="Es: 5"
                      className="w-full bg-neutral-950 border border-neutral-800 text-white p-2 text-xs outline-none focus:border-red-500/50 rounded-lg font-mono transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] text-neutral-450 uppercase block tracking-wider font-bold">Bersaglio</label>
                    <select
                      value={newRuleTarget}
                      onChange={(e) => setNewRuleTarget(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 text-white p-2 text-xs outline-none focus:border-red-500/50 rounded-lg font-mono transition-all"
                    >
                      <option value="all">Tutti</option>
                      <option value="roles">Ruoli specifici</option>
                      <option value="target_player">Giocatore Singolo</option>
                    </select>
                  </div>
                </div>

                {newRuleTarget === 'roles' && (
                  <div className="space-y-1 animate-in fade-in duration-200">
                    <label className="text-[9px] text-neutral-450 uppercase block tracking-wider font-bold">Ruolo Bersaglio</label>
                    <select 
                      value={targetRole}
                      onChange={(e) => setTargetRole(e.target.value as 'liar' | 'accomplice')}
                      className="w-full bg-neutral-950 border border-neutral-800 text-white p-2 text-xs outline-none focus:border-red-500/50 rounded-lg font-mono"
                    >
                      <option value="liar">Bugiardo</option>
                      <option value="accomplice">Complice</option>
                    </select>
                  </div>
                )}

                {newRuleTarget === 'target_player' && (
                  <div className="space-y-1 animate-in fade-in duration-200">
                    <label className="text-[9px] text-neutral-450 uppercase block tracking-wider font-bold">Giocatore</label>
                    <select 
                      value={targetPlayerId}
                      onChange={(e) => setTargetPlayerId(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 text-white p-2 text-xs outline-none focus:border-red-500/50 rounded-lg font-mono"
                    >
                      <option value="" disabled>-- Seleziona --</option>
                      {connectedNodesRef.current.map(node => (
                        <option key={node.id} value={node.id}>
                          P{node.table_number < 10 ? `0${node.table_number}` : node.table_number} - {node.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[9px] text-neutral-450 uppercase block tracking-wider font-bold">Titolo Comunicazione</label>
                  <input
                    type="text"
                    required
                    value={newRuleTitle}
                    onChange={(e) => setNewRuleTitle(e.target.value)}
                    placeholder="Es: TRADIMENTO PSICOLOGICO"
                    className="w-full bg-neutral-950 border border-neutral-800 text-white p-2 text-xs outline-none focus:border-red-500/50 rounded-lg font-mono transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] text-neutral-450 uppercase block tracking-wider font-bold">Opzioni Risposta (separate da virgola)</label>
                  <input
                    type="text"
                    required
                    value={newRuleButtons}
                    onChange={(e) => setNewRuleButtons(e.target.value)}
                    placeholder="Es: ACCETTA, TRADISCI"
                    className="w-full bg-neutral-950 border border-neutral-800 text-white p-2 text-xs outline-none focus:border-red-500/50 rounded-lg font-mono transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] text-neutral-450 uppercase block tracking-wider font-bold">Messaggio / Storyline</label>
                  <textarea
                    required
                    value={newRuleMessage}
                    onChange={(e) => setNewRuleMessage(e.target.value)}
                    placeholder="Inserisci il testo descrittivo dell'innesco narrativo..."
                    className="w-full h-20 bg-neutral-950 border border-neutral-800 text-white p-2 text-xs resize-none outline-none focus:border-red-500/50 rounded-lg font-mono transition-all"
                  />
                </div>
              </div>

              <NeuButton
                type="submit"
                disabled={loading || !gameId}
                variant="primary"
                className="w-full mt-4"
              >
                <Plus className="w-3.5 h-3.5" />
                PROGRAMMA EVENTO
              </NeuButton>
            </form>

          </div>

          {/* COLONNA 3: Monitoraggio e Logs */}
          <div className="space-y-6">
            
            {/* Radar Psicologico (Live) */}
            <div className={`bg-gradient-to-b from-neutral-900/60 to-neutral-950/80 backdrop-blur-lg border border-neutral-800 rounded-2xl p-5 hover:border-neutral-700 transition-all duration-300 flex flex-col justify-between min-h-[220px] ${!gameId ? 'opacity-40 pointer-events-none' : ''}`}>
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-neutral-400 text-xs font-bold tracking-widest uppercase flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-red-500" />
                    RADAR LIVE FEEDBACK
                  </h2>
                  <NeuButton
                    type="button"
                    onClick={handleClearRadar}
                    variant="default"
                    className="text-[9px] px-2.5 py-1 h-6"
                  >
                    RESET
                  </NeuButton>
                </div>

                <div className="space-y-3.5 max-h-[160px] overflow-y-auto pr-1">
                  {voteStats.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-slate-500">
                      <Activity className="w-6 h-6 mb-1 opacity-20 animate-pulse" />
                      <p className="text-[10px] uppercase tracking-wider">Nessun feedback in ingresso</p>
                    </div>
                  ) : (
                    voteStats.map((item) => (
                      <div key={item.label} className="space-y-1">
                        <div className="flex justify-between text-[10px] uppercase font-bold text-neutral-200">
                          <span className="font-mono">{item.label}</span>
                          <span className="text-red-550 font-mono">{item.count} ({item.percentage}%)</span>
                        </div>
                        <div className="w-full bg-neutral-950 h-2.5 rounded-full overflow-hidden border border-neutral-900 relative">
                          <div
                            className="bg-gradient-to-r from-red-650 to-red-500 h-full rounded-full shadow-[0_0_8px_rgba(220,38,38,0.5)] transition-all duration-500 ease-out"
                            style={{ width: `${item.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Scaletta Programmata */}
            <div className={`bg-gradient-to-b from-neutral-900/60 to-neutral-950/80 backdrop-blur-lg border border-neutral-800 rounded-2xl p-5 hover:border-neutral-700 transition-all duration-300 flex flex-col justify-between min-h-[300px] ${!gameId ? 'opacity-40 pointer-events-none' : ''}`}>
              <div>
                <h2 className="text-neutral-400 text-xs font-bold tracking-widest uppercase flex items-center gap-1.5 mb-4">
                  <Layers className="w-3.5 h-3.5 text-red-500" />
                  SCALETTA EVENTI LIVE
                </h2>
                
                <div className="overflow-y-auto max-h-[190px] pr-1 space-y-2.5 font-mono">
                  {engineRules.length === 0 ? (
                    <p className="text-[10px] text-neutral-550 uppercase py-8 text-center border border-neutral-850 rounded-xl bg-neutral-950/20">
                      Nessun evento in scaletta
                    </p>
                  ) : (
                    [...engineRules]
                      .sort((a, b) => Number(a.trigger_logic?.minute || 0) - Number(b.trigger_logic?.minute || 0))
                      .map((rule) => {
                        const triggerMinute = rule.trigger_logic?.minute ?? '?';
                        const actionTitle = rule.action_logic?.title || 'COMUNICAZIONE';
                        const buttons = rule.action_logic?.buttons || [];
                        return (
                          <div key={rule.id} className="flex justify-between items-center p-2.5 border border-neutral-850 bg-neutral-950/60 rounded-xl hover:border-neutral-700 transition-colors">
                            <div className="space-y-1 min-w-0 pr-2">
                              <div className="flex items-center gap-2">
                                <span className="text-red-400 text-[10px] font-bold bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded font-mono">
                                  MIN {triggerMinute}
                                </span>
                                <span className="text-neutral-200 text-xs font-semibold uppercase truncate block max-w-[130px]">
                                  {actionTitle}
                                </span>
                              </div>
                              {buttons.length > 0 && (
                                <p className="text-[8px] text-neutral-500 uppercase tracking-widest block truncate">
                                  Opzioni: {buttons.join(' | ')}
                                </p>
                              )}
                            </div>

                            <NeuButton
                              type="button"
                              onClick={() => handleDeleteRule(rule.id)}
                              variant="danger"
                              className="text-[8px] px-2 py-1 h-6"
                            >
                              <Trash2 className="w-3 h-3" />
                            </NeuButton>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            </div>

            {/* Log di Sistema */}
            <div className="bg-gradient-to-b from-neutral-900/60 to-neutral-950/80 backdrop-blur-lg border border-neutral-800 rounded-2xl p-5 hover:border-neutral-700 transition-all duration-300 flex flex-col h-[280px] overflow-hidden">
              <h2 className="text-neutral-400 text-xs font-bold tracking-widest mb-3.5 uppercase flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-red-500" />
                CONSOLE LOGS (LIVE)
              </h2>
              <div className="flex-grow overflow-y-auto overflow-x-hidden pr-1 space-y-3 font-mono text-[10px] bg-neutral-950/50 border border-neutral-850 rounded-xl p-3.5">
                {logs.map((log, idx) => (
                  <div key={idx} className="leading-relaxed text-neutral-350 break-words hover:bg-neutral-900/40 p-0.5 rounded transition-all">
                    <span className="text-neutral-500 font-semibold shrink-0">
                      {log.substring(0, 10)}
                    </span>
                    <span className="ml-2 text-neutral-300">
                      {log.substring(10)}
                    </span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>

            {/* Interfaccia Neurale (Claudia) */}
            <div className="bg-gradient-to-b from-[#1c0707]/40 to-[#0c0000]/60 border border-red-950/60 rounded-2xl p-5 flex flex-col min-h-[300px] shadow-[0_0_25px_rgba(220,38,38,0.06)] hover:border-red-900/30 transition-all duration-300 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 blur-2xl pointer-events-none rounded-full" />
              
              <div className="flex justify-between items-center mb-4 relative z-10">
                <h2 className="text-red-450 text-xs font-extrabold tracking-widest uppercase flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  CO-PILOTA CLAUDIA
                </h2>
                <span className="text-[8px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded font-mono uppercase tracking-wider animate-pulse">
                  ACTIVE
                </span>
              </div>

              <NeuButton
                type="button"
                onClick={generateAITrigger}
                disabled={aiLoading || !gameId}
                variant="primary"
                className="w-full text-xs py-2.5 mb-4 relative z-10 !border-red-500/25 !bg-red-950/20 hover:!bg-red-950/40 !text-red-400"
              >
                {aiLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ANALISI IN CORSO...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    GENERA PROPOSTA NARRATIVA
                  </>
                )}
              </NeuButton>

              {/* Staging Proposal Card */}
              {aiProposal ? (
                <div className="flex-grow flex flex-col justify-between relative z-10 animate-in fade-in duration-300">
                  <div className="border border-red-900/40 bg-neutral-950/80 p-3.5 rounded-xl font-mono space-y-2 mb-4 text-xs">
                    <div className="flex justify-between text-[8px] uppercase tracking-wider font-extrabold text-red-450 border-b border-red-900/20 pb-1.5">
                      <span>Staging Proposal</span>
                      <span className="animate-pulse">PRONTA</span>
                    </div>
                    <div className="text-[11px] text-neutral-200">
                      <strong className="text-red-400 font-semibold font-sans">TITOLO: </strong>{aiProposal.title}
                    </div>
                    <div className="text-[11px] text-neutral-300 leading-relaxed font-sans">
                      <strong className="text-red-400 font-semibold font-sans">MESSAGGIO: </strong>{aiProposal.message}
                    </div>
                    {aiProposal.buttons.length > 0 && (
                      <div className="text-[9px] text-red-400 bg-red-500/5 px-2 py-1 rounded border border-red-500/10 inline-block font-sans">
                        <strong>OPZIONI: </strong>{aiProposal.buttons.join(' | ')}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <NeuButton
                      type="button"
                      onClick={handleDiscardAIProposal}
                      variant="default"
                      className="py-2 text-xs"
                    >
                      SCARTA
                    </NeuButton>
                    <NeuButton
                      type="button"
                      onClick={handleApproveAIProposal}
                      variant="primary"
                      className="py-2 text-xs !border-red-500/25 !bg-red-950/20 hover:!bg-red-950/40 !text-red-400"
                    >
                      APPROVA
                    </NeuButton>
                  </div>
                </div>
              ) : (
                <div className="flex-grow flex flex-col items-center justify-center border border-dashed border-red-950/50 bg-neutral-950/20 p-6 rounded-xl relative z-10">
                  <Sparkles className="w-6 h-6 text-red-500/20 mb-2" />
                  <p className="text-[9px] text-red-400/50 uppercase tracking-widest text-center">
                    {aiLoading ? 'Generazione innesco...' : 'Nessun trigger in staging'}
                  </p>
                </div>
              )}
            </div>

          </div>

        </div>

        {/* Danger Zone - Reset Totale */}
        <div className="border border-red-500/20 bg-red-500/5 p-5 flex flex-col md:flex-row justify-between items-center gap-4 rounded-2xl max-w-7xl mx-auto">
          <div className="space-y-1 text-center md:text-left">
            <h3 className="text-red-400 text-xs font-extrabold tracking-widest uppercase flex items-center justify-center md:justify-start gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              DANGER ZONE
            </h3>
            <p className="text-[10px] text-neutral-400 uppercase tracking-wider font-mono">
              Rimuove tutti i nodi connessi, i voti storici e le scalette temporali. Azione irreversibile di fine serata.
            </p>
          </div>
          <NeuButton
            type="button"
            onClick={handleHardReset}
            disabled={loading || !gameId}
            variant="danger"
            className="w-full md:w-auto px-6 py-2.5 shrink-0"
          >
            RESET TOTALE SERATA
          </NeuButton>
        </div>
        
      </div>
    </div>
  );
}
