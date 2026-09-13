import { buildBrainAIPrompt, BrainAIProviderError, type BrainAIProvider, type BrainAIRequest } from './brain.ai'

export type BrainAIProviderConfig = {
  /** Public endpoint only. It must be a server-side authenticated boundary. */
  endpoint: string
  timeoutMs?: number
  fetcher?: typeof fetch
  /** Supplies the current Staff JWT for the boundary request, never for the AI payload. */
  getAccessToken?: () => Promise<string | undefined>
}

export type BrainAIEndpointRequest = {
  request: BrainAIRequest
  prompt: string
}

const DEFAULT_TIMEOUT_MS = 1500
const MAX_RESPONSE_BYTES = 32_768

function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/$/, '')
}

function isConfigured(config: BrainAIProviderConfig): boolean {
  return normalizeEndpoint(config.endpoint).length > 0
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const body = await response.text()
  if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) {
    throw new BrainAIProviderError('MALFORMED_RESPONSE')
  }
  try {
    return JSON.parse(body) as unknown
  } catch {
    throw new BrainAIProviderError('MALFORMED_RESPONSE')
  }
}

export function createProductionBrainAIProvider(config: BrainAIProviderConfig): BrainAIProvider {
  const endpoint = normalizeEndpoint(config.endpoint)
  const fetcher = config.fetcher ?? fetch
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return {
    async evaluate(request) {
      if (!isConfigured(config)) throw new BrainAIProviderError('MISSING_CONFIGURATION')
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new BrainAIProviderError('MISSING_CONFIGURATION')

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const payload: BrainAIEndpointRequest = { request, prompt: buildBrainAIPrompt(request) }

      try {
        const accessToken = await config.getAccessToken?.()
        let response: Response
        try {
          response = await fetcher(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json', ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
            body: JSON.stringify(payload),
            signal: controller.signal,
            credentials: 'include',
          })
        } catch {
          if (controller.signal.aborted) throw new BrainAIProviderError('NETWORK_ERROR')
          throw new BrainAIProviderError('NETWORK_ERROR')
        }

        if (!response.ok) {
          throw new BrainAIProviderError(response.status === 429 ? 'RATE_LIMIT' : 'HTTP_ERROR')
        }
        return await readJsonResponse(response)
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

/** Reads only public endpoint configuration; no provider credential is accepted here. */
export function createConfiguredProductionBrainAIProvider(endpoint = import.meta.env.VITE_BRAIN_AI_ENDPOINT, getAccessToken?: () => Promise<string | undefined>): BrainAIProvider | undefined {
  if (!endpoint?.trim()) return undefined
  return createProductionBrainAIProvider({ endpoint, getAccessToken })
}
