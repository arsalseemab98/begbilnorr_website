import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

const ALLOWED = ['jpg', 'jpeg', 'png', 'webp', 'avif'];
const MAX_SIZE = 4 * 1024 * 1024; // 4MB per file (Vercel limit)

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return new Response(JSON.stringify({ error: 'Ingen fil.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    if (!ALLOWED.includes(ext)) {
      return new Response(JSON.stringify({ error: 'Ogiltig filtyp.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (file.size > MAX_SIZE) {
      return new Response(JSON.stringify({ error: `Filen är för stor (max 4MB). Denna fil: ${(file.size / 1024 / 1024).toFixed(1)}MB` }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const buffer = new Uint8Array(await file.arrayBuffer());

    const { error } = await supabase.storage
      .from('car-images')
      .upload(fileName, buffer, { contentType: file.type, upsert: false });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data } = supabase.storage.from('car-images').getPublicUrl(fileName);

    return new Response(JSON.stringify({ url: data.publicUrl }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Upload error:', err);
    return new Response(JSON.stringify({ error: 'Uppladdningsfel.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
