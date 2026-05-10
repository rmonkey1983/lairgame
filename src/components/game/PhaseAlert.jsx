import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell } from 'lucide-react';

const PhaseAlert = ({ phase, visible, onComplete }) => {
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        onComplete();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [visible, onComplete]);

  const phaseConfig = {
    waiting: { label: 'Lobby Attesa', color: '#3b82f6' },
    liar_selection: { label: 'Scelta Bugiardo', color: '#ff003c' },
    accomplice_selection: { label: 'Scelta Complice', color: '#a855f7' },
    mission: { label: 'Inizio Missione', color: '#ff003c' },
    vote: { label: 'Fase Votazione', color: '#a855f7' },
    result: { label: 'Risultati Finali', color: '#22c55e' }
  };

  const current = phaseConfig[phase] || phaseConfig.waiting;

  return (
    <AnimatePresence>
      {visible && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.5, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.2, filter: 'blur(20px)' }}
            className="relative px-12 py-8 rounded-[40px] overflow-hidden"
            style={{
              background: 'rgba(0,0,0,0.8)',
              backdropFilter: 'blur(40px)',
              border: `2px solid ${current.color}40`,
              boxShadow: `0 0 100px ${current.color}20`
            }}
          >
            <div className="flex flex-col items-center text-center space-y-4">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="p-3 rounded-full bg-white/5 border border-white/10"
              >
                <Bell style={{ color: current.color }} />
              </motion.div>
              <div className="space-y-1">
                <p className="text-white/40 uppercase tracking-[0.4em] text-[0.6rem] font-bold">Nuova Fase</p>
                <h2 
                  className="text-4xl md:text-5xl font-black italic tracking-tighter uppercase"
                  style={{ color: current.color }}
                >
                  {current.label}
                </h2>
              </div>
            </div>

            {/* Scanning line animation */}
            <motion.div 
              className="absolute inset-0 pointer-events-none opacity-20"
              style={{
                background: `linear-gradient(to bottom, transparent, ${current.color}, transparent)`,
                height: '10%'
              }}
              animate={{ top: ['-10%', '110%'] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default PhaseAlert;
