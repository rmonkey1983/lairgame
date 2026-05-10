/**
 * BentoCard component provides a premium, frosted glass effect base for UI elements.
 */
const BentoCard = ({ children, className = '', phase = 'waiting' }) => {
  const phaseClass = `phase-${phase}`;
  
  return (
    <div className={`
      relative overflow-hidden
      backdrop-blur-md bg-white/5 
      border border-white/10 
      rounded-bento p-6 
      transition-all duration-500
      bento-glow ${phaseClass}
      ${className}
    `}>
      {/* Subtle Inner Highlight */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
      
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};

export default BentoCard;
