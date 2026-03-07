import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return new Response(JSON.stringify({ error: 'Ingen fil.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const allowed = ['jpg', 'jpeg', 'png', 'webp', 'avif'];
    if (!allowed.includes(ext)) {
      return new Response(JSON.stringify({ error: 'Ogiltig filtyp.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (file.size > 10 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'Filen är för stor (max 10MB).' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error } = await supabase.storage
      .from('car-images')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: urlData } = supabase.storage
      .from('car-images')
      .getPublicUrl(fileName);

    return new Response(JSON.stringify({ url: urlData.publicUrl }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Upload error:', err);
    return new Response(JSON.stringify({ error: 'Uppladdningsfel.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
