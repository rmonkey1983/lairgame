import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BentoCard from './BentoCard';
import { Shield, Target, Eye, EyeOff } from 'lucide-react';

const ProfileCard = ({ user, role, mission, award }) => {
  const [revealed, setRevealed] = useState(false);
  const isLiar = role === 'bugiardo';

  return (
    <BentoCard glowColor={isLiar ? '#ff003c' : '#3b82f6'} className="w-full">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-white/10 to-transparent border border-white/10 flex items-center justify-center relative">
            <div className={`absolute inset-0 rounded-full blur-md opacity-20 ${isLiar ? 'bg-red-500' : 'bg-blue-500'}`} />
            <span className="text-2xl font-black italic">{user.name[0]}</span>
          </div>
          <div>
            <h3 className="text-xl font-bold uppercase italic tracking-tighter">{user.name}</h3>
            <p className="text-[0.6rem] text-white/30 uppercase tracking-[0.3em]">Identità Protetta</p>
          </div>
        </div>
        
        <button 
          aria-label={revealed ? 'Nascondi ruolo' : 'Mostra ruolo'}
          onClick={() => setRevealed(!revealed)}
          className="p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
        >
          {revealed ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      <div className="space-y-6">
        <div className="relative h-20 rounded-2xl bg-black/40 border border-white/5 overflow-hidden flex items-center justify-center">
          <AnimatePresence mode="wait">
            {!revealed ? (
              <motion.div
                key="hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-1"
              >
                <div className="flex gap-1">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/10" />
                  ))}
                </div>
                <p className="text-[0.5rem] uppercase tracking-[0.4em] text-white/20">Ruolo Nascosto</p>
              </motion.div>
            ) : (
              <motion.div
                key="revealed"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-4 px-6 w-full"
              >
                <div className={`p-2 rounded-lg ${isLiar ? 'bg-red-500/20 text-red-500' : 'bg-blue-500/20 text-blue-500'}`}>
                  {isLiar ? <Target size={20} /> : <Shield size={20} />}
                </div>
                <div>
                  <p className="text-[0.55rem] uppercase tracking-widest text-white/40 mb-0.5">Il Tuo Ruolo</p>
                  <p className={`text-sm font-black uppercase italic ${isLiar ? 'text-red-500' : 'text-blue-500'}`}>
                    {isLiar ? 'Bugiardo' : 'Investigatore'}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
          <h4 className="text-[0.6rem] font-bold uppercase tracking-widest text-white/30 mb-3 flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-[#ff003c]" />
            Obiettivo Corrente
          </h4>
          <p className={`text-xs leading-relaxed ${!revealed ? 'filter blur-sm select-none opacity-20' : 'text-white/80'}`}>
            {mission || "In attesa di istruzioni dal tavolo..."}
          </p>
        </div>

        {award && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center gap-3"
          >
            <div className="text-blue-400">
              <Shield size={16} />
            </div>
            <div>
              <p className="text-[0.5rem] uppercase tracking-widest text-blue-400 font-bold">Titolo Assegnato</p>
              <p className="text-xs font-black italic uppercase text-white">{award}</p>
            </div>
          </motion.div>
        )}
      </div>
    </BentoCard>
  );
};

export default ProfileCard;
