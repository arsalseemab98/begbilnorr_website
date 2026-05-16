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
  valuationSource?: 'market' | 'static';
  marketSampleSize?: number;
  marketConfidence?: string;
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

    ${input.valuationSource ? `
      <p><strong>Värderings-källa:</strong> ${input.valuationSource === 'market' ? `Fordonlista (${input.marketSampleSize ?? 0} liknande bilar, confidence: ${input.marketConfidence ?? '-'})` : 'Statisk algoritm (ingen marknadsdata)'}</p>
    ` : ''}
    <hr>
    ${utmLine}
  `;

  return { subject, html };
}
