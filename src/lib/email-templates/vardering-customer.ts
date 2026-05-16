// src/lib/email-templates/vardering-customer.ts
//
// Dark Begbilnorr-themed valuation email. Uses inline CSS only.
// Colors and fonts mirror the site (begbilnorr.se):
//   --bg-dark-1: #000000   --bg-dark-2: #0a0a0a   --bg-dark-3: #111111
//   --bg-dark-4: #151515   --bg-dark-5: #1a1a1a
//   --red: #E62E2D         --red-dark: #C42625
//   --sans: 'DM Sans'      --serif: 'DM Serif Display' (italic for headings)

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
  marketSampleSize?: number;
  marketConfidence?: string;
  marketYears?: number[];
}

function fmt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function fuelLabel(f: string): string {
  return ({ petrol: 'Bensin', diesel: 'Diesel', hybrid: 'Hybrid', electric: 'El' } as const)[f as 'petrol'] ?? f;
}

const SANS = `'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;
const SERIF = `'DM Serif Display', Georgia, 'Times New Roman', serif`;

export function renderCustomerEmail(input: CustomerEmailInput): { subject: string; html: string } {
  const { namn, brand, model, year, miltalMil, fuel, skick, valuation } = input;
  const subject = `Värdering av din ${brand} ${model} (${year})`;

  const html = `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${subject}</title>
  <!-- DM Sans + DM Serif Display from Google Fonts. Apple Mail/iOS Mail/Thunderbird honour these;
       Gmail web + Outlook fall back to system serif/sans via the font-stack below. -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display:ital@0;1&display=swap');
    /* Reset for Outlook + dark-mode tweaks */
    body { margin:0 !important; padding:0 !important; }
    a { color: inherit; }
  </style>
</head>
<body style="margin:0;padding:0;background:#000000;font-family:${SANS};color:#FFFFFF;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#000000;">
    <tr><td align="center" style="padding:32px 16px;">

      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%;">

        <!-- Header — navbar logo -->
        <tr><td align="center" style="padding-bottom:28px;">
          <img src="https://begbilnorr.se/images/begbilnorr-logo-nav.webp" alt="Begbilnorr" width="150" height="90" style="display:block;border:0;outline:none;text-decoration:none;width:150px;height:auto;">
        </td></tr>

        <!-- Body card — matches site's --bg-dark-3 -->
        <tr><td style="background:#111111;padding:48px 40px 40px;border-radius:12px;border:1px solid rgba(255,255,255,0.06);">

          <!-- Section label (matches .hero-label / .section-label on site) -->
          <p style="margin:0 0 14px;font-family:${SANS};font-size:11px;letter-spacing:2.5px;color:#E62E2D;text-transform:uppercase;font-weight:700;">Värdering</p>

          <!-- Greeting — serif italic, matches site h2 style -->
          <h1 style="margin:0 0 20px;font-family:${SERIF};font-style:italic;font-weight:400;font-size:32px;color:#FFFFFF;line-height:1.15;letter-spacing:-0.3px;">
            Hej ${escapeHtml(namn)},
          </h1>

          <p style="margin:0 0 28px;font-family:${SANS};font-size:15px;color:rgba(255,255,255,0.7);line-height:1.7;">
            Här är värderingen av din <strong style="color:#FFFFFF;font-weight:600;">${escapeHtml(brand)} ${escapeHtml(model)} (${year})</strong>:
          </p>

          <!-- Red accent line (matches site's .hero-line) -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:28px;">
            <tr><td style="height:3px;width:60px;background:#E62E2D;line-height:3px;font-size:0;">&nbsp;</td></tr>
          </table>

          <!-- Main estimate card — matches site's .tool-card / --bg-dark-4 -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#151515;border-radius:12px;border:1px solid rgba(255,255,255,0.06);margin-bottom:24px;">
            <tr><td align="center" style="padding:32px 24px;">
              <p style="margin:0 0 8px;font-family:${SANS};font-size:11px;letter-spacing:1.5px;color:rgba(255,255,255,0.5);text-transform:uppercase;font-weight:600;">Uppskattat marknadsvärde</p>
              <p style="margin:0 0 10px;font-family:${SERIF};font-style:italic;font-weight:400;font-size:48px;color:#FFFFFF;letter-spacing:-1.5px;line-height:1.1;">${fmt(valuation.estimate)} kr</p>
              <p style="margin:0;font-family:${SANS};font-size:13px;color:rgba(255,255,255,0.5);">Intervall: ${fmt(valuation.rangeLow)} – ${fmt(valuation.rangeHigh)} kr</p>
            </td></tr>
          </table>

          <!-- Details -->
          <p style="margin:24px 0 10px;font-family:${SANS};font-size:11px;letter-spacing:2px;color:rgba(255,255,255,0.55);text-transform:uppercase;font-weight:700;">Detaljer</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#151515;border-radius:12px;border:1px solid rgba(255,255,255,0.06);margin-bottom:24px;">
            ${detailRow('Märke', escapeHtml(brand))}
            ${detailRow('Modell', escapeHtml(model))}
            ${detailRow('Årsmodell', String(year))}
            ${detailRow('Miltal', `${fmt(miltalMil)} mil`)}
            ${detailRow('Drivmedel', fuelLabel(fuel))}
            ${detailRow('Skick', skickLabel(skick), true)}
          </table>

          <!-- Three price levels -->
          <p style="margin:24px 0 10px;font-family:${SANS};font-size:11px;letter-spacing:2px;color:rgba(255,255,255,0.55);text-transform:uppercase;font-weight:700;">Tre möjliga pris-nivåer</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#151515;border-radius:12px;border:1px solid rgba(255,255,255,0.06);margin-bottom:32px;">
            ${detailRow('Inbytespris (cirka)', `${fmt(valuation.tradeIn)} kr`)}
            ${detailRow('Försäljning privat', `${fmt(valuation.privateSale)} kr`)}
            ${detailRow('Begbilnorr-bud', `<strong style="color:#FFFFFF;font-weight:700;">${fmt(valuation.bgnBud)} kr</strong>`, true)}
          </table>

          <!-- CTA — matches site's .btn-primary -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:8px;">
            <tr><td align="center">
              <a href="https://begbilnorr.se/salj-bil?utm_source=email&utm_medium=vardering&utm_campaign=vardering-customer"
                 style="display:inline-block;background:#E62E2D;color:#FFFFFF;text-decoration:none;font-family:${SANS};font-weight:600;font-size:15px;padding:16px 32px;border-radius:8px;letter-spacing:0.3px;">
                Få ett konkret bud inom 24h →
              </a>
            </td></tr>
          </table>

          ${input.marketSampleSize && input.marketYears && input.marketYears.length > 0 ? `
          <p style="margin:32px 0 0;font-family:${SANS};font-size:13px;color:rgba(255,255,255,0.55);line-height:1.7;text-align:center;">
            Baserat på <strong style="color:rgba(255,255,255,0.8);font-weight:600;">${input.marketSampleSize} liknande bilar</strong>
            (${input.marketYears[0]}–${input.marketYears[input.marketYears.length - 1]})
            i Norrland-marknaden.
            ${input.marketConfidence === 'low' ? '<br><span style="color:#f59e0b;">⚠️ Få liknande bilar i datan — räkna med ±20% osäkerhet.</span>' : ''}
          </p>
          ` : ''}

          <!-- Divider -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:32px 0 20px;">
            <tr><td style="height:1px;background:rgba(255,255,255,0.08);line-height:1px;font-size:0;">&nbsp;</td></tr>
          </table>

          <!-- Disclaimer -->
          <p style="margin:0;font-family:${SANS};font-size:12px;color:rgba(255,255,255,0.4);line-height:1.7;text-align:center;">
            Värderingen är ett estimat baserat på årsmodell, miltal, märke, drivmedel och skick.
            Faktiskt pris avgörs efter besiktning av bilen hos oss i Luleå.
          </p>
        </td></tr>

        <!-- Footer outside card -->
        <tr><td align="center" style="padding:32px 16px 16px;font-family:${SANS};font-size:12px;color:rgba(255,255,255,0.4);line-height:1.8;">
          <strong style="color:rgba(255,255,255,0.65);font-weight:600;">Begbilnorr</strong> — Fabriksvägen 18, 972 54 Luleå<br>
          <a href="mailto:info@begbilnorr.se" style="color:rgba(255,255,255,0.5);text-decoration:none;">info@begbilnorr.se</a>
          &nbsp;·&nbsp;
          <a href="tel:0920-99986" style="color:rgba(255,255,255,0.5);text-decoration:none;">0920-999 86</a>
          &nbsp;·&nbsp;
          <a href="https://begbilnorr.se" style="color:rgba(255,255,255,0.5);text-decoration:none;">begbilnorr.se</a>
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
    <tr><td style="padding:16px 22px;${border}">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td style="font-family:${SANS};font-size:14px;color:rgba(255,255,255,0.55);">${label}</td>
          <td align="right" style="font-family:${SANS};font-size:14px;color:#FFFFFF;font-weight:500;">${value}</td>
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
