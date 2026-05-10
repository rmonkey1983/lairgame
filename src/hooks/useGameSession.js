import { useSupabaseSession } from './useSupabaseSession';
import { useDemoSession } from './useDemoSession';

export const useGameSession = () => {
  const isDemo = sessionStorage.getItem('liar_is_demo') === 'true';
  
  const supabaseSession = useSupabaseSession();
  const demoSession = useDemoSession();

  // In production, demo must stay synchronized across devices.
  // Local-only demo session is kept for localhost development.
  const isLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  return isDemo && isLocalhost ? demoSession : supabaseSession;
};
