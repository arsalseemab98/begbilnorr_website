import type { APIRoute } from 'astro';
import { supabaseAdmin as supabase } from '../../lib/supabase-admin';
import { verifyAdmin, UNAUTHORIZED } from '../../lib/auth';

export const GET: APIRoute = async ({ request, url }) => {
  if (!verifyAdmin(request)) return UNAUTHORIZED;
  const source = url.searchParams.get('source');

  let query = supabase
    .from('leads')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(200);

  if (source && source !== 'all') {
    query = query.contains('sources', [source]);
  }

  const { data, error } = await query;

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Also fetch latest utm_data for each lead from contact_submissions
  const emails = (data || []).filter(l => l.email).map(l => l.email);
  let utmMap: Record<string, any> = {};

  if (emails.length > 0) {
    const { data: submissions } = await supabase
      .from('contact_submissions')
      .select('email, utm_data, created_at')
      .in('email', emails)
      .not('utm_data', 'is', null)
      .order('created_at', { ascending: false });

    if (submissions) {
      for (const s of submissions) {
        if (s.email && !utmMap[s.email] && s.utm_data && Object.keys(s.utm_data).length > 0) {
          utmMap[s.email] = s.utm_data;
        }
      }
    }
  }

  const enriched = (data || []).map(lead => ({
    ...lead,
    utm_data: lead.email ? utmMap[lead.email] || null : null,
  }));

  return new Response(JSON.stringify(enriched), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
