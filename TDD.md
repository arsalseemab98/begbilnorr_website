# TDD — Tasks & Backlog

> `[ ]` pending · `[x]` done · `[~]` in progress / blocked

## ✅ Klart (sorterat senast överst)

### 2026-05-18
- [x] Lighthouse-audit av prod (roier-seo-skill) — baseline: Perf 91 / A11y 95 / BP 96 / SEO 100
- [x] Three.js gating: bara desktop + WebGL-stöd + idle (sparar 87 KiB, fixar console-error)
- [x] CarCard Blocket-bilder 1600w → 800w + srcset 1200w retina + sizes + decoding=async
- [x] Kontrastfix: `.interested-btn` röd #E62E2D → #B82221 (klarar WCAG AA)
- [x] Kontrastfix: `.bottom-nav-item` rgba(255,255,255,0.5) → 0.78
- [x] Kontrastfix: Footer "Vi rekommenderar att boka tid" rgba 0.4 → 0.7

### 2026-05-17
- [x] Ta bort `Begbilnorr`-watermark-overlay från alla bil-bilder (CarCard + bilar/[slug] + CSS)
- [x] Update CLAUDE.md + skapa TDD.md + DEVLOG.md

### 2026-05-16
- [x] Spec + plan + bygg: fordonlista valuation API-endpoint (secure cross-project)
- [x] Begbilnorr-website: integrera fordonlista-klient + email-templates
- [x] Email: matcha begbilnorr.se-design (DM Sans/Serif, mörk bakgrund, navbar-logo)
- [x] Email: ta bort "Tre möjliga pris-nivåer" från kundmejl
- [x] Email: byt logo från .webp till .png + lägg till preheader
- [x] Email: ta bort "Baserat på N liknande bilar"-rad
- [x] Email: byt subject + body till "Vi behöver mer uppgifter från dig" vid insufficient data
- [x] Bygg `/begar-bud`-sida (modal-style, telefonfält + hidden namn/email)
- [x] Brand-wrappa alla /api/contact-mejl med logo + dark theme
- [x] Algoritm: cap miltal-justering vid ±35% / ±15% av basePrice
- [x] Algoritm: relaxed model match i fordonlista (Corolla Estate → fallback "Corolla")
- [x] i18n: Estate → Kombi, Saloon → Sedan, Hatchback → Halvkombi etc
- [x] Manual review-mejl när fordonlista returnerar insufficient (inte fallback till statisk)
- [x] DMARC + BIMI: DNS-records + SVG-logo
- [x] Update sitemap.xml.ts med 5 nya verktyg-sidor
- [x] Submit sitemap + 5 URLs till Google Search Console (URL Inspection)
- [x] Loading state med 3-stegs progress på /vardera-bil
- [x] Restructure nav: "Värdera din bil" → "Verktyg" hub

### 2026-05-15
- [x] /vardera-bil: progressive disclosure (skick visas efter regnr+miltal)
- [x] /vardera-bil: 2-stegs form (bil-info → kontakt)
- [x] /vardera-bil: skick som card-grid med Lucide-ikoner istället för dropdown
- [x] /vardera-bil: friendlier disclaimer, ta bort IP-restriktions-mention

### 2026-05-14
- [x] Brainstorm + spec: email-gated valuation flow
- [x] Plan + bygg: /api/vardera + biluppgifter wrapper + rate limit + email templates
- [x] Bygg 4 verktyg-sidor: /vardera-bil, /billan-kalkylator, /bilskatt-kollare, /besiktning-datum
- [x] Skapa /verktyg hub-sida
- [x] Keyword research för bloggcontent + tools (Google Keyword Planner)

---

## 📋 Pending (prioriterat)

### Kort sikt
- [ ] Få Vercel-deploy att picka upp redeploys snabbare (env-vars behöver `vercel --prod` ibland)
- [ ] Testa /vardera-bil med en riktig kunds regnr (verkligt scenario)
- [ ] Lägg till bloggsektion + första 2 artiklar baserat på KEYWORD-RESEARCH.md
- [ ] Optimera /vardera-bil för Google Ads-landningssida (separata UTM-parametrar i mejl-länkar)

### Medium sikt
- [ ] Bygg admin-sida för att hantera värderingar (se inkomna leads + status)
- [ ] Sätt upp DMARC-rapport-läsare (idag går rapporterna till info@ men ingen läser dem strukturerat)
- [ ] Förbättra modell-namn-matchning i fordonlista (just nu ILIKE — kunde vara fuzzier för t.ex. "V70 II" → "V70")
- [ ] Cache fordonlista-svar i begbilnorr-side också (idag bara på fordonlista-side, dubbelcache OK)

### Lång sikt / nice-to-have
- [ ] VMC eller CMC-cert för Gmail-avatar (kostar ~3-15k kr/år)
- [ ] BIMI-logo: byt ut placeholder-monogram mot riktig vector-version av Begbilnorr-logo
- [ ] Auto-detektera Begbilnorr-poster-bilder och filtrera bort dem från car carousels
- [ ] Lägg till AI-vision-baserad skick-uppskattning (kund laddar upp foton → AI gissar skick)
- [ ] Bygg `/blocket-redirect/{regnr}` så kunder kan kolla pris direkt från Blocket-länk

---

## ⚠️ Kända problem / blockers

- [~] Gmail visar inte avatar-logo (kräver VMC/CMC-cert — väntar på beslut om kostnad värt det)
- [~] /vardera-bil rate limit (5/IP/24h) testkänt — kan behöva justeras när vi har riktiga användare
- [~] biluppgifter.se kostar per uppslag — vid spike kan månadskostnad bli hög (övervaka via deras dashboard)
- [~] BIMI SVG är placeholder-monogram, inte riktig Begbilnorr-logo (behöver vector-version från designer)

---

## 🔬 Idéer / framtida

- Generera nya hero-bilder för /vardera-bil utan "Sälj din bil"-text på finansiering.webp + salj-din-bil.webp via AI
- Bygg /blogg med Astro Content Collections för SEO-content
- Lägg till "Värdera din bil"-CTA på footern i alla sidor
- Sätt upp Cloudflare WAF eller Vercel Firewall för extra rate-limit-skydd
- Skicka SMS-bekräftelse via Telavox (samma som admin-app) när bud-request lämnas
- A/B-testa olika subject lines på värderingsmejl för att se vilken får högst open rate
