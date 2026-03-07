import type { APIRoute } from 'astro';
import { sendEmail } from '../../lib/email';
import { supabase } from '../../lib/supabase';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { name, email, phone, message, carSlug, carName, source } = body;

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
            ? `Värdering: ${senderName}`
            : source === 'bevakning'
              ? `Bevakning: ${carName || senderName}`
              : `Begbilnorr.se: ${senderName}`;

      await sendEmail({
        to: ['info@begbilnorr.se'],
        replyTo: senderEmail || undefined,
        subject,
        html: `
          <h2>Nytt meddelande från begbilnorr.se</h2>
          <p><strong>Källa:</strong> ${sourceLabel}</p>
          ${carName ? `<p><strong>Bil:</strong> ${carName}</p>` : ''}
          <p><strong>Namn:</strong> ${senderName}</p>
          ${senderEmail ? `<p><strong>E-post:</strong> ${senderEmail}</p>` : ''}
          ${phone ? `<p><strong>Telefon:</strong> ${phone}</p>` : ''}
          <p><strong>Meddelande:</strong></p>
          <p>${message.replace(/\n/g, '<br>')}</p>
        `,
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
    });

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
