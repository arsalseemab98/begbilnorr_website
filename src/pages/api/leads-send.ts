import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { sendEmail } from '../../lib/email';
import { verifyAdmin, UNAUTHORIZED } from '../../lib/auth';
import { signUnsubscribeToken } from '../../lib/unsubscribe-token';

interface SendBody {
  emails?: string[];
  subject?: string;
  html?: string;
  testEmail?: string;
}

function unsubscribeFooter(token: string): string {
  const link = `https://begbilnorr.se/api/unsubscribe?token=${encodeURIComponent(token)}`;
  return `<hr style="border:none;border-top:1px solid #ddd;margin:32px 0 16px;" />
<p style="font-size:12px;color:#666;font-family:system-ui,-apple-system,sans-serif;">
  Du får detta mejl för att du kontaktat oss via begbilnorr.se.
  <a href="${link}" style="color:#666;">Avregistrera dig här</a>.
</p>`;
}

export const POST: APIRoute = async ({ request }) => {
  if (!verifyAdmin(request)) return UNAUTHORIZED;

  let body: SendBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Ogiltig JSON.' }), { status: 400 });
  }

  const { subject, html, testEmail } = body;
  if (!subject || !html) {
    return new Response(JSON.stringify({ error: 'Ämne och innehåll krävs.' }), { status: 400 });
  }

  // Test mode — single dummy token so the unsubscribe link renders
  if (testEmail) {
    const previewHtml = html + unsubscribeFooter(signUnsubscribeToken('test-preview'));
    try {
      await sendEmail({ to: [testEmail], subject: `[TEST] ${subject}`, html: previewHtml });
      return new Response(JSON.stringify({ success: true, sent: 1, test: true }), { status: 200 });
    } catch (e) {
      console.error('Test send failed:', e);
      return new Response(JSON.stringify({ error: 'Test-utskick misslyckades.' }), { status: 500 });
    }
  }

  if (!Array.isArray(body.emails) || body.emails.length === 0) {
    return new Response(JSON.stringify({ error: 'Inga mottagare valda.' }), { status: 400 });
  }

  // Look up lead rows for the chosen emails, skipping unsubscribed ones
  const { data: leads, error: lookupErr } = await supabase
    .from('leads')
    .select('id, email, unsubscribed_at')
    .in('email', body.emails);

  if (lookupErr) {
    console.error('Lead lookup failed:', lookupErr);
    return new Response(JSON.stringify({ error: 'Kunde inte hämta leads.' }), { status: 500 });
  }

  const eligible = (leads || []).filter(l => l.email && !l.unsubscribed_at);
  const skipped = (leads || []).length - eligible.length;

  if (eligible.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Alla valda mottagare är avregistrerade.', skipped_unsubscribed: skipped }),
      { status: 400 }
    );
  }

  let sent = 0;
  let failed = 0;
  const sentEmails: string[] = [];

  // Send one-at-a-time so each recipient gets a unique unsubscribe token
  for (const lead of eligible) {
    try {
      const footer = unsubscribeFooter(signUnsubscribeToken(lead.id));
      await sendEmail({ to: [lead.email], subject, html: html + footer });
      sent++;
      sentEmails.push(lead.email);
    } catch (e) {
      console.error(`Send failed for ${lead.email}:`, e);
      failed++;
    }
  }

  if (sentEmails.length) {
    const { error: updErr } = await supabase
      .from('leads')
      .update({ last_emailed_at: new Date().toISOString() })
      .in('email', sentEmails);
    if (updErr) console.error('last_emailed_at update failed:', updErr);
  }

  return new Response(
    JSON.stringify({
      success: true,
      sent,
      failed,
      total: eligible.length,
      skipped_unsubscribed: skipped,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
