// ══════════════════════════════════════════════════════════════
// Promote a user to admin — run from terminal, no deploy needed
// ══════════════════════════════════════════════════════════════
// Usage:
//   1. Copy .env.example to .env and fill in your Supabase values
//      OR set env vars manually below
//   2. node scripts/promote-admin-cli.mjs your-email@example.com
// ══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env if it exists
let supabaseUrl = process.env.VITE_SUPABASE_URL;
let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  // Try reading from .env
  const envPath = resolve(__dirname, '..', '.env');
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const [key, ...vals] = line.split('=');
      const val = vals.join('=').trim().replace(/^["']|["']$/g, '');
      if (key.trim() === 'VITE_SUPABASE_URL') supabaseUrl = val;
      if (key.trim() === 'SUPABASE_SERVICE_ROLE_KEY') serviceRoleKey = val;
    }
  }
}

if (!supabaseUrl || !serviceRoleKey) {
  console.error('\n❌ Missing Supabase credentials.');
  console.error('   Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file');
  console.error('   Or pass them as VITE_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... before the command.\n');
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error('\n❌ Usage: node scripts/promote-admin-cli.mjs <email>\n');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function promote() {
  console.log(`\n🔍 Looking up user: ${email}...`);

  const { data: users, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) { console.error('❌ Failed to list users:', listErr.message); process.exit(1); }

  const user = (users?.users || []).find((u) => u.email === email);
  if (!user) { console.error(`❌ User not found: ${email}`); process.exit(1); }

  console.log(`   Found: ${user.id}`);
  console.log(`   Current role: ${user.user_metadata?.role || '(none)'}`);

  const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
    user_metadata: { ...(user.user_metadata || {}), role: 'admin' },
  });

  if (error) { console.error('❌ Failed to promote:', error.message); process.exit(1); }

  console.log(`✅ ${email} is now an ADMIN!`);
  console.log(`   New role: ${data.user.user_metadata?.role}\n`);
}

promote();
