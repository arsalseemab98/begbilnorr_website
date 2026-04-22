import { createHmac, timingSafeEqual } from 'node:crypto';

function getSecret(): string {
  const secret = import.meta.env.UNSUBSCRIBE_SECRET || process.env.UNSUBSCRIBE_SECRET;
  if (!secret) throw new Error('UNSUBSCRIBE_SECRET env var not configured');
  return secret;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export function signUnsubscribeToken(leadId: string): string {
  const iat = Math.floor(Date.now() / 1000).toString(36);
  const payload = `${leadId}.${iat}`;
  const hmac = createHmac('sha256', getSecret()).update(payload).digest();
  return `${payload}.${b64url(hmac)}`;
}

export function verifyUnsubscribeToken(token: string): { leadId: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [leadId, iat, sigB64] = parts;
  if (!leadId || !iat || !sigB64) return null;

  const expected = createHmac('sha256', getSecret()).update(`${leadId}.${iat}`).digest();
  const got = fromB64url(sigB64);
  if (got.length !== expected.length) return null;
  if (!timingSafeEqual(got, expected)) return null;

  return { leadId };
}
