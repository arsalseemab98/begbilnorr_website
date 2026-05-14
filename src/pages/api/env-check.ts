// src/pages/api/env-check.ts
//
// TEMPORARY diagnostic endpoint. Returns which env vars matching a pattern
// are visible at runtime — WITHOUT exposing values. Remove after debugging.

import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  const fromProcessEnv = typeof process !== 'undefined' && process.env
    ? Object.keys(process.env).filter((k) => /BILUPPGIFTER|AZURE|SUPABASE/i.test(k))
    : [];

  const fromImportMeta = Object.keys(import.meta.env || {}).filter((k) =>
    /BILUPPGIFTER|AZURE|SUPABASE/i.test(k)
  );

  // Direct named lookups (mask values: just show if present)
  const direct = {
    'process.env.BILUPPGIFTER_API_KEY':
      typeof process !== 'undefined' && !!process.env?.BILUPPGIFTER_API_KEY,
    'import.meta.env.BILUPPGIFTER_API_KEY': !!import.meta.env.BILUPPGIFTER_API_KEY,
    'process.env.AZURE_TENANT_ID':
      typeof process !== 'undefined' && !!process.env?.AZURE_TENANT_ID,
    'import.meta.env.SUPABASE_URL': !!import.meta.env.SUPABASE_URL,
  };

  return new Response(
    JSON.stringify(
      {
        fromProcessEnv,
        fromImportMeta,
        direct,
        runtime: {
          hasProcessEnv: typeof process !== 'undefined' && !!process.env,
          processEnvKeyCount:
            typeof process !== 'undefined' && process.env
              ? Object.keys(process.env).length
              : 0,
          importMetaEnvKeyCount: Object.keys(import.meta.env || {}).length,
        },
      },
      null,
      2
    ),
    { headers: { 'Content-Type': 'application/json' } }
  );
};
