import { motion } from 'framer-motion';

const StyledInput = ({ 
  label, 
  value, 
  onChange, 
  placeholder, 
  type = 'text', 
  className = '',
  icon: Icon
}) => {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {label && (
        <label className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-white/40 ml-4">
          {label}
        </label>
      )}
      <div className="relative group">
        {Icon && (
          <div className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-white/60 transition-colors">
            <Icon size={18} />
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`
            w-full bg-white/5 border border-white/10 rounded-2xl py-4 
            ${Icon ? 'pl-14' : 'px-6'} pr-6
            text-white placeholder:text-white/20
            focus:outline-none focus:border-white/20 focus:bg-white/10
            transition-all duration-300
          `}
        />
        <motion.div 
          className="absolute inset-0 rounded-2xl border border-white/0 pointer-events-none"
          whileHover={{ borderColor: 'rgba(255,255,255,0.05)' }}
          animate={{ scale: [1, 1.01, 1] }}
          transition={{ duration: 4, repeat: Infinity }}
        />
      </div>
    </div>
  );
};

export default StyledInput;
