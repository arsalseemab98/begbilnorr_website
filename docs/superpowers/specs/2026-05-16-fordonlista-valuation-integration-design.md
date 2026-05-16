# Fordonlista Valuation Integration — Design

**Date:** 2026-05-16
**Status:** Approved by user
**Scope:** Replace begbilnorr_website's static valuation algorithm with real Blocket market data from the fordonlista project, accessed via a secure API endpoint.

---

## Goals

1. Produce accurate car valuations grounded in real Norrland market prices (Blocket).
2. Keep fordonlista's GDPR-sensitive data (owner names, addresses) isolated — never expose to begbilnorr_website.
3. Cache common lookups to reduce DB load and improve latency.
4. Fall back gracefully to the existing static algorithm when no data is available.
5. Authenticated, rate-limited cross-project API call.

---

## Architecture

Two projects, communicating via a secure HTTP API:

```
begbilnorr_website (Astro 5 SSR @ Vercel)
  └─ /api/vardera
       ├─ biluppgifter.se          → brand, model, year, fuel, gearbox
       ├─ fordonlista /api/v1/valuation  → market basePrice + sampleSize
       │                              (X-API-Key auth, CORS-locked)
       └─ Local: applies miltal + skick adjustment, sends emails

fordonlista (Next.js 16 @ Vercel — already deployed)
  └─ /api/v1/valuation  (NEW)
       ├─ Auth: X-API-Key (constant-time compare)
       ├─ Rate limit: 50/IP/hr, 1000/day total
       ├─ Cache: 24h TTL per (brand, model, year)
       ├─ Query: blocket_annonser (private + dealer-adjusted)
       └─ Return: aggregated only (no raw rows, no PII)
```

## API Contract: `POST /api/v1/valuation`

### Request

```http
POST /api/v1/valuation HTTP/1.1
Host: fordonlista.vercel.app
Content-Type: application/json
X-API-Key: <FORDONLISTA_VALUATION_KEY>
Origin: https://begbilnorr.se

{
  "marke": "Toyota",
  "modell": "Auris",
  "arsmodell": 2015,
  "miltal": 14000
}
```

### Validation rules

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `marke` | string | yes | 1-50 chars, `^[A-Za-zÅÄÖåäö\s\-]+$` |
| `modell` | string | yes | 1-100 chars |
| `arsmodell` | int | yes | 1990 ≤ n ≤ 2026 |
| `miltal` | int | no | 0 ≤ n ≤ 500000 |

Invalid input → `400 Bad Request` with `{ error: "..." }`.

### Response (success — sufficient data)

```json
{
  "basePrice": 132000,
  "sampleSize": 18,
  "confidence": "high",
  "priceRange": [98000, 165000],
  "avgMileage": 13821,
  "matchedYears": [2013, 2014, 2015, 2016, 2017],
  "sourceMix": { "private": 12, "dealer_adjusted": 6 }
}
```

### Response (insufficient data)

```json
{
  "confidence": "insufficient",
  "sampleSize": 1
}
```

When `confidence === "insufficient"`, begbilnorr_website falls back to the static algorithm.

### Response codes

| Code | Meaning |
|------|---------|
| 200 | Success (incl. insufficient — still a valid answer) |
| 400 | Invalid input |
| 401 | Missing or wrong X-API-Key |
| 403 | Origin not whitelisted |
| 429 | Rate limit exceeded |
| 500 | Server error (begbilnorr falls back) |

## Security

### 1. Shared-secret authentication

- Generate 32-byte random key: `openssl rand -hex 32`
- Store in both projects' Vercel env vars as `FORDONLISTA_VALUATION_KEY`
- fordonlista verifies with `crypto.timingSafeEqual` to prevent timing attacks
- Constant-time compare prevents key-guessing via response-time differences

### 2. CORS lockdown

Only these origins may call the endpoint:
- `https://begbilnorr.se`
- `https://begbilnorr-website.vercel.app` (Vercel preview)

Other origins → `403 Forbidden`.

### 3. Rate limiting

| Window | Limit |
|--------|-------|
| Per IP / hour | 50 |
| Total / day | 1 000 |

Storage: a new Supabase table `valuation_api_logs` (timestamp, ip, marke, modell, arsmodell, confidence). Both rate limit and audit log in one place.

### 4. Input validation (server-side)

- Reject strings outside character whitelist
- Reject years outside 1990-2026
- Truncate/reject oversized strings

### 5. Output minimization

Response NEVER contains:
- Individual `regnummer`, `id`, `blocket_id`
- Seller names, phone numbers, addresses
- Listing URLs or images
- Owner data from `biluppgifter_data`

Only aggregates (count, median, range, avg).

### 6. Audit logging

Insert into `valuation_api_logs` for every request:
```sql
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
```

Logs:
- ✅ timestamp, IP, request params, confidence tier, sample size
- ❌ API key (never logged), customer regnr (begbilnorr doesn't pass it)

### 7. Cache layer

Storage: a new Supabase table `valuation_cache`:
```sql
CREATE TABLE valuation_cache (
  cache_key text PRIMARY KEY,  -- "{marke}|{modell}|{arsmodell}" lowercased
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_valuation_cache_created ON valuation_cache(created_at);
```

- Read: SELECT WHERE cache_key = $1 AND created_at > now() - interval '24 hours'
- Write: UPSERT after each successful query
- Eviction: cron job deletes rows older than 7 days nightly (lazy cleanup)

The cache key is brand+model+year only — NOT including miltal. Miltal-adjustment happens on begbilnorr_website's side after fetching the cached aggregate.

## Matching algorithm (inside /api/v1/valuation)

### Step A: Query private listings

```sql
SELECT pris, arsmodell, miltal, borttagen, 'private' AS source
FROM blocket_annonser
WHERE LOWER(marke) = LOWER($1)
  AND LOWER(modell) ILIKE '%' || LOWER($2) || '%'
  AND arsmodell BETWEEN $3 - 2 AND $3 + 2
  AND is_leasing = FALSE
  AND saljare_typ = 'privat'
  AND pris BETWEEN 5000 AND 2000000;
```

### Step B: Conditional dealer supplement

If private rows < 5, run the same query for `saljare_typ = 'handlare'` and multiply each price by `0.75` (handlers have margin built in).

### Step C: Sample-size gate

| Total sample (private + adjusted dealer) | confidence |
|------------------------------------------|------------|
| ≥ 10 | `"high"` |
| 5-9 | `"medium"` |
| 3-4 | `"low"` |
| < 3 | `"insufficient"` — early return |

### Step D: Weighting

For each row:
```
year_weight =
  1.0  if arsmodell == target_year
  0.7  if |diff| == 1
  0.5  if |diff| == 2

source_weight =
  1.0  if source == 'private'
  0.85 if source == 'dealer_adjusted'

sale_weight =
  1.2  if borttagen IS NOT NULL (already sold = stronger price signal)
  1.0  otherwise

weight = year_weight × source_weight × sale_weight
```

### Step E: Weighted median

Sort by price ascending; accumulate weights; the first row where cumulative weight ≥ total_weight / 2 is the weighted median.

### Step F: Build response

```typescript
return {
  basePrice: weightedMedian,
  sampleSize: rows.length,
  confidence: tierOf(rows.length),
  priceRange: [rows[0].pris, rows[rows.length - 1].pris],
  avgMileage: avg(rows.map(r => r.miltal).filter(Boolean)),
  matchedYears: uniq(rows.map(r => r.arsmodell)).sort(),
  sourceMix: {
    private: rows.filter(r => r.source === 'private').length,
    dealer_adjusted: rows.filter(r => r.source === 'dealer_adjusted').length,
  },
};
```

## Adjustment algorithm (on begbilnorr_website's side)

After fetching the API response:

```typescript
// 1. Insufficient → fall back to existing static algorithm
if (api.confidence === 'insufficient') {
  return calculateValuation_static(input);
}

// 2. Miltal adjustment vs. sample avg
const expectedMileage = api.avgMileage ?? 13000;
const mileageDiff = miltal - expectedMileage;
const mileageAdjustment = -mileageDiff * 8;  // 8 kr per mil deviation

// 3. Skick multiplier
const skickMult = {
  som_ny: 1.10,
  mycket_bra: 1.00,
  bra: 0.92,
  sliten: 0.80,
}[skick];

// 4. Final
const estimate = Math.max(5000, Math.round((api.basePrice + mileageAdjustment) * skickMult));

return {
  estimate,
  rangeLow: Math.round(estimate * 0.88),
  rangeHigh: Math.round(estimate * 1.12),
  tradeIn: Math.round(estimate * 0.85),
  privateSale: estimate,
  bgnBud: Math.round(estimate * 0.90),
  // Extra context for the email
  sampleSize: api.sampleSize,
  confidence: api.confidence,
  matchedYears: api.matchedYears,
};
```

## Email integration

The customer email gets an additional line under the disclaimer:

> Värderingen baseras på {sampleSize} liknande bilar ({matchedYears[0]}-{matchedYears[end]}) i Norrland-marknaden.

If `confidence === 'low'` (only 3-4 matches), add a caveat:
> ⚠️ Få liknande bilar i marknadsdatan — räkna med ±20% osäkerhet.

Fallback path (insufficient): use existing disclaimer text, no sampleSize mention.

## New files

### On fordonlista
| File | Purpose |
|------|---------|
| `app/api/v1/valuation/route.ts` | The new endpoint |
| `lib/valuation/query.ts` | SQL + weighted median |
| `lib/valuation/auth.ts` | API key verification + CORS |
| `lib/valuation/rate-limit.ts` | IP rate limit via Supabase |
| `lib/valuation/cache.ts` | Cache read/write via Supabase |

### On begbilnorr_website
| File | Purpose |
|------|---------|
| `src/lib/fordonlista-client.ts` | Wrapper for calling fordonlista API |

### Modified files
| File | Change |
|------|--------|
| `begbilnorr_website/src/pages/api/vardera.ts` | After biluppgifter lookup, call fordonlista; pass result into calculation |
| `begbilnorr_website/src/lib/valuation.ts` | Add `calculateFromMarketData()` alongside existing `calculateValuation()` |
| `begbilnorr_website/src/lib/email-templates/vardering-customer.ts` | Show sample size + confidence note |

## Supabase schema additions (on fordonlista project)

```sql
-- Rate limit + audit log (one table, two purposes)
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

-- Aggregate cache
CREATE TABLE valuation_cache (
  cache_key text PRIMARY KEY,
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_valuation_cache_created ON valuation_cache(created_at);

-- Enable RLS, deny anon access (route uses service role for these)
ALTER TABLE valuation_api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE valuation_cache ENABLE ROW LEVEL SECURITY;
-- No policies = no anon access. Service role bypasses RLS.
```

## Environment variables

| Variable | Project | Purpose |
|----------|---------|---------|
| `FORDONLISTA_VALUATION_KEY` | both | Shared API key (32-byte hex) |
| `FORDONLISTA_VALUATION_URL` | begbilnorr_website | `https://fordonlista.vercel.app/api/v1/valuation` |
| `SUPABASE_SERVICE_ROLE_KEY` | fordonlista | Already exists; used for cache + logs writes |

## Failure modes

| Failure | Behavior |
|---------|----------|
| fordonlista API down (5xx, timeout) | begbilnorr falls back to static algorithm. Customer still gets a valuation. |
| API key invalid | 401. begbilnorr logs error, falls back. (Should never happen in prod — alert via Sentry if it does.) |
| Rate limit hit | 429. begbilnorr falls back. Logs warning. |
| Insufficient data | 200 with `confidence: "insufficient"`. begbilnorr uses static algorithm. |
| Supabase down on fordonlista side | API returns 500. begbilnorr falls back. |
| biluppgifter API down on begbilnorr side | Customer gets "manual review" email. No call to fordonlista needed. |

## Testing strategy

Manual tests (no automated test suite in either project):

1. **Happy path**: regnr WUS137 (known Toyota Auris 2015) → API call → response with `sampleSize ≥ 10` → email shows market-grounded valuation.
2. **Auth failure**: call API with wrong key → 401.
3. **Rate limit**: 51 calls from same IP within 1 hour → 51st returns 429.
4. **CORS**: call from `https://example.com` → 403.
5. **Insufficient data**: rare model (e.g. obscure brand) → response has `insufficient`, begbilnorr uses static.
6. **Cache**: same query twice within 24h → second hit is logged as `cached: true`.
7. **Verify no PII leaks**: response body inspected — no regnummer, no names, no URLs.

## Rollout plan (not implementation — just sequence)

1. Build + deploy fordonlista API endpoint (with auth + rate limit + cache + logs).
2. Verify endpoint via curl from local + Vercel preview.
3. Add env vars to begbilnorr_website's Vercel.
4. Build + deploy begbilnorr_website with fordonlista-client + integrated into /api/vardera.
5. Smoke test with WUS137 — verify email contains market-grounded number.
6. Monitor logs for first 48h.
7. Old static prices in `BASE_PRICES` map stay as fallback — don't remove.

## Out of scope

- Self-service admin UI to tune algorithm parameters (year_weight, source_weight, etc.). Future work.
- Per-region pricing variations (Luleå vs. Umeå). All Norrland treated as one market.
- Historical price trends (e.g. "this car has dropped 8% in last 6 months"). Not in v1.
- Real-time scraper-triggered cache invalidation. 24h TTL is good enough.
- Per-variant matching (e.g. "Volvo V60 D4" specifically). v1 uses model-token ILIKE matching.

## To verify during implementation

- Confirm `valuation_cache` and `valuation_api_logs` tables don't already exist in fordonlista's Supabase.
- Confirm `FORDONLISTA_VALUATION_KEY` env var name doesn't clash with anything else.
- Decide: should fordonlista's existing `/api` routes already use a similar auth pattern we should mirror? Check existing routes for consistency.

## Decided design choices (no longer open)

- **Auth**: shared X-API-Key (HMAC-signed requests not necessary at this scale).
- **CORS**: hardcoded whitelist (no wildcard, no env-var for now).
- **Cache TTL**: 24 hours (Blocket data changes slowly enough).
- **Sample size threshold**: < 3 → `insufficient` (begbilnorr falls back); 3-4 → `low`; 5-9 → `medium`; ≥ 10 → `high`.
- **Year window**: ±2 years.
- **Dealer adjustment factor**: 0.75 (handlers have ~25% margin built in on used cars).
- **Miltal penalty**: 8 kr per mil deviation (down from 10 kr in static — real data has more variance).
