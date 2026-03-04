# Begbilnorr Astro — begbilnorr.se

## Projektöversikt
Begbilnorr.se — begagnade bilar i Luleå. Astro 5 SSR med Vercel-adapter och ISR (60s).

## Tech Stack
- **Framework:** Astro 5 (`output: 'server'`)
- **Adapter:** `@astrojs/vercel` med ISR (60s expiration)
- **Integration:** `@astrojs/react` (för interaktiva komponenter)
- **Styling:** Scoped CSS + global.css (CSS-variabler)
- **Database:** Supabase (PostgreSQL)
- **Hosting:** Vercel Pro
- **Fonts:** DM Sans + DM Serif Display (Google Fonts)

## Supabase
- **Project ID:** `lgtmzyspwbdjukoozwec`
- **URL:** `https://lgtmzyspwbdjukoozwec.supabase.co`
- **Region:** eu-north-1 (Stockholm)
- **Tabeller:**
  - `cars` — 18 bilar (reg_no, slug, brand, model, variant, full_name, year, mileage, fuel_type, gearbox, body_type, price, monthly_payment, description, specifications, equipment[], images[], is_active, is_sold)
  - `settings` — Inställningar (key/value)
  - `contact_submissions` — Kontaktformulär

## Vercel
- **Project:** `begbilnorr-website`
- **URL:** https://begbilnorr-website.vercel.app
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
│   ├── SEOHead.astro       — Meta-taggar (OG, Twitter, canonical)
│   └── StructuredData.astro — JSON-LD injection
├── pages/
│   ├── index.astro         — Startsida (hero med three.js)
│   ├── bilar/
│   │   ├── index.astro     — Alla bilar
│   │   └── [slug].astro    — Bil-detaljsida
│   ├── swish.astro         — Betala med Swish (prerender)
│   ├── hoja-swish-grans.astro — Höja Swish-gräns (prerender)
│   ├── finansiering.astro  — Bilfinansiering
│   ├── salj-bil.astro      — Sälj din bil
│   ├── om-oss.astro        — Om oss
│   ├── kontakt.astro       — Kontakt
│   └── sitemap.xml.ts      — Dynamisk sitemap
├── lib/
│   └── supabase.ts         — Supabase client
├── types/
│   └── car.ts              — Car interface
└── styles/
    └── global.css           — Globala stilar + CSS-variabler
```

## CSS-variabler
- Bakgrunder: `--bg-dark-2` till `--bg-dark-5`
- Färger: `--red`, `--red-dark`
- Typsnitt: `--serif` (DM Serif Display), `--sans` (DM Sans)

## SEO
- Lighthouse: Performance 65, Accessibility 100, SEO 100, Best Practices 100
- Prerender: swish.astro, hoja-swish-grans.astro (statisk HTML från CDN)
- StructuredData: FAQPage, HowTo, AutoDealer schemas
- Sitemap: Dynamisk med bilar + statiska sidor

## Bildkarusell (CarCard)
- Pilar vänster/höger — syns vid hover (desktop), alltid synliga (mobil)
- Dot-indikatorer — klickbara, visar aktiv bild
- Räknare "1 / 8" — nere till höger
- Touch swipe — svep vänster/höger på mobil
- Max 8 bilder per kort för prestanda
- CSS i `global.css` under "CAR CARD CAROUSEL"

## Bildoptimering
- Navbar-logo: `/images/begbilnorr-logo-nav.webp` (4KB, 150x90)
- Footer-logo: `/images/begbilnorr-logo.webp` (15KB, 200x120)
- Bank-logotyper: `/banks/*.webp` (Swish-sidan)

## Kommandon
```bash
npm run dev      # Starta dev-server (port 4321)
npm run build    # Bygg för produktion
npm run preview  # Förhandsgranska build
```
