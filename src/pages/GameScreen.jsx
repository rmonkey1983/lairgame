import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameSession } from '@/hooks/useGameSession';
import AppHeader from '@/components/game/AppHeader';
import BackgroundEffects from '@/components/game/BackgroundEffects';
import WaitingRoom from '@/components/game/WaitingRoom';
import MissionCard from '@/components/game/MissionCard';
import TimerBar from '@/components/game/TimerBar';
import LiarChoiceScreen from '@/components/game/LiarChoiceScreen';
import PhaseAlert from '@/components/game/PhaseAlert';
import ProfileCard from '@/components/game/ProfileCard';
import BentoCard from '@/components/game/BentoCard';
import LiveVoteTracker from '@/components/game/LiveVoteTracker';
import { Trophy, Lightbulb, RefreshCw, AlertTriangle, Target, CheckCircle2 } from 'lucide-react';

const GameScreen = ({ currentUser }) => {
  const { session, updateSession, registerPlayer, castVote } = useGameSession();
  const [alertVisible, setAlertVisible] = useState(false);
  const [prevPhase, setPrevPhase] = useState(null);

  useEffect(() => {
    if (!session) return;
    if (currentUser?.name && !currentUser?.isHost) {
      const isRegistered = (session.players || []).some(p => p.name.toLowerCase() === currentUser.name.toLowerCase());
      if (!isRegistered) {
        registerPlayer(currentUser);
      }
    }
  }, [currentUser, session, registerPlayer]);

  useEffect(() => {
    if (!session) return;
    if (session.phase !== prevPhase && prevPhase !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAlertVisible(true);
    }
    setPrevPhase(session.phase);
  }, [session, prevPhase]);

  if (!session) {
    return (
      <div className="relative min-h-screen w-full bg-[#000000] flex flex-col items-center justify-center p-6 font-display">
        <BackgroundEffects />
        <RefreshCw size={40} className="text-[#ff003c] animate-spin relative z-10" />
      </div>
    );
  }

  const phase = session.phase || 'waiting';
  const players = session.players || [];
  
  const isMe = (name) => name?.toLowerCase() === currentUser?.name?.toLowerCase();
  
  const isCandidate = isMe(session.currentCandidate?.name);
  const isLiar = isMe(session.currentLiar?.name);
  const isAccomplice = isMe(session.currentAccomplice?.name);

  // Determinare se l'indizio corrente è destinato a questo giocatore
  const isHintVisible = () => {
    if (!session.adminHint || !session.adminHint.text) return false;
    const { targetType, targetId } = session.adminHint;
    
    if (targetType === 'all') return true;
    if (targetType === 'table' && session.table_code === targetId) return true;
    
    // Identifica il giocatore corrente nel database locale
    const myProfile = players.find(p => p.name.toLowerCase() === currentUser?.name?.toLowerCase());
    if (targetType === 'player' && myProfile?.id === targetId) return true;
    
    return false;
  };

  const showHint = isHintVisible();

  return (
    <div className="relative min-h-screen bg-[#000000] overflow-x-hidden font-display selection:bg-[#ff003c]/30 text-white">
      <BackgroundEffects />
      <AppHeader isConnected={true} />
      
      <PhaseAlert phase={phase} visible={alertVisible} onComplete={() => setAlertVisible(false)} />

      <main className="relative z-10 max-w-7xl mx-auto p-6 md:p-12">
        <AnimatePresence mode="wait">
          {phase === 'waiting' && (
            <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <WaitingRoom 
                players={players} 
                isHost={currentUser?.isHost} 
                onStart={() => updateSession({ phase: 'liar_selection', currentCandidate: null })} 
              />
            </motion.div>
          )}

          {(phase === 'liar_selection' || phase === 'accomplice_selection') && (
            <motion.div key="selection" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {isCandidate ? (
                <LiarChoiceScreen 
                  role={phase === 'liar_selection' ? 'bugiardo' : 'complice'}
                  duration={session.timer_duration || 20}
                  onAccept={() => {
                    const update = phase === 'liar_selection' 
                      ? { currentLiar: session.currentCandidate, phase: 'accomplice_selection', currentCandidate: null } 
                      : { currentAccomplice: session.currentCandidate, phase: 'mission', currentCandidate: null };
                    updateSession(update);
                  }}
                  onDecline={() => updateSession({ currentCandidate: null })}
                  onExpire={() => updateSession({ currentCandidate: null })}
                />
              ) : (
                <div className="max-w-2xl mx-auto space-y-8">
                  <BentoCard className="text-center py-16" glowColor={phase === 'liar_selection' ? '#ff003c' : '#a855f7'}>
                    <h2 className="text-4xl font-black italic uppercase mb-6 tracking-tighter">
                      Selezione {phase === 'liar_selection' ? 'Bugiardo' : 'Complice'}
                    </h2>
                    <div className="flex flex-col items-center gap-8">
                      <div className="relative">
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }} className="w-20 h-20 rounded-full border-2 border-dashed border-white/10" />
                        <RefreshCw className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/20 w-8 h-8" />
                      </div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[#ff003c] font-bold animate-pulse">
                        {session.currentCandidate ? `In attesa di ${session.currentCandidate.name}...` : 'Ricerca Candidato...'}
                      </p>
                    </div>
                  </BentoCard>

                  <BentoCard glowColor="#3b82f6">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-blue-400">
                        <Lightbulb size={24} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-widest mb-2 text-blue-400">Consiglio</h4>
                        <p className="text-white/70 italic text-lg leading-relaxed">"Ricorda: il bugiardo non ha paura di essere scoperto, ha paura di non essere creduto."</p>
                      </div>
                    </div>
                  </BentoCard>
                </div>
              )}
            </motion.div>
          )}

          {phase === 'mission' && (
            <motion.div key="mission" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 space-y-6">
                  <div className="p-6 bg-white/5 border border-white/10 rounded-[32px]">
                    <div className="flex justify-between items-center mb-4 px-2">
                      <span className="text-[0.6rem] text-white/30 uppercase font-black tracking-widest">Tempo Rimanente Missione</span>
                      <span className="text-[0.6rem] text-blue-400 font-black tracking-widest">{session.timer_duration}s</span>
                    </div>
                    <TimerBar 
                      key={session.timer_duration || 60}
                      duration={session.timer_duration || 60} 
                      onExpire={() => console.log('Mission Timer Expired')} 
                    />
                  </div>
                  <MissionCard story={session.activeStory} isLiar={isLiar || isAccomplice} />
                </div>
                <div className="lg:col-span-4 space-y-6">
                  <ProfileCard 
                    user={currentUser} 
                    role={isLiar ? 'bugiardo' : isAccomplice ? 'complice' : 'innocente'} 
                    award={session.awards?.[currentUser?.name]}
                  />
                  
                  {/* Visualizzazione Indizio Condizionale */}
                  {showHint && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }} 
                      animate={{ opacity: 1, scale: 1 }} 
                      className="p-6 rounded-[32px] bg-gradient-to-br from-yellow-500/20 to-yellow-600/5 border border-yellow-500/30 shadow-[0_0_30px_rgba(234,179,8,0.15)] relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/10 blur-[40px] pointer-events-none" />
                      
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-yellow-500/20 rounded-xl">
                          <AlertTriangle size={16} className="text-yellow-500" />
                        </div>
                        <div>
                          <p className="text-[0.6rem] text-yellow-500 font-bold uppercase tracking-[0.2em]">Messaggio Regia</p>
                          {session.adminHint.targetType === 'player' && (
                            <p className="text-[0.5rem] text-white/50 uppercase tracking-widest flex items-center gap-1 mt-0.5">
                              <Target size={8} /> Sussurro Privato
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <p className="text-sm text-yellow-100/90 italic leading-relaxed font-medium">
                        "{session.adminHint.text}"
                      </p>
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {phase === 'vote' && (
            <motion.div key="vote" className="max-w-4xl mx-auto py-12">
              <div className="text-center mb-16">
                <h2 className="text-5xl md:text-7xl font-black italic uppercase tracking-tighter mb-4">Votazione</h2>
                <p className="text-[0.65rem] text-white/40 uppercase tracking-[0.4em] font-bold">Seleziona chi secondo te sta mentendo</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {players.filter(p => !isMe(p.name)).map((p, i) => {
                  const hasVoted = session.votes?.[currentUser?.name]?.target === p.name;
                  return (
                    <BentoCard 
                      key={i} 
                      ariaLabel={`Vota ${p.name}`}
                      onClick={() => castVote(currentUser?.name, p.name)}
                      glowColor={hasVoted ? '#ff003c' : null}
                      className={`group transition-all ${hasVoted ? 'bg-[#ff003c]/5 border-[#ff003c]/30' : 'hover:bg-white/5'}`}
                    >
                      <div className="flex justify-between items-center w-full">
                        <span className={`text-2xl font-black uppercase italic tracking-tighter transition-colors ${hasVoted ? 'text-white' : 'text-white/60 group-hover:text-white'}`}>
                          {p.name}
                        </span>
                        {hasVoted && (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                            <CheckCircle2 className="text-[#ff003c]" size={24} />
                          </motion.div>
                        )}
                      </div>
                    </BentoCard>
                  );
                })}
              </div>
              
              <div className="mt-16 text-center">
                <div className="inline-flex items-center gap-4 px-6 py-3 bg-white/5 border border-white/10 rounded-full">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-[0.6rem] text-white/40 uppercase font-black tracking-widest">
                    VOTI RICEVUTI: {Object.keys(session.votes || {}).length} / {players.length}
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          {phase === 'result' && (
            <motion.div key="result" className="max-w-4xl mx-auto py-12">
              <div className="text-center mb-16">
                <Trophy className="w-20 h-20 text-yellow-500 mx-auto mb-8 shadow-[0_0_30px_rgba(234,179,8,0.2)]" />
                <h2 className="text-5xl md:text-7xl font-black italic uppercase tracking-tighter mb-4">Fine Missione</h2>
                <p className="text-white/40 uppercase tracking-[0.4em] text-[0.6rem] font-bold">Rivelazione della Verità</p>
              </div>

              <LiveVoteTracker 
                players={players} 
                votes={session.votes} 
                awards={session.awards}
                session={session}
                showResults={true} 
              />
              
              {currentUser?.isHost && (
                <div className="mt-12 flex justify-center">
                  <button 
                    aria-label="Torna in lobby"
                    onClick={() => updateSession({ phase: 'waiting', votes: {}, currentCandidate: null, currentLiar: null, currentAccomplice: null })}
                    className="px-10 py-4 bg-white text-black rounded-2xl font-black uppercase italic tracking-widest hover:scale-105 transition-all"
                  >
                    TORNA IN LOBBY
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default GameScreen;
