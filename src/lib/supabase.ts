import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.SUPABASE_ANON_KEY || '';

const isConfigured = supabaseUrl.startsWith('http') && supabaseAnonKey.length > 0;

const chainable = (): any =>
  new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then') return undefined;
      if (prop === 'data') return null;
      if (prop === 'error') return null;
      return (..._args: any[]) => chainable();
    },
  });

export const supabase: SupabaseClient = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : new Proxy({} as SupabaseClient, {
      get: () => (..._args: any[]) => chainable(),
    });
