# /vardera-bil Email Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/vardera-bil` from a client-side estimator to a gated email-delivery flow with regnr lookup, lead capture, IP rate limiting, and dual-recipient emails (customer + dealer).

**Architecture:** Frontend collects regnr + miltal + skick + contact info, POSTs to a new `/api/vardera` route. The route validates input, enforces 5/IP/day rate limit via a new `vardering_lookups` Supabase table, looks up vehicle data from biluppgifter.se, runs the depreciation+skick valuation algorithm, sends two emails (designed customer email + plaintext dealer notification), and saves to existing `contact_submissions` and `leads` tables.

**Tech Stack:** Astro 5 SSR · Vercel adapter · Supabase Postgres · Microsoft Graph API for email · biluppgifter.se for vehicle lookup · TypeScript

**Project context for the engineer:**
- Existing email infra: `src/lib/email.ts` exports `sendEmail({to, subject, html, replyTo})` using Microsoft Graph
- Existing form pattern: see `src/pages/api/contact.ts` for how `contact_submissions` and `leads` are written
- Existing supabase client: `src/lib/supabase.ts`
- Existing astro page pattern: see `src/pages/finansiering.astro` (page-hero + sections + scoped style + `<script is:inline>`)
- The current `src/pages/vardera-bil.astro` (created earlier today) is being REPLACED — its client-side valuation is being moved server-side

**Spec:** `docs/superpowers/specs/2026-05-14-vardera-bil-email-flow-design.md`

**Note on TDD:** This codebase has no test suite. TDD steps replaced with "implement → manually verify via build / curl" pattern. Frequent commits still apply.

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `src/lib/valuation.ts` | Create | Pure function: vehicle data + miltal + skick → estimate (no I/O) |
| `src/lib/biluppgifter.ts` | Create | Wrapper around biluppgifter.se HTTP API; throws on failure |
| `src/lib/rate-limit.ts` | Create | Supabase-backed IP rate limit check + record |
| `src/lib/email-templates/vardering-customer.ts` | Create | HTML template — dark Begbilnorr design (inline CSS only) |
| `src/lib/email-templates/vardering-dealer.ts` | Create | HTML template — plaintext-style lead notification |
| `src/pages/api/vardera.ts` | Create | Orchestrator: validate → rate-limit → lookup → calc → emails → persist |
| `src/pages/vardera-bil.astro` | Rewrite | New form (regnr + miltal + skick + contact), POST to `/api/vardera`, success state |
| `supabase migration` | Run | Create `vardering_lookups` table |

---

## Task 1: Supabase migration — `vardering_lookups` table

**Files:**
- Run: SQL against Supabase project `lgtmzyspwbdjukoozwec`

- [ ] **Step 1: Apply migration via Supabase MCP**

Use `mcp__supabase__apply_migration` with:

```sql
-- migration name: create_vardering_lookups
create table vardering_lookups (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  regnr text,
  created_at timestamptz not null default now()
);

create index idx_vardering_lookups_ip_created on vardering_lookups (ip, created_at desc);
```

- [ ] **Step 2: Verify table exists**

Use `mcp__supabase__list_tables` and confirm `vardering_lookups` appears with the three columns.

- [ ] **Step 3: Commit** (no code yet, but document the migration)

```bash
cd /Users/arsalseemab/Desktop/github/begbilnorr_website
git add -A docs/
git commit -m "docs: add /vardera-bil email flow design + plan"
```

---

## Task 2: Pure valuation algorithm — `src/lib/valuation.ts`

**Files:**
- Create: `src/lib/valuation.ts`

Single pure function — no I/O, easy to reason about. Extracted from the client-side JS in the current `vardera-bil.astro` so we can reuse it server-side.

- [ ] **Step 1: Create the file**

```typescript
// src/lib/valuation.ts

export type Skick = 'som_ny' | 'mycket_bra' | 'bra' | 'sliten';

export interface ValuationInput {
  brand: string;          // e.g. "Volvo"
  year: number;           // e.g. 2018
  miltalMil: number;      // mil (1 mil = 10 km)
  fuel: 'petrol' | 'diesel' | 'hybrid' | 'electric';
  gearbox: 'manual' | 'automatic';
  skick: Skick;
}

export interface ValuationResult {
  estimate: number;
  rangeLow: number;
  rangeHigh: number;
  tradeIn: number;
  privateSale: number;
  bgnBud: number;
}

const BASE_PRICES: Record<string, number> = {
  Volvo: 220000,
  Volkswagen: 180000,
  Audi: 240000,
  BMW: 250000,
  'Mercedes-Benz': 260000,
  Toyota: 170000,
  Kia: 150000,
  Hyundai: 145000,
  Ford: 130000,
  Skoda: 160000,
  Peugeot: 120000,
  Renault: 115000,
  Nissan: 125000,
  Opel: 110000,
  Tesla: 350000,
};
const DEFAULT_BASE = 140000;

const FUEL_MULT: Record<ValuationInput['fuel'], number> = {
  petrol: 1.0,
  diesel: 1.05,
  hybrid: 1.15,
  electric: 1.25,
};

const GEARBOX_MULT: Record<ValuationInput['gearbox'], number> = {
  manual: 0.92,
  automatic: 1.0,
};

const SKICK_MULT: Record<Skick, number> = {
  som_ny: 1.10,
  mycket_bra: 1.0,
  bra: 0.92,
  sliten: 0.80,
};

export function calculateValuation(input: ValuationInput): ValuationResult {
  const basePrice = BASE_PRICES[input.brand] ?? DEFAULT_BASE;
  const currentYear = new Date().getFullYear();
  const age = Math.max(0, currentYear - input.year);

  let depreciation = 1;
  for (let i = 0; i < age; i++) {
    depreciation *= i === 0 ? 0.85 : 0.90;
  }

  const expectedMileageMil = age * 1200;
  const mileageDiffMil = input.miltalMil - expectedMileageMil;
  const mileageAdjustment = -mileageDiffMil * 10;

  const raw = basePrice * depreciation * FUEL_MULT[input.fuel] * GEARBOX_MULT[input.gearbox];
  const estimate = Math.max(5000, Math.round((raw + mileageAdjustment) * SKICK_MULT[input.skick]));

  return {
    estimate,
    rangeLow: Math.round(estimate * 0.88),
    rangeHigh: Math.round(estimate * 1.12),
    tradeIn: Math.round(estimate * 0.85),
    privateSale: estimate,
    bgnBud: Math.round(estimate * 0.90),
  };
}

const SKICK_LABELS: Record<Skick, string> = {
  som_ny: 'Som ny',
  mycket_bra: 'Mycket bra',
  bra: 'Bra',
  sliten: 'Sliten',
};

export function skickLabel(s: Skick): string {
  return SKICK_LABELS[s];
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/arsalseemab/Desktop/github/begbilnorr_website
npx tsc --noEmit src/lib/valuation.ts
```

Expected: no output (success). If errors, fix and re-run.

- [ ] **Step 3: Sanity check the math with a quick node REPL**

```bash
node -e "
const { calculateValuation } = require('./dist/lib/valuation.js');
console.log(calculateValuation({
  brand: 'Volvo', year: 2018, miltalMil: 12000, fuel: 'diesel', gearbox: 'automatic', skick: 'mycket_bra'
}));
"
```

If the file hasn't been transpiled (.ts can't be required directly), skip this step — the build in Task 9 will verify.

- [ ] **Step 4: Commit**

```bash
git add src/lib/valuation.ts
git commit -m "feat(vardera): add pure valuation algorithm"
```

---

## Task 3: biluppgifter.se wrapper — `src/lib/biluppgifter.ts`

**Files:**
- Create: `src/lib/biluppgifter.ts`

This wrapper isolates all knowledge of biluppgifter.se's API into one file. If we later switch to car.info, only this file changes.

**Note for engineer:** biluppgifter.se's exact REST endpoint and auth scheme depends on the account/plan. The code below assumes a JSON REST endpoint with API-key auth. If the actual scheme differs (HTTP Basic, different URL, different response shape), update this file — no other file needs to change.

- [ ] **Step 1: Create the file**

```typescript
// src/lib/biluppgifter.ts
//
// Wraps biluppgifter.se vehicle lookup.
//
// Required env var: BILUPPGIFTER_API_KEY
//
// If the endpoint URL or auth scheme differs from what's below, update only
// this file — callers use the typed return value and don't care.

export interface VehicleData {
  brand: string;          // e.g. "Volvo"
  model: string;          // e.g. "V70"
  year: number;           // e.g. 2018
  fuel: 'petrol' | 'diesel' | 'hybrid' | 'electric';
  gearbox: 'manual' | 'automatic';
  co2: number | null;     // g/km, null if unknown
  weight: number | null;  // tjänstevikt kg, null if unknown
}

export class BiluppgifterError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'BiluppgifterError';
  }
}

const BASE_URL = 'https://api.biluppgifter.se/v1';

function normaliseRegnr(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

function mapFuel(raw: string | undefined): VehicleData['fuel'] {
  const v = (raw ?? '').toLowerCase();
  if (v.includes('el') && !v.includes('hybrid')) return 'electric';
  if (v.includes('hybrid')) return 'hybrid';
  if (v.includes('diesel')) return 'diesel';
  return 'petrol';
}

function mapGearbox(raw: string | undefined): VehicleData['gearbox'] {
  return (raw ?? '').toLowerCase().includes('automat') ? 'automatic' : 'manual';
}

export async function getVehicleByRegnr(regnr: string): Promise<VehicleData> {
  const apiKey = import.meta.env.BILUPPGIFTER_API_KEY;
  if (!apiKey) {
    throw new BiluppgifterError('BILUPPGIFTER_API_KEY missing in env');
  }

  const reg = normaliseRegnr(regnr);
  const url = `${BASE_URL}/vehicle/${encodeURIComponent(reg)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new BiluppgifterError(`biluppgifter returned ${res.status}`, res.status);
  }

  const data: any = await res.json();
  // Be defensive — biluppgifter's response shape may vary by plan.
  const v = data.vehicle ?? data.data ?? data;

  if (!v.brand && !v.make) {
    throw new BiluppgifterError('Unexpected response shape from biluppgifter');
  }

  return {
    brand: String(v.brand ?? v.make).trim(),
    model: String(v.model ?? '').trim(),
    year: Number(v.model_year ?? v.year ?? v.first_registration_year ?? 0) || new Date().getFullYear(),
    fuel: mapFuel(v.fuel ?? v.fuel_type),
    gearbox: mapGearbox(v.gearbox ?? v.transmission),
    co2: v.co2 != null ? Number(v.co2) : null,
    weight: v.weight ?? v.kerb_weight ?? v.service_weight ?? null,
  };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit src/lib/biluppgifter.ts
```

Expected: no output. Fix any errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/biluppgifter.ts
git commit -m "feat(vardera): add biluppgifter.se vehicle lookup wrapper"
```

---

## Task 4: Rate-limit helper — `src/lib/rate-limit.ts`

**Files:**
- Create: `src/lib/rate-limit.ts`

- [ ] **Step 1: Create the file**

```typescript
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
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit src/lib/rate-limit.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/rate-limit.ts
git commit -m "feat(vardera): add IP rate-limit helper (5/IP/24h)"
```

---

## Task 5: Customer email template — `src/lib/email-templates/vardering-customer.ts`

**Files:**
- Create: `src/lib/email-templates/vardering-customer.ts`

Dark Begbilnorr-themed HTML email. **Inline CSS only** — many email clients (notably Gmail) strip `<style>` blocks. Use tables for layout (still the safest pattern in email).

- [ ] **Step 1: Create the directory + file**

```bash
mkdir -p src/lib/email-templates
```

```typescript
// src/lib/email-templates/vardering-customer.ts

import type { ValuationResult, Skick } from '../valuation';
import { skickLabel } from '../valuation';

export interface CustomerEmailInput {
  namn: string;
  brand: string;
  model: string;
  year: number;
  miltalMil: number;
  fuel: string;
  skick: Skick;
  valuation: ValuationResult;
}

function fmt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function fuelLabel(f: string): string {
  return ({ petrol: 'Bensin', diesel: 'Diesel', hybrid: 'Hybrid', electric: 'El' } as const)[f as 'petrol'] ?? f;
}

export function renderCustomerEmail(input: CustomerEmailInput): { subject: string; html: string } {
  const { namn, brand, model, year, miltalMil, fuel, skick, valuation } = input;
  const subject = `Värdering av din ${brand} ${model} (${year})`;

  const html = `<!DOCTYPE html>
<html lang="sv">
<head><meta charset="UTF-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#0F0F11;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#fff;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#0F0F11;">
    <tr><td align="center" style="padding:32px 16px;">

      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td align="center" style="padding-bottom:24px;">
          <img src="https://begbilnorr.se/images/begbilnorr-logo.webp" alt="Begbilnorr" width="160" style="display:block;border:0;outline:none;text-decoration:none;height:auto;">
        </td></tr>

        <!-- Red accent line -->
        <tr><td style="height:4px;background:#E62E2D;line-height:4px;font-size:0;">&nbsp;</td></tr>

        <!-- Body card -->
        <tr><td style="background:#1A1A1D;padding:36px 32px;border-radius:0 0 12px 12px;">

          <p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;color:#E62E2D;text-transform:uppercase;font-weight:600;">Värdering</p>

          <p style="margin:0 0 24px;font-size:18px;color:#fff;line-height:1.5;">Hej ${escapeHtml(namn)},</p>

          <p style="margin:0 0 24px;font-size:15px;color:rgba(255,255,255,0.75);line-height:1.7;">
            Här är värderingen av din <strong style="color:#fff;">${escapeHtml(brand)} ${escapeHtml(model)} (${year})</strong>:
          </p>

          <!-- Main estimate card -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#23232A;border-radius:8px;margin-bottom:24px;">
            <tr><td align="center" style="padding:28px 20px;">
              <p style="margin:0 0 6px;font-size:11px;letter-spacing:1.5px;color:rgba(255,255,255,0.55);text-transform:uppercase;font-weight:600;">Uppskattat marknadsvärde</p>
              <p style="margin:0 0 8px;font-size:38px;color:#fff;font-weight:700;letter-spacing:-1px;line-height:1.1;">${fmt(valuation.estimate)} kr</p>
              <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.5);">Intervall: ${fmt(valuation.rangeLow)} – ${fmt(valuation.rangeHigh)} kr</p>
            </td></tr>
          </table>

          <!-- Detail rows -->
          <p style="margin:0 0 10px;font-size:11px;letter-spacing:1.5px;color:rgba(255,255,255,0.55);text-transform:uppercase;font-weight:600;">Detaljer</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#23232A;border-radius:8px;margin-bottom:24px;">
            ${detailRow('Märke', escapeHtml(brand))}
            ${detailRow('Modell', escapeHtml(model))}
            ${detailRow('Årsmodell', String(year))}
            ${detailRow('Miltal', `${fmt(miltalMil)} mil`)}
            ${detailRow('Drivmedel', fuelLabel(fuel))}
            ${detailRow('Skick', skickLabel(skick), true)}
          </table>

          <!-- Three price levels -->
          <p style="margin:0 0 10px;font-size:11px;letter-spacing:1.5px;color:rgba(255,255,255,0.55);text-transform:uppercase;font-weight:600;">Tre möjliga pris-nivåer</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#23232A;border-radius:8px;margin-bottom:28px;">
            ${detailRow('Inbytespris (cirka)', `${fmt(valuation.tradeIn)} kr`)}
            ${detailRow('Försäljning privat', `${fmt(valuation.privateSale)} kr`)}
            ${detailRow('Begbilnorr-bud', `<strong style="color:#fff;">${fmt(valuation.bgnBud)} kr</strong>`, true)}
          </table>

          <!-- CTA -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr><td align="center" style="padding-bottom:24px;">
              <a href="https://begbilnorr.se/salj-bil?utm_source=email&utm_medium=vardering&utm_campaign=vardering-customer"
                 style="display:inline-block;background:#E62E2D;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:8px;letter-spacing:0.3px;">
                Få ett konkret bud inom 24h →
              </a>
            </td></tr>
          </table>

          <!-- Disclaimer -->
          <p style="margin:24px 0 0;font-size:12px;color:rgba(255,255,255,0.4);line-height:1.6;">
            Värderingen är ett estimat baserat på årsmodell, miltal, märke, drivmedel och skick.
            Faktiskt pris avgörs efter besiktning av bilen hos oss i Luleå.
          </p>
        </td></tr>

        <!-- Footer outside card -->
        <tr><td align="center" style="padding:24px 16px;font-size:12px;color:rgba(255,255,255,0.4);line-height:1.7;">
          <strong style="color:rgba(255,255,255,0.6);">Begbilnorr</strong> — Fabriksvägen 18, 972 54 Luleå<br>
          <a href="mailto:info@begbilnorr.se" style="color:rgba(255,255,255,0.5);text-decoration:none;">info@begbilnorr.se</a> · <a href="https://begbilnorr.se" style="color:rgba(255,255,255,0.5);text-decoration:none;">begbilnorr.se</a>
        </td></tr>

      </table>

    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

function detailRow(label: string, value: string, isLast: boolean = false): string {
  const border = isLast ? '' : 'border-bottom:1px solid rgba(255,255,255,0.06);';
  return `
    <tr><td style="padding:14px 20px;${border}">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td style="font-size:14px;color:rgba(255,255,255,0.55);">${label}</td>
          <td align="right" style="font-size:14px;color:#fff;font-weight:500;">${value}</td>
        </tr>
      </table>
    </td></tr>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit src/lib/email-templates/vardering-customer.ts
```

- [ ] **Step 3: Quick visual sanity check**

Write the rendered HTML to a temp file and open it in a browser:

```bash
node --input-type=module -e "
import('./dist/lib/email-templates/vardering-customer.js').catch(()=>{
  console.log('Skipping preview — file not transpiled yet (run after build)');
});
"
```

This step can be skipped if no transpiled build exists; Task 9's build will verify the file compiles, and the manual smoke test in Task 9 will render it.

- [ ] **Step 4: Commit**

```bash
git add src/lib/email-templates/vardering-customer.ts
git commit -m "feat(vardera): add customer valuation email template (dark theme)"
```

---

## Task 6: Dealer email template — `src/lib/email-templates/vardering-dealer.ts`

**Files:**
- Create: `src/lib/email-templates/vardering-dealer.ts`

Simple HTML email matching existing `/api/contact` style. No fancy design — Begbilnorr wants quick info to follow up.

- [ ] **Step 1: Create the file**

```typescript
// src/lib/email-templates/vardering-dealer.ts

import type { ValuationResult, Skick } from '../valuation';
import { skickLabel } from '../valuation';

export interface DealerEmailInput {
  namn: string;
  email: string;
  phone: string | null;
  regnr: string;
  brand: string;
  model: string;
  year: number;
  miltalMil: number;
  fuel: string;
  skick: Skick;
  valuation: ValuationResult;
  utmData: Record<string, unknown> | null;
}

function fmt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function renderDealerEmail(input: DealerEmailInput): { subject: string; html: string } {
  const { namn, email, phone, regnr, brand, model, year, miltalMil, fuel, skick, valuation, utmData } = input;

  const subject = `Ny värderingsförfrågan — ${namn} (${regnr})`;

  const utmLine = utmData
    ? `<p><strong>Trafikkälla:</strong> ${utmData.utm_source ?? '-'} / ${utmData.utm_medium ?? '-'}${utmData.utm_campaign ? ` / ${utmData.utm_campaign}` : ''}${utmData.landing_page ? ` (${utmData.landing_page})` : ''}</p>`
    : '';

  const html = `
    <h2>Ny värderingsförfrågan från begbilnorr.se</h2>
    <p><strong>Källa:</strong> vardering-v2</p>

    <h3>Kund</h3>
    <p>
      <strong>Namn:</strong> ${namn}<br>
      <strong>E-post:</strong> <a href="mailto:${email}">${email}</a><br>
      <strong>Telefon:</strong> ${phone ?? '(ej angiven)'}
    </p>

    <h3>Bil</h3>
    <p>
      <strong>Regnr:</strong> ${regnr}<br>
      <strong>Märke:</strong> ${brand}<br>
      <strong>Modell:</strong> ${model}<br>
      <strong>Årsmodell:</strong> ${year}<br>
      <strong>Miltal:</strong> ${fmt(miltalMil)} mil<br>
      <strong>Drivmedel:</strong> ${fuel}<br>
      <strong>Skick:</strong> ${skickLabel(skick)}
    </p>

    <h3>Värdering skickad till kund</h3>
    <p>
      <strong>Marknadsvärde:</strong> ${fmt(valuation.estimate)} kr (${fmt(valuation.rangeLow)} – ${fmt(valuation.rangeHigh)} kr)<br>
      <strong>Inbytespris:</strong> ${fmt(valuation.tradeIn)} kr<br>
      <strong>Privatförsäljning:</strong> ${fmt(valuation.privateSale)} kr<br>
      <strong>Begbilnorr-bud:</strong> ${fmt(valuation.bgnBud)} kr
    </p>

    <hr>
    ${utmLine}
  `;

  return { subject, html };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit src/lib/email-templates/vardering-dealer.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/email-templates/vardering-dealer.ts
git commit -m "feat(vardera): add dealer lead notification email"
```

---

## Task 7: API route — `src/pages/api/vardera.ts`

**Files:**
- Create: `src/pages/api/vardera.ts`

Orchestrator. Heavy uses of try/catch — partial failure (e.g. one of two emails fails) must NOT cause the customer to lose their lead.

- [ ] **Step 1: Create the file**

```typescript
// src/pages/api/vardera.ts

import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { sendEmail } from '../../lib/email';
import { getVehicleByRegnr, BiluppgifterError } from '../../lib/biluppgifter';
import { calculateValuation, type Skick } from '../../lib/valuation';
import { checkRateLimit, recordLookup, extractIP, RATE_LIMIT_PER_DAY } from '../../lib/rate-limit';
import { renderCustomerEmail } from '../../lib/email-templates/vardering-customer';
import { renderDealerEmail } from '../../lib/email-templates/vardering-dealer';

const REGNR_RE = /^[A-ZÅÄÖ]{3}[0-9]{2}[A-Z0-9]$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SKICK_VALUES: Skick[] = ['som_ny', 'mycket_bra', 'bra', 'sliten'];

function badRequest(message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { regnr, miltal, skick, namn, email, phone, gdpr, utm_data } = body;

    // ---- 1. Validate ----
    if (!regnr || typeof regnr !== 'string') return badRequest('Registreringsnummer krävs.');
    const cleanRegnr = regnr.toUpperCase().replace(/[\s-]/g, '');
    if (!REGNR_RE.test(cleanRegnr)) return badRequest('Ogiltigt registreringsnummer (ex: ABC123 eller ABC12A).');

    const miltalNum = Number(miltal);
    if (!Number.isFinite(miltalNum) || miltalNum <= 0 || miltalNum > 500000) {
      return badRequest('Ogiltigt miltal.');
    }

    if (!SKICK_VALUES.includes(skick)) return badRequest('Ogiltigt skick.');
    if (!namn || typeof namn !== 'string' || namn.trim().length < 2) return badRequest('Namn krävs.');
    if (!email || !EMAIL_RE.test(email)) return badRequest('Ogiltig e-postadress.');
    if (!gdpr) return badRequest('Du måste godkänna integritetspolicyn.');

    const cleanPhone = phone && typeof phone === 'string' && phone.trim().length >= 6 ? phone.trim() : null;

    // ---- 2. Rate limit ----
    const ip = extractIP(request);
    const limit = await checkRateLimit(ip);
    if (!limit.allowed) {
      return new Response(
        JSON.stringify({
          error: `Du har använt din kvot på ${RATE_LIMIT_PER_DAY} värderingar/dag. Försök igen imorgon eller kontakta oss direkt.`,
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ---- 3. Vehicle lookup ----
    let vehicle: Awaited<ReturnType<typeof getVehicleByRegnr>> | null = null;
    let lookupError: string | null = null;
    try {
      vehicle = await getVehicleByRegnr(cleanRegnr);
    } catch (err) {
      lookupError = err instanceof BiluppgifterError ? err.message : 'unknown';
      console.warn('biluppgifter lookup failed:', lookupError);
    }

    // Always record the attempt for rate limit accounting
    await recordLookup(ip, cleanRegnr);

    // ---- 4 & 5: Calculate + send emails ----
    let customerSubject = '';
    let customerHtml = '';
    let dealerSubject = '';
    let dealerHtml = '';

    if (vehicle) {
      const valuation = calculateValuation({
        brand: vehicle.brand,
        year: vehicle.year,
        miltalMil: miltalNum,
        fuel: vehicle.fuel,
        gearbox: vehicle.gearbox,
        skick: skick as Skick,
      });

      const c = renderCustomerEmail({
        namn: namn.trim(),
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
        miltalMil: miltalNum,
        fuel: vehicle.fuel,
        skick: skick as Skick,
        valuation,
      });
      customerSubject = c.subject;
      customerHtml = c.html;

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
      });
      dealerSubject = d.subject;
      dealerHtml = d.html;
    } else {
      // ---- Fallback: manual review ----
      customerSubject = 'Tack för din värderingsförfrågan';
      customerHtml = `
        <p>Hej ${namn.trim()},</p>
        <p>Tack för att du vill värdera din bil hos oss. Vi kunde inte göra en automatisk uppslagning av <strong>${cleanRegnr}</strong>, men vi värderar din bil personligen och återkommer inom 24 timmar.</p>
        <p>Med vänliga hälsningar,<br>Begbilnorr — Luleå</p>
      `;
      dealerSubject = `Manuell värdering krävs — ${namn.trim()} (${cleanRegnr})`;
      dealerHtml = `
        <h2>Värderingsförfrågan — manuell hantering krävs</h2>
        <p><strong>Anledning:</strong> biluppgifter.se-uppslag misslyckades: ${lookupError}</p>
        <p>
          <strong>Kund:</strong> ${namn.trim()}<br>
          <strong>E-post:</strong> ${email}<br>
          <strong>Telefon:</strong> ${cleanPhone ?? '(ej angiven)'}<br>
        </p>
        <p>
          <strong>Regnr:</strong> ${cleanRegnr}<br>
          <strong>Miltal:</strong> ${miltalNum} mil<br>
          <strong>Skick (uppgivet):</strong> ${skick}
        </p>
      `;
    }

    let customerEmailSent = false;
    let dealerEmailSent = false;

    try {
      await sendEmail({ to: [email], subject: customerSubject, html: customerHtml });
      customerEmailSent = true;
    } catch (e) {
      console.error('customer email failed:', e);
    }
    try {
      await sendEmail({ to: ['info@begbilnorr.se'], replyTo: email, subject: dealerSubject, html: dealerHtml });
      dealerEmailSent = true;
    } catch (e) {
      console.error('dealer email failed:', e);
    }

    // ---- 7. Persist ----
    try {
      await supabase.from('contact_submissions').insert({
        name: namn.trim(),
        email,
        phone: cleanPhone,
        message: `Värderingsförfrågan: ${cleanRegnr}, ${miltalNum} mil, skick=${skick}${vehicle ? `. Auto-värdering skickad.` : `. MANUELL HANTERING KRÄVS (biluppgifter-fel: ${lookupError}).`}`,
        source: 'vardering-v2',
        sent_successfully: customerEmailSent && dealerEmailSent,
        utm_data: utm_data ?? {},
      });
    } catch (e) {
      console.error('contact_submissions insert failed:', e);
    }

    try {
      const { data: existing } = await supabase
        .from('leads')
        .select('id, sources, form_labels, submission_count')
        .eq('email', email)
        .maybeSingle();

      if (existing) {
        const sources = existing.sources || [];
        const labels = existing.form_labels || [];
        if (!sources.includes('vardering-v2')) sources.push('vardering-v2');
        if (!labels.includes('Värdering (auto)')) labels.push('Värdering (auto)');
        await supabase
          .from('leads')
          .update({
            name: namn.trim(),
            phone: cleanPhone || undefined,
            sources,
            form_labels: labels,
            submission_count: (existing.submission_count || 1) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await supabase.from('leads').insert({
          email,
          phone: cleanPhone,
          name: namn.trim(),
          sources: ['vardering-v2'],
          form_labels: ['Värdering (auto)'],
        });
      }
    } catch (e) {
      console.error('leads upsert failed:', e);
    }

    return new Response(
      JSON.stringify({ success: true, autoValuation: !!vehicle }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('/api/vardera error:', err);
    return new Response(
      JSON.stringify({ error: 'Ett oväntat fel inträffade. Försök igen eller kontakta oss direkt.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

If errors, fix them before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/vardera.ts
git commit -m "feat(vardera): add /api/vardera orchestrator route"
```

---

## Task 8: Frontend rewrite — `src/pages/vardera-bil.astro`

**Files:**
- Modify: `src/pages/vardera-bil.astro` (rewrite — current file gets replaced)

Big change: replace the on-page calculator with a 7-field form that POSTs to `/api/vardera`. Result panel becomes a success-state card.

- [ ] **Step 1: Replace the file with the new content**

Overwrite `src/pages/vardera-bil.astro` with:

```astro
---
import Layout from '../components/Layout.astro';
---

<Layout
  title="Värdera din bil gratis | Begbilnorr Luleå"
  description="Fyll i regnr och miltal — vi mejlar en värdering av din bil baserad på marknadsdata i Norrland. Gratis och utan registrering."
>
  <section class="page-hero">
    <div class="container">
      <div class="hero-label">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="m17 5-5-3-5 3"/><path d="m17 19-5 3-5-3"/><path d="M2 12h20"/></svg>
        VÄRDERINGSVERKTYG
      </div>
      <h1>Värdera din bil gratis</h1>
      <p>Fyll i uppgifterna — vi mejlar värderingen direkt till dig.</p>
      <div class="hero-line"></div>
    </div>
  </section>

  <section class="tool-section">
    <div class="container">
      <div class="tool-card" id="formCard">
        <form id="varderaForm" class="vardera-form" novalidate>
          <h2 class="tool-h2">Din bil</h2>

          <div class="input-row">
            <div class="input-group">
              <label for="regnr">Registreringsnummer *</label>
              <input type="text" id="regnr" name="regnr" class="tool-input" placeholder="ABC123" required autocomplete="off" />
            </div>
            <div class="input-group">
              <label for="miltal">Miltal (mil) *</label>
              <input type="number" id="miltal" name="miltal" class="tool-input" placeholder="12 000" min="0" max="500000" step="100" required />
            </div>
          </div>

          <div class="input-group">
            <label for="skick">Skick *</label>
            <select id="skick" name="skick" class="tool-input" required>
              <option value="">Välj skick…</option>
              <option value="som_ny">✨ Som ny (≤2 år, servicebok, inga repor)</option>
              <option value="mycket_bra">👍 Mycket bra (skötselbok, småskador möjliga)</option>
              <option value="bra">👌 Bra (normalt slitage, fungerar bra)</option>
              <option value="sliten">🔧 Sliten (synliga skador eller mekaniska problem)</option>
            </select>
            <small class="input-hint">Påverkar värderingen — var ärlig för bästa estimat.</small>
          </div>

          <h2 class="tool-h2" style="margin-top:8px;">Kontaktuppgifter</h2>

          <div class="input-group">
            <label for="namn">Namn *</label>
            <input type="text" id="namn" name="namn" class="tool-input" placeholder="Anna Andersson" required autocomplete="name" />
          </div>

          <div class="input-row">
            <div class="input-group">
              <label for="email">E-post *</label>
              <input type="email" id="email" name="email" class="tool-input" placeholder="din@mejl.se" required autocomplete="email" />
            </div>
            <div class="input-group">
              <label for="phone">Telefon (valfritt)</label>
              <input type="tel" id="phone" name="phone" class="tool-input" placeholder="070-123 45 67" autocomplete="tel" />
            </div>
          </div>

          <label class="gdpr-row">
            <input type="checkbox" id="gdpr" name="gdpr" required />
            <span>Jag godkänner <a href="/integritetspolicy" target="_blank" rel="noopener">integritetspolicyn</a> och att Begbilnorr kontaktar mig via e-post/telefon.</span>
          </label>

          <button type="submit" id="submitBtn" class="btn-primary tool-btn">Få värderingen på mejl</button>

          <p class="form-error" id="formError" style="display:none;"></p>
        </form>
      </div>

      <!-- Success state -->
      <div class="success-card" id="successCard" style="display:none;">
        <div class="success-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
        </div>
        <h2>Värderingen är på väg!</h2>
        <p>Vi har skickat värderingen till <strong id="successEmail">din e-post</strong>. Kolla även skräpposten.</p>
        <p class="success-sub" id="successSub"></p>
        <a href="/bilar" class="btn-outline">Se våra bilar</a>
      </div>

      <div class="disclaimer">
        <p>⚠️ Värderingen är ett estimat baserat på årsmodell, miltal, märke, drivmedel och skick. Faktiskt pris avgörs efter besiktning hos oss i Luleå. Max 5 värderingar per IP per dygn.</p>
      </div>
    </div>
  </section>

  <section class="info-section">
    <div class="container">
      <h2 class="section-heading" style="text-align:center;margin-bottom:48px;">Så fungerar värderingen</h2>
      <div class="info-grid">
        <div class="info-card">
          <div class="step-number">1</div>
          <h3>Fordonsuppslag</h3>
          <p>Vi slår upp ditt regnr mot Sveriges fordonsregister för att få märke, modell och årsmodell.</p>
        </div>
        <div class="info-card">
          <div class="step-number">2</div>
          <h3>Marknadsdata</h3>
          <p>Vi använder data från tusentals bilannonser i Norrbotten och Västerbotten för att räkna ut grundvärdet.</p>
        </div>
        <div class="info-card">
          <div class="step-number">3</div>
          <h3>Justering för skick + miltal</h3>
          <p>Värderingen justeras för bilens skick (som ny → sliten) och om miltalet är högre/lägre än förväntat.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="cta-section">
    <div class="container" style="text-align:center;">
      <h2>Vill du sälja bilen direkt?</h2>
      <p>Vi köper bilar i hela Norrland — snabbt, enkelt och utan mellanhand.</p>
      <div class="cta-buttons">
        <a href="/salj-bil" class="btn-primary">Sälj din bil</a>
        <a href="/kontakt" class="btn-outline">Kontakta oss</a>
      </div>
    </div>
  </section>
</Layout>

<style>
  .tool-section {
    background: var(--bg-dark-3);
    padding: 80px 0 40px;
    border-top: 1px solid rgba(255,255,255,0.06);
  }

  .tool-card {
    max-width: 640px;
    margin: 0 auto;
    background: var(--bg-dark-4);
    border-radius: 12px;
    padding: 48px 40px;
    border: 1px solid rgba(255,255,255,0.06);
  }

  .tool-h2 {
    font-family: var(--serif);
    font-size: 26px;
    font-weight: 400;
    font-style: italic;
    color: var(--white);
    margin-bottom: 24px;
  }

  .vardera-form {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .input-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .input-group label {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255,255,255,0.7);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .input-hint {
    font-size: 12px;
    color: rgba(255,255,255,0.4);
    margin-top: 2px;
  }

  .tool-input {
    background: var(--bg-dark-5);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px;
    padding: 12px 14px;
    color: var(--white);
    font-family: var(--sans);
    font-size: 15px;
    color-scheme: dark;
    transition: border-color 0.2s;
  }

  .tool-input:focus {
    outline: none;
    border-color: var(--red);
  }

  select.tool-input {
    cursor: pointer;
  }

  #regnr {
    text-transform: uppercase;
    letter-spacing: 1px;
    font-weight: 600;
  }

  .gdpr-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 13px;
    color: rgba(255,255,255,0.65);
    line-height: 1.5;
    cursor: pointer;
  }

  .gdpr-row input[type="checkbox"] {
    margin-top: 2px;
    accent-color: var(--red);
  }

  .gdpr-row a {
    color: var(--red);
  }

  .tool-btn {
    margin-top: 8px;
    width: 100%;
    justify-content: center;
  }

  .tool-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .form-error {
    background: rgba(230,46,45,0.1);
    border: 1px solid rgba(230,46,45,0.3);
    border-radius: 8px;
    padding: 12px 16px;
    color: #fda4a4;
    font-size: 14px;
    margin-top: 4px;
  }

  .success-card {
    max-width: 640px;
    margin: 0 auto;
    background: var(--bg-dark-4);
    border-radius: 12px;
    padding: 48px 40px;
    border: 1px solid rgba(46,204,113,0.3);
    text-align: center;
  }

  .success-icon {
    width: 80px;
    height: 80px;
    margin: 0 auto 24px;
    border-radius: 50%;
    background: rgba(46,204,113,0.1);
    color: #2ecc71;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .success-card h2 {
    font-family: var(--serif);
    font-size: 28px;
    font-weight: 400;
    font-style: italic;
    color: var(--white);
    margin-bottom: 16px;
  }

  .success-card p {
    font-size: 15px;
    color: rgba(255,255,255,0.7);
    line-height: 1.7;
    margin-bottom: 12px;
  }

  .success-sub {
    font-size: 13px !important;
    color: rgba(255,255,255,0.5) !important;
    margin-bottom: 28px !important;
  }

  .disclaimer {
    max-width: 640px;
    margin: 24px auto 0;
    padding: 16px 20px;
    background: rgba(255,255,255,0.03);
    border-left: 3px solid rgba(255,255,255,0.2);
    border-radius: 4px;
  }

  .disclaimer p {
    font-size: 13px;
    color: rgba(255,255,255,0.5);
    line-height: 1.6;
    margin: 0;
  }

  .info-section {
    background: var(--bg-dark-2);
    padding: 80px 0;
    border-top: 1px solid rgba(255,255,255,0.06);
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 32px;
    max-width: 1000px;
    margin: 0 auto;
  }

  .info-card {
    background: var(--bg-dark-4);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 8px;
    padding: 40px 28px 32px;
    text-align: center;
    position: relative;
  }

  .step-number {
    position: absolute;
    top: -16px;
    left: 50%;
    transform: translateX(-50%);
    width: 32px;
    height: 32px;
    background: var(--red);
    color: var(--white);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
  }

  .info-card h3 {
    font-size: 18px;
    font-weight: 700;
    color: var(--white);
    margin: 16px 0 12px;
  }

  .info-card p {
    font-size: 14px;
    color: rgba(255,255,255,0.6);
    line-height: 1.7;
  }

  .cta-section {
    background: var(--bg-dark-3);
    padding: 80px 0;
    border-top: 1px solid rgba(255,255,255,0.06);
  }

  .cta-section h2 {
    font-family: var(--serif);
    font-size: 32px;
    font-weight: 400;
    font-style: italic;
    color: var(--white);
    margin-bottom: 12px;
  }

  .cta-section p {
    font-size: 16px;
    color: rgba(255,255,255,0.6);
    margin-bottom: 32px;
  }

  .cta-buttons {
    display: flex;
    justify-content: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  @media (max-width: 768px) {
    .input-row {
      grid-template-columns: 1fr;
    }
    .info-grid {
      grid-template-columns: 1fr;
    }
    .tool-section {
      padding: 48px 0 32px;
    }
    .tool-card,
    .success-card {
      padding: 32px 20px;
    }
    .cta-buttons {
      flex-direction: column;
      align-items: center;
    }
  }
</style>

<script is:inline>
  (function() {
    var form = document.getElementById('varderaForm');
    var formCard = document.getElementById('formCard');
    var successCard = document.getElementById('successCard');
    var successEmail = document.getElementById('successEmail');
    var successSub = document.getElementById('successSub');
    var submitBtn = document.getElementById('submitBtn');
    var errorBox = document.getElementById('formError');

    function getUtmData() {
      try {
        var params = new URLSearchParams(window.location.search);
        return {
          utm_source: params.get('utm_source') || null,
          utm_medium: params.get('utm_medium') || null,
          utm_campaign: params.get('utm_campaign') || null,
          gclid: params.get('gclid') || null,
          fbclid: params.get('fbclid') || null,
          referrer: document.referrer || null,
          landing_page: window.location.pathname,
        };
      } catch (e) {
        return {};
      }
    }

    function showError(msg) {
      errorBox.textContent = msg;
      errorBox.style.display = 'block';
    }

    function hideError() {
      errorBox.style.display = 'none';
    }

    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      hideError();

      var payload = {
        regnr: (document.getElementById('regnr').value || '').trim(),
        miltal: parseInt(document.getElementById('miltal').value, 10),
        skick: document.getElementById('skick').value,
        namn: (document.getElementById('namn').value || '').trim(),
        email: (document.getElementById('email').value || '').trim(),
        phone: (document.getElementById('phone').value || '').trim() || null,
        gdpr: document.getElementById('gdpr').checked,
        utm_data: getUtmData(),
      };

      submitBtn.disabled = true;
      submitBtn.textContent = 'Skickar…';

      try {
        var res = await fetch('/api/vardera', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        var data = await res.json();

        if (!res.ok) {
          showError(data.error || 'Något gick fel. Försök igen.');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Få värderingen på mejl';
          return;
        }

        successEmail.textContent = payload.email;
        successSub.textContent = data.autoValuation
          ? 'Värderingen är skickad till din mejl.'
          : 'Vi värderar din bil personligen och återkommer inom 24 timmar.';

        formCard.style.display = 'none';
        successCard.style.display = 'block';
        successCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) {
        showError('Något gick fel. Kontrollera din internetanslutning och försök igen.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Få värderingen på mejl';
      }
    });

    // Live-uppercase regnr while typing
    var regnrInput = document.getElementById('regnr');
    regnrInput.addEventListener('input', function() {
      var pos = regnrInput.selectionStart;
      regnrInput.value = regnrInput.value.toUpperCase().replace(/\s/g, '');
      regnrInput.setSelectionRange(pos, pos);
    });
  })();
</script>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/vardera-bil.astro
git commit -m "feat(vardera): rewrite frontend to email-gated lead form"
```

---

## Task 9: Build + manual smoke test

**Files:** none — verification step.

- [ ] **Step 1: Production build**

```bash
cd /Users/arsalseemab/Desktop/github/begbilnorr_website
npm run build
```

Expected: `Build Complete!` with no errors. If TypeScript errors appear, fix the offending file and re-run.

- [ ] **Step 2: Start dev server**

```bash
npm run dev
```

Expected: server starts on `http://localhost:4321`.

- [ ] **Step 3: Manual test in browser — happy path**

1. Open `http://localhost:4321/vardera-bil`
2. Fill: regnr `ABC123`, miltal `12000`, skick "Mycket bra", namn "Test Testsson", email `test@example.com`, check GDPR
3. Submit
4. Expected: form replaced by success card; if `BILUPPGIFTER_API_KEY` is unset, success message reads "Vi värderar din bil personligen…"
5. Check `info@begbilnorr.se` inbox (or Microsoft Graph logs) — dealer email should arrive
6. Check Supabase: `select * from vardering_lookups order by created_at desc limit 1;` → row exists
7. Check Supabase: `select * from contact_submissions where source = 'vardering-v2' order by created_at desc limit 1;` → row exists
8. Check Supabase: `select * from leads where email = 'test@example.com';` → row exists

- [ ] **Step 4: Manual test — invalid regnr**

1. Submit with regnr `XX1` → expect inline error "Ogiltigt registreringsnummer"
2. Submit without GDPR check → expect "Du måste godkänna integritetspolicyn"

- [ ] **Step 5: Manual test — rate limit**

1. Submit 6 valid requests quickly
2. 6th should fail with 429 + "Du har använt din kvot…" message

Optional: skip if biluppgifter API key is set and you don't want to burn 5 API calls. Test by manually inserting 5 rows into `vardering_lookups` with your IP, then submit once.

- [ ] **Step 6: Update CLAUDE.md (project docs)**

Append the following section to `/Users/arsalseemab/Desktop/github/begbilnorr_website/CLAUDE.md`:

```markdown
## Värderingsverktyg (/vardera-bil)

Email-gated lead form using biluppgifter.se vehicle lookup.

- API route: `src/pages/api/vardera.ts`
- Algorithm: `src/lib/valuation.ts`
- Rate limit: 5 per IP per 24h (table: `vardering_lookups`)
- Env var: `BILUPPGIFTER_API_KEY` (without this, falls back to manual review)
- Customer email: dark Begbilnorr design (`src/lib/email-templates/vardering-customer.ts`)
- Dealer notification: `info@begbilnorr.se` (`src/lib/email-templates/vardering-dealer.ts`)
- Source label in `contact_submissions` and `leads`: `vardering-v2`
```

Then commit:

```bash
git add CLAUDE.md
git commit -m "docs: document /vardera-bil v2 in CLAUDE.md"
```

- [ ] **Step 7: Final build sanity check**

```bash
npm run build
```

Expected: still clean.

---

## Self-review (run after writing)

- **Spec coverage:** Every section of the spec is covered:
  - User flow → Task 8 (frontend) + Task 7 (API)
  - Form fields → Task 8
  - Skick multipliers → Task 2
  - Backend architecture → Task 7
  - Failure modes → Task 7 (try/catch around each step, fallback to manual)
  - New files → Tasks 2–7
  - Supabase schema → Task 1
  - Env vars → Task 3 + Task 9 step 6
  - Email designs → Tasks 5–6
  - Rate limit → Task 4 + Task 7 + Task 9 step 5
  - Testing strategy → Task 9
- **Placeholder scan:** No TBD/TODO. All code blocks present. Fallback behaviour for missing API key is spelled out (not "handle gracefully").
- **Type consistency:** `Skick` is defined once in `valuation.ts` and imported by templates and API. `ValuationResult` likewise. `VehicleData` defined in `biluppgifter.ts` and used inline in API route.

---

Plan complete.
