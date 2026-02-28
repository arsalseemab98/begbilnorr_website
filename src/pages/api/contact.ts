import type { APIRoute } from 'astro';
import { resend } from '../../lib/resend';
import { supabase } from '../../lib/supabase';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { name, email, phone, message, carSlug, carName } = body;

    if (!name || !email || !message) {
      return new Response(
        JSON.stringify({ error: 'Namn, e-post och meddelande krävs.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Ogiltig e-postadress.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let sentSuccessfully = false;

    try {
      await resend.emails.send({
        from: 'Begbilnorr <noreply@begbilnorr.se>',
        to: ['info@begbilnorr.se'],
        replyTo: email,
        subject: carName
          ? `Intresseanmälan: ${carName}`
          : `Kontaktformulär: ${name}`,
        html: `
          <h2>Nytt meddelande från begbilnorr.se</h2>
          ${carName ? `<p><strong>Bil:</strong> ${carName}</p>` : ''}
          <p><strong>Namn:</strong> ${name}</p>
          <p><strong>E-post:</strong> ${email}</p>
          ${phone ? `<p><strong>Telefon:</strong> ${phone}</p>` : ''}
          <p><strong>Meddelande:</strong></p>
          <p>${message.replace(/\n/g, '<br>')}</p>
        `,
      });
      sentSuccessfully = true;
    } catch (emailError) {
      console.error('Email send error:', emailError);
    }

    await supabase.from('contact_submissions').insert({
      name,
      email,
      phone: phone || null,
      message,
      car_slug: carSlug || null,
      car_name: carName || null,
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
