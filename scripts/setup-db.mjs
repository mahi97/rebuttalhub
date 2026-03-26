// Run the database schema against Supabase using the pg endpoint
// Usage: node scripts/setup-db.mjs

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ibutelrimuoxxvtqhazy.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || readEnvFile();

function readEnvFile() {
  try {
    const env = readFileSync('.env.local', 'utf8');
    const match = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
    return match?.[1]?.trim();
  } catch { return ''; }
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false }
});

// We can't run raw SQL via the client library, so we'll use the REST API
// to create tables by splitting our schema into individual statements

const sql = readFileSync('supabase-schema.sql', 'utf8');

// Split SQL into statements (simple approach)
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

console.log(`Found ${statements.length} SQL statements to execute.`);
console.log('');
console.log('NOTE: Please execute the SQL schema via the Supabase SQL Editor:');
console.log(`${SUPABASE_URL}/project/ibutelrimuoxxvtqhazy/sql`);
console.log('');
console.log('1. Go to the Supabase Dashboard → SQL Editor');
console.log('2. Paste the contents of supabase-schema.sql');
console.log('3. Click "Run"');
console.log('');
console.log('The schema file is located at: supabase-schema.sql');
