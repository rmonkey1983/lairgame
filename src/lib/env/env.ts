export type AppEnvironment = 'development' | 'production' | 'test'

// VITE_* values are public browser config. Never place secrets here.
export function getAppEnvironment(mode = import.meta.env.MODE): AppEnvironment { if (mode === 'production' || mode === 'test') return mode; return 'development' }

export type SupabasePublicConfig = { url: string; publishableKey: string }

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  return url && publishableKey ? { url, publishableKey } : null
}
