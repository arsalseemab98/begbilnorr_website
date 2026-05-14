// src/lib/rate-limit.ts
//
// IP-based rate limiting backed by Supabase `vardering_lookups` table.
// Window: 24 hours rolling. Limit: 5 per IP.

import { supabase } from './supabase';

export const RATE_LIMIT_PER_DAY = 5;
const WINDOW_MS = 24 * 60 * 60 * 1000;

export function extractIP(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIP = request.headers.get('x-real-ip');
  if (realIP) return realIP.trim();
  return 'unknown';
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  count: number;
}

export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from('vardering_lookups')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('created_at', since);

  if (error) {
    console.error('rate-limit query error:', error);
    // Fail-open: don't block legitimate users on transient DB errors.
    return { allowed: true, remaining: RATE_LIMIT_PER_DAY, count: 0 };
  }

  const usedCount = count ?? 0;
  return {
    allowed: usedCount < RATE_LIMIT_PER_DAY,
    remaining: Math.max(0, RATE_LIMIT_PER_DAY - usedCount),
    count: usedCount,
  };
}

export async function recordLookup(ip: string, regnr: string | null): Promise<void> {
  const { error } = await supabase
    .from('vardering_lookups')
    .insert({ ip, regnr });
  if (error) {
    console.error('rate-limit insert error:', error);
    // Non-fatal — we already sent the email.
  }
}
