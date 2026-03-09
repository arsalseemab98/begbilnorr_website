import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { verifyAdmin, UNAUTHORIZED } from '../../lib/auth';

export const GET: APIRoute = async ({ request }) => {
  if (!verifyAdmin(request)) return UNAUTHORIZED;
  const { data, error } = await supabase
    .from('newsletter_subscribers')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(data), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  if (!verifyAdmin(request)) return UNAUTHORIZED;
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'add') {
      const { email, name } = body;
      if (!email) {
        return new Response(JSON.stringify({ error: 'E-post krävs.' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }

      const { error } = await supabase
        .from('newsletter_subscribers')
        .upsert({ email, name: name || null, source: 'manual', is_active: true }, { onConflict: 'email' });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (action === 'toggle') {
      const { id, is_active } = body;
      const { error } = await supabase
        .from('newsletter_subscribers')
        .update({ is_active })
        .eq('id', id);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete') {
      const { id } = body;
      const { error } = await supabase
        .from('newsletter_subscribers')
        .delete()
        .eq('id', id);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Ogiltig action.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Ogiltiga data.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
};
