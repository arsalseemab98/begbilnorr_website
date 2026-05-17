# DEVLOG — Funktioner & Errors

> Senaste överst. Format: `YYYY-MM-DD HH:MM · [type] · beskrivning`
> Types: `feat` · `fix` · `style` · `docs` · `chore` · `refactor` · `incident`

---

## 2026-05-17

- **14:35 · style** · Tog bort `Begbilnorr`-watermark text-overlay från alla bil-bilder (CarCard + bilar/[slug] + 30 rader CSS i global.css). Commit `3f1f867`.
- **14:30 · debug** · Försökte hitta vad användaren menade med "Begbilnorr på vänster sida på bilder". Trodde först det var marknadsförings-postrar i Blocket-bilderna (image 1, 2, 5 är posters med Begbilnorr-branding). Användaren förtydligade: det var en HTML-overlay (`<div class="watermark">`) — inte i själva bildfilen.

## 2026-05-16

- **17:05 · copy** · Bytte ut "Vi värderar din bil personligen" → "Vi behöver mer uppgifter från dig" i fallback-mejl. Commit `3061a0e`.
- **17:03 · feat(vardera)** · Manual review när fordonlista returnerar `insufficient` (ingen fallback till statisk algoritm längre). Commit `7a7a530`.
- **16:57 · style(vardera)** · Tog bort "Baserat på N liknande bilar"-raden från kundmejlet. Ersatt med "Kontakta oss för detaljerad värdering"-link. Commit `f00578d`.
- **16:35 · seo** · Submit sitemap + 5 URLs till Google Search Console via URL Inspection (begbilnorr.se account u/4, agnagn1942 har inte access).
- **16:34 · seo** · Lagt till 5 verktyg-sidor i sitemap.xml.ts. Commit `33e21b7`.
- **16:30 · i18n(vardera)** · Localize Estate → Kombi, Saloon → Sedan etc i mejlet. `localizeModelSv()` i biluppgifter.ts. Commit `373a2f7`.
- **16:27 · fix(vardera)** · Cap miltal-justering vid ±35% / ±15% av basePrice. Toyota Corolla 2019 + 30 000 mil + sliten gav tidigare 5 000 kr (floor) → nu rimligt värde. Commit `26ddb1d`.
- **16:27 · feat(vardera)** · Relaxed model match i fordonlista — om "Corolla Estate" ger 0 träffar prövas "Corolla". Commit `b767540` (fordonlista repo).
- **16:00 · feat(email)** · BIMI Tiny PS SVG-logo (placeholder-monogram). Pushat. BIMI DNS-record + DMARC också tillagda via Vercel CLI. SVG på `public/bimi-logo.svg` (403 bytes).
- **15:48 · style(email)** · Branded wrapper på alla /api/contact-mejl (logo header + dark theme). Commit `b2eda73`.
- **15:42 · style(bud)** · Förenklat /begar-bud till one-field modal — bara telefon synligt, namn+email hidden. Commit `d00eaa6`.
- **15:38 · feat(vardera)** · /begar-bud bid-request-sida. CTA-knappen i värderingsmejlet pekar dit med URL-params. Commit `25efc1c`.
- **15:30 · fix(vardera)** · Logo overlap + Gmail "..."-trim. Bytte .webp → .png för logo, explicit dimensions, tog bort `<style>@import` som Gmail strippar. Commit `d0ce948`.
- **15:25 · fix(vardera)** · process.env fallback för BILUPPGIFTER_API_KEY (Vercel exposerar inte alltid via import.meta.env). Commit `21a166e`.
- **15:25 · style(vardera)** · Bytt mejl-design till exakta site-färger (`#000000`, `#111111`, `#151515`, `#E62E2D`) + DM Sans/Serif via Google Fonts. Commit `40b2416`.
- **15:13 · nav** · Bytt nav tillbaka till "Verktyg" (från "Värdera din bil") — verktygshub är bättre struktur tills Valuation-paket aktiverat. Commit `1d64267`.
- **14:50 · feat(vardera)** · Loading state med 3-stegs progress card på form submit. Commit del av `26ddb1d`.
- **14:30 · debug** · Vercel deploy picked up SUPABASE_SERVICE_ROLE_KEY först efter empty-commit redeploy. Lärdom: efter `vercel env add` MÅSTE man redeploya.
- **14:25 · fix** · biluppgifter-nyckeln hade trailing `\n` pga `echo "..." | vercel env add`. Fixat med `printf` (inget \n) + `.trim()` på server-side. Commit `e76847e` (fordonlista).
- **14:20 · feat** · Skick som card-grid med Lucide-ikoner + progressive disclosure (skick visas efter regnr+miltal). Commit `a254c57`, `d69865a`.
- **14:00 · feat(vardera)** · 2-stegs form (bil-info → kontakt). Commit `f6332f6`.
- **13:00 · feat** · /api/v1/valuation endpoint på fordonlista deployed. Auth, rate limit, cache, audit log allt working. Commit `c0bd95c` till `9e19ece` (fordonlista repo).
- **12:30 · spec + plan** · Brainstorm + design fordonlista valuation integration. Spec på `docs/superpowers/specs/2026-05-16-fordonlista-valuation-integration-design.md`.

## 2026-05-15

- **15:00 · feat** · /vardera-bil rewritten till email-gated 2-stegs form. Commit `b39bb81`.
- **14:30 · feat** · biluppgifter.se integration + cross-project setup. Endpoint pattern: `/api/v1/vehicle/regno/{regnr}` med Bearer auth.
- **14:00 · feat** · Rate limit 5/IP/24h via `vardering_lookups`-tabellen.

## 2026-05-14

- **17:00 · feat** · Bygg 4 verktyg-sidor: /vardera-bil, /billan-kalkylator, /bilskatt-kollare, /besiktning-datum. Commit `[multiple]`.
- **15:00 · research** · Keyword research för bloggcontent + tools via Google Keyword Planner. Resultat sparat i `KEYWORD-RESEARCH.md`. Topp-fynd: "kvd värdera bil" 60 500/mån LÅG konkurrens.
- **13:00 · brainstorm** · Design email-gated valuation flow. Beslut: gated flow, GDPR-checkbox, 4-niv-skick, mörk Begbilnorr-design.

---

## 🐛 Lösta incidents

### 2026-05-16 — biluppgifter API-nyckel trailing newline
- **Symtom**: HTTP 401 från `/api/v1/valuation` trots att nyckeln var tillagd i Vercel
- **Root cause**: `echo "..." | vercel env add` lade till `\n` i värdet → längd-mismatch i `timingSafeEqual()`
- **Fix**: Bytt till `printf` (utan \n) + lagt till `.trim()` i auth.ts som defense
- **Lärdom**: Använd ALLTID `printf` med Vercel CLI för env-vars, eller verifiera med `vercel env pull` efteråt

### 2026-05-16 — Vercel deploy med SUPABASE_SERVICE_ROLE_KEY
- **Symtom**: HTTP 500 efter att SUPABASE_SERVICE_ROLE_KEY lagts till
- **Root cause**: Vercel deployen var redan byggd FÖRE env-var:n lades till → funktionen hade inte tillgång
- **Fix**: `git commit --allow-empty + git push` triggade ny deploy som plockade upp env-varen
- **Lärdom**: Vercel cachar env-vars vid build → ALLTID redeploya efter env-vars ändras

### 2026-05-16 — Toyota Corolla 2019 + 30 000 mil + sliten = 5 000 kr
- **Symtom**: Värderingen visade flooren (5 000 kr) istället för realistiskt pris
- **Root cause**: Static algoritm hade ingen cap på miltal-justering. `-21 600 mil × 10 kr/mil = -216 000 kr` → estimate gick negativt → max(5000, neg) = 5000
- **Fix**: Cap miltal-justering vid ±35% / ±15% av basePrice. Sänkt kr/mil från 10 → 6.
- **Lärdom**: Algoritmer behöver ALLTID sanity caps på extreme-värden, inte bara floors

---

## 📊 Stats (per dag)

| Datum | Commits | Files changed |
|-------|---------|---------------|
| 2026-05-14 | 8 | 12 |
| 2026-05-15 | 5 | 8 |
| 2026-05-16 | 25 | 30+ |
| 2026-05-17 | 2 | 3 |

(Approximat — kör `git log --since=2026-05-14 --oneline | wc -l` för exakt antal)
