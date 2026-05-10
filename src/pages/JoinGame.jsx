import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BackgroundEffects from '../components/game/BackgroundEffects';
import PowerButton from '../components/game/PowerButton';
import StyledInput from '../components/game/StyledInput';
import { QrCode, Scan, ShieldCheck, AlertCircle, Loader2, MapPin, Ticket, CheckCircle2 } from 'lucide-react';
import { useSupabaseSession } from '@/hooks/useSupabaseSession';
import { supabase } from '@/lib/supabase';

const generateDemoIdentity = () => {
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return {
    name: `Giocatore Demo ${suffix}`,
    ticketId: `DEMO-${suffix}`,
  };
};

const JOIN_STATE_KEY = 'liar_join_state';

const readJoinState = () => {
  try {
    const raw = sessionStorage.getItem(JOIN_STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const JoinGame = ({ onJoin, onDemo, setIsDemo }) => {
  const savedJoinState = readJoinState();
  const { session, registerPlayer } = useSupabaseSession();
  const [step, setStep] = useState(savedJoinState.step || 'ticket'); // ticket, waiting, table, success
  const [ticketId, setTicketId] = useState(savedJoinState.ticketId || '');
  const [participant, setParticipant] = useState(savedJoinState.participant || null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    const joinState = {
      step,
      ticketId,
      participant,
    };
    sessionStorage.setItem(JOIN_STATE_KEY, JSON.stringify(joinState));
  }, [step, ticketId, participant]);

  const handleFinalJoin = useCallback(async (pData) => {
    if (!pData?.name) return;
    const registered = await registerPlayer({ 
      name: pData.name, 
      id: Date.now() + 100, // ID reale
      tableCode: pData.table_code 
    });
    sessionStorage.removeItem(JOIN_STATE_KEY);
    onJoin(registered || { name: pData.name, tableCode: pData.table_code });
  }, [registerPlayer, onJoin]);

  // 1. Invio Ticket ID
  const handleSubmitTicket = async () => {
    if (!ticketId) return;
    setStatus('loading');
    setError('');

    // DEMO MODE CHECK
    if (ticketId.toUpperCase() === 'DEMO') {
      setIsDemo(true);
      sessionStorage.setItem('liar_is_demo', 'true');
      const demoIdentity = generateDemoIdentity();
      const demoUser = { name: demoIdentity.name, ticket_id: demoIdentity.ticketId, table_code: 'BBL-QR-7' };
      setParticipant(demoUser);
      setStep('table');
      setStatus('idle');
      return;
    }

    try {
      // Real Supabase validation
      const { data, error: upsertError } = await supabase
        .from('participants')
        .upsert([{ ticket_id: ticketId, status: 'pending' }], { onConflict: 'ticket_id' })
        .select()
        .single();

      if (upsertError) throw upsertError;
      
      setParticipant(data);
      if (data.status === 'validated') setStep('table');
      else if (data.status === 'seated') handleFinalJoin(data);
      else setStep('waiting');
    } catch (err) {
      setError('Errore durante l\'invio del ticket.');
      console.error(err);
    } finally {
      setStatus('idle');
    }
  };

  // 2. Listener per Validazione Regia
  useEffect(() => {
    if (step !== 'waiting' || !ticketId) return;

    const channel = supabase
      .channel(`participant:${ticketId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'participants', filter: `ticket_id=eq.${ticketId}` },
        (payload) => {
          setParticipant(payload.new);
          if (payload.new.status === 'validated') {
            setStep('table');
          } else if (payload.new.status === 'seated') {
            handleFinalJoin(payload.new);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [step, ticketId, handleFinalJoin]);

  // 3. Scan Tavolo
  const handleScanTable = () => {
    setStatus('scanning');
    setTimeout(async () => {
      const scannedTable = 'BBL-QR-7'; 
      
      if (scannedTable === participant.table_code) {
        setStatus('success');
        
        if (ticketId.toUpperCase() === 'DEMO') {
          const updatedDemo = { ...participant, status: 'seated' };
          setParticipant(updatedDemo);
          setTimeout(() => handleFinalJoin(updatedDemo), 1000);
          return;
        }

        const { data, error } = await supabase
          .from('participants')
          .update({ status: 'seated' })
          .eq('ticket_id', ticketId)
          .select()
          .single();
        
        if (!error) {
          setParticipant(data);
          setTimeout(() => handleFinalJoin(data), 1000);
        }
      } else {
        setError(`Tavolo errato. Recati al tavolo ${participant.table_code}`);
        setStatus('idle');
      }
    }, 1500);
  };

  if (!session) {
    return (
      <div className="relative min-h-screen w-full bg-[#000000] flex flex-col items-center justify-center p-6 font-display">
        <BackgroundEffects />
        <Loader2 size={40} className="text-[#ff003c] animate-spin relative z-10" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full bg-[#000000] flex flex-col items-center justify-center p-6 overflow-hidden font-display">
      <BackgroundEffects />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 w-full max-w-md">
        <div className="bg-white/5 border border-white/10 rounded-[40px] p-8 md:p-12 backdrop-blur-xl shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-[#ff003c] shadow-[0_0_15px_rgba(255,0,60,0.5)]" />
          
          <AnimatePresence mode="wait">
            {step === 'ticket' && (
              <motion.div key="step-ticket" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="text-center mb-10">
                  <Ticket className="w-12 h-12 text-[#ff003c] mx-auto mb-6" />
                  <h1 className="text-3xl font-black italic uppercase tracking-tighter mb-2">Benvenuto</h1>
                  <p className="text-[0.6rem] uppercase tracking-[0.3em] text-white/40 font-bold italic">Inserisci il codice del tuo biglietto</p>
                </div>
                
                <div className="space-y-4">
                  <StyledInput 
                    placeholder="Ticket (es. TKT-123) o scrivi 'DEMO'" 
                    value={ticketId} 
                    onChange={e => setTicketId(e.target.value.toUpperCase())}
                  />
                  {error && <p className="text-[0.6rem] text-red-500 uppercase font-bold text-center tracking-widest">{error}</p>}
                  <PowerButton ariaLabel="Invia codice ticket" onClick={handleSubmitTicket} disabled={status === 'loading'} className="w-full !py-4">
                    {status === 'loading' ? <Loader2 className="animate-spin mx-auto" size={16} /> : 'INVIA CODICE'}
                  </PowerButton>
                </div>
              </motion.div>
            )}

            {step === 'waiting' && (
              <motion.div key="step-waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
                <div className="relative w-24 h-24 mx-auto mb-10">
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} className="absolute inset-0 border-2 border-dashed border-[#ff003c]/30 rounded-full" />
                  <ShieldCheck size={48} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#ff003c] animate-pulse" />
                </div>
                <h2 className="text-2xl font-black italic uppercase tracking-tighter mb-4">Validazione...</h2>
                <p className="text-[0.65rem] text-white/50 leading-relaxed uppercase tracking-widest font-bold">
                  La Regia sta verificando il tuo arrivo.<br/>Rimani in attesa.
                </p>
                <p className="mt-8 text-[0.5rem] text-[#ff003c] font-black uppercase tracking-[0.4em] animate-bounce">Ticket: {ticketId}</p>
              </motion.div>
            )}

            {step === 'table' && (
              <motion.div key="step-table" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="text-center mb-10">
                  <MapPin className="w-12 h-12 text-[#3b82f6] mx-auto mb-6" />
                  <h1 className="text-3xl font-black italic uppercase tracking-tighter mb-2">Accomodati</h1>
                  <p className="text-[0.7rem] text-[#3b82f6] font-black uppercase tracking-[0.2em] mb-8">TAVOLO ASSEGNATO: {participant.table_code}</p>
                  <p className="text-[0.6rem] uppercase tracking-[0.2em] text-white/40 font-bold">Scansiona il QR sul tavolo per entrare</p>
                </div>

                <div className="space-y-6">
                  <div className="relative aspect-square max-w-[200px] mx-auto">
                    <div className="absolute inset-0 border-2 border-white/10 rounded-3xl" />
                    <div className="absolute inset-2 bg-black/40 rounded-2xl flex items-center justify-center">
                      {status === 'scanning' ? (
                        <Scan size={60} className="text-[#3b82f6] animate-pulse" />
                      ) : status === 'success' ? (
                        <CheckCircle2 size={60} className="text-green-500" />
                      ) : (
                        <QrCode size={60} className="text-white/10" />
                      )}
                    </div>
                    {status === 'scanning' && (
                      <motion.div animate={{ y: [-80, 80, -80] }} transition={{ duration: 1, repeat: Infinity }} className="absolute top-1/2 left-0 w-full h-1 bg-[#3b82f6] shadow-[0_0_15px_#3b82f6]" />
                    )}
                  </div>

                  {error && <p className="text-[0.6rem] text-red-500 uppercase font-bold text-center tracking-widest">{error}</p>}
                  
                  <PowerButton ariaLabel="Scansiona QR tavolo" onClick={handleScanTable} disabled={status !== 'idle'} className="w-full !py-4 !bg-[#3b82f6]/20 !border-[#3b82f6]/40 !text-[#3b82f6]">
                    SCANSIONA QR TAVOLO
                  </PowerButton>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-12 flex justify-center border-t border-white/5 pt-8">
            <button aria-label="Entra come regia admin" onClick={onDemo} className="text-[0.55rem] text-white/20 uppercase tracking-[0.2em] hover:text-white transition-colors flex items-center gap-2 font-bold">
              <AlertCircle size={10} /> ENTRA COME REGIA (ADMIN)
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default JoinGame;

