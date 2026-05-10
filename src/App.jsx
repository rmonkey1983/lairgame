import { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import BackgroundEffects from './components/game/BackgroundEffects';
import { RefreshCw } from 'lucide-react';

const SplashScreen = lazy(() => import('./pages/SplashScreen'));
const JoinGame = lazy(() => import('./pages/JoinGame'));
const GameScreen = lazy(() => import('./pages/GameScreen'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));

function AppContent() {
  const [user, setUser] = useState(() => {
    const saved = sessionStorage.getItem('liar_user');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [isDemo, setIsDemo] = useState(() => sessionStorage.getItem('liar_is_demo') === 'true');

  const navigate = useNavigate();

  useEffect(() => {
    if (user) sessionStorage.setItem('liar_user', JSON.stringify(user));
    sessionStorage.setItem('liar_is_demo', isDemo ? 'true' : 'false');
  }, [user, isDemo]);

  const handleEnter = () => navigate('/join');

  const handleJoin = (userData) => {
    setUser({ ...userData, isHost: false });
    // isDemo is already set by JoinGame if they use the DEMO ticket
    navigate('/game');
  };

  const handleDemo = () => {
    setUser({ name: 'Regia-Admin', tableCode: 'BBL-QR-7', isHost: true });
    setIsDemo(true);
    navigate('/admin'); // Admin should go to /admin
  };

  return (
    <AnimatePresence mode="wait">
      <Suspense
        fallback={
          <div className="relative min-h-screen w-full bg-[#000000] flex flex-col items-center justify-center p-6 font-display">
            <BackgroundEffects />
            <RefreshCw size={40} className="text-[#ff003c] animate-spin relative z-10" />
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<SplashScreen onEnter={handleEnter} />} />
          <Route path="/join" element={<JoinGame onJoin={handleJoin} onDemo={handleDemo} setIsDemo={setIsDemo} />} />
          <Route
            path="/game"
            element={<GameScreen currentUser={user} isDemo={isDemo} />}
          />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </Suspense>
    </AnimatePresence>
  );
}

function App() {
  return (
    <Router>
      <div className="app-container font-sans bg-[#0a0a0f] min-h-screen text-white">
        <AppContent />
      </div>
    </Router>
  );
}

export default App;
