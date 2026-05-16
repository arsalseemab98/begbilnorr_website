# Begbilnorr Astro — begbilnorr.se

## Projektöversikt
Begbilnorr.se — begagnade bilar i Luleå (Fabriksvägen 18, 972 54). Astro 5 SSR med Vercel-adapter och ISR (60s).

## Tech Stack
- **Framework:** Astro 5 (`output: 'server'`)
- **Adapter:** `@astrojs/vercel` med ISR (60s expiration)
- **Integration:** `@astrojs/react` (för interaktiva komponenter)
- **Styling:** Scoped CSS + global.css (CSS-variabler)
- **Database:** Supabase (PostgreSQL)
- **Hosting:** Vercel Pro
- **Fonts:** DM Sans + DM Serif Display (Google Fonts)
- **Bilder:** Supabase Storage (`car-images` bucket) + Blocket CDN fallback
- **Analytics:** Google Analytics GA4 (G-WRX7JK64Z0) + Microsoft Clarity (vtjfc41xfh)
- **GDPR:** Cookie consent banner med Google Consent Mode v2

## Supabase
- **Project ID:** `lgtmzyspwbdjukoozwec`
- **URL:** `https://lgtmzyspwbdjukoozwec.supabase.co`
- **Region:** eu-north-1 (Stockholm)
- **Tabeller:**
  - `cars` — 22 bilar totalt, 14 aktiva (reg_no, slug, brand, model, variant, full_name, year, mileage, fuel_type, gearbox, body_type, price, monthly_payment, description, specifications, equipment[], images[], is_active, is_sold, is_vat_deductible)
  - `settings` — Inställningar (key/value)
  - `contact_submissions` — Kontaktformulär (name, email, phone, message, car_slug, car_name, source, sent_successfully, utm_data JSONB)
  - `leads` — Unika leads med email/phone, sources[], form_labels[], submission_count (upsert på email)
  - `newsletter_subscribers` — Nyhetsbrevsprenumeranter (email, source, is_active)
  - `redirects` — 301-redirects (slug, target_url, is_active, click_count). Hanteras av `[...slug].astro` catch-all
- **Bildata:** Synkas manuellt från Blocket (dealer 7514308). Beskrivningar hämtas från Blocket-annonser. Bilar som inte längre finns på Blocket markeras `is_active=false, is_sold=true`.

## Vercel
- **Project:** `begbilnorr-website`
- **URL:** https://begbilnorr-website.vercel.app
- **Production:** https://begbilnorr.se
- **GitHub:** https://github.com/arsalseemab98/begbilnorr_website
- **Team:** arsalseemab98s-projects (Pro)
- **Env vars:** SUPABASE_URL, SUPABASE_ANON_KEY

## Projektstruktur
```
src/
├── components/
│   ├── Layout.astro        — Wrapper (SEOHead, Navbar, Footer)
│   ├── Navbar.astro        — Navbar + mobil-meny + bottom-nav
│   ├── Footer.astro        — Footer med FAB-knappar
│   ├── CarCard.astro       — Bilkort med bildkarusell (pilar, dots, swipe)
│   ├── SEOHead.astro       — Meta-taggar (OG, Twitter, canonical, GA4, Clarity)
│   ├── CookieConsent.astro — GDPR cookie consent banner (sv)
│   └── StructuredData.astro — JSON-LD injection
├── pages/
│   ├── index.astro         — Startsida (hero med three.js)
│   ├── bilar/
│   │   ├── index.astro     — Alla bilar (filter: pris, miltal, år, märke, bränsle, växellåda)
│   │   └── [slug].astro    — Bil-detaljsida (beskrivning, utrustning, galleri)
│   ├── swish.astro         — Betala med Swish (prerender)
│   ├── hoja-swish-grans.astro — Höja Swish-gräns (prerender)
│   ├── finansiering.astro  — Bilfinansiering
│   ├── salj-bil.astro      — Sälj din bil
│   ├── om-oss.astro        — Om oss
│   ├── kontakt.astro       — Kontakt
│   ├── admin.astro         — Admin-panel
│   ├── integritetspolicy.astro — Integritetspolicy (GDPR)
│   ├── anvandarvillkor.astro — Användarvillkor
│   ├── fragor-och-svar.astro — FAQ med kategorier
│   ├── [...slug].astro     — Catch-all: Supabase redirects + 404
│   └── sitemap.xml.ts      — Dynamisk sitemap
├── lib/
│   ├── supabase.ts         — Supabase client
│   └── utils.ts            — formatPrice, formatPriceExVat, formatMileage, calculateMonthlyPayment
├── types/
│   └── car.ts              — Car interface
└── styles/
    └── global.css           — Globala stilar + CSS-variabler
```

## Bilkort (CarCard)
- Visar: år / miltal / växellåda (Manuell/Automat) / LULEÅ
- Bränsletyp-badge på bilden + "Moms"-badge under (om `is_vat_deductible`)
- "Moms avdragsgill · X kr ex. moms" text under bilnamn (om moms)
- Pris ex. moms beräknas: `price / 1.25`
- USP-strip: Hemleverans, Garanti, Finansiering
- Bildkarusell: pilar, dots, swipe, räknare "1 / 8", max 8 bilder
- CSS i `global.css` under "CAR CARD CAROUSEL"

## Bil-detaljsida ([slug].astro)
- Bildgalleri med thumbnails och pil-navigation
- Beskrivning: `car.description` (från Blocket-annons, med `set:html` och `\n` → `<br />`)
- "Moms avdragsgill · X kr ex. moms" under bilnamn (om moms)
- Utrustningslista: `car.equipment[]`
- Specs-grid: miltal, årsmodell, drivmedel, växellåda, karosseri, reg.nr
- CTA: kontakt, WhatsApp, ring, beräkna månadskostnad
- "Vill du veta mer?" formulär under galleriet

## Filter (bilar/index.astro)
- Dynamiska range sliders för pris, årsmodell, miltal (baserat på lager)
- Dropdowns för märke, bränsle, växellåda
- Fritextsökning
- Filterchips med aktiva filter
- Kollapsbar på mobil med toggle-knapp

## CSS-variabler
- Bakgrunder: `--bg-dark-2` till `--bg-dark-5`
- Färger: `--red`, `--red-dark`, `--red-light`
- Typsnitt: `--serif` (DM Serif Display), `--sans` (DM Sans)

## SEO
- Lighthouse: Performance 65, Accessibility 100, SEO 100, Best Practices 100
- Prerender: swish.astro, hoja-swish-grans.astro (statisk HTML från CDN)
- StructuredData: FAQPage, HowTo, AutoDealer, Car schemas
- Sitemap: Dynamisk med bilar + statiska sidor
- Adress i JSON-LD: Fabriksvägen 18, 972 54 Luleå

## Bildoptimering
- Navbar-logo: `/images/begbilnorr-logo-nav.webp` (4KB, 150x90)
- Footer-logo: `/images/begbilnorr-logo.webp` (15KB, 200x120)
- Bank-logotyper: `/banks/*.webp` (Swish-sidan)
- Bilbilder: Supabase Storage (`car-images` bucket, public)

## Blocket-integration
- Dealer-sida: https://www.blocket.se/mobility/dealer/7514308/begbilnorr
- Bilder: `https://images.blocketcdn.se/dynamic/default/item/{id}/{uuid}`
- Beskrivningar: Hämtas från Blocket-annonser och sparas i `cars.description`
- Utrustning: Hämtas från Blocket och sparas i `cars.equipment[]`

## Analytics & GDPR
- **Google Analytics:** GA4 property `real_begbilnorr`, Measurement ID `G-WRX7JK64Z0`
- **Microsoft Clarity:** Tag ID `vtjfc41xfh`
- **Cookie Consent:** CookieConsent.astro — GDPR banner med Google Consent Mode v2
  - Default: `analytics_storage: denied` (ingen spårning utan samtycke)
  - Vid "Acceptera": consent uppdateras till `granted`, sparas i localStorage
  - Vid "Avvisa": varningstext visas, overlay stannar kvar — användaren måste godkänna för att använda sidan
- **GA4 Enhanced Measurement:** Page views, Scrolls, Outbound clicks, Site search, Video engagement, File downloads, Form interactions
- **Formulär-villkor:** Alla formulär har obligatorisk checkbox för användarvillkor + integritetspolicy med expanderbar sammanfattning
- **Policy-sidor:** `/integritetspolicy` och `/anvandarvillkor` — länkas i footer och formulär-checkboxar
- **UTM-spårning:** Alla formulär skickar UTM-data (utm_source, utm_medium, utm_campaign, gclid, fbclid, referrer, landing_page). Auto-detekterar källa (google, facebook, blocket, direct). Sparas i `contact_submissions.utm_data` (JSONB) och visas i e-postnotiser.

## Redirects (gamla WordPress-URLs)
Hanteras via `redirects`-tabellen i Supabase + `[...slug].astro` catch-all (301).
- `/hem/` → `/`, `/bilfinansiering/` → `/finansiering`, `/kopabil/` → `/bilar`
- `/kontakta-oss/` → `/kontakt`, `/saljabil/` → `/salj-bil`, `/garanti/` → `/fragor-och-svar`
- `/product/*` → `/bilar`, `/product-category/*` → `/bilar`
- `/hemleverans/` → `/bilar`, `/tjanster/` → `/bilar`
- Nya redirects läggs till via admin-panelen eller direkt i Supabase

## Footer
- "Skapat av swiftcore.se" med SwiftCore-favicon (`/images/swiftcore-favicon.png`)

## Värderingsverktyg (/vardera-bil)
Email-gated lead form med regnr-uppslag via biluppgifter.se + marknadsdata från fordonlista.

### Filer
- API route: `src/pages/api/vardera.ts`
- Statisk algoritm (fallback): `src/lib/valuation.ts` → `calculateValuation()`
- Marknadsdata-algoritm: `src/lib/valuation.ts` → `calculateFromMarketData()`
- Fordonlista-klient: `src/lib/fordonlista-client.ts`
- Regnr-lookup: `src/lib/biluppgifter.ts` (kräver `BILUPPGIFTER_API_KEY`)
- Rate limit: 5/IP/24h via `vardering_lookups` (`src/lib/rate-limit.ts`)
- Kund-mejl: dark Begbilnorr-design (`src/lib/email-templates/vardering-customer.ts`)
- Dealer-mejl: notis till `info@begbilnorr.se` (`src/lib/email-templates/vardering-dealer.ts`)

### Värderings-flöde
1. biluppgifter.se → märke, modell, år, drivmedel, växellåda
2. POST till `fordonlista.vercel.app/api/v1/valuation` (kräver `FORDONLISTA_VALUATION_KEY` + `FORDONLISTA_VALUATION_URL`)
3. Om `confidence` ∈ {high, medium, low} → använd `basePrice` från Norrland-marknadsdata + miltal/skick-justering
4. Om `insufficient` eller API-fel → fallback till statisk algoritm (`BASE_PRICES`-map)
5. Mejl till kund inkluderar "Baserat på N liknande bilar (YYYY-YYYY)" när marknadsdata användes

### Skick-multipliers (båda algoritmerna)
- ✨ Som ny: +10%
- 👍 Mycket bra: 0%
- 👌 Bra: −8%
- 🔧 Sliten: −20%

### Source-labels
- `contact_submissions.source = 'vardering-v2'`
- `leads.form_labels` inkluderar `'Värdering (auto)'`
- Dealer-mejl visar "Värderings-källa: Fordonlista (N liknande, confidence X)" eller "Statisk algoritm"

### Specs + planer
- Email-gated flow: `docs/superpowers/specs/2026-05-14-vardera-bil-email-flow-design.md` (plan: `docs/superpowers/plans/2026-05-14-vardera-bil-email-flow.md`)
- Fordonlista-integration: `docs/superpowers/specs/2026-05-16-fordonlista-valuation-integration-design.md` (plan: `docs/superpowers/plans/2026-05-16-fordonlista-valuation-integration.md`)

## Kommandon
```bash
npm run dev      # Starta dev-server (port 4321)
npm run build    # Bygg för produktion
npm run preview  # Förhandsgranska build
```
