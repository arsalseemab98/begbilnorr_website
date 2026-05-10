import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  const id = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || 'dev';
  return new Response(JSON.stringify({ v: id }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};
