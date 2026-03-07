import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

const ALLOWED = ['jpg', 'jpeg', 'png', 'webp', 'avif'];
const MAX_SIZE = 10 * 1024 * 1024;

async function uploadSingleFile(file: File): Promise<{ url: string } | { error: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  if (!ALLOWED.includes(ext)) return { error: `Ogiltig filtyp: ${file.name}` };
  if (file.size > MAX_SIZE) return { error: `För stor: ${file.name}` };

  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buffer = new Uint8Array(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from('car-images')
    .upload(fileName, buffer, { contentType: file.type, upsert: false });

  if (error) return { error: error.message };

  const { data } = supabase.storage.from('car-images').getPublicUrl(fileName);
  return { url: data.publicUrl };
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const singleFile = formData.get('file') as File | null;

    // Support both single file (file) and multiple files (files[])
    const toUpload = files.length > 0 ? files : singleFile ? [singleFile] : [];

    if (!toUpload.length) {
      return new Response(JSON.stringify({ error: 'Inga filer.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Upload all files in parallel
    const results = await Promise.all(toUpload.map(f => uploadSingleFile(f)));
    const urls = results.filter((r): r is { url: string } => 'url' in r).map(r => r.url);
    const errors = results.filter((r): r is { error: string } => 'error' in r).map(r => r.error);

    return new Response(JSON.stringify({ urls, errors: errors.length ? errors : undefined }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Upload error:', err);
    return new Response(JSON.stringify({ error: 'Uppladdningsfel.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
