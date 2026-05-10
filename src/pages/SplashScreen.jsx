import { motion } from 'framer-motion';
import BackgroundEffects from '../components/game/BackgroundEffects';
import PowerButton from '../components/game/PowerButton';

const SplashScreen = ({ onEnter }) => {
  return (
    <div className="relative h-screen w-screen bg-[#000000] flex flex-col items-center justify-center overflow-hidden font-display">
      <BackgroundEffects />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 text-center"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="mb-8"
        >
          <img 
            src="/logo.jpg" 
            alt="Liar System Logo" 
            className="h-64 md:h-80 mx-auto"
          />
        </motion.div>

        <h1 className="text-5xl md:text-8xl font-black italic tracking-tighter uppercase mb-2">
          A Cena Col <span className="text-[#ff003c] drop-shadow-[0_0_15px_rgba(255,0,60,0.5)]">Bugiardo</span>
        </h1>
        
        <p className="text-white/40 uppercase tracking-[0.4em] text-[0.6rem] md:text-xs font-bold mb-12">
          Esperienza di deduzione sociale premium
        </p>

        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <PowerButton ariaLabel="Inizia partita" onClick={onEnter} className="!px-12 !py-4 text-sm">
            Inizia Partita
          </PowerButton>
        </motion.div>
      </motion.div>

      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 left-0 right-0 text-center"
      >
        <p className="text-[0.6rem] uppercase tracking-[0.5em] font-black text-[#ff003c] drop-shadow-[0_0_5px_rgba(255,0,60,0.3)]">
          Powered by Black Bulls Lab
        </p>
      </motion.footer>

      {/* Decorative lines */}
      <div className="absolute top-0 left-1/4 w-px h-full bg-gradient-to-b from-transparent via-white/5 to-transparent" />
      <div className="absolute top-0 right-1/4 w-px h-full bg-gradient-to-b from-transparent via-white/5 to-transparent" />
    </div>
  );
};

export default SplashScreen;
