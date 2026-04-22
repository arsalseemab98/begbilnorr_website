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

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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
    return json({ error: 'Ogiltig JSON.' }, 400);
  }

  // `html` is trusted admin input (endpoint is behind verifyAdmin). Do not escape or sanitize.
  const { subject, html, testEmail } = body;
  if (!subject || !html) {
    return json({ error: 'Ämne och innehåll krävs.' }, 400);
  }

  // Test mode — single dummy token so the unsubscribe link renders
  if (testEmail) {
    const previewHtml = html + unsubscribeFooter(signUnsubscribeToken('test-preview'));
    try {
      await sendEmail({ to: [testEmail], subject: `[TEST] ${subject}`, html: previewHtml });
      return json({ success: true, sent: 1, test: true }, 200);
    } catch (e) {
      console.error('Test send failed:', e);
      return json({ error: 'Test-utskick misslyckades.' }, 500);
    }
  }

  if (!Array.isArray(body.emails) || body.emails.length === 0) {
    return json({ error: 'Inga mottagare valda.' }, 400);
  }
  // Cap protects against Supabase .in() URL-length silent failure (documented in MEMORY.md).
  if (body.emails.length > 100) {
    return json({ error: 'För många mottagare i ett utskick (max 100).' }, 400);
  }

  // Look up lead rows for the chosen emails, skipping unsubscribed ones
  const { data: leads, error: lookupErr } = await supabase
    .from('leads')
    .select('id, email, unsubscribed_at')
    .in('email', body.emails);

  if (lookupErr) {
    console.error('Lead lookup failed:', lookupErr);
    return json({ error: 'Kunde inte hämta leads.' }, 500);
  }

  const eligible = (leads || []).filter(l => l.email && !l.unsubscribed_at);
  const skipped = (leads || []).length - eligible.length;

  if (eligible.length === 0) {
    return json({ error: 'Alla valda mottagare är avregistrerade.', skipped_unsubscribed: skipped }, 400);
  }

  let sent = 0;
  let failed = 0;

  // Send one-at-a-time so each recipient gets a unique unsubscribe token.
  // last_emailed_at is also written per-lead to avoid the Supabase .in() URL limit.
  for (const lead of eligible) {
    try {
      const footer = unsubscribeFooter(signUnsubscribeToken(lead.id));
      await sendEmail({ to: [lead.email], subject, html: html + footer });
      sent++;
      const { error: updErr } = await supabase
        .from('leads')
        .update({ last_emailed_at: new Date().toISOString() })
        .eq('id', lead.id);
      if (updErr) console.error(`last_emailed_at update failed for ${lead.email}:`, updErr);
    } catch (e) {
      console.error(`Send failed for ${lead.email}:`, e);
      failed++;
    }
  }

  return json(
    { success: true, sent, failed, total: eligible.length, skipped_unsubscribed: skipped },
    200
  );
};
