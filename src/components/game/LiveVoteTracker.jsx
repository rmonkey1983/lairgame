import { motion } from 'framer-motion';
import BentoCard from './BentoCard';
import { Trophy, Users } from 'lucide-react';

const LiveVoteTracker = ({ players, votes = {}, awards = {}, showResults, session }) => {
  if (!showResults) return null;

  // Calculate vote tally
  const tally = (players || []).reduce((acc, player) => {
    const voteCount = Object.values(votes).filter(v => v?.target === player.name).length;
    acc[player.name] = voteCount;
    return acc;
  }, {});

  const totalVotes = Object.keys(votes).length;

  return (
    <BentoCard glowColor="#22c55e" className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-green-500/10 text-green-500">
            <Trophy size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-black italic uppercase tracking-tighter">Risultati</h2>
            <p className="text-[0.6rem] text-white/30 uppercase tracking-[0.4em] font-bold">Esito della Votazione</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-2xl border border-white/10">
          <Users size={14} className="text-white/40" />
          <span className="text-[0.7rem] font-black text-white/60">{totalVotes} VOTI</span>
        </div>
      </div>

      <div className="space-y-6">
        {players.map((player, index) => {
          const count = tally[player.name] || 0;
          const percentage = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
          const isLiar = player.role === 'bugiardo' || session?.currentLiar?.name === player.name;
          const award = awards[player.name];
          
          return (
            <motion.div 
              key={index} 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`p-6 rounded-[32px] border transition-all ${isLiar ? 'bg-red-500/5 border-red-500/20' : 'bg-white/5 border-white/10'}`}
            >
              <div className="flex justify-between items-center mb-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-black uppercase italic tracking-tighter">{player.name}</span>
                    {isLiar && (
                      <span className="text-[0.55rem] font-black uppercase tracking-widest bg-red-500 text-white px-2 py-0.5 rounded shadow-[0_0_10px_rgba(255,0,60,0.4)]">
                        IL BUGIARDO
                      </span>
                    )}
                  </div>
                  {award && (
                    <motion.span 
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="text-[0.6rem] text-blue-400 font-bold uppercase tracking-widest"
                    >
                      🏆 {award}
                    </motion.span>
                  )}
                </div>
                <span className={`text-sm font-black italic ${count > 0 ? 'text-white' : 'text-white/20'}`}>{count} VOTI</span>
              </div>
              
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                  className={`h-full ${isLiar ? 'bg-red-500 shadow-[0_0_15px_rgba(255,0,60,0.5)]' : 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]'}`}
                />
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-12 text-center">
        <p className="text-[0.6rem] text-white/20 uppercase font-black tracking-[0.4em] animate-pulse">
          La verità è stata rivelata
        </p>
      </div>
    </BentoCard>
  );
};

export default LiveVoteTracker;
