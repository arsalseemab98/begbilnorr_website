import type { APIRoute } from 'astro';
import { sendEmail } from '../../lib/email';
import { supabase } from '../../lib/supabase';
import { wrapBranded } from '../../lib/email-templates/branded-wrapper';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { name, email, phone, message, carSlug, carName, source, utm_data } = body;

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'Meddelande krävs.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const senderName = name || 'Okänd';
    const senderEmail = email && email !== 'ej angiven' ? email : null;

    if (senderEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(senderEmail)) {
        return new Response(
          JSON.stringify({ error: 'Ogiltig e-postadress.' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    let sentSuccessfully = false;

    try {
      const sourceLabel = source || 'okänd';
      const subject = carName
        ? `Intresseanmälan: ${carName}`
        : source === 'newsletter' || source === 'newsletter-footer'
          ? `Ny prenumerant: ${senderEmail || senderName}`
          : source === 'vardering' || source === 'salj-bil-footer'
            ? `Ny värderingsförfrågan${phone ? ` — ${phone}` : ''}`
            : source === 'bevakning'
              ? `Bevakning: ${carName || senderName}`
              : `Begbilnorr.se: ${senderName}`;

      // Branded internal notification — dark theme matching site
      const lblStyle = 'color:rgba(255,255,255,0.55);font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;margin:0 0 4px;';
      const valStyle = 'color:#FFFFFF;margin:0 0 18px;font-size:15px;';
      const innerHtml = `
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:2.5px;color:#E62E2D;text-transform:uppercase;font-weight:700;">${sourceLabel}</p>
        <h1 style="margin:0 0 24px;font-family:'DM Serif Display',Georgia,serif;font-style:italic;font-weight:400;font-size:26px;color:#FFFFFF;line-height:1.2;">Nytt meddelande</h1>

        ${carName ? `<p style="${lblStyle}">Bil</p><p style="${valStyle}">${carName}</p>` : ''}
        <p style="${lblStyle}">Namn</p><p style="${valStyle}">${senderName}</p>
        ${senderEmail ? `<p style="${lblStyle}">E-post</p><p style="${valStyle}"><a href="mailto:${senderEmail}" style="color:#FFFFFF;text-decoration:underline;">${senderEmail}</a></p>` : ''}
        ${phone ? `<p style="${lblStyle}">Telefon</p><p style="${valStyle}"><a href="tel:${phone}" style="color:#FFFFFF;text-decoration:underline;">${phone}</a></p>` : ''}
        <p style="${lblStyle}">Meddelande</p>
        <div style="background:#151515;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:16px 18px;color:rgba(255,255,255,0.85);font-size:14px;line-height:1.7;white-space:pre-wrap;">${message.replace(/\n/g, '<br>')}</div>
        ${utm_data ? `
          <div style="margin-top:24px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.45);font-size:12px;">
            <strong style="color:rgba(255,255,255,0.65);">Trafikkälla:</strong>
            ${utm_data.utm_source || '-'} / ${utm_data.utm_medium || '-'}${utm_data.utm_campaign ? ` / ${utm_data.utm_campaign}` : ''}${utm_data.landing_page ? ` (${utm_data.landing_page})` : ''}
          </div>
        ` : ''}
      `;

      await sendEmail({
        to: ['info@begbilnorr.se'],
        replyTo: senderEmail || undefined,
        subject,
        html: wrapBranded({
          title: subject,
          preheader: `${sourceLabel} — ${senderName}${phone ? ` (${phone})` : ''}`,
          innerHtml,
        }),
      });
      sentSuccessfully = true;
    } catch (emailError) {
      console.error('Email send error:', emailError);
    }

    // Auto-add newsletter subscribers
    if ((source === 'newsletter' || source === 'newsletter-footer') && senderEmail) {
      await supabase.from('newsletter_subscribers').upsert(
        { email: senderEmail, source: source === 'newsletter' ? 'hemsida' : 'footer', is_active: true },
        { onConflict: 'email' }
      );
    }

    await supabase.from('contact_submissions').insert({
      name: senderName,
      email: senderEmail || email || null,
      phone: phone || null,
      message,
      car_slug: carSlug || null,
      car_name: carName || null,
      source: source || null,
      sent_successfully: sentSuccessfully,
      utm_data: utm_data || {},
    });

    // Save lead (upsert by email or insert by phone)
    const formLabels: Record<string, string> = {
      'kontakt': 'Kontaktformulär',
      'kontakt-footer': 'Kontaktmodal (footer)',
      'vardering': 'Värderingsformulär',
      'salj-bil-footer': 'Sälj bil (footer)',
      'bevakning': 'Prisbevakning',
      'newsletter': 'Nyhetsbrev',
      'newsletter-footer': 'Nyhetsbrev (footer)',
    };
    const formLabel = formLabels[source || ''] || source || 'Okänd';
    const leadEmail = senderEmail || null;
    const leadPhone = phone || null;

    if (leadEmail || leadPhone) {
      try {
        if (leadEmail) {
          const { data: existing } = await supabase
            .from('leads')
            .select('id, sources, form_labels, submission_count')
            .eq('email', leadEmail)
            .maybeSingle();

          if (existing) {
            const sources = existing.sources || [];
            const labels = existing.form_labels || [];
            if (!sources.includes(source || '')) sources.push(source || '');
            if (!labels.includes(formLabel)) labels.push(formLabel);
            await supabase.from('leads').update({
              name: senderName !== 'Okänd' ? senderName : undefined,
              phone: leadPhone || undefined,
              sources,
              form_labels: labels,
              submission_count: (existing.submission_count || 1) + 1,
              updated_at: new Date().toISOString(),
            }).eq('id', existing.id);
          } else {
            await supabase.from('leads').insert({
              email: leadEmail,
              phone: leadPhone,
              name: senderName !== 'Okänd' ? senderName : null,
              sources: [source || ''],
              form_labels: [formLabel],
            });
          }
        } else if (leadPhone) {
          await supabase.from('leads').insert({
            phone: leadPhone,
            name: senderName !== 'Okänd' ? senderName : null,
            sources: [source || ''],
            form_labels: [formLabel],
          });
        }
      } catch (leadError) {
        console.error('Lead save error:', leadError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, emailSent: sentSuccessfully }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Contact API error:', error);
    return new Response(
      JSON.stringify({ error: 'Ett oväntat fel inträffade.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
