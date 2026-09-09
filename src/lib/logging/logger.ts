type LogPayload = Record<string, unknown> | undefined
const isProduction = import.meta.env.PROD
export const logger = {
  info(message: string, payload?: LogPayload) { if (!isProduction) console.info(message, payload) },
  warn(message: string, payload?: LogPayload) { console.warn(message, payload) },
  error(message: string, payload?: LogPayload) { console.error(message, payload) },
}
