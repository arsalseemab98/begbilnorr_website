import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { sendEmail } from '../../lib/email';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { subject, html, testEmail } = body;

    if (!subject || !html) {
      return new Response(JSON.stringify({ error: 'Ämne och innehåll krävs.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Test mode: send to single email
    if (testEmail) {
      await sendEmail({ to: [testEmail], subject: `[TEST] ${subject}`, html });
      return new Response(JSON.stringify({ success: true, sent: 1, test: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get all active subscribers
    const { data: subscribers, error } = await supabase
      .from('newsletter_subscribers')
      .select('email')
      .eq('is_active', true);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!subscribers?.length) {
      return new Response(JSON.stringify({ error: 'Inga aktiva prenumeranter.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Send in batches of 10
    const emails = subscribers.map(s => s.email);
    const batchSize = 10;
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      try {
        await sendEmail({ to: batch, subject, html });
        sent += batch.length;
      } catch (e) {
        console.error(`Newsletter batch failed:`, e);
        failed += batch.length;
      }
    }

    return new Response(JSON.stringify({ success: true, sent, failed, total: emails.length }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Newsletter send error:', error);
    return new Response(JSON.stringify({ error: 'Ett oväntat fel inträffade.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
