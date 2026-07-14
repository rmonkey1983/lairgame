import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// Importazione lazy dei due nuovi componenti principali
const PlayerTerminal = lazy(() => import('./pages/PlayerTerminal'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));

// Fallback loader semplice
const PageLoader = () => (
  <div className="min-h-screen bg-black flex items-center justify-center text-red-500 font-mono text-xs tracking-widest uppercase animate-pulse">
    Caricamento...
  </div>
);

function App() {
  return (
    <HashRouter>
      <Toaster
        position="bottom-center"
        gutter={10}
        toastOptions={{
          duration: 4000,
          style: {
            background: '#0a0a0a',
            color: '#d4d4d4',
            border: '1px solid #262626',
            fontFamily: 'ui-monospace, monospace',
            fontSize: '11px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            borderRadius: '0',
            boxShadow: '6px 6px 12px #000000, -6px -6px 12px #1a1a1a',
            padding: '10px 16px',
          },
          success: {
            duration: 3500,
            iconTheme: { primary: '#22c55e', secondary: '#0a0a0a' },
          },
          error: {
            duration: 5000,
            iconTheme: { primary: '#ef4444', secondary: '#0a0a0a' },
          },
        }}
      />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Rotta Principale Giocatore */}
          <Route path="/" element={<PlayerTerminal />} />
          <Route path="/t/:tableCode/join" element={<PlayerTerminal />} />
          <Route path="/t/:tableCode/player-panel" element={<PlayerTerminal />} />
          <Route path="/t/:tableCode/game" element={<PlayerTerminal />} />

          {/* Rotta Regia Core */}
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/t/:tableCode/admin" element={<AdminDashboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}

export default App;
