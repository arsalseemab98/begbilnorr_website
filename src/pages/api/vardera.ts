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
