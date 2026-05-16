# Fordonlista Valuation Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace begbilnorr_website's static valuation algorithm with a secure cross-project API call to fordonlista that returns market-grounded valuations from real Blocket data (28k+ listings, 4 Norrland regions).

**Architecture:** New `POST /api/v1/valuation` endpoint on fordonlista (Next.js 16, deployed at fordonlista.vercel.app) — protected by X-API-Key, CORS-locked, IP-rate-limited, with 24h Supabase-backed cache. Returns aggregated stats only (no raw rows, no PII). begbilnorr_website's `/api/vardera` calls this endpoint after fetching vehicle data from biluppgifter.se, then applies miltal and skick adjustments locally. If the endpoint returns `confidence: "insufficient"` or fails, begbilnorr falls back to the existing static algorithm.

**Tech Stack:** Next.js 16 App Router (fordonlista) · Astro 5 SSR + Vercel (begbilnorr_website) · Supabase Postgres · TypeScript · Vercel Edge Functions

**Spec:** `docs/superpowers/specs/2026-05-16-fordonlista-valuation-integration-design.md`

**Project locations:**
- fordonlista: `/Users/arsalseemab/Desktop/github/fordonlista`
- begbilnorr_website: `/Users/arsalseemab/Desktop/github/begbilnorr_website`

**Supabase projects:**
- fordonlista DB: `rueqiiqxkazocconmnwp` (where new tables go)
- begbilnorr DB: `lgtmzyspwbdjukoozwec` (no changes here)

**No automated test suite in either project.** Use manual verification via `npm run build`, `curl`, and Supabase queries.

---

## File Structure

### New files on fordonlista
| File | Responsibility |
|------|----------------|
| `lib/valuation/auth.ts` | Constant-time API-key compare + CORS origin check |
| `lib/valuation/rate-limit.ts` | Count requests per IP in valuation_api_logs |
| `lib/valuation/cache.ts` | Read/write valuation_cache table |
| `lib/valuation/query.ts` | SQL query + weighted median algorithm |
| `app/api/v1/valuation/route.ts` | Endpoint orchestrator |

### Modified files on fordonlista
None — new tables and routes only.

### New files on begbilnorr_website
| File | Responsibility |
|------|----------------|
| `src/lib/fordonlista-client.ts` | HTTP wrapper for the valuation API |

### Modified files on begbilnorr_website
| File | Change |
|------|--------|
| `src/lib/valuation.ts` | Add `calculateFromMarketData()` alongside existing function |
| `src/pages/api/vardera.ts` | Call fordonlista after biluppgifter; use market data when confidence ≥ low |
| `src/lib/email-templates/vardering-customer.ts` | Optional "based on N similar cars" line |

### Supabase tables (on `rueqiiqxkazocconmnwp` only)
- `valuation_api_logs` (new): rate-limit + audit
- `valuation_cache` (new): 24h aggregate cache

---

## Phase A — fordonlista DB setup

### Task 1: Create Supabase tables on fordonlista

**Files:** none — Supabase migration via MCP

- [ ] **Step 1: Apply migration**

Use `mcp__supabase__apply_migration` with project_id `rueqiiqxkazocconmnwp`:

```sql
-- migration name: create_valuation_tables
CREATE TABLE valuation_api_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL,
  marke text,
  modell text,
  arsmodell int,
  confidence text,
  sample_size int,
  cached boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_valuation_logs_ip_created ON valuation_api_logs(ip, created_at DESC);
CREATE INDEX idx_valuation_logs_created ON valuation_api_logs(created_at DESC);

CREATE TABLE valuation_cache (
  cache_key text PRIMARY KEY,
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_valuation_cache_created ON valuation_cache(created_at);

ALTER TABLE valuation_api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation_cache ENABLE ROW LEVEL SECURITY;
-- No policies = anon cannot access; service_role bypasses RLS.
```

- [ ] **Step 2: Verify tables exist**

Use `mcp__supabase__list_tables` on `rueqiiqxkazocconmnwp` and confirm both tables present with `rls_enabled: true`.

- [ ] **Step 3: Commit design + plan to begbilnorr_website repo**

```bash
cd /Users/arsalseemab/Desktop/github/begbilnorr_website
git add docs/superpowers/plans/
git commit -m "docs: plan — fordonlista valuation integration"
```

(The spec was committed earlier as `5478378`.)

---

### Task 2: Generate shared API key + set env vars

**Files:** none — env var setup via terminal + Vercel CLI

- [ ] **Step 1: Generate 32-byte hex secret**

```bash
openssl rand -hex 32
```

Save the output. This is the shared `FORDONLISTA_VALUATION_KEY` — same value in both projects.

- [ ] **Step 2: Add to fordonlista Vercel env vars**

```bash
cd /Users/arsalseemab/Desktop/github/fordonlista
# Production
echo "<KEY_FROM_STEP_1>" | vercel env add FORDONLISTA_VALUATION_KEY production
# Preview
echo "<KEY_FROM_STEP_1>" | vercel env add FORDONLISTA_VALUATION_KEY preview
```

Verify:
```bash
vercel env ls production | grep FORDONLISTA_VALUATION_KEY
```

Expected: row showing `FORDONLISTA_VALUATION_KEY  Encrypted  Production`.

- [ ] **Step 3: Add to begbilnorr_website Vercel env vars**

```bash
cd /Users/arsalseemab/Desktop/github/begbilnorr_website
echo "<KEY_FROM_STEP_1>" | vercel env add FORDONLISTA_VALUATION_KEY production
echo "<KEY_FROM_STEP_1>" | vercel env add FORDONLISTA_VALUATION_KEY preview

# Also add the URL (full path including /api/v1/valuation)
echo "https://fordonlista.vercel.app/api/v1/valuation" | vercel env add FORDONLISTA_VALUATION_URL production
echo "https://fordonlista.vercel.app/api/v1/valuation" | vercel env add FORDONLISTA_VALUATION_URL preview
```

Verify both are listed:
```bash
vercel env ls production | grep FORDONLISTA
```

Expected: two rows, `FORDONLISTA_VALUATION_KEY` and `FORDONLISTA_VALUATION_URL`.

- [ ] **Step 4: No commit (env vars don't go in code)**

---

## Phase B — fordonlista API endpoint

### Task 3: Create auth helper — `lib/valuation/auth.ts`

**Files:**
- Create: `/Users/arsalseemab/Desktop/github/fordonlista/lib/valuation/auth.ts`

- [ ] **Step 1: Create directory**

```bash
cd /Users/arsalseemab/Desktop/github/fordonlista
mkdir -p lib/valuation
```

- [ ] **Step 2: Create the file**

```typescript
// lib/valuation/auth.ts
//
// API-key + CORS auth for the valuation endpoint.

import { timingSafeEqual } from 'node:crypto';

const ALLOWED_ORIGINS = [
  'https://begbilnorr.se',
  'https://begbilnorr-website.vercel.app',
];

export interface AuthResult {
  ok: boolean;
  status?: number;
  message?: string;
}

export function checkApiKey(request: Request): AuthResult {
  const expected = process.env.FORDONLISTA_VALUATION_KEY;
  if (!expected) {
    return { ok: false, status: 500, message: 'Server misconfigured' };
  }
  const provided = request.headers.get('x-api-key');
  if (!provided) {
    return { ok: false, status: 401, message: 'Missing X-API-Key' };
  }
  // Lengths must match for timingSafeEqual
  if (provided.length !== expected.length) {
    return { ok: false, status: 401, message: 'Invalid X-API-Key' };
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (!timingSafeEqual(a, b)) {
    return { ok: false, status: 401, message: 'Invalid X-API-Key' };
  }
  return { ok: true };
}

export function checkOrigin(request: Request): AuthResult {
  const origin = request.headers.get('origin');
  // Server-side calls don't send Origin — allow them when X-API-Key is present
  // (we already validated key). Browser calls must have Origin in whitelist.
  if (!origin) {
    return { ok: true };
  }
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return { ok: false, status: 403, message: 'Origin not allowed' };
  }
  return { ok: true };
}
```

- [ ] **Step 3: Verify compiles**

```bash
cd /Users/arsalseemab/Desktop/github/fordonlista
npx tsc --noEmit lib/valuation/auth.ts
```

Expected: no errors. (If unrelated errors appear elsewhere in the project, ignore them — only fix errors in your new file.)

- [ ] **Step 4: Commit**

```bash
git add lib/valuation/auth.ts
git commit -m "feat(valuation): add API-key + CORS auth helper"
```

---

### Task 4: Create rate-limit helper — `lib/valuation/rate-limit.ts`

**Files:**
- Create: `/Users/arsalseemab/Desktop/github/fordonlista/lib/valuation/rate-limit.ts`

This module uses Supabase's service role to read/write to `valuation_api_logs`.

- [ ] **Step 1: Check existing Supabase client pattern**

```bash
cd /Users/arsalseemab/Desktop/github/fordonlista
ls lib/supabase* lib/db/* 2>/dev/null
```

Look for an existing service-role Supabase client. Note its export path.

- [ ] **Step 2: Create the file**

If existing service-role client is at `lib/supabase-admin.ts`, import from there. Otherwise create inline client as below.

```typescript
// lib/valuation/rate-limit.ts
//
// IP-based rate limiting backed by valuation_api_logs.
// Window: 1 hour for per-IP, 24 hours for global.

import { createClient } from '@supabase/supabase-js';

const PER_IP_LIMIT = 50;     // 50 req / hour / IP
const GLOBAL_LIMIT = 1000;   // 1000 req / day total
const PER_IP_WINDOW_MS = 60 * 60 * 1000;
const GLOBAL_WINDOW_MS = 24 * 60 * 60 * 1000;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function extractIP(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() ?? 'unknown';
}

export interface RateLimitResult {
  allowed: boolean;
  reason?: 'per_ip' | 'global';
  remaining?: number;
}

export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  const sb = adminClient();
  const perIpSince = new Date(Date.now() - PER_IP_WINDOW_MS).toISOString();
  const globalSince = new Date(Date.now() - GLOBAL_WINDOW_MS).toISOString();

  // Per-IP query
  const perIp = await sb
    .from('valuation_api_logs')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('created_at', perIpSince);
  if (perIp.error) {
    console.error('rate-limit per-ip query error:', perIp.error);
    return { allowed: true };  // fail open
  }
  if ((perIp.count ?? 0) >= PER_IP_LIMIT) {
    return { allowed: false, reason: 'per_ip' };
  }

  // Global query
  const global = await sb
    .from('valuation_api_logs')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', globalSince);
  if (global.error) {
    console.error('rate-limit global query error:', global.error);
    return { allowed: true };  // fail open
  }
  if ((global.count ?? 0) >= GLOBAL_LIMIT) {
    return { allowed: false, reason: 'global' };
  }

  return { allowed: true, remaining: PER_IP_LIMIT - (perIp.count ?? 0) };
}

export interface LogEntry {
  ip: string;
  marke: string;
  modell: string;
  arsmodell: number;
  confidence: string;
  sample_size: number;
  cached: boolean;
}

export async function recordLog(entry: LogEntry): Promise<void> {
  const sb = adminClient();
  const { error } = await sb.from('valuation_api_logs').insert(entry);
  if (error) {
    console.error('rate-limit log insert error:', error);
    // Non-fatal — already responded to caller
  }
}
```

- [ ] **Step 3: Verify compiles**

```bash
npx tsc --noEmit lib/valuation/rate-limit.ts
```

- [ ] **Step 4: Commit**

```bash
git add lib/valuation/rate-limit.ts
git commit -m "feat(valuation): add IP rate-limit (50/IP/hr, 1000/day)"
```

---

### Task 5: Create cache helper — `lib/valuation/cache.ts`

**Files:**
- Create: `/Users/arsalseemab/Desktop/github/fordonlista/lib/valuation/cache.ts`

- [ ] **Step 1: Create the file**

```typescript
// lib/valuation/cache.ts
//
// 24-hour Supabase-backed cache for valuation responses.
// Key: lowercase "{marke}|{modell}|{arsmodell}".

import { createClient } from '@supabase/supabase-js';

const TTL_MS = 24 * 60 * 60 * 1000;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function cacheKey(marke: string, modell: string, arsmodell: number): string {
  return `${marke.toLowerCase().trim()}|${modell.toLowerCase().trim()}|${arsmodell}`;
}

export async function getCached(key: string): Promise<any | null> {
  const sb = adminClient();
  const cutoff = new Date(Date.now() - TTL_MS).toISOString();
  const { data, error } = await sb
    .from('valuation_cache')
    .select('response_json, created_at')
    .eq('cache_key', key)
    .gte('created_at', cutoff)
    .maybeSingle();
  if (error) {
    console.error('cache read error:', error);
    return null;
  }
  return data?.response_json ?? null;
}

export async function setCached(key: string, response: any): Promise<void> {
  const sb = adminClient();
  const { error } = await sb.from('valuation_cache').upsert({
    cache_key: key,
    response_json: response,
    created_at: new Date().toISOString(),
  });
  if (error) {
    console.error('cache write error:', error);
    // Non-fatal
  }
}
```

- [ ] **Step 2: Verify compiles**

```bash
npx tsc --noEmit lib/valuation/cache.ts
```

- [ ] **Step 3: Commit**

```bash
git add lib/valuation/cache.ts
git commit -m "feat(valuation): add 24h response cache via Supabase"
```

---

### Task 6: Create query + weighted median — `lib/valuation/query.ts`

**Files:**
- Create: `/Users/arsalseemab/Desktop/github/fordonlista/lib/valuation/query.ts`

- [ ] **Step 1: Create the file**

```typescript
// lib/valuation/query.ts
//
// Query Blocket data + compute weighted median valuation.

import { createClient } from '@supabase/supabase-js';

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

interface Row {
  pris: number;
  arsmodell: number;
  miltal: number | null;
  borttagen: string | null;
  source: 'private' | 'dealer_adjusted';
}

export type Confidence = 'high' | 'medium' | 'low' | 'insufficient';

export interface ValuationResponse {
  basePrice?: number;
  sampleSize: number;
  confidence: Confidence;
  priceRange?: [number, number];
  avgMileage?: number;
  matchedYears?: number[];
  sourceMix?: { private: number; dealer_adjusted: number };
}

const DEALER_DISCOUNT = 0.75;
const YEAR_WINDOW = 2;

function yearWeight(diff: number): number {
  const abs = Math.abs(diff);
  if (abs === 0) return 1.0;
  if (abs === 1) return 0.7;
  return 0.5;
}

function sourceWeight(source: Row['source']): number {
  return source === 'private' ? 1.0 : 0.85;
}

function saleWeight(borttagen: string | null): number {
  return borttagen ? 1.2 : 1.0;
}

function weightedMedian(rows: Row[], targetYear: number): number {
  const samples = rows.map((r) => ({
    price: r.pris,
    weight:
      yearWeight(r.arsmodell - targetYear) *
      sourceWeight(r.source) *
      saleWeight(r.borttagen),
  }));
  samples.sort((a, b) => a.price - b.price);
  const total = samples.reduce((s, x) => s + x.weight, 0);
  const half = total / 2;
  let cum = 0;
  for (const s of samples) {
    cum += s.weight;
    if (cum >= half) return s.price;
  }
  return samples[samples.length - 1].price;
}

function confidenceFor(n: number): Confidence {
  if (n >= 10) return 'high';
  if (n >= 5) return 'medium';
  if (n >= 3) return 'low';
  return 'insufficient';
}

export async function queryValuation(
  marke: string,
  modell: string,
  arsmodell: number,
): Promise<ValuationResponse> {
  const sb = adminClient();
  const yearLow = arsmodell - YEAR_WINDOW;
  const yearHigh = arsmodell + YEAR_WINDOW;

  // Private listings
  const privateQuery = await sb
    .from('blocket_annonser')
    .select('pris, arsmodell, miltal, borttagen, saljare_typ')
    .ilike('marke', marke)
    .ilike('modell', `%${modell}%`)
    .gte('arsmodell', yearLow)
    .lte('arsmodell', yearHigh)
    .eq('is_leasing', false)
    .eq('saljare_typ', 'privat')
    .gte('pris', 5000)
    .lte('pris', 2000000)
    .not('pris', 'is', null);

  if (privateQuery.error) {
    console.error('valuation query error (private):', privateQuery.error);
    throw new Error('Database error');
  }

  const privateRows: Row[] = (privateQuery.data ?? []).map((r: any) => ({
    pris: r.pris,
    arsmodell: r.arsmodell,
    miltal: r.miltal,
    borttagen: r.borttagen,
    source: 'private',
  }));

  let rows = privateRows;

  // If fewer than 5 private rows, supplement with dealer rows (price × 0.75)
  if (privateRows.length < 5) {
    const dealerQuery = await sb
      .from('blocket_annonser')
      .select('pris, arsmodell, miltal, borttagen, saljare_typ')
      .ilike('marke', marke)
      .ilike('modell', `%${modell}%`)
      .gte('arsmodell', yearLow)
      .lte('arsmodell', yearHigh)
      .eq('is_leasing', false)
      .eq('saljare_typ', 'handlare')
      .gte('pris', 5000)
      .lte('pris', 2000000)
      .not('pris', 'is', null);

    if (dealerQuery.error) {
      console.error('valuation query error (dealer):', dealerQuery.error);
      // Don't throw — still useful with private-only
    } else {
      const dealerRows: Row[] = (dealerQuery.data ?? []).map((r: any) => ({
        pris: Math.round(r.pris * DEALER_DISCOUNT),
        arsmodell: r.arsmodell,
        miltal: r.miltal,
        borttagen: r.borttagen,
        source: 'dealer_adjusted',
      }));
      rows = [...privateRows, ...dealerRows];
    }
  }

  const conf = confidenceFor(rows.length);

  if (conf === 'insufficient') {
    return { sampleSize: rows.length, confidence: 'insufficient' };
  }

  const basePrice = weightedMedian(rows, arsmodell);
  const prices = rows.map((r) => r.pris).sort((a, b) => a - b);
  const mileages = rows.map((r) => r.miltal).filter((m): m is number => typeof m === 'number' && m > 0);
  const avgMileage = mileages.length
    ? Math.round(mileages.reduce((s, m) => s + m, 0) / mileages.length)
    : undefined;
  const years = Array.from(new Set(rows.map((r) => r.arsmodell))).sort();

  return {
    basePrice,
    sampleSize: rows.length,
    confidence: conf,
    priceRange: [prices[0], prices[prices.length - 1]],
    avgMileage,
    matchedYears: years,
    sourceMix: {
      private: rows.filter((r) => r.source === 'private').length,
      dealer_adjusted: rows.filter((r) => r.source === 'dealer_adjusted').length,
    },
  };
}
```

- [ ] **Step 2: Verify compiles**

```bash
npx tsc --noEmit lib/valuation/query.ts
```

- [ ] **Step 3: Commit**

```bash
git add lib/valuation/query.ts
git commit -m "feat(valuation): add SQL query + weighted median algorithm"
```

---

### Task 7: Create endpoint orchestrator — `app/api/v1/valuation/route.ts`

**Files:**
- Create: `/Users/arsalseemab/Desktop/github/fordonlista/app/api/v1/valuation/route.ts`

- [ ] **Step 1: Create directory**

```bash
cd /Users/arsalseemab/Desktop/github/fordonlista
mkdir -p app/api/v1/valuation
```

- [ ] **Step 2: Create the file**

```typescript
// app/api/v1/valuation/route.ts
//
// POST /api/v1/valuation — secure, rate-limited, cached market valuation.

import { NextResponse } from 'next/server';
import { checkApiKey, checkOrigin } from '@/lib/valuation/auth';
import { checkRateLimit, recordLog, extractIP } from '@/lib/valuation/rate-limit';
import { getCached, setCached, cacheKey } from '@/lib/valuation/cache';
import { queryValuation } from '@/lib/valuation/query';

export const runtime = 'nodejs';   // need node:crypto for timingSafeEqual
export const dynamic = 'force-dynamic';

const MARKE_RE = /^[A-Za-zÅÄÖåäö\s\-]{1,50}$/;

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  // 1. Auth (key)
  const keyCheck = checkApiKey(request);
  if (!keyCheck.ok) return bad(keyCheck.message ?? 'Unauthorized', keyCheck.status ?? 401);

  // 2. CORS / origin
  const originCheck = checkOrigin(request);
  if (!originCheck.ok) return bad(originCheck.message ?? 'Forbidden', originCheck.status ?? 403);

  // 3. Parse body
  let body: any;
  try {
    body = await request.json();
  } catch {
    return bad('Invalid JSON body');
  }
  const { marke, modell, arsmodell } = body ?? {};

  if (typeof marke !== 'string' || !MARKE_RE.test(marke)) {
    return bad('Invalid marke');
  }
  if (typeof modell !== 'string' || modell.length < 1 || modell.length > 100) {
    return bad('Invalid modell');
  }
  if (typeof arsmodell !== 'number' || arsmodell < 1990 || arsmodell > 2026) {
    return bad('Invalid arsmodell');
  }

  // 4. Rate limit
  const ip = extractIP(request);
  const rl = await checkRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded (${rl.reason})` },
      { status: 429 },
    );
  }

  // 5. Cache lookup
  const key = cacheKey(marke, modell, arsmodell);
  const cached = await getCached(key);
  if (cached) {
    await recordLog({
      ip,
      marke,
      modell,
      arsmodell,
      confidence: cached.confidence ?? 'unknown',
      sample_size: cached.sampleSize ?? 0,
      cached: true,
    });
    return NextResponse.json(cached);
  }

  // 6. Query Supabase
  let response;
  try {
    response = await queryValuation(marke, modell, arsmodell);
  } catch (err) {
    console.error('queryValuation failed:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }

  // 7. Write cache + log (don't await — fire and forget for latency)
  setCached(key, response);
  recordLog({
    ip,
    marke,
    modell,
    arsmodell,
    confidence: response.confidence,
    sample_size: response.sampleSize,
    cached: false,
  });

  return NextResponse.json(response);
}
```

- [ ] **Step 3: Verify compiles (full project type check)**

```bash
cd /Users/arsalseemab/Desktop/github/fordonlista
npx tsc --noEmit
```

If errors only in unrelated files, ignore them. Fix any errors in your new files.

- [ ] **Step 4: Build to verify Next.js picks up the route**

```bash
npm run build
```

Expected: build succeeds, route `/api/v1/valuation` listed in route map.

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/valuation/route.ts
git commit -m "feat(valuation): add POST /api/v1/valuation endpoint"
```

- [ ] **Step 6: Push + deploy**

```bash
git push origin main
```

Wait ~30s for Vercel to deploy. Then verify with `vercel ls --prod` that the latest deployment is Ready.

---

### Task 8: Smoke-test fordonlista endpoint live

**Files:** none — verification only.

- [ ] **Step 1: Curl with valid key (Toyota Auris 2015)**

Get the key value:
```bash
cd /Users/arsalseemab/Desktop/github/fordonlista
vercel env pull .env.test --environment=production
KEY=$(grep FORDONLISTA_VALUATION_KEY .env.test | cut -d'"' -f2)
rm .env.test
```

Call the live endpoint:
```bash
curl -s -X POST https://fordonlista.vercel.app/api/v1/valuation \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $KEY" \
  -d '{"marke":"Toyota","modell":"Auris","arsmodell":2015}' | python3 -m json.tool
```

Expected response:
```json
{
  "basePrice": <some number around 130000>,
  "sampleSize": <≥ 5>,
  "confidence": "medium" or "high",
  "priceRange": [...],
  "avgMileage": <around 13000-22000>,
  "matchedYears": [2013, 2014, 2015, 2016, 2017],
  "sourceMix": { "private": ..., "dealer_adjusted": ... }
}
```

- [ ] **Step 2: Verify auth blocks bad key (expect 401)**

```bash
curl -s -X POST https://fordonlista.vercel.app/api/v1/valuation \
  -H "Content-Type: application/json" \
  -H "X-API-Key: wrong-key" \
  -d '{"marke":"Toyota","modell":"Auris","arsmodell":2015}' -w "\nHTTP %{http_code}\n"
```

Expected: `HTTP 401`.

- [ ] **Step 3: Verify input validation (expect 400)**

```bash
curl -s -X POST https://fordonlista.vercel.app/api/v1/valuation \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $KEY" \
  -d '{"marke":"Toyota","modell":"Auris","arsmodell":1850}' -w "\nHTTP %{http_code}\n"
```

Expected: `HTTP 400` with `{"error":"Invalid arsmodell"}`.

- [ ] **Step 4: Verify second call is cached**

Call same params twice; the second should be faster. Then check log:

```sql
-- via mcp__supabase__execute_sql on rueqiiqxkazocconmnwp
SELECT marke, modell, arsmodell, confidence, cached, created_at
FROM valuation_api_logs
ORDER BY created_at DESC
LIMIT 5;
```

Expected: at least one row with `cached: true`.

- [ ] **Step 5: Verify response contains NO PII**

Read the response from Step 1 carefully. Confirm absence of: `regnummer`, `id`, `blocket_id`, `saljare_namn`, any phone/email/address fields, URLs.

If any PII fields present → STOP and fix `lib/valuation/query.ts` to strip them.

- [ ] **Step 6: No commit (verification only)**

---

## Phase C — begbilnorr_website integration

### Task 9: Create fordonlista client — `src/lib/fordonlista-client.ts`

**Files:**
- Create: `/Users/arsalseemab/Desktop/github/begbilnorr_website/src/lib/fordonlista-client.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/fordonlista-client.ts
//
// Wrapper around the fordonlista valuation API.
// Returns null (not throw) on any failure — callers fall back to static algo.

export type Confidence = 'high' | 'medium' | 'low' | 'insufficient';

export interface MarketValuation {
  basePrice?: number;
  sampleSize: number;
  confidence: Confidence;
  priceRange?: [number, number];
  avgMileage?: number;
  matchedYears?: number[];
  sourceMix?: { private: number; dealer_adjusted: number };
}

export async function fetchMarketValuation(
  marke: string,
  modell: string,
  arsmodell: number,
): Promise<MarketValuation | null> {
  const url =
    import.meta.env.FORDONLISTA_VALUATION_URL ??
    process.env.FORDONLISTA_VALUATION_URL;
  const key =
    import.meta.env.FORDONLISTA_VALUATION_KEY ??
    (typeof process !== 'undefined' ? process.env.FORDONLISTA_VALUATION_KEY : undefined);

  if (!url || !key) {
    console.warn('fordonlista env vars missing; skipping market lookup');
    return null;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': key,
      },
      body: JSON.stringify({ marke, modell, arsmodell }),
      // Timeout via AbortSignal — don't block /api/vardera if fordonlista is slow
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      console.warn('fordonlista API returned', res.status);
      return null;
    }
    const data = (await res.json()) as MarketValuation;
    return data;
  } catch (err) {
    console.warn('fordonlista API call failed:', err);
    return null;
  }
}
```

- [ ] **Step 2: Verify compiles**

```bash
cd /Users/arsalseemab/Desktop/github/begbilnorr_website
npx tsc --noEmit
```

(Ignore pre-existing error in `redirects.ts`.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/fordonlista-client.ts
git commit -m "feat(vardera): add fordonlista valuation API client"
```

---

### Task 10: Add market-data path to valuation — `src/lib/valuation.ts`

**Files:**
- Modify: `/Users/arsalseemab/Desktop/github/begbilnorr_website/src/lib/valuation.ts`

Add a new exported function `calculateFromMarketData()` that takes the fordonlista response + user inputs and produces the same `ValuationResult` shape. Keep the existing `calculateValuation()` as fallback.

- [ ] **Step 1: Read the current file**

```bash
cat src/lib/valuation.ts
```

Note the existing `ValuationResult` interface (defined near the top).

- [ ] **Step 2: Append the new function to the end of the file**

```typescript
// Append at end of src/lib/valuation.ts

import type { MarketValuation } from './fordonlista-client';

export interface MarketAdjustmentInput {
  market: MarketValuation;        // confidence must NOT be 'insufficient'
  miltalMil: number;
  skick: Skick;
}

const MILEAGE_PENALTY_KR_PER_MIL = 8;

export function calculateFromMarketData(input: MarketAdjustmentInput): ValuationResult {
  const { market, miltalMil, skick } = input;
  if (market.confidence === 'insufficient' || market.basePrice == null) {
    throw new Error('calculateFromMarketData called with insufficient data');
  }

  const expectedMileage = market.avgMileage ?? 13000;
  const mileageDiff = miltalMil - expectedMileage;
  const mileageAdjustment = -mileageDiff * MILEAGE_PENALTY_KR_PER_MIL;

  const skickMultiplier = ({
    som_ny: 1.10,
    mycket_bra: 1.00,
    bra: 0.92,
    sliten: 0.80,
  } as const)[skick];

  const estimate = Math.max(
    5000,
    Math.round((market.basePrice + mileageAdjustment) * skickMultiplier),
  );

  return {
    estimate,
    rangeLow: Math.round(estimate * 0.88),
    rangeHigh: Math.round(estimate * 1.12),
    tradeIn: Math.round(estimate * 0.85),
    privateSale: estimate,
    bgnBud: Math.round(estimate * 0.90),
  };
}
```

- [ ] **Step 3: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/valuation.ts
git commit -m "feat(vardera): add calculateFromMarketData() for fordonlista path"
```

---

### Task 11: Wire fordonlista lookup into `/api/vardera`

**Files:**
- Modify: `/Users/arsalseemab/Desktop/github/begbilnorr_website/src/pages/api/vardera.ts`

After the existing biluppgifter lookup, call fordonlista. Use `calculateFromMarketData()` when confidence is high/medium/low. Use the existing `calculateValuation()` otherwise.

- [ ] **Step 1: Read the current file**

```bash
cat src/pages/api/vardera.ts
```

Locate the block where `vehicle` has been fetched and `calculateValuation()` is called.

- [ ] **Step 2: Edit imports (top of file)**

Find:
```typescript
import { calculateValuation, type Skick } from '../../lib/valuation';
```

Replace with:
```typescript
import { calculateValuation, calculateFromMarketData, type Skick } from '../../lib/valuation';
import { fetchMarketValuation } from '../../lib/fordonlista-client';
```

- [ ] **Step 3: Replace the valuation block**

Find the section that looks roughly like:
```typescript
if (vehicle) {
  const valuation = calculateValuation({
    brand: vehicle.brand,
    year: vehicle.year,
    miltalMil: miltalNum,
    fuel: vehicle.fuel,
    gearbox: vehicle.gearbox,
    skick: skick as Skick,
  });

  const c = renderCustomerEmail({ ... });
```

Replace with:
```typescript
if (vehicle) {
  // Try fordonlista market data first
  let valuation;
  let valuationSource: 'market' | 'static' = 'static';
  let marketSampleSize: number | undefined;
  let marketConfidence: string | undefined;
  let marketYears: number[] | undefined;

  const market = await fetchMarketValuation(
    vehicle.brand,
    vehicle.model,
    vehicle.year,
  );

  if (market && market.confidence !== 'insufficient' && market.basePrice != null) {
    valuation = calculateFromMarketData({
      market,
      miltalMil: miltalNum,
      skick: skick as Skick,
    });
    valuationSource = 'market';
    marketSampleSize = market.sampleSize;
    marketConfidence = market.confidence;
    marketYears = market.matchedYears;
  } else {
    valuation = calculateValuation({
      brand: vehicle.brand,
      year: vehicle.year,
      miltalMil: miltalNum,
      fuel: vehicle.fuel,
      gearbox: vehicle.gearbox,
      skick: skick as Skick,
    });
  }

  const c = renderCustomerEmail({
    namn: namn.trim(),
    brand: vehicle.brand,
    model: vehicle.model,
    year: vehicle.year,
    miltalMil: miltalNum,
    fuel: vehicle.fuel,
    skick: skick as Skick,
    valuation,
    marketSampleSize,
    marketConfidence,
    marketYears,
  });
```

- [ ] **Step 4: Update the dealer-email render call**

Find the `renderDealerEmail({...})` call right after `renderCustomerEmail`. Add the same three optional fields:

```typescript
  const d = renderDealerEmail({
    namn: namn.trim(),
    email,
    phone: cleanPhone,
    regnr: cleanRegnr,
    brand: vehicle.brand,
    model: vehicle.model,
    year: vehicle.year,
    miltalMil: miltalNum,
    fuel: vehicle.fuel,
    skick: skick as Skick,
    valuation,
    utmData: utm_data ?? null,
    valuationSource,
    marketSampleSize,
    marketConfidence,
  });
```

- [ ] **Step 5: Verify compiles**

```bash
npx tsc --noEmit
```

It will fail because `renderCustomerEmail` and `renderDealerEmail` don't accept the new fields yet — that's expected. Continue to Task 12.

- [ ] **Step 6: No commit yet (incomplete state)** — committing happens in Task 12 once email templates accept the new fields.

---

### Task 12: Update email templates to show market context

**Files:**
- Modify: `/Users/arsalseemab/Desktop/github/begbilnorr_website/src/lib/email-templates/vardering-customer.ts`
- Modify: `/Users/arsalseemab/Desktop/github/begbilnorr_website/src/lib/email-templates/vardering-dealer.ts`

- [ ] **Step 1: Update customer-email types**

In `vardering-customer.ts`, find `CustomerEmailInput`. Add three optional fields:

```typescript
export interface CustomerEmailInput {
  namn: string;
  brand: string;
  model: string;
  year: number;
  miltalMil: number;
  fuel: string;
  skick: Skick;
  valuation: ValuationResult;
  marketSampleSize?: number;
  marketConfidence?: string;
  marketYears?: number[];
}
```

- [ ] **Step 2: Add market-context line to customer email body**

In the same file, find the disclaimer paragraph that begins with `"Värderingen är ett estimat..."`. Just before that paragraph, insert:

```html
${input.marketSampleSize && input.marketYears ? `
  <p style="margin:24px 0 0;font-size:13px;color:rgba(255,255,255,0.55);line-height:1.6;">
    Baserat på <strong style="color:rgba(255,255,255,0.75);">${input.marketSampleSize} liknande bilar</strong>
    (${input.marketYears[0]}-${input.marketYears[input.marketYears.length - 1]})
    i Norrland-marknaden.
    ${input.marketConfidence === 'low' ? '<br><span style="color:#f59e0b;">⚠️ Få liknande bilar i datan — räkna med ±20% osäkerhet.</span>' : ''}
  </p>
` : ''}
```

- [ ] **Step 3: Update dealer-email types**

In `vardering-dealer.ts`, find `DealerEmailInput`. Add three optional fields:

```typescript
export interface DealerEmailInput {
  // ... existing fields ...
  valuationSource?: 'market' | 'static';
  marketSampleSize?: number;
  marketConfidence?: string;
}
```

- [ ] **Step 4: Add market-source line to dealer email**

In the same file, near the bottom of the HTML before the `<hr>`, add:

```html
${input.valuationSource ? `
  <p><strong>Värderings-källa:</strong> ${input.valuationSource === 'market' ? `Fordonlista (${input.marketSampleSize ?? 0} liknande bilar, confidence: ${input.marketConfidence ?? '-'})` : 'Statisk algoritm (ingen marknadsdata)'}</p>
` : ''}
```

- [ ] **Step 5: Verify project-wide compile**

```bash
npx tsc --noEmit
```

(Pre-existing redirects.ts error excluded.) All other files should be clean.

- [ ] **Step 6: Build**

```bash
npm run build
```

Expected: "Build Complete!".

- [ ] **Step 7: Commit everything together**

```bash
git add src/pages/api/vardera.ts src/lib/email-templates/vardering-customer.ts src/lib/email-templates/vardering-dealer.ts
git commit -m "feat(vardera): integrate fordonlista market valuation + email context"
```

---

### Task 13: Push + deploy + live smoke test

**Files:** none — verification only.

- [ ] **Step 1: Push**

```bash
cd /Users/arsalseemab/Desktop/github/begbilnorr_website
git push origin main
```

Wait ~30s. Verify deploy succeeded:
```bash
vercel ls --prod | head -5
```

- [ ] **Step 2: Smoke test — submit valuation request**

Go to `https://begbilnorr.se/vardera-bil`. Fill in:
- Regnr: `WUS137`
- Miltal: `14000`
- Skick: `Mycket bra`
- Namn: `Test Test`
- E-post: (your address)
- ✅ GDPR

Submit.

- [ ] **Step 3: Verify email arrived with market-data context**

Check your inbox for "Värdering av din Toyota Auris Estate (2015)".

Expected:
- Big estimate around **120 000-140 000 kr** (matches median for 2015 Toyota Auris in fordonlista)
- New line: "Baserat på X liknande bilar (YYYY-YYYY) i Norrland-marknaden"

If estimate is still ~65k → fordonlista path failed; check Supabase `valuation_api_logs` for the request.

- [ ] **Step 4: Verify fordonlista log**

```sql
-- via mcp__supabase__execute_sql on rueqiiqxkazocconmnwp
SELECT marke, modell, arsmodell, confidence, sample_size, cached, created_at at time zone 'Europe/Stockholm' as local_time
FROM valuation_api_logs
ORDER BY created_at DESC
LIMIT 5;
```

Expected: row with `marke='Toyota'`, `modell='Auris Estate'`, `arsmodell=2015`, `confidence='medium'` or `'high'`.

- [ ] **Step 5: Verify dealer email shows source**

In the dealer notification email (sent to `info@begbilnorr.se`), look for the line:
> **Värderings-källa:** Fordonlista (XX liknande bilar, confidence: high/medium/low)

- [ ] **Step 6: Confirm static fallback still works**

Submit a request with an obscure car (e.g. regnr of a Lamborghini or unusual import). The fordonlista lookup will likely return `insufficient` and begbilnorr should fall back. Email should still arrive (without "Baserat på..."-line). Check log:

```sql
SELECT confidence, sample_size FROM valuation_api_logs ORDER BY created_at DESC LIMIT 1;
```

Expected: `confidence='insufficient'`.

- [ ] **Step 7: No commit (verification only)**

---

### Task 14: Update CLAUDE.md docs

**Files:**
- Modify: `/Users/arsalseemab/Desktop/github/begbilnorr_website/CLAUDE.md`

- [ ] **Step 1: Locate the Värderingsverktyg section**

It currently documents the static algorithm. Update it to mention the new fordonlista integration.

- [ ] **Step 2: Replace the section**

Find the heading `## Värderingsverktyg (/vardera-bil)` and replace the block under it with:

```markdown
## Värderingsverktyg (/vardera-bil)

Email-gated lead form using biluppgifter.se vehicle lookup + fordonlista market data.

- API route: `src/pages/api/vardera.ts`
- Static algorithm fallback: `src/lib/valuation.ts` (function `calculateValuation`)
- Market data path: `src/lib/valuation.ts` (function `calculateFromMarketData`)
- Fordonlista client: `src/lib/fordonlista-client.ts`
- Regnr-lookup: `src/lib/biluppgifter.ts` (requires `BILUPPGIFTER_API_KEY`)
- Rate limit: 5/IP/24h via `vardering_lookups` (`src/lib/rate-limit.ts`)
- Customer email: dark Begbilnorr design (`src/lib/email-templates/vardering-customer.ts`)
- Dealer email: notification to `info@begbilnorr.se`

### Valuation flow
1. biluppgifter → brand, model, year, fuel, gearbox
2. Call fordonlista `/api/v1/valuation` with brand+model+year (requires `FORDONLISTA_VALUATION_KEY` + `FORDONLISTA_VALUATION_URL`)
3. If `confidence` in {high, medium, low} → use market data + apply miltal & skick adjustment
4. If `insufficient` or call fails → fall back to static base-price algorithm
5. Email mentions sample size + matched-year range when market data was used

### Source labels
- `contact_submissions.source = 'vardering-v2'`
- `leads.form_labels` includes `'Värdering (auto)'`

### Specs
- Email-gated flow: `docs/superpowers/specs/2026-05-14-vardera-bil-email-flow-design.md`
- Fordonlista integration: `docs/superpowers/specs/2026-05-16-fordonlista-valuation-integration-design.md`
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document fordonlista integration in CLAUDE.md"
git push origin main
```

---

## Self-Review

### Spec coverage check

| Spec section | Covered in task |
|--------------|-----------------|
| API contract (request/response) | Tasks 6 (query), 7 (route) |
| Auth (X-API-Key) | Task 3 |
| CORS lockdown | Task 3 |
| Rate limiting (50/hr per IP, 1000/day) | Task 4 |
| Input validation | Task 7 |
| Output minimization (no PII) | Task 6 + verification in Task 8 step 5 |
| Audit logging | Task 4 |
| Cache (24h TTL) | Task 5 |
| Matching algorithm (private + dealer*0.75) | Task 6 |
| Weighting (year/source/sale) | Task 6 |
| Weighted median | Task 6 |
| Adjustment (miltal + skick) | Task 10 |
| Email integration | Task 12 |
| Failure modes (insufficient/timeout/etc) | Task 9 (try/catch with null), Task 11 (conditional) |
| Testing strategy | Tasks 8, 13 (manual smoke tests) |
| Rollout sequence | Tasks ordered to match spec's rollout plan |

### Placeholder scan

No "TBD", "TODO", "implement later" in any task. All code blocks complete. All commands have expected outputs.

### Type consistency

- `Confidence` type defined in `lib/valuation/query.ts` (Task 6) and re-defined identically in `src/lib/fordonlista-client.ts` (Task 9). These are intentionally separate (they live in different projects with no shared types).
- `MarketValuation` interface in fordonlista-client.ts (Task 9) matches `ValuationResponse` interface in query.ts (Task 6) field-for-field.
- `MarketAdjustmentInput` (Task 10) consumes `MarketValuation` (Task 9) — types align.

---

Plan complete.
