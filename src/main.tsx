import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import App from './app/App.tsx'
import { handleCaughtError, handleRecoverableError, handleUncaughtError } from './app/root-error-handlers'

createRoot(document.getElementById('root')!, {
  onCaughtError: handleCaughtError,
  onUncaughtError: handleUncaughtError,
  onRecoverableError: handleRecoverableError,
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
