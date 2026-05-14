# /vardera-bil — Email Flow Design

**Date:** 2026-05-14
**Status:** Approved by user
**Scope:** Rebuild `/vardera-bil` from a client-side estimator to a gated email-delivery flow with regnr lookup and lead capture.

---

## Goals

1. Capture qualified leads (name + email) before showing valuation.
2. Send the valuation to the customer via professionally designed email.
3. Notify Begbilnorr (`info@begbilnorr.se`) about each new lead.
4. Look up real vehicle data from regnr (via biluppgifter.se) so the form stays short.
5. Protect against API cost abuse with IP-based rate limiting (5/day).

---

## User flow

```
1. Customer visits /vardera-bil
2. Fills in:
   - Regnr (e.g. ABC123)
   - Miltal (e.g. 12 000)
   - Skick (Som ny / Mycket bra / Bra / Sliten)
   - Namn
   - E-post
   - Telefon (optional)
   - ☐ Godkänner integritetspolicy
3. Clicks "Få värderingen på mejl"
4. Loading spinner while server processes (typically 1–3s — depends on biluppgifter response time)
5. On-page confirmation:
   ✉ "Värderingen är skickad till din@mejl.se. Kolla även skräpposten."
6. Customer receives designed email with valuation
7. Begbilnorr receives lead notification email
```

## Form fields

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| Regnr | text | yes | Swedish regnr format: `^[A-ZÅÄÖ]{3}[0-9]{2}[A-Z0-9]$` (case-insensitive, spaces stripped) |
| Miltal | number | yes | 0 < n < 500000 |
| Skick | select | yes | One of: `som_ny`, `mycket_bra`, `bra`, `sliten` |
| Namn | text | yes | min 2 chars |
| E-post | email | yes | RFC-ish regex |
| Telefon | tel | no | min 6 digits if provided |
| GDPR-checkbox | checkbox | yes | must be true |

## Skick multipliers

| Value | Label | Multiplier |
|-------|-------|------------|
| `som_ny` | ✨ Som ny | 1.10 |
| `mycket_bra` | 👍 Mycket bra | 1.00 (baseline) |
| `bra` | 👌 Bra | 0.92 |
| `sliten` | 🔧 Sliten | 0.80 |

## Valuation algorithm

```
basePrice = lookup_base_price_by_brand(brand)   // existing map in current /vardera-bil
age = currentYear - registrationYear
depreciation = 1
for i in 0..age:
  depreciation *= (i === 0 ? 0.85 : 0.90)        // 15% first year, 10% per year after
expectedMileage = age * 1200                     // mil
mileageDiff = miltal - expectedMileage
mileageAdjustment = -mileageDiff * 10            // 10 kr per mil over/under expected

rawValue = basePrice * depreciation * fuelMult * gearboxMult
estimate = max(5000, (rawValue + mileageAdjustment) * skickMultiplier)

range_low  = estimate * 0.88
range_high = estimate * 1.12
tradeIn    = estimate * 0.85
private    = estimate
bgnBud     = estimate * 0.90
```

Same algorithm as v1 with the addition of `skickMultiplier` and inputs sourced from regnr lookup.

## Backend architecture

### Endpoint: `POST /api/vardera`

Request body:
```json
{
  "regnr": "ABC123",
  "miltal": 12000,
  "skick": "mycket_bra",
  "namn": "Anna Andersson",
  "email": "anna@example.com",
  "phone": "0701234567",
  "gdpr": true,
  "utm_data": { /* same shape as /api/contact */ }
}
```

Server steps:
1. **Validate** — 400 on invalid input
2. **Rate limit** — count rows in `vardering_lookups` where `ip = $clientIP` and `created_at > now() - 24h`. If ≥ 5 → 429 Too Many Requests
3. **biluppgifter.se lookup** — `getVehicleByRegnr(regnr)` returns `{ brand, model, year, fuel, gearbox, weight, co2 }`. If lookup fails → fallback to "manual review" mode (see Failure modes)
4. **Calculate** — run valuation algorithm
5. **Send customer email** — designed HTML (see Email design)
6. **Send dealer email** — simple lead notification to `info@begbilnorr.se`
7. **Persist**:
   - Insert into `vardering_lookups (ip, created_at)`
   - Insert into `contact_submissions` with `source: 'vardering-v2'` and message containing valuation summary
   - Upsert into `leads` (existing pattern from `/api/contact`)
8. **Return** `{ success: true }`

Response:
```json
{ "success": true }
```

Or on error:
```json
{ "error": "Ogiltig e-postadress." }
```

### Failure modes

| Failure | Response | Customer experience |
|---------|----------|---------------------|
| Invalid form data | 400 + error message | Toast/inline error |
| Rate limit exceeded | 429 + message | "Du har använt din kvot för idag. Försök igen imorgon eller kontakta oss direkt." |
| biluppgifter.se lookup fails | 200, but customer email says "Vi värderar din bil personligen och återkommer inom 24h" | Begbilnorr gets full lead with regnr to value manually |
| Email send fails | 200, but `sent_successfully: false` saved | Customer still sees success page (Begbilnorr can follow up manually since lead is saved) |

## New files

| File | Purpose |
|------|---------|
| `src/pages/api/vardera.ts` | API route — orchestration |
| `src/lib/biluppgifter.ts` | Wrapper for biluppgifter.se API |
| `src/lib/rate-limit.ts` | IP-based rate limit helper (Supabase-backed) |
| `src/lib/email-templates/vardering-customer.ts` | HTML template — dark Begbilnorr design |
| `src/lib/email-templates/vardering-dealer.ts` | HTML template — simple lead notification |
| `src/lib/valuation.ts` | Pure valuation algorithm (extracted from current /vardera-bil JS for server-side reuse) |

## Modified files

| File | Change |
|------|--------|
| `src/pages/vardera-bil.astro` | New form (regnr + miltal + skick + contact), POST to `/api/vardera`, replace results panel with success state |

## Supabase schema additions

```sql
create table vardering_lookups (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  regnr text,  -- stored for abuse-pattern analysis (not sensitive PII)
  created_at timestamptz not null default now()
);

create index idx_vardering_lookups_ip_created on vardering_lookups (ip, created_at desc);
```

No other schema changes — `contact_submissions` and `leads` already support this flow.

## Environment variables (new)

```
BILUPPGIFTER_API_KEY=<from biluppgifter.se account>
```

(Exact env var name depends on biluppgifter.se's auth scheme. To be confirmed during implementation. May use HTTP Basic with username/password instead of a single key.)

## Email design (customer)

Dark theme matching the site. Uses inline CSS only (no `<style>` blocks — many email clients strip them).

### Template structure

```
┌─────────────────────────────────────────────────────┐
│  Background: #0F0F11 (matches --bg-dark-3)          │
│                                                      │
│  Header strip:                                       │
│    [Begbilnorr logo, white version, 120×72 px]      │
│                                                      │
│  Accent line: 4px red (#E62E2D)                     │
│                                                      │
│  Body card (#1A1A1D, rounded 12px, padding 32px):   │
│                                                      │
│    "VÄRDERING" — uppercase, letter-spacing 2px,     │
│       12px red                                       │
│                                                      │
│    "Hej {namn}," — DM Sans, 18px white               │
│                                                      │
│    "Här är värderingen av din {brand} {model}       │
│     ({year}):"                                       │
│                                                      │
│    Big number card (#23232A, rounded 8px, padding   │
│      24px, text-align center):                       │
│      "Uppskattat marknadsvärde"                      │
│       — 12px gray uppercase                          │
│      "185 000 kr" — 40px serif italic white         │
│      "Intervall: 162 800 – 207 200 kr"               │
│       — 14px gray                                    │
│                                                      │
│    Details table (#23232A):                          │
│      Märke       | Volvo                             │
│      Modell      | V70                               │
│      Årsmodell   | 2018                              │
│      Miltal      | 12 000 mil                        │
│      Drivmedel   | Diesel                            │
│      Skick       | Mycket bra                        │
│                                                      │
│    Three pricing levels table:                       │
│      Inbytespris (cirka)  | 157 250 kr               │
│      Försäljning privat   | 185 000 kr               │
│      Begbilnorr-bud       | 166 500 kr               │
│                                                      │
│    Red CTA button (background #E62E2D, white text):  │
│      "Få ett konkret bud inom 24h →"                 │
│       — links to https://begbilnorr.se/salj-bil      │
│         with utm_source=email&utm_campaign=vardering │
│                                                      │
│    Disclaimer (12px gray):                           │
│      "Värderingen är ett estimat. Exakt pris        │
│       avgörs efter besiktning hos oss."              │
│                                                      │
│  Footer (outside card, smaller):                     │
│    "Begbilnorr — Fabriksvägen 18, 972 54 Luleå"      │
│    "Telefon: 0920-XX XX XX · info@begbilnorr.se"     │
│    "[Avregistrera]"-link (för att slippa nyhetsbrev) │
└─────────────────────────────────────────────────────┘
```

Subject line: `Värdering av din {brand} {model} ({year})`
From: `info@begbilnorr.se`
Reply-to: `info@begbilnorr.se` (not the customer)

## Email design (dealer)

Same simple format as existing `/api/contact` emails. No design needed beyond inline HTML:

Subject: `Ny värderingsförfrågan — {namn} ({regnr})`
Body:
```
Ny värderingsförfrågan från begbilnorr.se

Källa: vardering-v2

Kund:
  Namn:     Anna Andersson
  E-post:   anna@example.com
  Telefon:  070-123 45 67

Bil:
  Regnr:      ABC123
  Märke:      Volvo
  Modell:     V70
  Årsmodell:  2018
  Miltal:     12 000 mil
  Skick:      Mycket bra

Värdering skickad till kund:
  Marknadsvärde:      185 000 kr (162 800 – 207 200 kr)
  Inbytespris:        157 250 kr
  Privatförsäljning:  185 000 kr
  Begbilnorr-bud:     166 500 kr

Trafikkälla: google / cpc / vardering-q2 (begbilnorr.se/vardera-bil)
```

## Rate limit details

- Storage: `vardering_lookups` Supabase table
- Window: 24 hours rolling (not calendar day — easier to implement and fairer for users)
- Limit: 5 attempts per IP
- Key: `request.headers['x-forwarded-for']` (first IP if comma-separated) → fallback to `request.headers['x-real-ip']` → fallback to `'unknown'`
- Response on limit: 429 with friendly message
- Rate limit applies regardless of whether biluppgifter lookup succeeded (to prevent retry abuse)

## Testing strategy

- Manual: Submit form with valid data → verify both emails arrive, lead saved, lookup saved
- Manual: Submit invalid regnr → API returns 400
- Manual: Submit 6 times in a row from same IP → 6th returns 429
- Manual: Submit when BILUPPGIFTER_API_KEY missing → customer gets fallback email, dealer still gets lead

No automated tests — this project doesn't have a test suite currently.

## Out of scope

- Multi-language emails (Swedish only)
- SMS notifications
- Customer-facing valuation history (no login system)
- Admin tool to manually adjust valuation algorithms
- A/B testing infrastructure
- Webhook integrations (Slack, Discord, etc.)

## To verify during implementation

1. **biluppgifter.se auth scheme** — once an account exists, confirm whether auth is API key (single env var) or HTTP Basic (username + password). The wrapper `src/lib/biluppgifter.ts` reads env vars and is the only file that needs updating if scheme differs from what's prototyped.
2. **API key not yet provisioned** — user must register at biluppgifter.se and add `BILUPPGIFTER_API_KEY` (or equivalent) to `.env.local` and Vercel env vars before the API can succeed in production. Until then, all submissions take the manual-review fallback path (which is still useful: lead is captured, customer gets a polite "we'll value it manually" mail).

## Decided design choices (no longer open)

- **Email logo**: use existing `public/images/begbilnorr-logo.webp` (already designed on dark bg).
- **vardering_lookups stores regnr**: yes (see schema), useful for abuse-pattern analysis. Not considered PII under Swedish data protection rules.
