import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const GET: APIRoute = async () => {
  const { data, error } = await supabase
    .from('cars')
    .select('id, full_name, reg_no, slug, brand, model, variant, year, mileage, fuel_type, gearbox, body_type, price, monthly_payment, description, specifications, equipment, images, is_active, is_sold, created_at')
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
    const { action } = body;

    // Create new car
    if (action === 'create') {
      const { reg_no, brand, model, variant, year, mileage, fuel_type, gearbox, body_type, price, monthly_payment, description, specifications, equipment, images } = body;

      if (!reg_no || !brand || !model || !year || !price) {
        return new Response(JSON.stringify({ error: 'Reg.nr, märke, modell, år och pris krävs.' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }

      const full_name = variant ? `${brand} ${model} ${variant}` : `${brand} ${model}`;
      const slug = `${brand}-${model}${variant ? '-' + variant : ''}-${year}-${reg_no}`
        .toLowerCase()
        .replace(/[åä]/g, 'a')
        .replace(/ö/g, 'o')
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      const { data, error } = await supabase
        .from('cars')
        .insert({
          reg_no: reg_no.toUpperCase(),
          slug,
          brand,
          model,
          variant: variant || null,
          full_name,
          year: parseInt(year),
          mileage: parseInt(mileage) || 0,
          fuel_type: fuel_type || 'Bensin',
          gearbox: gearbox || 'Manuell',
          body_type: body_type || null,
          price: parseInt(price),
          monthly_payment: monthly_payment || null,
          description: description || null,
          specifications: specifications || null,
          equipment: equipment || [],
          images: images || [],
          is_active: true,
          is_sold: false,
        })
        .select('id')
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true, id: data.id }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Delete car
    if (action === 'delete') {
      const { id } = body;
      if (!id) {
        return new Response(JSON.stringify({ error: 'ID krävs.' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }

      const { error } = await supabase.from('cars').delete().eq('id', id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Update car (default behavior)
    const { id, ...updates } = body;
    if (!id) {
      return new Response(JSON.stringify({ error: 'ID krävs.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Recalculate full_name and slug if brand/model/variant changed
    if (updates.brand || updates.model || updates.variant !== undefined) {
      const { data: existing } = await supabase.from('cars').select('brand, model, variant, year, reg_no').eq('id', id).single();
      if (existing) {
        const b = updates.brand || existing.brand;
        const m = updates.model || existing.model;
        const v = updates.variant !== undefined ? updates.variant : existing.variant;
        updates.full_name = v ? `${b} ${m} ${v}` : `${b} ${m}`;
      }
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
