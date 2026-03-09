import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { verifyAdmin, UNAUTHORIZED } from '../../lib/auth';

export const GET: APIRoute = async () => {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'announcement_bar')
    .single();

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify(data?.value || {}),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};

export const POST: APIRoute = async ({ request }) => {
  if (!verifyAdmin(request)) return UNAUTHORIZED;
  try {
    const body = await request.json();
    const { text, link, visible } = body;

    const { error } = await supabase
      .from('settings')
      .upsert({
        key: 'announcement_bar',
        value: { text, link, visible },
      });

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: 'Ogiltiga data.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
