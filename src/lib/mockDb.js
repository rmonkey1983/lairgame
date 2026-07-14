// Database Mock Condiviso in-memory per test offline local-first
// Aggiornato v3: + scenario_phases, scenario_hints, status/settings su stories

const isPlaceholder = (import.meta.env.VITE_SUPABASE_URL || '').includes('placeholder');
const forceMockLocal = typeof window !== 'undefined' && localStorage.getItem('liar_force_mock') === 'true';

class MockDatabase {
  constructor() {
    this.isMock = isPlaceholder || forceMockLocal;

    this.state = {
      // ── Stato globale evento ──────────────────────────────────
      gameState: { id: 1, current_phase: 1, active_story_id: null },

      // ── Storie ───────────────────────────────────────────────
      stories: [
        {
          id: 1,
          title: "L'Ombra del Toro",
          tagline: "Un tradimento silenzioso tra le fazioni",
          intro: "Stasera una delle fazioni nasconde un segreto che potrebbe ribaltare gli equilibri. Qualcuno mente. Qualcuno copre. Sta a voi scoprire chi.",
          liar_briefing: "Sei il Bugiardo. Il tuo obiettivo è convincere tutti che il microfilm non esiste. Inventa dettagli credibili e mantieni la calma.",
          accomplice_briefing: "Sei il Complice. Conosci l'identità del Bugiardo. Supportalo senza farti scoprire. Semina dubbi sugli altri.",
          difficulty: 'medium',
          min_players: 3,
          cover_emoji: '🐂',
          is_active: true,
          status: 'published',
          version: 1,
          author_name: 'Black Bulls Lab',
          settings: { liar_count_formula: 'auto', accomplice_enabled: true, accomplice_count_formula: 'auto', role_choice_duration: 60, mission_timer: 300, initial_coins: 100, auction_enabled: true, transfers_enabled: true, min_players: 3, max_players: 40 },
          cover_image_url: null,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        },
        {
          id: 2,
          title: "Il Tradimento della Rosa",
          tagline: "Alleanze spezzate e veleni dolci",
          intro: "Una figura misteriosa ha venduto informazioni riservate alla fazione nemica. La cena è solo una copertura. Il vero gioco è scoprire il traditore prima del dolce.",
          liar_briefing: "Sei il Traditore. Hai già consegnato i documenti. Ora devi far credere che sia stato qualcun altro. Usa le emozioni degli altri come scudo.",
          accomplice_briefing: "Sei il Complice. Sai chi ha tradito. Crea alibi credibili e attacca i sospetti degli innocenti. Non rivelare troppo.",
          difficulty: 'hard',
          min_players: 4,
          cover_emoji: '🌹',
          is_active: true,
          status: 'published',
          version: 1,
          author_name: 'Black Bulls Lab',
          settings: { liar_count_formula: 'auto', accomplice_enabled: true, accomplice_count_formula: 'auto', role_choice_duration: 60, mission_timer: 600, initial_coins: 100, auction_enabled: true, transfers_enabled: true, min_players: 4, max_players: 30 },
          cover_image_url: null,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        },
        {
          id: 3,
          title: "Codice Notte Fonda",
          tagline: "Una spia nel cuore del tavolo",
          intro: "Un agente infiltrato ha accesso ai segreti di tutte le fazioni. Questa notte deve estrarre informazioni senza essere smascherato. Chi è lo spione?",
          liar_briefing: "Sei la Spia. Devi raccogliere tre informazioni chiave dagli altri tavoli prima della fine del secondo piatto. Sii discreto.",
          accomplice_briefing: "Sei la Copertura. Hai il compito di proteggere la spia creando confusione. Ogni domanda che devia i sospetti conta.",
          difficulty: 'easy',
          min_players: 2,
          cover_emoji: '🕵️',
          is_active: true,
          status: 'draft',
          version: 1,
          author_name: 'Black Bulls Lab',
          settings: { liar_count_formula: 'auto', accomplice_enabled: true, accomplice_count_formula: 'auto', role_choice_duration: 60, mission_timer: 300, initial_coins: 80, auction_enabled: false, transfers_enabled: true, min_players: 2, max_players: 20 },
          cover_image_url: null,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        }
      ],

      // ── Fasi Scenario ────────────────────────────────────────
      scenario_phases: [
        { id: 1, story_id: 1, phase_number: 1, name: 'Antipasto', subtitle: 'Avvia Ricatti', duration_seconds: 300, description: null, mc_script: 'Benvenuti signori! Stasera qualcuno a questa tavola mente...', actor_script: 'Entra in scena con il vassoio coperto. Guarda i giocatori uno ad uno.', sort_order: 1, created_at: new Date().toISOString() },
        { id: 2, story_id: 1, phase_number: 2, name: 'Primo Piatto', subtitle: 'Asta Indizi', duration_seconds: 600, description: null, mc_script: null, actor_script: null, sort_order: 2, created_at: new Date().toISOString() },
        { id: 3, story_id: 1, phase_number: 3, name: 'Secondo Piatto', subtitle: 'Interrogatorio', duration_seconds: 600, description: null, mc_script: null, actor_script: null, sort_order: 3, created_at: new Date().toISOString() },
        { id: 4, story_id: 1, phase_number: 4, name: 'Dolce & Fine', subtitle: 'Votazione Finale', duration_seconds: 300, description: null, mc_script: null, actor_script: null, sort_order: 4, created_at: new Date().toISOString() },
        { id: 5, story_id: 2, phase_number: 1, name: 'Antipasto', subtitle: 'Il Sospetto', duration_seconds: 300, description: null, mc_script: null, actor_script: null, sort_order: 1, created_at: new Date().toISOString() },
        { id: 6, story_id: 2, phase_number: 2, name: 'Primo Piatto', subtitle: 'Asta Alleanza', duration_seconds: 600, description: null, mc_script: null, actor_script: null, sort_order: 2, created_at: new Date().toISOString() },
        { id: 7, story_id: 2, phase_number: 3, name: 'Secondo Piatto', subtitle: 'Confessione', duration_seconds: 600, description: null, mc_script: null, actor_script: null, sort_order: 3, created_at: new Date().toISOString() },
        { id: 8, story_id: 2, phase_number: 4, name: 'Dolce & Fine', subtitle: 'Verdetto', duration_seconds: 300, description: null, mc_script: null, actor_script: null, sort_order: 4, created_at: new Date().toISOString() },
        { id: 9, story_id: 3, phase_number: 1, name: 'Antipasto', subtitle: 'Raccolta Intel', duration_seconds: 300, description: null, mc_script: null, actor_script: null, sort_order: 1, created_at: new Date().toISOString() },
        { id: 10, story_id: 3, phase_number: 2, name: 'Primo Piatto', subtitle: 'Codice Cifrato', duration_seconds: 600, description: null, mc_script: null, actor_script: null, sort_order: 2, created_at: new Date().toISOString() },
        { id: 11, story_id: 3, phase_number: 3, name: 'Secondo Piatto', subtitle: 'Smascheramento', duration_seconds: 600, description: null, mc_script: null, actor_script: null, sort_order: 3, created_at: new Date().toISOString() },
        { id: 12, story_id: 3, phase_number: 4, name: 'Dolce & Fine', subtitle: 'Verdetto Finale', duration_seconds: 300, description: null, mc_script: null, actor_script: null, sort_order: 4, created_at: new Date().toISOString() },
      ],

      // ── Hint Scenario ────────────────────────────────────────
      scenario_hints: [
        { id: 1, story_id: 1, phase_number: 1, hint_text: 'Qualcuno mente sul microfilm...', target: 'all', trigger_type: 'manual', trigger_delay_seconds: 0, sort_order: 1, created_at: new Date().toISOString() },
        { id: 2, story_id: 1, phase_number: 1, hint_text: 'Controlla il tavolo Beta', target: 'faction', trigger_type: 'timed', trigger_delay_seconds: 300, sort_order: 2, created_at: new Date().toISOString() },
        { id: 3, story_id: 1, phase_number: 2, hint_text: "L'indizio costa 20 BBL", target: 'all', trigger_type: 'manual', trigger_delay_seconds: 0, sort_order: 1, created_at: new Date().toISOString() },
      ],

      // ── Missioni ─────────────────────────────────────────────
      missions: [
        // Storia 1: L'Ombra del Toro
        { id: 101, story_id: 1, phase: 1, type: 'primary',   title: 'Recupera il Microfilm',        description: 'Scopri quale fazione custodisce il microfilm. Parla con i tavoli vicini e raccogli indizi entro la fine dell\'antipasto.',          target: 'innocent',    reward_coins: 30, is_revealed: true,  sort_order: 1, created_at: new Date().toISOString() },
        { id: 102, story_id: 1, phase: 1, type: 'secondary',  title: 'Scambia un Segreto',           description: 'Rivela un segreto falso a un\'altra fazione e osserva la loro reazione. Se credono alla bugia guadagni 10 BBL.',                  target: 'liar',        reward_coins: 10, is_revealed: true,  sort_order: 2, created_at: new Date().toISOString() },
        { id: 103, story_id: 1, phase: 2, type: 'primary',   title: 'L\'Asta degli Indizi',          description: 'La regia metterà all\'asta un indizio cruciale. Usa i tuoi BBL per aggiudicartelo prima degli altri tavoli.',                       target: 'all',         reward_coins: 20, is_revealed: true,  sort_order: 3, created_at: new Date().toISOString() },
        { id: 104, story_id: 1, phase: 2, type: 'bonus',     title: 'Doppio Gioco',                  description: 'Convinci un giocatore di un altro tavolo a votare contro la propria fazione durante la fase voto. Vale 40 BBL.',                   target: 'accomplice',  reward_coins: 40, is_revealed: false, sort_order: 4, created_at: new Date().toISOString() },
        { id: 105, story_id: 1, phase: 3, type: 'primary',   title: 'L\'Interrogatorio',             description: 'Ogni fazione deve fare almeno una domanda diretta al tavolo sospettato. Chi rifiuta perde 15 BBL.',                               target: 'all',         reward_coins: 0,  is_revealed: true,  sort_order: 5, created_at: new Date().toISOString() },
        { id: 106, story_id: 1, phase: 4, type: 'primary',   title: 'Il Voto Finale',                description: 'Esprimi il tuo voto. Se identifichi correttamente il Bugiardo la tua fazione guadagna 50 BBL.',                                   target: 'innocent',    reward_coins: 50, is_revealed: true,  sort_order: 6, created_at: new Date().toISOString() },

        // Storia 2: Il Tradimento della Rosa
        { id: 201, story_id: 2, phase: 1, type: 'primary',   title: 'Trova il Documento Rubato',    description: 'Un documento riservato è sparito. Parla con le altre fazioni e costruisci la tua versione dei fatti.',                              target: 'innocent',    reward_coins: 25, is_revealed: true,  sort_order: 1, created_at: new Date().toISOString() },
        { id: 202, story_id: 2, phase: 1, type: 'secondary',  title: 'Semina il Panico',             description: 'Accusa pubblicamente una fazione innocente entro la fine dell\'antipasto. Se nessuno ti contraddice guadagni 20 BBL.',              target: 'liar',        reward_coins: 20, is_revealed: true,  sort_order: 2, created_at: new Date().toISOString() },
        { id: 203, story_id: 2, phase: 2, type: 'primary',   title: 'L\'Asta dell\'Alleanza',       description: 'Offri BBL per formare un\'alleanza temporanea con un altro tavolo. L\'alleato non potrà votarti.',                                  target: 'all',         reward_coins: 15, is_revealed: true,  sort_order: 3, created_at: new Date().toISOString() },
        { id: 204, story_id: 2, phase: 3, type: 'primary',   title: 'La Confessione Pubblica',      description: 'Durante il secondo piatto, una fazione deve confessare un dettaglio (vero o falso) sulla propria storia. Decidete voi quale.',       target: 'all',         reward_coins: 10, is_revealed: true,  sort_order: 4, created_at: new Date().toISOString() },
        { id: 205, story_id: 2, phase: 4, type: 'primary',   title: 'Il Verdetto della Rosa',       description: 'Il voto finale. Se il Traditore viene smascherato, tutti gli Innocenti vincono 60 BBL.',                                            target: 'innocent',    reward_coins: 60, is_revealed: true,  sort_order: 5, created_at: new Date().toISOString() },

        // Storia 3: Codice Notte Fonda
        { id: 301, story_id: 3, phase: 1, type: 'primary',   title: 'Raccolta Informazioni',        description: 'Visita un altro tavolo durante l\'antipasto e poni almeno due domande. Ogni risposta è una prova.',                                  target: 'all',         reward_coins: 15, is_revealed: true,  sort_order: 1, created_at: new Date().toISOString() },
        { id: 302, story_id: 3, phase: 2, type: 'secondary',  title: 'Il Messaggio Cifrato',        description: 'La regia vi fornirà un codice segreto. Chi lo decifra per primo guadagna 35 BBL.',                                                  target: 'all',         reward_coins: 35, is_revealed: false, sort_order: 2, created_at: new Date().toISOString() },
        { id: 303, story_id: 3, phase: 3, type: 'primary',   title: 'Smascherare la Copertura',    description: 'Identifica il Complice della Spia prima del voto finale. Vale 45 BBL.',                                                              target: 'innocent',    reward_coins: 45, is_revealed: true,  sort_order: 3, created_at: new Date().toISOString() },
        { id: 304, story_id: 3, phase: 4, type: 'primary',   title: 'Verdetto Notte Fonda',         description: 'Vota per la Spia. Risposta corretta: 40 BBL per tutta la fazione.',                                                                 target: 'all',         reward_coins: 40, is_revealed: true,  sort_order: 4, created_at: new Date().toISOString() },
      ],

      // ── Fazioni ──────────────────────────────────────────────
      factions: [
        { id: 1, name: "Tavolo Alpha", bbl_coins: 120, group_secret: "IL CODICE SEGRETO È 'BULL'", table_code: "BBL-QR-7",  story_id: 1, created_at: new Date().toISOString() },
        { id: 2, name: "Tavolo Beta",  bbl_coins: 80,  group_secret: "IL CODICE SEGRETO È 'LIAR'", table_code: "BBL-BETA", story_id: 2, created_at: new Date().toISOString() }
      ],

      // ── Partecipanti & Ticket ─────────────────────────────────
      participants: [],
      bookings: [
        { ticket_code: "TKT-992-BBL", name: "MARCO", paid: true },
        { ticket_code: "TKT-100-BBL", name: "ANNA",  paid: true }
      ],
      tickets: [
        { ticket_code: "TKT-992-BBL", used: false },
        { ticket_code: "TKT-100-BBL", used: false }
      ],

      // ── Gioco ─────────────────────────────────────────────────
      session: null,
      game_players: [],
      game_votes: [],
      game_logs: [],
      session_missions: [],
      coin_transactions: [],

      listeners: []
    };

    // Carica stato da localStorage se presente
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('liar_mock_db_state');
        if (saved) {
          const parsed = JSON.parse(saved);
          this.state = { ...this.state, ...parsed, listeners: [] };
        }
      } catch (e) {
        console.error('Errore nel caricamento del mock DB da localStorage:', e);
      }

      // Sincronizzazione cross-tab in tempo reale
      window.addEventListener('storage', (e) => {
        if (e.key === 'liar_mock_db_state' && e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue);
            const currentListeners = this.state.listeners;
            this.state = { ...parsed, listeners: currentListeners };
            currentListeners.forEach(l => l());
          } catch (err) {
            console.error('Errore nel parsing del mock DB da storage event:', err);
          }
        }
      });
    }
  }

  // ── Pub/Sub ────────────────────────────────────────────────
  subscribe(listener) {
    this.state.listeners.push(listener);
    return () => {
      this.state.listeners = this.state.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    if (typeof window !== 'undefined') {
      try {
        const stateToSave = { ...this.state };
        delete stateToSave.listeners;
        localStorage.setItem('liar_mock_db_state', JSON.stringify(stateToSave));
      } catch (e) {
        console.error('Errore nel salvataggio del mock DB su localStorage:', e);
      }
    }
    this.state.listeners.forEach(l => l());
  }

  // ── Game State ────────────────────────────────────────────
  getGameState() { return this.state.gameState; }
  updateGameState(updates) {
    this.state.gameState = { ...this.state.gameState, ...updates };
    this.notify();
    return this.state.gameState;
  }

  // ── Storie / Scenari ─────────────────────────────────────
  getStories()        { return this.state.stories.filter(s => s.is_active); }
  getAllStories()     { return this.state.stories; }
  getStory(id)        { return this.state.stories.find(s => s.id === id) || null; }
  getMissions(storyId){ return (this.state.missions || []).filter(m => m.story_id === storyId).sort((a, b) => a.sort_order - b.sort_order); }

  createStory(story) {
    const maxId = this.state.stories.reduce((max, s) => Math.max(max, s.id), 0);
    const newStory = {
      id: maxId + 1,
      status: 'draft',
      version: 1,
      is_active: true,
      settings: { liar_count_formula: 'auto', accomplice_enabled: true, accomplice_count_formula: 'auto', role_choice_duration: 60, mission_timer: 300, initial_coins: 100, auction_enabled: true, transfers_enabled: true, min_players: 3, max_players: 40 },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...story
    };
    this.state.stories.push(newStory);
    // Crea 4 fasi di default
    const defaultPhases = [
      { name: 'Antipasto', subtitle: 'Fase 1', duration_seconds: 300 },
      { name: 'Primo Piatto', subtitle: 'Fase 2', duration_seconds: 600 },
      { name: 'Secondo Piatto', subtitle: 'Fase 3', duration_seconds: 600 },
      { name: 'Dolce & Fine', subtitle: 'Fase 4', duration_seconds: 300 },
    ];
    const maxPhaseId = this.state.scenario_phases.reduce((max, p) => Math.max(max, p.id), 0);
    defaultPhases.forEach((p, i) => {
      this.state.scenario_phases.push({
        id: maxPhaseId + i + 1,
        story_id: newStory.id,
        phase_number: i + 1,
        ...p,
        description: null,
        mc_script: null,
        actor_script: null,
        sort_order: i + 1,
        created_at: new Date().toISOString()
      });
    });
    this.notify();
    return newStory;
  }

  updateStory(id, updates) {
    this.state.stories = this.state.stories.map(s => s.id === id ? { ...s, ...updates, updated_at: new Date().toISOString() } : s);
    this.notify();
    return this.getStory(id);
  }

  deleteStory(id) {
    this.state.stories = this.state.stories.filter(s => s.id !== id);
    this.state.missions = (this.state.missions || []).filter(m => m.story_id !== id);
    this.state.scenario_phases = this.state.scenario_phases.filter(p => p.story_id !== id);
    this.state.scenario_hints = this.state.scenario_hints.filter(h => h.story_id !== id);
    this.notify();
  }

  duplicateStory(id) {
    const original = this.getStory(id);
    if (!original) return null;
    const newStory = this.createStory({
      ...original,
      id: undefined,
      title: original.title + ' (copia)',
      status: 'draft',
      version: 1
    });
    // Duplica missioni
    const originalMissions = this.getMissions(id);
    const maxMissionId = (this.state.missions || []).reduce((max, m) => Math.max(max, m.id), 0);
    originalMissions.forEach((m, i) => {
      this.state.missions.push({ ...m, id: maxMissionId + i + 1, story_id: newStory.id });
    });
    // Duplica hint
    const originalHints = this.getScenarioHints(id);
    const maxHintId = this.state.scenario_hints.reduce((max, h) => Math.max(max, h.id), 0);
    originalHints.forEach((h, i) => {
      this.state.scenario_hints.push({ ...h, id: maxHintId + i + 1, story_id: newStory.id });
    });
    this.notify();
    return newStory;
  }

  // ── Fasi Scenario ────────────────────────────────────────
  getScenarioPhases(storyId) {
    return this.state.scenario_phases.filter(p => p.story_id === storyId).sort((a, b) => a.sort_order - b.sort_order);
  }
  setScenarioPhases(storyId, phases) {
    this.state.scenario_phases = this.state.scenario_phases.filter(p => p.story_id !== storyId);
    const maxId = this.state.scenario_phases.reduce((max, p) => Math.max(max, p.id), 0);
    phases.forEach((p, i) => {
      this.state.scenario_phases.push({ ...p, id: p.id || maxId + i + 1, story_id: storyId, sort_order: i + 1, phase_number: i + 1 });
    });
    this.notify();
  }

  // ── Hint Scenario ────────────────────────────────────────
  getScenarioHints(storyId) {
    return this.state.scenario_hints.filter(h => h.story_id === storyId).sort((a, b) => a.sort_order - b.sort_order);
  }
  setScenarioHints(storyId, hints) {
    this.state.scenario_hints = this.state.scenario_hints.filter(h => h.story_id !== storyId);
    const maxId = this.state.scenario_hints.reduce((max, h) => Math.max(max, h.id), 0);
    hints.forEach((h, i) => {
      this.state.scenario_hints.push({ ...h, id: h.id || maxId + i + 1, story_id: storyId, sort_order: i + 1 });
    });
    this.notify();
  }

  // ── Missioni CRUD ────────────────────────────────────────
  addMission(mission) {
    const maxId = (this.state.missions || []).reduce((max, m) => Math.max(max, m.id), 0);
    const newMission = { id: maxId + 1, created_at: new Date().toISOString(), ...mission };
    this.state.missions.push(newMission);
    this.notify();
    return newMission;
  }
  updateMission(id, updates) {
    this.state.missions = this.state.missions.map(m => m.id === id ? { ...m, ...updates } : m);
    this.notify();
  }
  deleteMission(id) {
    this.state.missions = this.state.missions.filter(m => m.id !== id);
    this.notify();
  }

  // ── Fazioni ──────────────────────────────────────────────
  getFactions()              { return this.state.factions; }
  getFaction(id)             { return this.state.factions.find(f => f.id === id) || null; }
  getFactionByTableCode(code){ return this.state.factions.find(f => f.table_code === code) || null; }
  updateFaction(id, updates) {
    this.state.factions = this.state.factions.map(f => f.id === id ? { ...f, ...updates } : f);
    this.notify();
    return this.state.factions.find(f => f.id === id);
  }

  // ── Partecipanti & Ticket ─────────────────────────────────
  getParticipants(tableCode)  { return this.state.participants.filter(p => p.table_code === tableCode); }
  addParticipant(participant) {
    const newPart = { id: Math.random().toString(), status: 'pending', created_at: new Date().toISOString(), ...participant };
    this.state.participants.push(newPart);
    this.notify();
    return newPart;
  }
  updateParticipant(id, updates) {
    this.state.participants = this.state.participants.map(p => p.id === id ? { ...p, ...updates } : p);
    this.notify();
    return this.state.participants.find(p => p.id === id);
  }
  verifyTicket(ticketCode) { return this.state.tickets.find(t => t.ticket_code === ticketCode) || null; }
  useTicket(ticketCode) {
    this.state.tickets = this.state.tickets.map(t => t.ticket_code === ticketCode ? { ...t, used: true } : t);
    this.notify();
  }

  // ── Token BBL ────────────────────────────────────────────
  transferTokens(fromId, toId, amount) {
    const from = this.getFaction(fromId);
    const to   = this.getFaction(toId);
    if (!from || !to) throw new Error('Fazione non trovata');
    if (from.bbl_coins < amount) throw new Error('Saldo BBL insufficiente');
    this.updateFaction(fromId, { bbl_coins: from.bbl_coins - amount });
    this.updateFaction(toId,   { bbl_coins: to.bbl_coins   + amount });
    if (!this.state.coin_transactions) this.state.coin_transactions = [];
    this.state.coin_transactions.push({ id: Math.random().toString(), from_faction_id: fromId, to_faction_id: toId, amount, reason: 'transfer', created_at: new Date().toISOString() });
    return true;
  }
}

export const mockDb = new MockDatabase();
