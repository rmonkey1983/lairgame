import { motion } from 'framer-motion';
import BentoCard from './BentoCard';
import { Users, Play, ShieldCheck, Loader2 } from 'lucide-react';
import PowerButton from './PowerButton';

const WaitingRoom = ({ players, isHost, onStart }) => {
  return (
    <BentoCard glowColor="#3b82f6" className="max-w-2xl mx-auto overflow-visible">
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-400">
            <Users size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-black italic uppercase tracking-tighter">Lobby di Attesa</h2>
            <p className="text-[0.6rem] text-white/30 uppercase tracking-[0.4em] font-bold">In attesa della cena...</p>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-3xl font-black italic text-white/90 leading-none">{players.length}</span>
          <span className="text-[0.5rem] text-white/30 uppercase font-bold tracking-widest">Giocatori</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
        {players.map((player, index) => (
          <motion.div 
            key={index} 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 group hover:border-white/10 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center font-black text-sm shadow-[0_4px_12px_rgba(59,130,246,0.3)]">
                {player.name[0].toUpperCase()}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold uppercase italic tracking-tight">{player.name}</span>
                <span className="text-[0.5rem] text-white/20 font-bold uppercase tracking-widest">{player.id > 100 ? 'Giocatore Reale' : 'Ospite Bot'}</span>
              </div>
            </div>
            {player.id > 100 ? (
              <ShieldCheck size={16} className="text-blue-400" />
            ) : (
              <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
            )}
          </motion.div>
        ))}
        {players.length === 0 && (
          <div className="col-span-full py-10 text-center border-2 border-dashed border-white/5 rounded-3xl">
            <Loader2 className="w-6 h-6 text-white/10 mx-auto animate-spin mb-3" />
            <p className="text-[0.6rem] text-white/20 uppercase font-black tracking-widest">Nessun giocatore connesso</p>
          </div>
        )}
      </div>

      <div className="relative pt-8 border-t border-white/5">
        {isHost ? (
          <div className="space-y-4">
            <PowerButton 
              ariaLabel="Avvia la sessione"
              onClick={onStart}
              disabled={players.length < 3}
              className="w-full !py-5"
            >
              <Play size={18} fill="currentColor" />
              AVVIA LA SESSIONE
            </PowerButton>
            {players.length < 3 && (
              <p className="text-center text-[0.55rem] text-[#ff003c] font-black uppercase tracking-widest animate-pulse">
                Minimo 3 giocatori richiesti per iniziare
              </p>
            )}
          </div>
        ) : (
          <div className="text-center p-6 bg-blue-500/5 rounded-2xl border border-blue-500/10">
            <p className="text-[0.65rem] text-blue-400 font-black uppercase tracking-[0.3em] animate-pulse">
              In attesa che l'host avvii la partita
            </p>
          </div>
        )}
      </div>
    </BentoCard>
  );
};

export default WaitingRoom;
