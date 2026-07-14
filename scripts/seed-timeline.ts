import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Carica variabili d'ambiente da file .env se disponibile
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseServiceKey) {
  console.error('ERRORE: SUPABASE_SERVICE_ROLE_KEY non configurata nelle variabili d\'ambiente.');
  process.exit(1);
}

// Inizializza client Supabase Service Role
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

interface SeedEvent {
  minute_trigger: number;
  target_logic: string;
  payload: {
    type: string;
    title: string;
    message: string;
    buttons?: Array<{ label: string; action: string }>;
    duration_seconds?: number;
  };
}

async function runSeed() {
  const dataPath = path.join(__dirname, 'timeline_data.json');
  
  if (!fs.existsSync(dataPath)) {
    console.error(`ERRORE: File dei dati non trovato in: ${dataPath}`);
    process.exit(1);
  }

  // 1. Leggi e valida i dati locali
  const rawData = fs.readFileSync(dataPath, 'utf8');
  let events: SeedEvent[] = [];

  try {
    events = JSON.parse(rawData);
    if (!Array.isArray(events)) throw new Error('I dati nel file JSON devono essere un array.');
  } catch (err: any) {
    console.error(`ERRORE: Formato JSON non valido in timeline_data.json: ${err.message}`);
    process.exit(1);
  }

  // 2. Controllo flag di troncamento (--truncate)
  const shouldTruncate = process.argv.includes('--truncate');

  if (shouldTruncate) {
    console.log('Fase di pulizia: Rimozione dei vecchi template di timeline_events...');
    // Elimina solo gli eventi template (dove game_id è nullo) per evitare di intaccare partite attive
    const { error: deleteError } = await supabase
      .from('timeline_events')
      .delete()
      .is('game_id', null);

    if (deleteError) {
      console.error(`ERRORE durante la pulizia dei vecchi eventi: ${deleteError.message}`);
      process.exit(1);
    }
    console.log('Pulizia completata.');
  }

  // 3. Esegui l'inserimento bulk
  console.log(`Fase di caricamento: Inserimento di ${events.length} eventi di timeline nel database...`);

  // Struttura i record escludendo game_id (in quanto eventi template globali)
  const recordsToInsert = events.map(e => ({
    game_id: null, // Null indica che fa parte dei template globali
    minute_trigger: e.minute_trigger,
    target_logic: e.target_logic,
    payload: e.payload
  }));

  const { data, error: insertError } = await supabase
    .from('timeline_events')
    .insert(recordsToInsert)
    .select('id, minute_trigger');

  if (insertError) {
    console.error(`ERRORE durante l'inserimento bulk: ${insertError.message}`);
    
    // Fornisce un log dettagliato in caso di violazione del vincolo UNIQUE su (game_id, minute_trigger)
    if (insertError.code === '23505') {
      console.error('SUGGERIMENTO: Alcuni minuti di attivazione sono già registrati per i template globali.');
      console.error('Riesegui lo script aggiungendo il flag "--truncate" per sovrascrivere.');
    }
    process.exit(1);
  }

  console.log('Caricamento completato con successo!');
  if (data) {
    data.forEach((evt: any) => {
      console.log(` - Evento registrato al minuto: ${evt.minute_trigger} (ID: ${evt.id})`);
    });
  }
}

runSeed();
