/**
 * supabase.js
 * Central Supabase client initialization.
 * This is the ONLY place where createClient is called.
 *
 * CONFIGURATION REQUIRED:
 * Replace the placeholder values below with your actual
 * Supabase project URL and publishable (anon) key.
 *
 * NEVER use the service_role key here.
 * These values are safe to expose in the browser.
 *
 * Where to find your credentials:
 * Supabase Dashboard → Project Settings → API
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ============================================================
// ⚠️ CONFIGURAÇÃO OBRIGATÓRIA
// ============================================================
const SUPABASE_URL  = 'https://wtaoxfkgvqzhyhhvgzas.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_fBAYHYTGKP-bkvVNxgDPTg_IPLQhrAO';
// ============================================================

if (SUPABASE_URL === 'YOUR_SUPABASE_URL' || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_PUBLISHABLE_KEY') {
  console.warn(
    '[Supabase] ⚠️ Credenciais não configuradas.\n' +
    'Edite frontend/js/supabase.js e substitua YOUR_SUPABASE_URL e YOUR_SUPABASE_PUBLISHABLE_KEY.\n' +
    'Consulte docs/setup.md para instruções detalhadas.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
