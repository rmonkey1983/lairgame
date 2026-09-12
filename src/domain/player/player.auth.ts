import type { User } from '@supabase/supabase-js'
import { appError, fail, ok, type Result } from '../../lib/errors/error.contracts'
import { logger } from '../../lib/logging/logger'
import { playerSupabaseClient } from '../../lib/supabase/player-client'

function unavailable<T>(): Result<T> {
  return fail(appError('TEMPORARY_UNAVAILABLE', 'Servizio di gioco non configurato.', { retryable: false }))
}

async function createAnonymousSession(): Promise<Result<User>> {
  if (!playerSupabaseClient) return unavailable<User>()
  const signedIn = await playerSupabaseClient.auth.signInAnonymously()
  if (signedIn.error || !signedIn.data.user || signedIn.data.user.is_anonymous !== true) {
    logger.warn('Anonymous sign-in failed', { cause: signedIn.error })
    return fail(appError('UNAUTHORIZED', 'Impossibile creare la sessione Player.', { cause: signedIn.error, retryable: true }))
  }
  return ok(signedIn.data.user)
}

export async function ensureAnonymousPlayerSession(options: { forceFresh?: boolean } = {}): Promise<Result<User>> {
  if (!playerSupabaseClient) return unavailable<User>()

  const current = await playerSupabaseClient.auth.getSession()
  if (!options.forceFresh && !current.error && !current.data.session) return createAnonymousSession()
  if (!options.forceFresh && !current.error && current.data.session) {
    const verified = await playerSupabaseClient.auth.getUser()
    if (!verified.error && verified.data.user) {
      if (verified.data.user.is_anonymous === true) return ok(verified.data.user)
      return fail(appError('FORBIDDEN', 'Sessione non valida per Player.'))
    }
  }

  const cleared = await playerSupabaseClient.auth.signOut({ scope: 'local' })
  if (cleared.error) {
    return fail(appError('NETWORK', 'Impossibile ripristinare la sessione Player.', { cause: cleared.error, retryable: true }))
  }
  return createAnonymousSession()
}
