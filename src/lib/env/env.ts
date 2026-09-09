export type AppEnvironment = 'development' | 'production' | 'test'

// VITE_* values are public browser config. Never place secrets here.
export function getAppEnvironment(mode = import.meta.env.MODE): AppEnvironment { if (mode === 'production' || mode === 'test') return mode; return 'development' }
