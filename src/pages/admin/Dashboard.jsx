import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { useGameSession } from '@/hooks/useGameSession';
import BentoCard from '@/components/game/BentoCard';
import PowerButton from '@/components/game/PowerButton';
import StyledInput from '@/components/game/StyledInput';
import { 
  Settings, Users, ShieldCheck, Trophy, Send, Globe, MapPinned, User, Wand2, ScanLine
} from 'lucide-react';

const PRESET_STORIES = [
  "Eri a cena con un vecchio amico che non vedevi da anni. Parlavate del passato quando è successo l'imprevisto.",
  "Eri in missione segreta per recuperare un prototipo rubato. Il tuo contatto non si è presentato.",
  "Eri bloccato in un ascensore con tre sconosciuti. Uno di loro sembrava nascondere qualcosa.",
  "Eri a una festa di gala quando le luci si sono spente. Al ritorno della corrente, un quadro era sparito."
];

const MESSAGE_TEMPLATES = {
  waiting: [
    'Restate pronti, la sessione sta per iniziare.',
    'Controllate il tavolo e preparatevi alla prima fase.',
  ],
  liar_selection: [
    'Silenzio al tavolo: selezione in corso.',
    'Osservate attentamente i comportamenti degli altri.',
  ],
  accomplice_selection: [
    'Nuova scelta in corso, mantenete la concentrazione.',
    'State pronti: il gioco cambia rapidamente.',
  ],
  mission: [
    'Tempo missione attivo: collaborate senza dare indizi sospetti.',
    'Focus massimo: ogni dettaglio puo fare la differenza.',
  ],
  vote: [
    'Fase voto aperta: votate subito il sospetto principale.',
    'Votate ora, il tempo sta per scadere.',
  ],
  result: [
    'Risultati in arrivo: restate connessi.',
    'Fine round: preparatevi al prossimo giro.',
  ],
};

const AdminDashboard = () => {
  const { session, updateSession } = useGameSession(); 
  const [activeTab, setActiveTab] = useState('game'); 
  const [participants, setParticipants] = useState([]);
  const [totalBooked, setTotalBooked] = useState(0);
  const [validatingId, setValidatingId] = useState(null);
  const [validationData, setValidationData] = useState({ name: '', table: 'BBL-QR-7' });
  const [newStory, setNewStory] = useState('');
  const [newTimer, setNewTimer] = useState(60);
  const [hint, setHint] = useState('');
  const [hintTarget, setHintTarget] = useState('all');

  const fetchStats = useCallback(async () => {
    try {
      // 1. Fetch total bookings (paid)
      const { count, error: bookingError } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('payment_status', 'paid');
      
      if (bookingError) throw bookingError;
      setTotalBooked(count || 0);

      // 2. Fetch participants
      const { data, error } = await supabase
        .from('participants')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setParticipants(data || []);

      // Auto-start logic: if all validated and game hasn't started
      const confirmed = (data || []).filter(p => p.status === 'validated' || p.status === 'seated').length;
      if (count > 0 && confirmed >= count && session?.phase === 'waiting' && (data || []).length > 0) {
        // Option: updateSession({ phase: 'liar_selection' });
        console.log('Tutti i giocatori sono pronti!');
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  }, [session]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStats();
    const channel = supabase
      .channel('reception_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, () => fetchStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => fetchStats())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchStats]);

  const handleReset = () => {
    if (confirm('Resettare la sessione?')) {
      updateSession({
        phase: 'waiting',
        currentCandidate: null,
        currentLiar: null,
        currentAccomplice: null,
        adminHint: null,
        logs: [{ time: new Date().toLocaleTimeString(), msg: 'Sessione Resettata' }]
      });
    }
  };

  const handleValidate = async (ticketId) => {
    const { error } = await supabase
      .from('participants')
      .update({ 
        name: validationData.name, 
        table_code: validationData.table, 
        status: 'validated' 
      })
      .eq('ticket_id', ticketId);
    
    if (!error) {
      setValidatingId(null);
      fetchStats();
    }
  };

  const handleAction = (player, action) => {
    if (action === 'candidate') {
      updateSession({ currentCandidate: player, timer_duration: 20 });
    } else if (action === 'liar') {
      updateSession({ currentLiar: player, phase: 'accomplice_selection', currentCandidate: null });
    }
  };

  const tableCode = session.table_code || 'BBL-QR-7';
  const playerOptions = (session.players || []).filter((p) => p?.id && p?.name);

  const generateHint = () => {
    const phase = session.phase || 'waiting';
    const templates = MESSAGE_TEMPLATES[phase] || MESSAGE_TEMPLATES.waiting;
    const randomMessage = templates[Math.floor(Math.random() * templates.length)];
    setHint(randomMessage);
  };

  const handleSendHint = () => {
    const cleanHint = hint.trim();
    if (!cleanHint) return;

    let targetType = 'all';
    let targetId = null;
    let targetName = 'Tutti';

    if (hintTarget === 'table') {
      targetType = 'table';
      targetId = tableCode;
      targetName = `Tavolo ${tableCode}`;
    } else if (hintTarget.startsWith('player_')) {
      targetType = 'player';
      targetId = parseInt(hintTarget.replace('player_', ''), 10);
      const targetPlayer = playerOptions.find((p) => p.id === targetId);
      targetName = targetPlayer?.name || `Giocatore ${targetId}`;
    }

    updateSession({
      adminHint: { text: cleanHint, targetType, targetId },
      logs: [
        { time: new Date().toLocaleTimeString(), msg: `Messaggio a [${targetName}]: ${cleanHint}` },
        ...(session.logs || []),
      ].slice(0, 15),
    });

    setHint('');
  };

  const clearHint = () => {
    updateSession({ adminHint: null });
  };

  const phases = [
    { id: 'waiting', label: 'LOBBY (QR SCAN)', color: '#3b82f6' },
    { id: 'liar_selection', label: 'SCELTA BUGIARDO', color: '#ff003c' },
    { id: 'accomplice_selection', label: 'SCELTA COMPLICE', color: '#a855f7' },
    { id: 'mission', label: 'INIZIO MISSIONE', color: '#ff003c' },
    { id: 'vote', label: 'FASE VOTAZIONE', color: '#a855f7' },
    { id: 'result', label: 'RISULTATI FINALI', color: '#22c55e' }
  ];

  if (!session) return <div className="min-h-screen bg-black flex items-center justify-center text-[#ff003c] animate-pulse font-black">CONNESSIONE A SUPABASE...</div>;

  const confirmedCount = participants.filter(p => p.status === 'validated' || p.status === 'seated').length;
  const progress = totalBooked > 0 ? (confirmedCount / totalBooked) * 100 : 0;

  return (
    <div className="min-h-screen bg-[#000000] text-white p-6 md:p-12 font-display relative overflow-hidden">
      <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-[#ff003c]/5 blur-[120px] pointer-events-none" />

      <header className="max-w-7xl mx-auto flex justify-between items-center mb-16 relative z-10">
        <div className="flex items-center gap-6">
          <div className="p-4 rounded-3xl bg-white/5 border border-white/10">
            <Settings className="text-[#ff003c]" />
          </div>
          <div>
            <h1 className="text-4xl font-black italic uppercase tracking-tighter">GOD <span className="text-[#ff003c]">MODE</span></h1>
            <div className="flex items-center gap-2">
              <p className="text-[0.6rem] text-white/30 uppercase tracking-[0.5em] font-bold">Dashboard Regia</p>
              {sessionStorage.getItem('liar_is_demo') === 'true' && (
                <span className="text-[0.5rem] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-black border border-blue-500/30">DEMO</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link
            aria-label="Apri pagina scanner reception"
            to="/scanner-reception"
            className="px-6 py-3 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-[0.6rem] font-bold text-blue-300 hover:text-blue-200 transition-all inline-flex items-center gap-2 uppercase tracking-widest"
          >
            <ScanLine size={12} />
            Scanner Reception
          </Link>
          <div className="flex p-1 bg-white/5 border border-white/10 rounded-2xl">
            <button aria-label="Apri controllo game" onClick={() => setActiveTab('game')} className={`px-6 py-2 rounded-xl text-[0.6rem] font-bold uppercase transition-all ${activeTab === 'game' ? 'bg-[#ff003c]' : 'text-white/40'}`}>Controllo Game</button>
            <button aria-label="Apri reception" onClick={() => setActiveTab('reception')} className={`px-6 py-2 rounded-xl text-[0.6rem] font-bold uppercase transition-all ${activeTab === 'reception' ? 'bg-[#ff003c]' : 'text-white/40'}`}>Reception</button>
          </div>
          <button aria-label="Resetta sessione" onClick={handleReset} className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-[0.6rem] font-bold text-white/40 hover:text-red-500 transition-all">HARD RESET</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto relative z-10">
        {activeTab === 'game' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 space-y-8">
              <BentoCard glowColor="#ff003c">
                <h3 className="text-xl font-bold uppercase italic flex items-center gap-3 mb-8">
                  <Users size={22} className="text-[#ff003c]" />
                  Giocatori Connessi ({session.players?.length || 0})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(session.players || []).map((p, i) => (
                    <div key={i} className={`p-6 rounded-[32px] border ${session.currentCandidate?.id === p.id ? 'bg-[#ff003c]/10 border-[#ff003c]/30' : 'bg-white/5 border-white/10'}`}>
                      <div className="flex justify-between items-center mb-6">
                        <div className="flex flex-col">
                          <span className="font-black uppercase italic tracking-tighter text-lg flex items-center gap-2">
                            {p.name} {p.id > 100 && <span className="text-[#ff003c] text-[0.5rem] px-2 py-0.5 rounded-full bg-[#ff003c]/10 border border-[#ff003c]/20 font-bold">REALE</span>}
                          </span>
                          <span className={`text-[0.5rem] font-bold uppercase tracking-widest mt-1 ${session.votes?.[p.name] ? 'text-green-500' : 'text-white/20'}`}>
                            {session.votes?.[p.name] ? '● Attivo (Votato)' : '○ In Attesa...'}
                          </span>
                        </div>
                        {session.currentLiar?.id === p.id && <ShieldCheck className="text-[#ff003c]" size={18} />}
                      </div>
                      <div className="flex gap-2">
                        <button aria-label={`Proponi ${p.name} come candidato`} onClick={() => handleAction(p, 'candidate')} className="flex-1 py-2 rounded-xl bg-white/5 border border-white/10 text-[0.5rem] font-black uppercase">Proponi</button>
                        <button aria-label={`Imposta ${p.name} come bugiardo`} onClick={() => handleAction(p, 'liar')} className="px-4 py-2 rounded-xl bg-red-500/10 text-red-500 text-[0.5rem] font-black uppercase">Bugiardo</button>
                      </div>
                    </div>
                  ))}
                </div>
              </BentoCard>

              <BentoCard glowColor="#3b82f6">
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-lg font-bold uppercase italic">Gestione Missione</h3>
                  <PowerButton ariaLabel="Aggiorna storia e timer missione" onClick={() => updateSession({ activeStory: newStory || session.activeStory, timer_duration: parseInt(newTimer, 10) || session.timer_duration })} className="!px-6 !py-2 !text-[0.6rem]">AGGIORNA</PowerButton>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  <div className="md:col-span-8 space-y-3">
                    <textarea value={newStory || session.activeStory || ''} onChange={e => setNewStory(e.target.value)} className="w-full h-24 bg-white/5 border border-white/10 rounded-2xl p-4 text-sm" />
                    <div className="flex gap-2">
                      {PRESET_STORIES.map((s, i) => (
                        <button aria-label={`Seleziona preset storia ${i + 1}`} key={i} onClick={() => setNewStory(s)} className="text-[0.5rem] px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-white/40">Preset {i+1}</button>
                      ))}
                    </div>
                  </div>
                  <div className="md:col-span-4">
                    <StyledInput type="number" value={newTimer} onChange={e => setNewTimer(e.target.value)} className="!py-3" />
                  </div>
                </div>
              </BentoCard>
            </div>

            <div className="lg:col-span-4 space-y-8">
              <BentoCard glowColor="#f59e0b">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold uppercase italic text-amber-400">Messaggi Regia</h3>
                  <button
                    aria-label="Genera messaggio automatico"
                    onClick={generateHint}
                    className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 transition-all"
                  >
                    <Wand2 size={14} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      aria-label="Messaggio a tutti"
                      onClick={() => setHintTarget('all')}
                      className={`py-2 rounded-xl border text-[0.55rem] font-black uppercase tracking-widest transition-all ${hintTarget === 'all' ? 'bg-amber-500/20 border-amber-500/40 text-amber-200' : 'bg-white/5 border-white/10 text-white/50'}`}
                    >
                      <span className="inline-flex items-center gap-1"><Globe size={11} /> Tutti</span>
                    </button>
                    <button
                      aria-label="Messaggio al tavolo"
                      onClick={() => setHintTarget('table')}
                      className={`py-2 rounded-xl border text-[0.55rem] font-black uppercase tracking-widest transition-all ${hintTarget === 'table' ? 'bg-amber-500/20 border-amber-500/40 text-amber-200' : 'bg-white/5 border-white/10 text-white/50'}`}
                    >
                      <span className="inline-flex items-center gap-1"><MapPinned size={11} /> Tavolo</span>
                    </button>
                    <button
                      aria-label="Messaggio a singolo utente"
                      onClick={() => setHintTarget(playerOptions[0] ? `player_${playerOptions[0].id}` : 'all')}
                      className={`py-2 rounded-xl border text-[0.55rem] font-black uppercase tracking-widest transition-all ${hintTarget.startsWith('player_') ? 'bg-amber-500/20 border-amber-500/40 text-amber-200' : 'bg-white/5 border-white/10 text-white/50'}`}
                    >
                      <span className="inline-flex items-center gap-1"><User size={11} /> Singolo</span>
                    </button>
                  </div>

                  {hintTarget.startsWith('player_') && (
                    <select
                      aria-label="Seleziona giocatore destinatario"
                      value={hintTarget}
                      onChange={(e) => setHintTarget(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-amber-400/50"
                    >
                      {playerOptions.map((p) => (
                        <option key={p.id} value={`player_${p.id}`} className="bg-[#0a0a0f]">
                          {p.name}
                        </option>
                      ))}
                    </select>
                  )}

                  <textarea
                    value={hint}
                    onChange={(e) => setHint(e.target.value)}
                    placeholder="Scrivi un messaggio della regia..."
                    className="w-full h-24 bg-white/5 border border-white/10 rounded-2xl p-4 text-sm placeholder:text-white/30 focus:outline-none focus:border-amber-400/50"
                  />

                  <div className="flex gap-2">
                    <PowerButton
                      ariaLabel="Invia messaggio regia"
                      onClick={handleSendHint}
                      glowColor="#f59e0b"
                      className="w-full !py-3 !text-[0.6rem]"
                    >
                      <Send size={14} /> INVIA
                    </PowerButton>
                    <button
                      aria-label="Cancella messaggio regia attivo"
                      onClick={clearHint}
                      className="px-4 rounded-2xl bg-white/5 border border-white/10 text-[0.55rem] font-black uppercase text-white/50 hover:text-white transition-all"
                    >
                      Reset
                    </button>
                  </div>

                  {session.adminHint?.text && (
                    <p className="text-[0.55rem] text-amber-200/80 uppercase tracking-widest">
                      Attivo: "{session.adminHint.text}"
                    </p>
                  )}
                </div>
              </BentoCard>

              <BentoCard>
                <h3 className="text-lg font-bold uppercase italic mb-8 text-[#ff003c]">Controllo Fasi</h3>
                <div className="space-y-2">
                  {phases.map(p => (
                    <button aria-label={`Imposta fase ${p.label}`} key={p.id} onClick={() => updateSession({ phase: p.id, currentCandidate: null })} className={`w-full p-4 rounded-2xl border flex justify-between items-center transition-all ${session.phase === p.id ? 'bg-white/10 border-white/20' : 'bg-white/5 border-white/5'}`}>
                      <span className="text-[0.6rem] font-black uppercase tracking-widest">{p.label}</span>
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: session.phase === p.id ? p.color : 'rgba(255,255,255,0.1)' }} />
                    </button>
                  ))}
                </div>
              </BentoCard>

              <BentoCard>
                <h3 className="text-[0.6rem] font-black uppercase text-white/30 mb-4">Live Logs</h3>
                <div className="h-40 overflow-y-auto space-y-1 text-[0.5rem] font-mono opacity-50">
                  {(session.logs || []).map((l, i) => <p key={i}>[{l.time}] {l.msg}</p>)}
                </div>
              </BentoCard>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <BentoCard glowColor="#3b82f6" className="md:col-span-2">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h3 className="text-2xl font-black italic uppercase">Check-In Progress</h3>
                    <p className="text-[0.6rem] text-white/30 uppercase tracking-[0.4em]">Sincronizzazione Prenotazioni</p>
                  </div>
                  <div className="text-right">
                    <span className="text-5xl font-black italic text-blue-400">{confirmedCount}</span>
                    <span className="text-2xl font-black italic text-white/10"> / {totalBooked}</span>
                  </div>
                </div>
                
                <div className="h-4 bg-white/5 rounded-full overflow-hidden mb-8 border border-white/10">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} className="h-full bg-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.5)]" />
                </div>

                <div className="flex gap-4">
                  <button aria-label="Forza inizio partita" onClick={() => updateSession({ phase: 'liar_selection' })} className="flex-1 py-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-[0.7rem] font-black uppercase tracking-widest hover:bg-blue-500/20 transition-all">FORZA INIZIO GAME</button>
                </div>
              </BentoCard>

              <BentoCard className="flex flex-col justify-center text-center">
                <Trophy size={40} className="mx-auto mb-4 text-yellow-500 opacity-20" />
                <p className="text-[0.6rem] font-black uppercase tracking-[0.3em] text-white/40">Status</p>
                <p className="text-xl font-black italic uppercase mt-2">{confirmedCount >= totalBooked && totalBooked > 0 ? 'PRONTI AL LANCIO' : 'IN ATTESA DI ARRIVI'}</p>
              </BentoCard>
            </div>

            <BentoCard>
              <h3 className="text-xl font-black italic uppercase mb-8">Lista Partecipanti</h3>
              <div className="grid gap-4">
                {participants.map(p => (
                  <div key={p.ticket_id} className={`p-6 rounded-[32px] border flex justify-between items-center ${p.status === 'seated' ? 'bg-green-500/5 border-green-500/20' : p.status === 'validated' ? 'bg-blue-500/5 border-blue-500/20' : 'bg-white/5 border-white/10'}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-3 h-3 rounded-full ${p.status === 'seated' ? 'bg-green-500' : p.status === 'validated' ? 'bg-blue-400' : 'bg-white/20'}`} />
                      <span className="font-bold uppercase italic">{p.name || p.ticket_id}</span>
                    </div>
                    {p.status === 'pending' && (
                      <button aria-label={`Valida partecipante ${p.ticket_id}`} onClick={() => { setValidatingId(p.ticket_id); setValidationData({ name: '', table: 'BBL-QR-7' }); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 text-[0.5rem] font-black rounded-lg">VALIDA</button>
                    )}
                    {validatingId === p.ticket_id && (
                      <div className="flex gap-2">
                        <StyledInput placeholder="Nome" value={validationData.name} onChange={e => setValidationData({...validationData, name: e.target.value})} className="!py-1 !text-[0.6rem]" />
                        <button aria-label={`Conferma validazione ${p.ticket_id}`} onClick={() => handleValidate(p.ticket_id)} className="bg-blue-500 px-3 rounded-lg text-[0.5rem] font-black">OK</button>
                      </div>
                    )}
                    {p.status !== 'pending' && <span className="text-[0.5rem] font-black opacity-30 uppercase">{p.status}</span>}
                  </div>
                ))}
              </div>
            </BentoCard>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;
