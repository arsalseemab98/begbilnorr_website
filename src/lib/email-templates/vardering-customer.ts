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
