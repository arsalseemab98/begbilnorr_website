import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { verifyUnsubscribeToken } from '../../lib/unsubscribe-token';

function page(title: string, body: string, status: number): Response {
  const html = `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title} — Begbilnorr</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; background: #0b0b0b; color: #fff; margin: 0; display: flex; min-height: 100vh; align-items: center; justify-content: center; padding: 24px; }
  .card { max-width: 480px; background: #151515; border: 1px solid #262626; border-radius: 12px; padding: 32px; text-align: center; }
  h1 { margin: 0 0 12px; font-size: 22px; }
  p { margin: 0; color: #a3a3a3; line-height: 1.5; }
  a { color: #E62E2D; text-decoration: none; }
</style>
</head>
<body>
<div class="card">
<h1>${title}</h1>
<p>${body}</p>
<p style="margin-top:20px;"><a href="https://begbilnorr.se">Tillbaka till begbilnorr.se</a></p>
</div>
</body>
</html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export const GET: APIRoute = async ({ url }) => {
  const token = url.searchParams.get('token');
  if (!token) return page('Ogiltig länk', 'Länken saknar token.', 400);

  const verified = verifyUnsubscribeToken(token);
  if (!verified) return page('Ogiltig länk', 'Länken är ogiltig eller manipulerad.', 400);

  const { error } = await supabase
    .from('leads')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('id', verified.leadId)
    .is('unsubscribed_at', null);

  if (error) {
    console.error('Unsubscribe error:', error);
    return page('Något gick fel', 'Försök igen senare eller kontakta info@begbilnorr.se.', 500);
  }

  return page(
    'Du är avregistrerad',
    'Vi skickar inga fler mejl till dig. Om detta var ett misstag, kontakta info@begbilnorr.se.',
    200
  );
};
