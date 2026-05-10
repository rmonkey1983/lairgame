import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const TABLE_NAME = 'game_sessions';

export const useSupabaseSession = (tableCode = 'BBL-QR-7') => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  // Helper to fetch or create session
  const fetchOrCreateSession = useCallback(async () => {
    try {
      let { data, error } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .eq('table_code', tableCode)
        .single();

      if (error && error.code === 'PGRST116') {
        // Session doesn't exist, create it
        const { data: newSession, error: createError } = await supabase
          .from(TABLE_NAME)
          .insert([{ 
            table_code: tableCode,
            phase: 'waiting',
            players: [
              { id: 1, name: 'Marco (Bot)', role: 'innocente' },
              { id: 2, name: 'Sofia (Bot)', role: 'innocente' },
              { id: 3, name: 'Luca (Bot)', role: 'innocente' }
            ],
            active_story: "Eri a cena con un vecchio amico che non vedevi da anni.",
            timer_duration: 60,
            votes: {},
            logs: [{ time: new Date().toLocaleTimeString(), msg: 'Sistema Pronto (Supabase)' }]
          }])
          .select()
          .single();

        if (createError) throw createError;
        data = newSession;
      } else if (error) {
        throw error;
      }

      setSession(data);
    } catch (err) {
      console.error('Error fetching/creating session:', err);
    } finally {
      setLoading(false);
    }
  }, [tableCode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchOrCreateSession();

    // Subscribe to changes
    const channel = supabase
      .channel(`session:${tableCode}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLE_NAME,
          filter: `table_code=eq.${tableCode}`,
        },
        (payload) => {
          if (payload.new) {
            setSession(payload.new);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tableCode, fetchOrCreateSession]);

  const updateSession = useCallback(async (updates) => {
    try {
      // Map camelCase to snake_case if necessary
      const mappedUpdates = { ...updates };
      if (updates.currentCandidate !== undefined) {
        mappedUpdates.current_candidate = updates.currentCandidate;
        delete mappedUpdates.currentCandidate;
      }
      if (updates.currentLiar !== undefined) {
        mappedUpdates.current_liar = updates.currentLiar;
        delete mappedUpdates.currentLiar;
      }
      if (updates.currentAccomplice !== undefined) {
        mappedUpdates.current_accomplice = updates.currentAccomplice;
        delete mappedUpdates.currentAccomplice;
      }
      if (updates.activeStory !== undefined) {
        mappedUpdates.active_story = updates.activeStory;
        delete mappedUpdates.activeStory;
      }
      if (updates.adminHint !== undefined) {
        mappedUpdates.admin_hint = updates.adminHint;
        delete mappedUpdates.adminHint;
      }

      const { error } = await supabase
        .from(TABLE_NAME)
        .update(mappedUpdates)
        .eq('table_code', tableCode);

      if (error) throw error;
    } catch (err) {
      console.error('Error updating session:', err);
    }
  }, [tableCode]);

  const registerPlayer = useCallback(async (player) => {
    if (!player || !player.name) return null;
    try {
      // Get current players
      const { data, error: fetchError } = await supabase
        .from(TABLE_NAME)
        .select('players, logs')
        .eq('table_code', tableCode)
        .single();

      if (fetchError) throw fetchError;

      const currentPlayers = data.players || [];
      const exists = currentPlayers.find(p => p.name.toLowerCase() === player.name.toLowerCase());
      if (exists) return exists;

      const newPlayer = { ...player, id: player.id || Date.now(), role: 'innocente' };
      const newPlayers = [...currentPlayers, newPlayer];
      const newLogs = [{ time: new Date().toLocaleTimeString(), msg: `${player.name} si è unito` }, ...(data.logs || [])].slice(0, 15);

      const { error: updateError } = await supabase
        .from(TABLE_NAME)
        .update({ 
          players: newPlayers,
          logs: newLogs
        })
        .eq('table_code', tableCode);

      if (updateError) throw updateError;
      return newPlayer;
    } catch (err) {
      console.error('Error registering player:', err);
      return null;
    }
  }, [tableCode]);

  const castVote = useCallback(async (voterName, targetName) => {
    if (!voterName || !targetName) return;
    try {
      const { data, error: fetchError } = await supabase
        .from(TABLE_NAME)
        .select('votes, timer_duration')
        .eq('table_code', tableCode)
        .single();
      
      if (fetchError) throw fetchError;
      
      const voteTime = new Date().toISOString();
      const newVotes = { 
        ...(data.votes || {}), 
        [voterName]: { 
          target: targetName, 
          timestamp: voteTime,
        } 
      };
      
      const { error: updateError } = await supabase
        .from(TABLE_NAME)
        .update({ votes: newVotes })
        .eq('table_code', tableCode);
        
      if (updateError) throw updateError;
    } catch (err) {
      console.error('Error casting vote:', err);
    }
  }, [tableCode]);

  const resetVotes = useCallback(async () => {
    try {
      const { error } = await supabase
        .from(TABLE_NAME)
        .update({ votes: {} })
        .eq('table_code', tableCode);
        
      if (error) throw error;
    } catch (err) {
      console.error('Error resetting votes:', err);
    }
  }, [tableCode]);

  return { 
    session: session ? {
      ...session,
      currentCandidate: session.current_candidate,
      currentLiar: session.current_liar,
      currentAccomplice: session.current_accomplice,
      activeStory: session.active_story,
      adminHint: session.admin_hint,
      votes: session.votes || {},
      // Brain Logic: Calculate awards
      awards: session.phase === 'result' ? Object.keys(session.votes || {}).reduce((acc, voter) => {
        const vote = session.votes[voter];
        const isLiar = session.current_liar?.name === voter;
        const votedCorrectly = vote.target === session.current_liar?.name;
        
        // Calcolo voti ricevuti
        const votesAgainstThisPlayer = Object.values(session.votes).filter(v => v.target === voter).length;
        
        let title;

        if (isLiar) {
          if (votesAgainstThisPlayer === 0) title = "BUGIARDO ECCELLENTE";
          else if (votesAgainstThisPlayer <= 1) title = "MENTE FREDDA";
          else title = "BUGIARDO SCOPERTO";
        } else {
          if (votedCorrectly) {
            // Se ha votato correttamente e presto (timestamp logic can be added here if needed)
            title = "OCCHIO DI FALCO";
          } else {
            if (votesAgainstThisPlayer > 2) title = "CAPRO ESPIATORIO";
            else title = "ANALISTA DEL CAOS";
          }
        }

        acc[voter] = title;
        return acc;
      }, {}) : {}
    } : null, 
    loading, 
    updateSession, 
    registerPlayer,
    castVote,
    resetVotes
  };
};
