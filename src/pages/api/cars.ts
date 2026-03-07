import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const GET: APIRoute = async () => {
  const { data, error } = await supabase
    .from('cars')
    .select('id, full_name, reg_no, slug, brand, model, year, mileage, fuel_type, gearbox, price, monthly_payment, images, is_active, is_sold, created_at')
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
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: 'ID krävs.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const { error } = await supabase
      .from('cars')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Ogiltiga data.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
};
