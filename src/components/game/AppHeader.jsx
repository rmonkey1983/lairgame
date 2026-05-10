import { motion } from 'framer-motion';
import { Wifi, WifiOff } from 'lucide-react';

export default function AppHeader({ isConnected = true }) {
  return (
    <header
      className="flex items-center justify-between px-5 py-3 relative z-10"
      style={{
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,0,60,0.12)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center gap-2"
      >
        <img
          src="/logo.jpg"
          alt="Liar System"
          className="h-8 w-auto object-contain"
          style={{ filter: 'drop-shadow(0 0 8px rgba(255,0,60,0.55)) brightness(1.15)', borderRadius: '4px' }}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full"
        style={{
          background: isConnected ? 'rgba(52,211,153,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${isConnected ? 'rgba(52,211,153,0.25)' : 'rgba(239,68,68,0.25)'}`,
        }}
      >
        {isConnected ? (
          <Wifi className="w-3 h-3" style={{ color: '#34d399' }} />
        ) : (
          <WifiOff className="w-3 h-3" style={{ color: '#ef4444' }} />
        )}
        <motion.span
          animate={{ opacity: [1, 0.5, 1] }}
          transition={{ duration: 2, repeat: isConnected ? Infinity : 0 }}
          className="text-[0.6rem] font-display font-bold uppercase tracking-[0.18em]"
          style={{ color: isConnected ? '#34d399' : '#ef4444' }}
        >
          {sessionStorage.getItem('liar_is_demo') === 'true' ? 'DEMO' : isConnected ? 'LIVE' : 'OFFLINE'}
        </motion.span>
      </motion.div>
    </header>
  );
}