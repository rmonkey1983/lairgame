export type AppEnvironment = 'development' | 'production' | 'test'
export function getAppEnvironment(mode = import.meta.env.MODE): AppEnvironment { if (mode === 'production' || mode === 'test') return mode; return 'development' }
