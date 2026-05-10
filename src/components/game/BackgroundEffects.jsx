import { motion } from 'framer-motion';

export default function BackgroundEffects() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,0,60,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,0,60,0.03) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Radial center glow */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 50% 30%, rgba(255,0,60,0.06) 0%, transparent 65%)',
        }}
      />

      {/* Top-right corner accent */}
      <motion.div
        className="absolute -top-24 -right-24 w-72 h-72 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(255,0,60,0.08) 0%, transparent 70%)', filter: 'blur(40px)' }}
        animate={{ opacity: [0.4, 0.7, 0.4], scale: [1, 1.1, 1] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Bottom-left corner accent */}
      <motion.div
        className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(120,0,255,0.05) 0%, transparent 70%)', filter: 'blur(40px)' }}
        animate={{ opacity: [0.3, 0.6, 0.3], scale: [1.05, 1, 1.05] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
      />

      {/* Scanline subtle */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,0,60,0.015) 3px, rgba(255,0,60,0.015) 4px)',
        }}
      />
    </div>
  );
}