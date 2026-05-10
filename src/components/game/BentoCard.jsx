import { motion } from 'framer-motion';

/**
 * Bento-style card ispirata al design di Robin Holesinsky.
 * Glassmorphism dark con bordi sottili, backdrop blur e glow opzionale.
 */
export default function BentoCard({
  children,
  className = '',
  glowColor = null,
  delay = 0,
  onClick,
  ariaLabel,
  style = {},
  noPadding = false,
}) {
  const isInteractive = typeof onClick === 'function';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
      role={isInteractive ? 'button' : undefined}
      aria-label={ariaLabel}
      tabIndex={isInteractive ? 0 : undefined}
      onKeyDown={
        isInteractive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick(event);
              }
            }
          : undefined
      }
      className={`relative overflow-hidden rounded-3xl ${noPadding ? '' : 'p-5'} ${onClick ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black' : ''} ${className}`}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: glowColor
          ? `1px solid ${glowColor}35`
          : '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: glowColor
          ? `0 0 30px ${glowColor}15, 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)`
          : '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        ...style,
      }}
    >
      {/* Top highlight line */}
      <div
        className="absolute top-0 left-4 right-4 h-px pointer-events-none"
        style={{
          background: glowColor
            ? `linear-gradient(90deg, transparent, ${glowColor}60, transparent)`
            : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)',
        }}
      />
      {children}
    </motion.div>
  );
}