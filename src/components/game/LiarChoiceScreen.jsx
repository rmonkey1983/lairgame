import { motion } from 'framer-motion';
import BentoCard from './BentoCard';
import PowerButton from './PowerButton';
import TimerBar from './TimerBar';
import { Skull, UserPlus } from 'lucide-react';

const LiarChoiceScreen = ({ role = 'bugiardo', duration = 20, onAccept, onDecline, onExpire }) => {
  const isLiar = role === 'bugiardo';
  const accentColor = isLiar ? '#ff003c' : '#a855f7';

  return (
    <div className="flex flex-col items-center justify-center space-y-8 p-4 max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center"
      >
        <div className="inline-block p-4 rounded-full bg-white/5 border border-white/10 mb-6">
          {isLiar ? (
            <Skull className="w-16 h-16" style={{ color: accentColor, filter: `drop-shadow(0 0 15px ${accentColor}60)` }} />
          ) : (
            <UserPlus className="w-16 h-16" style={{ color: accentColor, filter: `drop-shadow(0 0 15px ${accentColor}60)` }} />
          )}
        </div>
        <h2 className="text-4xl md:text-6xl font-black italic tracking-tighter uppercase mb-4">
          Sei stato <span style={{ color: accentColor }}>Scelto</span>
        </h2>
        <p className="text-white/40 uppercase tracking-[0.4em] text-[0.6rem] font-bold">
          Vuoi diventare il <span className="text-white">{isLiar ? 'Bugiardo' : 'Complice'}</span> della serata?
        </p>
      </motion.div>

      <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-3xl p-6">
        <p className="text-[0.6rem] uppercase tracking-widest text-white/40 mb-4 text-center">Tempo per decidere</p>
        <TimerBar duration={duration} onExpire={onExpire} className="h-3" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
        <BentoCard 
          ariaLabel="Accetta ruolo assegnato"
          glowColor={accentColor} 
          onClick={onAccept}
          className="group hover:bg-white/5 transition-colors"
        >
          <div className="flex flex-col items-center text-center space-y-4">
            <h3 className="text-xl font-bold uppercase italic">Accetta</h3>
            <p className="text-[0.65rem] text-white/40 uppercase tracking-widest leading-relaxed">
              {isLiar 
                ? 'Inganna tutti i presenti per vincere.' 
                : 'Aiuta il bugiardo a non farsi scoprire.'}
            </p>
            <PowerButton ariaLabel="Accetta ruolo" glowColor={accentColor} className="w-full">
              Accetto il Ruolo
            </PowerButton>
          </div>
        </BentoCard>

        <BentoCard 
          ariaLabel="Rifiuta ruolo assegnato"
          onClick={onDecline}
          className="group hover:bg-white/5 transition-colors opacity-60 grayscale hover:grayscale-0 hover:opacity-100"
        >
          <div className="flex flex-col items-center text-center space-y-4">
            <h3 className="text-xl font-bold uppercase italic">Rifiuta</h3>
            <p className="text-[0.65rem] text-white/40 uppercase tracking-widest leading-relaxed">
              Passa la mano. Verrà scelto un altro giocatore.
            </p>
            <button aria-label="Rifiuta ruolo" className="w-full py-4 rounded-2xl border border-white/10 text-white/30 text-xs font-bold uppercase tracking-widest group-hover:text-white group-hover:border-white/20 transition-all">
              Rifiuta Ruolo
            </button>
          </div>
        </BentoCard>
      </div>
    </div>
  );
};

export default LiarChoiceScreen;
