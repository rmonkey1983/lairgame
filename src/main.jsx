import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

// Auto-redirect da pathname standard a hash path per HashRouter
if (window.location.pathname !== '/' && !window.location.hash) {
  window.location.replace(`/#${window.location.pathname}${window.location.search}`);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Registrazione del Service Worker per supporto PWA e caching offline in sala
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('[PWA] Service Worker registrato con successo:', reg.scope))
      .catch((err) => console.error('[PWA] Errore registrazione Service Worker:', err));
  });
}
