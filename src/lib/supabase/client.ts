import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { getSupabasePublicConfig } from '../env/env'

const config = getSupabasePublicConfig()

export const supabaseClient: SupabaseClient<Database> | null = config
  ? createClient<Database>(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null
