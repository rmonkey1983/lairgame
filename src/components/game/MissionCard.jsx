import { motion } from 'framer-motion';
import BentoCard from './BentoCard';
import { Eye, EyeOff, ShieldAlert, Target } from 'lucide-react';

const MissionCard = ({ story, isLiar }) => {
  return (
    <BentoCard glowColor={isLiar ? '#ff003c' : '#3b82f6'} className="h-full">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-2xl ${isLiar ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-400'}`}>
            {isLiar ? <Eye size={24} /> : <EyeOff size={24} />}
          </div>
          <div>
            <h2 className="text-xl font-black italic uppercase tracking-tighter">La Tua Missione</h2>
            <p className="text-[0.6rem] text-white/30 uppercase tracking-[0.3em] font-bold">Protocollo {isLiar ? 'Bugiardo' : 'Innocente'}</p>
          </div>
        </div>
        <div className={`px-4 py-1.5 rounded-full text-[0.6rem] font-black uppercase tracking-widest border ${isLiar ? 'bg-red-500/10 border-red-500/20 text-red-500 shadow-[0_0_15px_rgba(255,0,60,0.2)]' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}`}>
          {isLiar ? 'ATTIVO' : 'OSSERVATORE'}
        </div>
      </div>

      <div className="relative min-h-[200px] flex items-center justify-center">
        {isLiar ? (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }}
            className="w-full"
          >
            <div className="p-6 bg-white/5 border border-white/10 rounded-[32px] relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full bg-red-500 shadow-[0_0_15px_rgba(255,0,60,0.5)]" />
              <p className="text-xl md:text-2xl font-medium leading-relaxed text-white/90 italic">
                "{story || "Attendere istruzioni dalla regia..."}"
              </p>
            </div>
          </motion.div>
        ) : (
          <div className="text-center space-y-6 max-w-sm">
            <div className="relative inline-block">
              <motion.div 
                animate={{ rotate: 360 }} 
                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                className="w-24 h-24 rounded-full border-2 border-dashed border-white/5" 
              />
              <ShieldAlert className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/10 w-10 h-10" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-bold uppercase tracking-widest text-white/60">Contenuto Criptato</p>
              <p className="text-[0.65rem] text-white/30 leading-relaxed uppercase tracking-widest">
                Solo il Bugiardo e il suo Complice conoscono i dettagli della missione. Il tuo compito è identificarli prima che sia troppo tardi.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-10 pt-8 border-t border-white/5 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Target size={14} className="text-white/20" />
          <span className="text-[0.55rem] text-white/20 uppercase tracking-widest font-bold">Obiettivo: {isLiar ? 'Non farti scoprire' : 'Trova il Bugiardo'}</span>
        </div>
      </div>
    </BentoCard>
  );
};

export default MissionCard;
