import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { verifyAdmin, UNAUTHORIZED } from '../../lib/auth';

// GET: fetch all redirects (admin) or check a specific slug (public)
export const GET: APIRoute = async ({ url }) => {
  const slug = url.searchParams.get('slug');

  if (slug) {
    // Public: look up a single active redirect
    const { data, error } = await supabase
      .from('redirects')
      .select('id, slug, target_url')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Increment click count
    await supabase.rpc('increment_click_count', { redirect_id: data.id }).catch(() => {
      // Fallback: direct update
      supabase.from('redirects').update({ click_count: undefined }).eq('id', data.id);
    });

    return new Response(JSON.stringify(data), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Admin: fetch all redirects
  const { data, error } = await supabase
    .from('redirects')
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

// POST: create, update, delete redirects (admin only)
export const POST: APIRoute = async ({ request }) => {
  if (!verifyAdmin(request)) return UNAUTHORIZED;

  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'create') {
      const { slug, target_url } = body;
      if (!slug || !target_url) {
        return new Response(JSON.stringify({ error: 'Slug och mål-URL krävs.' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }

      const cleanSlug = slug.replace(/^\/+/, '').trim();
      const { data, error } = await supabase
        .from('redirects')
        .insert({ slug: cleanSlug, target_url: target_url.trim() })
        .select()
        .single();

      if (error) {
        const msg = error.message.includes('unique') ? 'Denna slug finns redan.' : error.message;
        return new Response(JSON.stringify({ error: msg }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify(data), {
        status: 201, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (action === 'update') {
      const { id, slug, target_url, is_active } = body;
      if (!id) {
        return new Response(JSON.stringify({ error: 'ID krävs.' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }

      const updates: Record<string, any> = {};
      if (slug !== undefined) updates.slug = slug.replace(/^\/+/, '').trim();
      if (target_url !== undefined) updates.target_url = target_url.trim();
      if (is_active !== undefined) updates.is_active = is_active;

      const { data, error } = await supabase
        .from('redirects')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify(data), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete') {
      const { id } = body;
      if (!id) {
        return new Response(JSON.stringify({ error: 'ID krävs.' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }

      const { error } = await supabase.from('redirects').delete().eq('id', id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (action === 'increment') {
      const { id } = body;
      if (!id) {
        return new Response(JSON.stringify({ error: 'ID krävs.' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }

      // Use raw SQL-like increment
      const { data: current } = await supabase.from('redirects').select('click_count').eq('id', id).single();
      const newCount = (current?.click_count || 0) + 1;
      await supabase.from('redirects').update({ click_count: newCount }).eq('id', id);

      return new Response(JSON.stringify({ success: true, click_count: newCount }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Ogiltig åtgärd.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Ogiltiga data.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
};
