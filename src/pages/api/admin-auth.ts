import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { username, password } = await request.json();

    const validUser = import.meta.env.ADMIN_USER || process.env.ADMIN_USER;
    const validPass = import.meta.env.ADMIN_PASS || process.env.ADMIN_PASS;

    if (!validUser || !validPass) {
      return new Response(JSON.stringify({ error: 'Admin credentials not configured.' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (username === validUser && password === validPass) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Fel användarnamn eller lösenord.' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Ogiltiga data.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
};
