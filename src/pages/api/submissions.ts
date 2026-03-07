import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const GET: APIRoute = async ({ url }) => {
  const source = url.searchParams.get('source');
  const limit = parseInt(url.searchParams.get('limit') || '50');

  let query = supabase
    .from('contact_submissions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (source && source !== 'alla') {
    query = query.eq('source', source);
  }

  const { data, error } = await query;

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
