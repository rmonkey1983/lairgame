import { ButtonHTMLAttributes, FC } from 'react';

interface NeuButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'danger' | 'success';
}

export const NeuButton: FC<NeuButtonProps> = ({
  variant = 'default',
  children,
  className = '',
  disabled,
  ...props
}) => {
  // Base classes for Brand-Premium Button (Liar System Crimson Red & Pure Black theme)
  const baseClass = 'px-4 py-2.5 rounded-lg font-bold text-xs uppercase tracking-widest transition-all duration-300 ease-out select-none flex items-center justify-center gap-2 border';

  // Interaction feedback and active state classes
  const stateClass = disabled
    ? 'opacity-35 cursor-not-allowed pointer-events-none'
    : 'hover:scale-[1.02] active:scale-[0.98] cursor-pointer';

  // Text color, background and accent classes based on variant (Liar System Brand Colors)
  let variantClass = '';
  switch (variant) {
    case 'primary':
      // Brand Crimson Red: #dc2626
      variantClass = 'bg-red-600/10 hover:bg-red-600/25 border-red-500/30 text-red-500 hover:text-red-400 hover:border-red-500/50 hover:shadow-[0_0_15px_rgba(220,38,38,0.25)]';
      break;
    case 'danger':
      variantClass = 'bg-red-950/20 hover:bg-red-900/30 border-red-800/40 text-red-600 hover:text-red-400 hover:border-red-600/60 hover:shadow-[0_0_15px_rgba(220,38,38,0.2)]';
      break;
    case 'success':
      variantClass = 'bg-emerald-600/10 hover:bg-emerald-600/25 border-emerald-500/30 text-emerald-400 hover:text-emerald-300 hover:border-emerald-500/50 hover:shadow-[0_0_15px_rgba(16,185,129,0.25)]';
      break;
    case 'default':
    default:
      variantClass = 'bg-neutral-900/60 hover:bg-neutral-900/95 border-neutral-800/80 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700/60';
      break;
  }

  return (
    <button
      disabled={disabled}
      className={`${baseClass} ${stateClass} ${variantClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
