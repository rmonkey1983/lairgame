import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'liar_system_demo_session';

const getDefaultSession = () => ({
  table_code: 'BBL-QR-7',
  phase: 'waiting',
  players: [
    { id: 1, name: 'Marco (Bot)', role: 'innocente' },
    { id: 2, name: 'Sofia (Bot)', role: 'innocente' },
    { id: 3, name: 'Luca (Bot)', role: 'innocente' }
  ],
  currentCandidate: null,
  currentLiar: null,
  currentAccomplice: null,
  activeStory: "Eri a cena con un vecchio amico che non vedevi da anni.",
  timer_duration: 60,
  adminHint: '',
  logs: [{ time: new Date().toLocaleTimeString(), msg: 'Sistema Pronto' }]
});

export const useDemoSession = () => {
  const [session, setSession] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : getDefaultSession();
    } catch (e) {
      console.error("Errore lettura iniziale sessione:", e);
      return getDefaultSession();
    }
  });

  const updateSession = useCallback((updates) => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const current = saved ? JSON.parse(saved) : session;
      
      let autoUpdates = {};
      if (updates.phase && updates.phase !== current.phase) {
        if ((updates.phase === 'liar_selection' || updates.phase === 'accomplice_selection') && !updates.currentCandidate) {
          const available = (current.players || []).filter(p => 
            p.role === 'innocente' && 
            p.id !== current.currentLiar?.id && 
            p.id !== current.currentAccomplice?.id
          );
          if (available.length > 0) {
            const real = available.find(p => p.id > 100);
            autoUpdates.currentCandidate = real || available[0];
            autoUpdates.timer_duration = 20;
          }
        }
      }

      const newState = { ...current, ...updates, ...autoUpdates };
      
      if (newState.players) {
        const uniquePlayers = [];
        const seenNames = new Set();
        for (const p of newState.players) {
          const nameLower = p.name.toLowerCase();
          if (!seenNames.has(nameLower)) {
            seenNames.add(nameLower);
            uniquePlayers.push(p);
          }
        }
        newState.players = uniquePlayers;
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
      setSession(newState);
      window.dispatchEvent(new Event('storage'));
    } catch (e) {
      console.error("Errore aggiornamento sessione:", e);
    }
  }, [session]);

  const registerPlayer = useCallback((player) => {
    if (!player || !player.name) return null;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const current = saved ? JSON.parse(saved) : session;
      
      const exists = (current.players || []).find(p => p.name.toLowerCase() === player.name.toLowerCase());
      if (exists) return exists;

      const newPlayer = { ...player, id: Date.now(), role: 'innocente' };
      const newState = { 
        ...current, 
        players: [...(current.players || []), newPlayer],
        logs: [{ time: new Date().toLocaleTimeString(), msg: `${player.name} si è unito` }, ...(current.logs || [])].slice(0, 15)
      };
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
      setSession(newState);
      window.dispatchEvent(new Event('storage'));
      return newPlayer;
    } catch (e) {
      console.error("Errore registrazione giocatore:", e);
      return null;
    }
  }, [session]);

  const castVote = useCallback(async (voterName, targetName) => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const current = saved ? JSON.parse(saved) : session;
      const newVotes = { 
        ...(current.votes || {}), 
        [voterName]: { target: targetName, timestamp: new Date().toISOString() } 
      };
      const newState = { ...current, votes: newVotes };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
      setSession(newState);
      window.dispatchEvent(new Event('storage'));
    } catch (e) {
      console.error("Errore voto demo:", e);
    }
  }, [session]);

  useEffect(() => {
    const sync = () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const data = JSON.parse(saved);
          if (JSON.stringify(data) !== JSON.stringify(session)) {
            setSession(data);
          }
        }
      } catch (e) {
        console.error("Errore sync demo:", e);
      }
    };
    window.addEventListener('storage', sync);
    const interval = setInterval(sync, 500);
    return () => {
      window.removeEventListener('storage', sync);
      clearInterval(interval);
    };
  }, [session]);

  // Bot Simulation Logic
  useEffect(() => {
    if (session.phase === 'vote') {
      const bots = (session.players || []).filter(p => p.name.includes('(Bot)'));
      
      const timer = setTimeout(() => {
        const newVotes = { ...(session.votes || {}) };
        let changed = false;
        
        bots.forEach(bot => {
          if (!newVotes[bot.name]) {
            const targets = (session.players || []).filter(p => p.name !== bot.name);
            const randomTarget = targets[Math.floor(Math.random() * targets.length)];
            newVotes[bot.name] = { target: randomTarget.name, timestamp: new Date().toISOString() };
            changed = true;
          }
        });
        
        if (changed) {
          updateSession({ votes: newVotes });
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [session.phase, session.players, session.votes, updateSession]);

  return { 
    session: session ? {
      ...session,
      votes: session.votes || {},
      awards: session.phase === 'result' ? Object.keys(session.votes || {}).reduce((acc, voter) => {
        const vote = session.votes[voter];
        const isLiar = session.currentLiar?.name === voter;
        const votedCorrectly = vote?.target === session.currentLiar?.name;
        const votesAgainstThisPlayer = Object.values(session.votes || {}).filter(v => v.target === voter).length;
        
        let title;
        if (isLiar) {
          if (votesAgainstThisPlayer === 0) title = "BUGIARDO ECCELLENTE";
          else if (votesAgainstThisPlayer <= 1) title = "MENTE FREDDA";
          else title = "BUGIARDO SCOPERTO";
        } else {
          if (votedCorrectly) title = "OCCHIO DI FALCO";
          else title = votesAgainstThisPlayer > 1 ? "CAPRO ESPIATORIO" : "ANALISTA DEL CAOS";
        }
        acc[voter] = title;
        return acc;
      }, {}) : {}
    } : null, 
    updateSession, 
    registerPlayer,
    castVote
  };
};
