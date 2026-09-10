import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { getSupabasePublicConfig } from '../env/env'

export function createSupabaseBrowserClient(storageKey: string): SupabaseClient<Database> | null {
  const config = getSupabasePublicConfig()
  return config
    ? createClient<Database>(config.url, config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey },
      })
    : null
}
