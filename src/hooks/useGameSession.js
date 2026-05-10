import { useSupabaseSession } from './useSupabaseSession';
import { useDemoSession } from './useDemoSession';

export const useGameSession = () => {
  const isDemo = sessionStorage.getItem('liar_is_demo') === 'true';
  
  const supabaseSession = useSupabaseSession();
  const demoSession = useDemoSession();

  return isDemo ? demoSession : supabaseSession;
};
