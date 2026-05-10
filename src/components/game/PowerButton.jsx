import { motion } from 'framer-motion';

const PowerButton = ({ 
  children, 
  onClick, 
  disabled = false, 
  className = '', 
  glowColor = '#ff003c',
  type = 'button',
  ariaLabel,
}) => {
  return (
    <motion.button
      type={type}
      aria-label={ariaLabel}
      whileHover={!disabled ? { scale: 1.02, y: -2 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
      onClick={onClick}
      disabled={disabled}
      className={`
        relative px-8 py-4 rounded-2xl font-bold uppercase tracking-widest
        transition-all duration-300 overflow-hidden
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
        focus-visible:ring-white focus-visible:ring-offset-black
        ${disabled ? 'opacity-50 cursor-not-allowed grayscale' : 'cursor-pointer'}
        ${className}
      `}
      style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: `1px solid ${glowColor}50`,
        color: glowColor,
        boxShadow: `0 0 20px ${glowColor}20, inset 0 0 10px ${glowColor}10`,
      }}
    >
      {/* Glossy overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
      
      {/* Glow on hover */}
      <motion.div
        className="absolute inset-0 opacity-0 transition-opacity duration-300"
        style={{
          background: `radial-gradient(circle at center, ${glowColor}30 0%, transparent 70%)`,
        }}
        whileHover={{ opacity: 1 }}
      />

      <span className="relative z-10 flex items-center justify-center gap-2">
        {children}
      </span>
    </motion.button>
  );
};

export default PowerButton;
