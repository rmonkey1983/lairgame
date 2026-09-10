import { appError, fail, ok, type Result } from '../../lib/errors/error.contracts'
import { logger } from '../../lib/logging/logger'
import { staffSupabaseClient } from '../../lib/supabase/staff-client'

export type StaffAccess = { staff_member_id: string; display_name: string | null; active: boolean }

function unavailable<T>(): Result<T> {
  return fail(appError('TEMPORARY_UNAVAILABLE', 'Accesso Regia non configurato.', { retryable: false }))
}

function mapStaffError(error: { message: string }, fallback = 'Accesso Regia non autorizzato.'): Result<never> {
  const messages: Record<string, string> = {
    AUTH_REQUIRED: 'Sessione Staff non disponibile.',
    STAFF_AUTH_REQUIRED: 'Accesso Staff richiesto.',
    STAFF_ACCESS_DENIED: 'Accesso Regia non autorizzato.',
    GAME_NOT_FOUND: 'Partita non trovata.',
  }
  return fail(appError(messages[error.message] ? 'FORBIDDEN' : 'UNKNOWN', messages[error.message] ?? fallback, { cause: error, retryable: !messages[error.message] }))
}

export async function signInStaff(email: string, password: string): Promise<Result<StaffAccess>> {
  const normalizedEmail = email.trim()
  if (!normalizedEmail || !password) return fail(appError('VALIDATION', 'Inserisci email e password.'))
  if (!staffSupabaseClient) return unavailable<StaffAccess>()

  const signedIn = await staffSupabaseClient.auth.signInWithPassword({ email: normalizedEmail, password })
  if (signedIn.error || !signedIn.data.user || signedIn.data.user.is_anonymous === true) {
    logger.warn('Staff sign-in failed', { cause: signedIn.error })
    return fail(appError('UNAUTHORIZED', 'Credenziali non valide.'))
  }

  const access = await getCurrentStaffAccess()
  if (!access.ok) {
    await staffSupabaseClient.auth.signOut({ scope: 'local' })
    return fail(appError('FORBIDDEN', 'Accesso Regia non autorizzato.', { cause: access.error.cause }))
  }
  return access
}

export async function getCurrentStaffAccess(): Promise<Result<StaffAccess>> {
  if (!staffSupabaseClient) return unavailable<StaffAccess>()
  const session = await staffSupabaseClient.auth.getSession()
  if (session.error) return fail(appError('NETWORK', 'Impossibile verificare l’accesso Regia.', { cause: session.error, retryable: true }))
  if (!session.data.session || session.data.session.user.is_anonymous === true) {
    return fail(appError('UNAUTHORIZED', 'Sessione Staff non disponibile.'))
  }
  const { data, error } = await staffSupabaseClient.rpc('get_my_staff_access')
  if (error || !data?.[0]) return error ? mapStaffError(error) : fail(appError('FORBIDDEN', 'Accesso Regia non autorizzato.'))
  return ok(data[0])
}

export async function signOutStaff(): Promise<Result<void>> {
  if (!staffSupabaseClient) return unavailable<void>()
  const { error } = await staffSupabaseClient.auth.signOut({ scope: 'local' })
  return error ? fail(appError('NETWORK', 'Logout non completato.', { cause: error, retryable: true })) : ok(undefined)
}
