import { describe, expect, it, vi } from 'vitest'
import { logger } from '../lib/logging/logger'
import { handleCaughtError, handleRecoverableError, handleUncaughtError } from './root-error-handlers'

describe('React root error handlers', () => {
  it('routes root errors through logger without exposing error message', () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
    const error = new Error('private technical detail')

    handleCaughtError(error, { componentStack: 'stack' })
    handleUncaughtError(error, { componentStack: 'stack' })
    handleRecoverableError(error, { componentStack: 'stack' })

    expect(errorSpy).toHaveBeenCalledTimes(2)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy.mock.calls[0][1]).toEqual({ errorType: 'Error', errorInfo: { componentStack: 'stack' } })
    expect(JSON.stringify(errorSpy.mock.calls[0][1])).not.toContain('private technical detail')
    errorSpy.mockRestore()
    warnSpy.mockRestore()
  })
})
