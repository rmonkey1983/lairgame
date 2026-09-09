import { describe, expect, it } from 'vitest'
import { appError, fail, ok } from './error.contracts'

describe('error and result contracts', () => {
  it('keeps success and failure explicit', () => {
    expect(ok('ready')).toEqual({ ok: true, value: 'ready' })
    expect(fail({ code: 'NETWORK' })).toEqual({ ok: false, error: { code: 'NETWORK' } })
  })

  it('keeps technical cause separate from user-safe message', () => {
    const cause = new Error('technical detail')
    expect(appError('NETWORK', 'Connessione non disponibile.', { cause, retryable: true })).toEqual({
      code: 'NETWORK', userMessage: 'Connessione non disponibile.', cause, retryable: true,
    })
  })
})
