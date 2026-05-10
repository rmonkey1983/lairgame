import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dqwrcxvvconiqgfohdcc.supabase.co';
const supabaseAnonKey = 'sb_publishable_Z3N_XW4aaskZcfZEPqPtPw_vgRs4YNu';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
  console.log('Testing connection to:', supabaseUrl);
  // Try to select from a table that might exist based on JoinGame.jsx
  const { error } = await supabase.from('participants').select('count', { count: 'exact', head: true });
  
  if (error) {
    console.error('❌ Connection failed:', error.message);
    console.log('Error details:', error);
  } else {
    console.log('✅ Connection successful! Participant count check passed.');
  }
}

testConnection();
