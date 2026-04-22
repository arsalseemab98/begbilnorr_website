import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.SUPABASE_URL || process.env.SUPABASE_URL || '';
const serviceKey =
  import.meta.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';

if (!url || !serviceKey) {
  throw new Error(
    'supabase-admin: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured. ' +
      'This client bypasses RLS and must only be imported from admin-auth-guarded endpoints.'
  );
}

export const supabaseAdmin: SupabaseClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
