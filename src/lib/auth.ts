/**
 * Verify admin authentication from request Authorization header.
 * Expects: Authorization: Basic base64(username:password)
 * Validates against ADMIN_USER / ADMIN_PASS env vars.
 */
export function verifyAdmin(request: Request): boolean {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Basic ')) return false;

  const validUser = import.meta.env.ADMIN_USER || process.env.ADMIN_USER;
  const validPass = import.meta.env.ADMIN_PASS || process.env.ADMIN_PASS;
  if (!validUser || !validPass) return false;

  try {
    const decoded = atob(header.slice(6));
    const [user, ...passParts] = decoded.split(':');
    const pass = passParts.join(':'); // password may contain colons
    return user === validUser && pass === validPass;
  } catch (_e) {
    return false;
  }
}

export const UNAUTHORIZED = new Response(
  JSON.stringify({ error: 'Ej behörig. Logga in igen.' }),
  { status: 401, headers: { 'Content-Type': 'application/json' } }
);
