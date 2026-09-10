import { createSupabaseBrowserClient } from './client'

export const STAFF_AUTH_STORAGE_KEY = 'liar-system-staff-auth'
export const staffSupabaseClient = createSupabaseBrowserClient(STAFF_AUTH_STORAGE_KEY)
