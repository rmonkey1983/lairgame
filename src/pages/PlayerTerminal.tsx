import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { NeuButton } from '../components/NeuButton';
import { 
  Fingerprint, 
  Cpu, 
  Radio, 
  AlertTriangle, 
  CheckCircle2, 
  VolumeX, 
  Lock, 
  Users, 
  Skull, 
  Shield, 
  Send,
  Volume2,
  RefreshCw,
  LogOut,
  Eye,
  Check,
  X
} from 'lucide-react';

/**
 * PlayerTerminal - Console Giocatore Unificata ed Autonoma
 * Gestisce l'Onboarding e la ricezione in tempo reale degli eventi inviati dalla Regia.
 */
export default function PlayerTerminal() {
  const { tableCode } = useParams<{ tableCode?: string }>();
  const routeJoinCode = tableCode?.trim().toUpperCase();

  // Riferimento canale broadcast
  const broadcastChannelRef = useRef<any>(null);

  // Connessione sessione
  const [isJoined, setIsJoined] = useState<boolean>(false);
  const [loadingSession, setLoadingSession] = useState<boolean>(true);

  // Dati giocatore
  const [gameId, setGameId] = useState<string>('');
  const [playerId, setPlayerId] = useState<string>('');
  const [playerName, setPlayerName] = useState<string>('');
  const [seatNumber, setSeatNumber] = useState<number>(0);
  const [isTarget, setIsTarget] = useState<boolean>(false);
  const [isRevealed, setIsRevealed] = useState<boolean>(false);

  // Campi di input form
  const [joinCode, setJoinCode] = useState<string>(() => (
    routeJoinCode ||
    localStorage.getItem('liar_join_code') ||
    'TORINO44'
  ));
  const [nameInput, setNameInput] = useState<string>('');
  const [seatInput, setSeatInput] = useState<string>('');

  // UI States
  const [formLoading, setFormLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSendingAction, setIsSendingAction] = useState<boolean>(false);

  // Stato Evento Timeline (Richiesto)
  const [currentEvent, setCurrentEvent] = useState<any>(null);
  const [showLiarProposal, setShowLiarProposal] = useState<boolean>(false);
  const [liarProposalData, setLiarProposalData] = useState<any>(null);
  const [showAccompliceProposal, setShowAccompliceProposal] = useState<boolean>(false);
  const [accompliceProposalData, setAccompliceProposalData] = useState<any>(null);

  // Ruolo del giocatore (sincronizzato in realtime)
  const [playerRole, setPlayerRole] = useState<'player' | 'liar' | 'accomplice' | null>(null);

  // Mission Card ricevuta dalla Regia
  const [missionData, setMissionData] = useState<any>(null);

  useEffect(() => {
    if (routeJoinCode) {
      setJoinCode(routeJoinCode);
    }
  }, [routeJoinCode]);

  // Genera un feedback sonoro (Web Audio API) e vibrazione fisica (Vibration API)
  const playSystemAlert = () => {
    // 1. Vibrazione fisica
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([200, 100, 200]);
      } catch (vibErr) {
        console.warn('Vibration API non supportata:', vibErr);
      }
    }

    // 2. Feedback acustico sci-fi
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth'; // tono aspro stile allarme
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.25);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (audioErr) {
      console.warn('Web Audio API bloccata o non supportata:', audioErr);
    }
  };

  // Invia risposta del giocatore via Broadcast Realtime e database (game_logs)
  const handleActionClick = async (buttonLabel: string) => {
    if (isSendingAction || !gameId) return;
    setIsSendingAction(true);

    try {
      // Invia la risposta via broadcast radio realtime
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.send({
          type: 'broadcast',
          event: 'response',
          payload: {
            player_name: playerName || 'Ignoto',
            seat_number: seatNumber,
            action_text: buttonLabel
          }
        });
        console.log(`[DEBUG BROADCAST] Risposta spedita via radio: ${buttonLabel}`);
      }

      // Prova a inserire nel database come storico nella tabella votes
      try {
        const { error: voteErr } = await supabase
          .from('votes')
          .insert({
            game_id: gameId,
            player_id: playerId || null,
            motivazione: buttonLabel
          });
        if (voteErr) throw voteErr;
      } catch (dbErr) {
        console.warn("Invio a votes fallito (tabella assente o RLS non allineata):", dbErr);
      }

      // Chiudi il modale
      setCurrentEvent(null);
    } catch (err) {
      console.error("Errore durante l'invio della risposta:", err);
    } finally {
      setIsSendingAction(false);
    }
  };

  // 1. Ripristino sessione locale all'avvio con validazione database
  useEffect(() => {
    const checkAndRestoreSession = async () => {
      const savedPlayerId = localStorage.getItem('liar_player_id');
      const savedGameId = localStorage.getItem('liar_game_id');
      const savedName = localStorage.getItem('liar_player_name');
      const savedSeat = localStorage.getItem('liar_seat_number');
      const savedJoinCode = localStorage.getItem('liar_join_code');

      if (savedPlayerId && savedGameId && savedName && savedSeat) {
        try {
          // Verifica se il giocatore esiste ancora nel database per questa partita
          const { data, error } = await supabase
            .from('players')
            .select('id')
            .eq('id', savedPlayerId)
            .eq('game_id', savedGameId)
            .maybeSingle();

          if (error || !data) {
            // Partita resettata o giocatore eliminato dal DB: pulisci cache e stati
            console.log('[SESSION] Giocatore non trovato nel database. Sgombero cache...');
            localStorage.removeItem('liar_player_id');
            localStorage.removeItem('liar_game_id');
            localStorage.removeItem('liar_player_name');
            localStorage.removeItem('liar_seat_number');
            localStorage.removeItem('liar_join_code');
            
            setGameId('');
            setPlayerId('');
            setPlayerName('');
            setSeatNumber(0);
            setIsJoined(false);
          } else {
            // Giocatore valido: ripristina la sessione
            setGameId(savedGameId);
            setPlayerId(savedPlayerId);
            setPlayerName(savedName);
            setSeatNumber(parseInt(savedSeat, 10));
            if (!routeJoinCode && savedJoinCode) {
              setJoinCode(savedJoinCode);
            }
            setIsJoined(true);
          }
        } catch (err) {
          console.error('[SESSION] Errore validazione sessione:', err);
          setIsJoined(false);
        }
      }
      setLoadingSession(false);
    };

    checkAndRestoreSession();
  }, []);

  // 1.1. Sottoscrizione realtime per aggiornamenti profilo giocatore (es. is_target)
  useEffect(() => {
    if (!isJoined || !playerId) return;

    // Carica lo stato iniziale: is_target + is_liar + is_accomplice
    const loadInitialPlayerState = async () => {
      try {
        const { data, error } = await supabase
          .from('players')
          .select('is_target, is_liar, is_accomplice')
          .eq('id', playerId)
          .maybeSingle();
        if (!error && data) {
          setIsTarget(data.is_target);
          const computedRole = data.is_liar ? 'liar' : data.is_accomplice ? 'accomplice' : 'player';
          setPlayerRole(computedRole);
        }
      } catch (err) {
        console.error('Errore caricamento stato giocatore:', err);
      }
    };
    loadInitialPlayerState();

    const playerChannel = supabase.channel(`player_changes:${playerId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'players', filter: `id=eq.${playerId}` },
        (payload) => {
          const updated = payload.new as any;
          if (updated) {
            setIsTarget(updated.is_target);
            const computedRole = updated.is_liar ? 'liar' : updated.is_accomplice ? 'accomplice' : 'player';
            setPlayerRole(computedRole);
            if (updated.is_target) {
              playSystemAlert();
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(playerChannel);
    };
  }, [isJoined, playerId]);

  // 2. Sottoscrizione Broadcast Realtime
  useEffect(() => {
    if (!isJoined || !gameId) return;

    // Sottoscrizione broadcast sul canale radio della partita (es. game-TORINO44)
    const channelName = `game-${joinCode || 'TORINO44'}`;
    const gameChannel = supabase.channel(channelName)
      .on('broadcast', { event: 'trigger' }, ({ payload }) => {
        console.log('Ricevuto evento broadcast:', payload);
        if (payload) {
          // Se il messaggio è mirato e non siamo noi il target, ignoralo silenziosamente
          if (payload.target_id && payload.target_id !== playerId) {
            console.log('[DEBUG TRIGGER] Ignorato evento target_id:', payload.target_id);
            return;
          }
          setCurrentEvent(payload);
          playSystemAlert();
        }
      })
      .on('broadcast', { event: 'LIAR_PROPOSAL' }, ({ payload }) => {
        console.log('[DEBUG BROADCAST LIAR_PROPOSAL] Ricevuto:', payload);
        if (payload && payload.target_id === playerId) {
          setLiarProposalData(payload);
          setShowLiarProposal(true);
          playSystemAlert();
        }
      })
      .on('broadcast', { event: 'ACCOMPLICE_PROPOSAL' }, ({ payload }) => {
        console.log('[DEBUG BROADCAST ACCOMPLICE_PROPOSAL] Ricevuto:', payload);
        if (payload && payload.target_id === playerId) {
          setAccompliceProposalData(payload);
          setShowAccompliceProposal(true);
          playSystemAlert();
        }
      })
      .on('broadcast', { event: 'SYSTEM_RESET' }, () => {
        console.log('[SYSTEM] Ricevuto segnale SYSTEM_RESET. Espulsione...');
        localStorage.clear();
        setGameId('');
        setPlayerId('');
        setPlayerName('');
        setSeatNumber(0);
        setCurrentEvent(null);
        setMissionData(null);
        setPlayerRole(null);
        setIsJoined(false);
        toast.error('La partita è stata terminata dalla Regia.');
        window.location.reload();
      })
      .on('broadcast', { event: 'MISSION_CARDS' }, (payload: any) => {
        console.log('RAW PAYLOAD MISSION_CARDS:', payload);
        // Supabase a volte annida il payload in modo imprevedibile. Lo estraiamo a forza:
        const data = payload.payload?.payload || payload.payload || payload;
        setMissionData(data);
        setCurrentEvent(null); // Forza la chiusura di eventuali eventi a tempo in corso
        playSystemAlert();
        toast('Missione ricevuta.', { icon: '🎯', duration: 4000 });
      })
      .subscribe();

    broadcastChannelRef.current = gameChannel;

    return () => {
      supabase.removeChannel(gameChannel);
      broadcastChannelRef.current = null;
    };
  }, [isJoined, gameId, joinCode]);

  // Gestione risposta alla proposta di ruolo di Bugiardo
  const handleLiarResponse = async (accepted: boolean) => {
    if (!gameId || !broadcastChannelRef.current) return;
    
    try {
      await broadcastChannelRef.current.send({
        type: 'broadcast',
        event: 'LIAR_RESPONSE',
        payload: {
          accepted,
          player_id: playerId,
          player_name: playerName,
          table_number: seatNumber
        }
      });
      console.log(`[DEBUG LIAR_RESPONSE] Spedito feedback: accepted=${accepted}`);
    } catch (err) {
      console.error('Errore nell\'invio del feedback Realtime:', err);
    }
    
    // Chiudi il modale
    setShowLiarProposal(false);
    setLiarProposalData(null);
  };

  // Gestione risposta alla proposta di ruolo di Complice
  const handleAccompliceResponse = async (accepted: boolean) => {
    if (!gameId || !broadcastChannelRef.current) return;
    
    try {
      await broadcastChannelRef.current.send({
        type: 'broadcast',
        event: 'ACCOMPLICE_RESPONSE',
        payload: {
          accepted,
          player_id: playerId,
          player_name: playerName,
          table_number: seatNumber
        }
      });
      console.log(`[DEBUG ACCOMPLICE_RESPONSE] Spedito feedback: accepted=${accepted}`);
    } catch (err) {
      console.error('Errore nell\'invio del feedback Realtime per complice:', err);
    }
    
    // Chiudi il modale
    setShowAccompliceProposal(false);
    setAccompliceProposalData(null);
  };

  // 3. Login / Registrazione giocatore su Supabase
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedCode = joinCode.trim().toUpperCase();
    const trimmedName = nameInput.trim();
    const seatInt = parseInt(seatInput, 10);

    if (!trimmedCode) {
      setErrorMessage('Inserisci il codice della serata.');
      return;
    }
    if (!trimmedName) {
      setErrorMessage('Inserisci il tuo nome.');
      return;
    }
    if (isNaN(seatInt) || seatInt <= 0) {
      setErrorMessage('Inserisci un numero di posto valido.');
      return;
    }

    setFormLoading(true);

    try {
      // Cerca la partita per join_code (qualsiasi sia lo stato)
      const { data: activeGame, error: gameError } = await supabase
        .from('games')
        .select('id, status')
        .eq('join_code', trimmedCode)
        .single();

      if (gameError || !activeGame) {
        setErrorMessage('Partita non trovata.');
        setFormLoading(false);
        return;
      }

      // 1. Cerca prima se questo giocatore esiste già
      const { data: existingPlayer, error: searchError } = await supabase
        .from('players')
        .select('*')
        .eq('game_id', activeGame.id)
        .eq('nickname', trimmedName)
        .eq('posto_tavola', seatInt)
        .maybeSingle();

      if (searchError) throw searchError;

      if (existingPlayer) {
        // Giocatore trovato: reconnect!
        localStorage.setItem('liar_player_id', existingPlayer.id);
        localStorage.setItem('liar_game_id', activeGame.id);
        localStorage.setItem('liar_player_name', trimmedName);
        localStorage.setItem('liar_seat_number', seatInt.toString());
        localStorage.setItem('liar_join_code', trimmedCode);

        setGameId(activeGame.id);
        setPlayerId(existingPlayer.id);
        setPlayerName(trimmedName);
        setSeatNumber(seatInt);
        setIsJoined(true);

        toast.success(`Bentornato ${trimmedName}. Sessione ripristinata.`);
      } else {
        // Giocatore non trovato: nuovo inserimento!
        const { data: newPlayer, error: playerError } = await supabase
          .from('players')
          .insert({
            game_id: activeGame.id,
            nickname: trimmedName,
            posto_tavola: seatInt,
          })
          .select('id')
          .single();

        if (playerError) {
          console.log('ERRORE JOIN:', playerError);
          if (playerError.code === '23505') {
            if (playerError.message.includes('posto_tavola') || playerError.message.includes('unique_game_seat')) {
              setErrorMessage('Posto a tavola già occupato.');
            } else if (playerError.message.includes('nickname') || playerError.message.includes('unique_game_player_name')) {
              setErrorMessage('Nome già in uso in questa partita.');
            } else {
              setErrorMessage('Posto o Nome già utilizzati.');
            }
          } else {
            setErrorMessage(`Errore del server durante l'accesso: ${playerError.message}`);
          }
          setFormLoading(false);
          return;
        }

        if (newPlayer) {
          localStorage.setItem('liar_player_id', newPlayer.id);
          localStorage.setItem('liar_game_id', activeGame.id);
          localStorage.setItem('liar_player_name', trimmedName);
          localStorage.setItem('liar_seat_number', seatInt.toString());
          localStorage.setItem('liar_join_code', trimmedCode);

          setGameId(activeGame.id);
          setPlayerId(newPlayer.id);
          setPlayerName(trimmedName);
          setSeatNumber(seatInt);
          setIsJoined(true);
        }
      }
    } catch (err: any) {
      console.error('Errore registrazione giocatore:', err);
      setErrorMessage('Errore del server durante l\'accesso.');
    } finally {
      setFormLoading(false);
    }
  };

  // 4. Disconnessione / Logout
  const handleLogout = () => {
    // Rimuove l'eventuale subscription al canale realtime di Supabase
    if (broadcastChannelRef.current) {
      try {
        supabase.removeChannel(broadcastChannelRef.current);
      } catch (err) {
        console.warn('Errore durante la rimozione del canale realtime:', err);
      }
      broadcastChannelRef.current = null;
    }

    localStorage.removeItem('liar_player_id');
    localStorage.removeItem('liar_game_id');
    localStorage.removeItem('liar_player_name');
    localStorage.removeItem('liar_seat_number');
    localStorage.removeItem('liar_join_code');
    
    setIsJoined(false);
    setGameId('');
    setPlayerId('');
    setPlayerName('');
    setSeatNumber(0);
    setNameInput('');
    setSeatInput('');
    setCurrentEvent(null);
  };

  if (loadingSession) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-neutral-500 font-mono text-xs tracking-widest uppercase gap-3">
        <RefreshCw className="w-5 h-5 animate-spin text-red-500" />
        <span>Verifica sessione attiva...</span>
      </div>
    );
  }

  // =========================================================================
  // SCHERMATA LOGIN / ONBOARDING (Se !isJoined)
  // =========================================================================
  if (!isJoined) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-0 sm:p-4">
        <div className="w-full max-w-md h-[100dvh] sm:h-[85vh] sm:max-h-[850px] sm:rounded-[36px] sm:border-[8px] sm:border-neutral-900 sm:shadow-[0_20px_50px_rgba(0,0,0,0.8)] bg-[#000000] relative overflow-hidden flex flex-col justify-between p-6 select-none">
          
          {/* Background decorativi di profondità (Brand Colors) */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(220,38,38,0.03)_0%,transparent_70%)] pointer-events-none z-0" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.002)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.002)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none z-0" />
          <div 
            className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-[0.02] pointer-events-none z-0 filter blur-[1px]" 
            style={{ backgroundImage: "url('/logo.png')" }} 
          />

          <div className="w-full relative z-10 flex flex-col justify-between h-full py-2">
            
            {/* Header Mini Mobile */}
            <div className="flex justify-between items-center px-1">
              <span className="text-[8px] font-mono tracking-widest text-neutral-500 uppercase">SYS_ONBOARDING</span>
              <span className="text-[8px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 font-mono uppercase tracking-widest rounded">
                SECURE ACCESS v2.0
              </span>
            </div>

            {/* Form & Welcome */}
            <div className="flex-1 flex flex-col justify-center my-auto space-y-6">
              <div className="text-center flex flex-col items-center">
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-2xl mb-3 shadow-[0_0_15px_rgba(220,38,38,0.1)]">
                  <Fingerprint className="w-8 h-8 text-red-500 animate-pulse" />
                </div>
                <h1 className="text-2xl font-extrabold tracking-widest text-white uppercase leading-none">LIAR SYSTEM</h1>
                <p className="text-[9px] text-neutral-500 tracking-wider uppercase mt-1.5">Connessione terminale giocatore</p>
              </div>

              {errorMessage && (
                <div className="border border-red-500/20 bg-red-500/5 p-3 rounded-lg text-center text-xs text-red-400 uppercase font-bold tracking-wider flex items-center justify-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {errorMessage}
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-[9px] text-neutral-400 uppercase tracking-widest font-bold px-1">
                    Codice Partita
                  </label>
                  <input
                    type="text"
                    required
                    disabled={formLoading}
                    placeholder="es. TORINO44"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 focus:border-red-500/50 focus:ring-1 focus:ring-red-500/15 px-4 py-3 text-sm text-white focus:outline-none uppercase tracking-wider rounded-xl font-mono transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[9px] text-neutral-400 uppercase tracking-widest font-bold px-1">
                    Nome
                  </label>
                  <input
                    type="text"
                    required
                    disabled={formLoading}
                    placeholder="es. Marco"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 focus:border-red-500/50 focus:ring-1 focus:ring-red-500/15 px-4 py-3 text-sm text-white focus:outline-none rounded-xl transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[9px] text-neutral-400 uppercase tracking-widest font-bold px-1">
                    Posto a Tavola
                  </label>
                  <input
                    type="number"
                    required
                    disabled={formLoading}
                    min="1"
                    max="99"
                    placeholder="es. 4"
                    value={seatInput}
                    onChange={(e) => setSeatInput(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 focus:border-red-500/50 focus:ring-1 focus:ring-red-500/15 px-4 py-3 text-sm text-white focus:outline-none rounded-xl font-mono transition-all"
                  />
                </div>

                <NeuButton
                  type="submit"
                  disabled={formLoading}
                  variant="primary"
                  className="w-full py-3.5 mt-2 rounded-xl"
                >
                  {formLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      CONNESSIONE...
                    </>
                  ) : (
                    <>
                      <Radio className="w-4 h-4" />
                      ENTRA NEL SISTEMA
                    </>
                  )}
                </NeuButton>
              </form>
            </div>

            {/* Footer Onboarding */}
            <div className="text-center pt-2">
              <p className="text-[8px] text-neutral-600 uppercase tracking-widest font-mono">
                &copy; Black Bulls Lab &bull; Diritti Riservati
              </p>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // SCHERMATA TERMINALE GIOCATORE CONNESSO (Se isJoined)
  // =========================================================================
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md h-[100dvh] sm:h-[85vh] sm:max-h-[850px] sm:rounded-[36px] sm:border-[8px] sm:border-neutral-900 sm:shadow-[0_20px_50px_rgba(0,0,0,0.8)] bg-[#000000] text-neutral-100 font-sans flex flex-col relative overflow-hidden select-none border-neutral-900">

      {/* Background gradients and glowing effects (Crimson Red / Black theme) */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(220,38,38,0.035)_0%,transparent_70%)] pointer-events-none z-0" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.002)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.002)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none z-0" />
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-[0.03] pointer-events-none z-0 filter blur-[1px]"
        style={{ backgroundImage: "url('/logo.png')" }}
      />

      {/* HEADER FISSO */}
      <header className="w-full flex justify-between items-center px-4 py-3 bg-neutral-950/60 backdrop-blur-md border-b border-neutral-800 relative z-10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Logo"
            className="w-10 h-10 shrink-0 object-contain rounded-lg border border-red-500/20 bg-black/40 p-0.5 drop-shadow-[0_0_8px_rgba(220,38,38,0.25)]"
          />
          <div>
            <h1 className="text-red-500 font-black tracking-widest text-xs uppercase leading-none">A CENA COL BUGIARDO</h1>
            <p className="text-[8px] text-neutral-400 tracking-wider uppercase mt-1">Liar System &bull; Live Terminal</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <NeuButton
            onClick={handleLogout}
            variant="danger"
            className="text-[9px] px-3 py-1.5 h-7"
          >
            <LogOut className="w-3.5 h-3.5" />
            Esci
          </NeuButton>
          <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 px-2 py-1 rounded-md">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-emerald-400 text-[8px] tracking-widest font-bold font-mono">ONLINE</span>
          </div>
        </div>
      </header>

      {/* AREA CENTRALE DINAMICA */}
      <main className="flex-1 flex flex-col justify-center items-center px-4 py-6 relative z-10 overflow-y-auto">

        {currentEvent ? (
          /* 1. Evento in corso dalla Scaletta */
          <div className="w-full max-w-md bg-gradient-to-b from-neutral-900 to-neutral-950 border border-neutral-800 p-6 sm:p-8 rounded-2xl shadow-[0_4px_30px_rgba(0,0,0,0.5)] flex flex-col justify-between min-h-[340px] hover:border-neutral-700/60 transition-all duration-300">
            <div className="border-b border-neutral-800 pb-3 mb-5">
              <span className="text-red-400 text-[8px] font-mono tracking-widest uppercase font-black bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded">
                SYSTEM PROTOCOL
              </span>
              <h2 className="text-white text-lg font-extrabold tracking-wide uppercase mt-2.5">
                {currentEvent?.title || 'COMUNICAZIONE'}
              </h2>
            </div>

            <div className="text-sm leading-relaxed mb-6 text-neutral-300 whitespace-pre-line font-medium">
              <p>{currentEvent?.message || ''}</p>
            </div>

            <div className="flex flex-col gap-3 mb-6">
              {currentEvent?.buttons && currentEvent.buttons.length > 0 ? (
                currentEvent.buttons.map((btn: any, idx: number) => {
                  const buttonText = typeof btn === 'string' ? btn : (btn.label || btn.text || btn.name || 'RISPONDI');
                  return (
                    <NeuButton
                      key={idx}
                      disabled={isSendingAction}
                      onClick={() => handleActionClick(buttonText)}
                      variant="primary"
                      className="w-full py-3 text-xs tracking-wider"
                    >
                      {buttonText}
                    </NeuButton>
                  );
                })
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <NeuButton
                    disabled={isSendingAction}
                    onClick={() => handleActionClick('CONFERMA')}
                    variant="primary"
                    className="py-3 text-xs tracking-wider"
                  >
                    CONFERMA
                  </NeuButton>
                  <NeuButton
                    disabled={isSendingAction}
                    onClick={() => handleActionClick('NEGA')}
                    variant="default"
                    className="py-3 text-xs tracking-wider"
                  >
                    NEGA
                  </NeuButton>
                </div>
              )}
            </div>

            <NeuButton
              onClick={() => setCurrentEvent(null)}
              variant="default"
              className="w-full py-2 text-[10px] tracking-wider"
            >
              CHIUDI COMUNICAZIONE
            </NeuButton>
          </div>

        ) : missionData ? (
          /* 2. Mission Card con Hold to Reveal */
          <div 
            className={`w-full max-w-md p-6 rounded-2xl bg-gradient-to-b from-neutral-900 to-neutral-950 border transition-all duration-300 select-none touch-none cursor-pointer hover:shadow-[0_4px_25px_rgba(0,0,0,0.4)] ${
              isRevealed 
                ? String(missionData.liarId) === String(playerId) 
                  ? 'border-red-500/40 shadow-[0_0_20px_rgba(220,38,38,0.18)]' 
                  : String(missionData.accompliceId) === String(playerId) 
                    ? 'border-red-500/30 shadow-[0_0_20px_rgba(220,38,38,0.12)]' 
                    : 'border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.12)]'
                : 'border-neutral-800 hover:border-neutral-700/60'
            }`}
            onMouseDown={() => setIsRevealed(true)}
            onMouseUp={() => setIsRevealed(false)}
            onMouseLeave={() => setIsRevealed(false)}
            onTouchStart={(e) => { e.preventDefault(); setIsRevealed(true); }}
            onTouchEnd={(e) => { e.preventDefault(); setIsRevealed(false); }}
            onContextMenu={(e) => e.preventDefault()}
          >
            
            {!isRevealed ? (
              /* STATO NASCOSTO */
              <div className="flex flex-col items-center justify-center py-10 opacity-85 animate-pulse">
                <div className="w-14 h-14 rounded-full border border-neutral-700 flex items-center justify-center mb-5 bg-neutral-950/60 shadow-[0_0_15px_rgba(255,255,255,0.03)]">
                  <Fingerprint className="w-6 h-6 text-red-500/80" />
                </div>
                <p className="text-xs font-bold tracking-widest text-neutral-400 uppercase text-center leading-relaxed">
                  Tieni premuto lo schermo<br/>
                  <span className="text-[9px] text-neutral-600">per decifrare la missione</span>
                </p>
              </div>
            ) : (
              /* STATO RIVELATO */
              <div className="animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-5 border-b border-neutral-850 pb-3">
                  <p className="text-[9px] font-bold tracking-[0.2em] text-neutral-400 uppercase">
                    LA TUA DIRETTIVA NARRATIVA
                  </p>
                  <Eye className="w-3.5 h-3.5 text-neutral-500" />
                </div>

                {/* VISTA BUGIARDO */}
                {String(missionData.liarId) === String(playerId) && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                      <p className="text-red-500 font-black uppercase text-xs tracking-widest flex items-center gap-1.5">
                        <Skull className="w-3.5 h-3.5" />
                        SEI IL BUGIARDO
                      </p>
                    </div>
                    <p className="text-neutral-300 text-xs leading-relaxed">
                      La bugia che devi difendere con ogni mezzo è:
                    </p>
                    <div className="bg-red-500/5 border border-red-500/15 p-4 rounded-xl">
                      <p className="text-base font-bold text-white italic leading-snug text-center">
                        &ldquo;{missionData.lie}&rdquo;
                      </p>
                    </div>
                    <p className="text-[8px] text-red-500/40 uppercase tracking-widest pt-2 border-t border-neutral-850 text-center font-mono">
                      NON RIVELARE QUESTO CANALE
                    </p>
                  </div>
                )}

                {/* VISTA COMPLICE */}
                {String(missionData.accompliceId) === String(playerId) && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                      <p className="text-red-400 font-black uppercase text-xs tracking-widest flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5" />
                        SEI IL COMPLICE
                      </p>
                    </div>
                    <p className="text-neutral-300 text-xs leading-relaxed">
                      Devi proteggere <span className="font-bold text-white">{missionData.liarName}</span> (Bugiardo).
                      Sostieni la sua versione senza farti scoprire. La sua bugia è:
                    </p>
                    <div className="bg-red-500/5 border border-red-500/15 p-4 rounded-xl">
                      <p className="text-base font-bold text-white italic leading-snug text-center">
                        &ldquo;{missionData.lie}&rdquo;
                      </p>
                    </div>
                    <p className="text-[8px] text-red-400/40 uppercase tracking-widest pt-2 border-t border-neutral-850 text-center font-mono">
                      COLLABORA SEGRETIAMENTE
                    </p>
                  </div>
                )}

                {/* VISTA GIOCATORI NORMALI */}
                {String(missionData.liarId) !== String(playerId) && String(missionData.accompliceId) !== String(playerId) && (
                  <div className="space-y-4">
                    {missionData.truth ? (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                          <p className="text-emerald-400 font-black uppercase text-xs tracking-widest flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5" />
                            GIOCATORE ONESTO
                          </p>
                        </div>
                        <p className="text-neutral-300 text-xs leading-relaxed">
                          La verità che devi sostenere e difendere è:
                        </p>
                        <div className="bg-emerald-500/5 border border-emerald-500/15 p-4 rounded-xl">
                          <p className="text-base font-bold text-white italic leading-snug text-center">
                            &ldquo;{missionData.truth}&rdquo;
                          </p>
                        </div>
                      </>
                    ) : (
                      <p className="text-neutral-300 text-xs italic leading-relaxed uppercase tracking-wider text-center py-4">
                        Nessuna direttiva in arrivo. Osserva le reazioni degli altri per smascherare il bugiardo.
                      </p>
                    )}
                    <p className="text-[8px] text-neutral-500 uppercase tracking-widest pt-2 border-t border-neutral-850 text-center font-mono">
                      SCOPRI CHI STA MENTENDO
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

        ) : (
          /* 3. Standby */
          <div className="flex flex-col items-center justify-center gap-5 animate-in fade-in">
            <div className="relative flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-red-950/20 border border-red-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(220,38,38,0.12)]">
                <div className="w-3.5 h-3.5 rounded-full bg-red-500 shadow-[0_0_12px_rgba(220,38,38,0.85)] animate-ping absolute" />
                <div className="w-3 h-3 rounded-full bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.7)]" />
              </div>
            </div>
            <p className="text-neutral-400 text-xs tracking-[0.25em] font-mono uppercase text-center select-none animate-pulse">
              IN ATTESA DI DIRETTIVE
            </p>
          </div>
        )}

      </main>

      {/* FOOTER PERSISTENTE */}
      <div className="relative z-10 px-4 pb-4 flex-shrink-0">
        <div className="w-full max-w-md mx-auto bg-neutral-900 border border-neutral-850 p-4 rounded-2xl shadow-[0_4px_25px_rgba(0,0,0,0.5)]">
          <div className="flex justify-between items-end">
            <div>
              <div className="text-[9px] text-neutral-500 uppercase tracking-widest mb-1 font-bold">GIOCATORE</div>
              <div className="font-extrabold text-white uppercase text-sm tracking-wide">{playerName || 'SCONOSCIUTO'}</div>
            </div>
            <div className="text-right">
              <div className="text-[9px] text-neutral-500 uppercase tracking-widest mb-1 font-bold">POSTAZIONE</div>
              <div className="font-extrabold text-white uppercase text-sm font-mono tracking-wider">
                TAVOLA {seatNumber < 10 ? `0${seatNumber}` : seatNumber}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-neutral-850">
            {isTarget ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.85)]" />
                <span className="text-red-500 text-[9px] font-bold tracking-wider uppercase font-mono">NODO ISOLATO</span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                <span className="text-emerald-400 text-[9px] font-bold tracking-wider uppercase font-mono">COLLEGAMENTO SICURO</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* MODALI OVERLAY */}

      {/* Modale Selezione Bugiardo */}
      {showLiarProposal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
          <div className="bg-neutral-950 border border-red-500/20 max-w-sm w-full p-6 space-y-6 shadow-[0_0_40px_rgba(220,38,38,0.15)] rounded-2xl text-center hover:border-red-500/30 transition-all">
            <div className="space-y-3 flex flex-col items-center">
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-2xl w-fit">
                <Skull className="w-6 h-6 text-red-500 animate-pulse" />
              </div>
              <span className="text-[9px] bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-0.5 font-mono uppercase tracking-widest rounded">
                SELEZIONE DI SISTEMA
              </span>
              <h3 className="text-white text-base font-extrabold uppercase tracking-wide">PROTOCOLLO RUOLO</h3>
            </div>
            <p className="text-neutral-300 text-xs leading-relaxed uppercase tracking-wider font-mono">
              Il Sistema ti ha selezionato per questa sessione. Accetti di essere il Bugiardo?
            </p>
            <div className="flex flex-col gap-2.5 pt-2">
              <NeuButton
                type="button"
                onClick={() => handleLiarResponse(true)}
                variant="primary"
                className="w-full py-3 text-xs tracking-wider font-extrabold shadow-[0_0_15px_rgba(220,38,38,0.15)] animate-pulse"
              >
                ACCETTO IL RUOLO
              </NeuButton>
              <NeuButton
                type="button"
                onClick={() => handleLiarResponse(false)}
                variant="default"
                className="w-full py-2.5 text-xs tracking-wider"
              >
                RIFIUTO
              </NeuButton>
            </div>
          </div>
        </div>
      )}

      {/* Modale Selezione Complice */}
      {showAccompliceProposal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
          <div className="bg-neutral-950 border border-red-500/20 max-w-sm w-full p-6 space-y-6 shadow-[0_0_40px_rgba(220,38,38,0.15)] rounded-2xl text-center hover:border-red-500/30 transition-all">
            <div className="space-y-3 flex flex-col items-center">
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-2xl w-fit">
                <Shield className="w-6 h-6 text-red-500 animate-pulse" />
              </div>
              <span className="text-[9px] bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-0.5 font-mono uppercase tracking-widest rounded">
                SELEZIONE DI SISTEMA
              </span>
              <h3 className="text-white text-base font-extrabold uppercase tracking-wide">PROTOCOLLO COMPLICE</h3>
            </div>
            <p className="text-neutral-300 text-xs leading-relaxed uppercase tracking-wider font-mono">
              Il Sistema ti ha selezionato come COMPLICE. Aiuta il Bugiardo a nascondere la verità. Accetti?
            </p>
            <div className="flex flex-col gap-2.5 pt-2">
              <NeuButton
                type="button"
                onClick={() => handleAccompliceResponse(true)}
                variant="primary"
                className="w-full py-3 text-xs tracking-wider font-extrabold shadow-[0_0_15px_rgba(220,38,38,0.15)] animate-pulse"
              >
                ACCETTO IL RUOLO
              </NeuButton>
              <NeuButton
                type="button"
                onClick={() => handleAccompliceResponse(false)}
                variant="default"
                className="w-full py-2.5 text-xs tracking-wider"
              >
                RIFIUTO
              </NeuButton>
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}
