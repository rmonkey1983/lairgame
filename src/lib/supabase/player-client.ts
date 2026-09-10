import { createSupabaseBrowserClient } from './client'

export const PLAYER_AUTH_STORAGE_KEY = 'liar-system-player-auth'
export const playerSupabaseClient = createSupabaseBrowserClient(PLAYER_AUTH_STORAGE_KEY)
