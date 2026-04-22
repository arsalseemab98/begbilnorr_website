# Lead Bulk Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admin select multiple leads (with a "select all" shortcut) and send them a composed email, with GDPR-compliant unsubscribe tracking.

**Architecture:** Reuses the existing `sendEmail()` helper (Microsoft Graph API via `info@begbilnorr.se`). Adds two nullable columns to `leads` (`unsubscribed_at`, `last_emailed_at`). Three new endpoints — `POST /api/leads-send`, `GET /api/unsubscribe`, and a signed-token helper — plus UI additions to the existing Leads tab in `admin.astro`.

**Tech Stack:** Astro 5 SSR, Supabase (PostgreSQL), Microsoft Graph API for email, Node `crypto` (HMAC-SHA256), plain TypeScript.

**No test harness exists in this repo.** Verification is done via `npm run build` (type/compile checks), `curl` against a local `npm run dev` server, and manual browser testing in the admin. This is called out per-task.

---

## File Structure

**New:**
- `src/lib/unsubscribe-token.ts` — HMAC sign/verify for public unsubscribe links
- `src/pages/api/leads-send.ts` — admin-only bulk send endpoint
- `src/pages/api/unsubscribe.ts` — public unsubscribe endpoint (returns HTML page)

**Modified:**
- `src/pages/api/leads.ts` — include `unsubscribed_at`, `last_emailed_at`, `id` in response
- `src/pages/admin.astro` — leads tab: checkbox column, select-all, send button, send modal, modal JS

**Schema (migration via `mcp__supabase__apply_migration`):**
- `leads`: add `unsubscribed_at timestamptz`, `last_emailed_at timestamptz`

**Env:**
- `UNSUBSCRIBE_SECRET` — 32-byte random hex added to all three Vercel envs

---

## Task 1: Add database columns

**Files:**
- Supabase migration (applied via MCP)

- [ ] **Step 1: Apply migration**

Run via `mcp__supabase__apply_migration` on project `lgtmzyspwbdjukoozwec`, name `add_lead_email_tracking`:

```sql
ALTER TABLE leads
  ADD COLUMN unsubscribed_at timestamptz,
  ADD COLUMN last_emailed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_unsubscribed_at ON leads(unsubscribed_at) WHERE unsubscribed_at IS NOT NULL;
```

- [ ] **Step 2: Verify columns exist**

Run via `mcp__supabase__execute_sql`:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'leads' AND column_name IN ('unsubscribed_at', 'last_emailed_at');
```

Expected: 2 rows, both `timestamp with time zone`.

- [ ] **Step 3: Commit (no file changes — migration is in Supabase)**

Skip — no local files changed. Move to Task 2.

---

## Task 2: Generate and configure UNSUBSCRIBE_SECRET

**Files:**
- Vercel environment variables (via CLI)
- `.env.local` (local dev)

- [ ] **Step 1: Generate a random 32-byte hex secret**

Run:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Save the output — you'll paste it three times below. Call it `$SECRET`.

- [ ] **Step 2: Add to Vercel production**

```bash
cd /Users/arsalseemab/Desktop/github/begbilnorr_website
echo "$SECRET" | vercel env add UNSUBSCRIBE_SECRET production
```

- [ ] **Step 3: Add to Vercel preview**

```bash
echo "$SECRET" | vercel env add UNSUBSCRIBE_SECRET preview
```

- [ ] **Step 4: Add to Vercel development**

```bash
echo "$SECRET" | vercel env add UNSUBSCRIBE_SECRET development
```

- [ ] **Step 5: Pull into local .env.local**

```bash
vercel env pull .env.local --yes
```

- [ ] **Step 6: Verify**

```bash
grep UNSUBSCRIBE_SECRET .env.local
```

Expected: one line `UNSUBSCRIBE_SECRET="..."`.

- [ ] **Step 7: Commit (no file changes)**

Skip — `.env.local` is gitignored.

---

## Task 3: Create unsubscribe token helper

**Files:**
- Create: `src/lib/unsubscribe-token.ts`

- [ ] **Step 1: Write the token helper**

Create `src/lib/unsubscribe-token.ts` with this exact content:

```typescript
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
```

- [ ] **Step 2: Verify it compiles**

Run:

```bash
cd /Users/arsalseemab/Desktop/github/begbilnorr_website && npx tsc --noEmit
```

Expected: no errors related to `unsubscribe-token.ts`.

- [ ] **Step 3: Smoke-test round-trip**

Run:

```bash
cd /Users/arsalseemab/Desktop/github/begbilnorr_website && node --input-type=module -e "
import('./src/lib/unsubscribe-token.ts').then(m => {
  process.env.UNSUBSCRIBE_SECRET = 'test-secret-1234';
  const t = m.signUnsubscribeToken('abc-123');
  console.log('token:', t);
  console.log('verified:', m.verifyUnsubscribeToken(t));
  console.log('tampered:', m.verifyUnsubscribeToken(t.slice(0, -2) + 'xx'));
});
" 2>&1 | tail -3
```

**Alternative if the above fails** (Astro TS loader):

Skip the runtime smoke — rely on the integration test in Task 5 (end-to-end send + unsubscribe flow catches any HMAC issue).

- [ ] **Step 4: Commit**

```bash
git add src/lib/unsubscribe-token.ts
git commit -m "feat: HMAC-signed unsubscribe token helper"
```

---

## Task 4: Create public `/api/unsubscribe` endpoint

**Files:**
- Create: `src/pages/api/unsubscribe.ts`

- [ ] **Step 1: Write the endpoint**

Create `src/pages/api/unsubscribe.ts` with this exact content:

```typescript
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { verifyUnsubscribeToken } from '../../lib/unsubscribe-token';

function page(title: string, body: string, status: number): Response {
  const html = `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title} — Begbilnorr</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; background: #0b0b0b; color: #fff; margin: 0; display: flex; min-height: 100vh; align-items: center; justify-content: center; padding: 24px; }
  .card { max-width: 480px; background: #151515; border: 1px solid #262626; border-radius: 12px; padding: 32px; text-align: center; }
  h1 { margin: 0 0 12px; font-size: 22px; }
  p { margin: 0; color: #a3a3a3; line-height: 1.5; }
  a { color: #E62E2D; text-decoration: none; }
</style>
</head>
<body>
<div class="card">
<h1>${title}</h1>
<p>${body}</p>
<p style="margin-top:20px;"><a href="https://begbilnorr.se">Tillbaka till begbilnorr.se</a></p>
</div>
</body>
</html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export const GET: APIRoute = async ({ url }) => {
  const token = url.searchParams.get('token');
  if (!token) return page('Ogiltig länk', 'Länken saknar token.', 400);

  const verified = verifyUnsubscribeToken(token);
  if (!verified) return page('Ogiltig länk', 'Länken är ogiltig eller manipulerad.', 400);

  const { error } = await supabase
    .from('leads')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('id', verified.leadId)
    .is('unsubscribed_at', null);

  if (error) {
    console.error('Unsubscribe error:', error);
    return page('Något gick fel', 'Försök igen senare eller kontakta info@begbilnorr.se.', 500);
  }

  return page(
    'Du är avregistrerad',
    'Vi skickar inga fler mejl till dig. Om detta var ett misstag, kontakta info@begbilnorr.se.',
    200
  );
};
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/arsalseemab/Desktop/github/begbilnorr_website && npm run build 2>&1 | tail -20
```

Expected: build succeeds, no errors mentioning `unsubscribe.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/unsubscribe.ts
git commit -m "feat: public unsubscribe endpoint with HTML confirmation page"
```

---

## Task 5: Create `/api/leads-send` endpoint

**Files:**
- Create: `src/pages/api/leads-send.ts`

- [ ] **Step 1: Write the endpoint**

Create `src/pages/api/leads-send.ts` with this exact content:

```typescript
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { sendEmail } from '../../lib/email';
import { verifyAdmin, UNAUTHORIZED } from '../../lib/auth';
import { signUnsubscribeToken } from '../../lib/unsubscribe-token';

interface SendBody {
  emails?: string[];
  subject?: string;
  html?: string;
  testEmail?: string;
}

function unsubscribeFooter(token: string): string {
  const link = `https://begbilnorr.se/api/unsubscribe?token=${encodeURIComponent(token)}`;
  return `<hr style="border:none;border-top:1px solid #ddd;margin:32px 0 16px;" />
<p style="font-size:12px;color:#666;font-family:system-ui,-apple-system,sans-serif;">
  Du får detta mejl för att du kontaktat oss via begbilnorr.se.
  <a href="${link}" style="color:#666;">Avregistrera dig här</a>.
</p>`;
}

export const POST: APIRoute = async ({ request }) => {
  if (!verifyAdmin(request)) return UNAUTHORIZED;

  let body: SendBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Ogiltig JSON.' }), { status: 400 });
  }

  const { subject, html, testEmail } = body;
  if (!subject || !html) {
    return new Response(JSON.stringify({ error: 'Ämne och innehåll krävs.' }), { status: 400 });
  }

  // Test mode — single dummy token so the unsubscribe link renders
  if (testEmail) {
    const previewHtml = html + unsubscribeFooter(signUnsubscribeToken('test-preview'));
    try {
      await sendEmail({ to: [testEmail], subject: `[TEST] ${subject}`, html: previewHtml });
      return new Response(JSON.stringify({ success: true, sent: 1, test: true }), { status: 200 });
    } catch (e) {
      console.error('Test send failed:', e);
      return new Response(JSON.stringify({ error: 'Test-utskick misslyckades.' }), { status: 500 });
    }
  }

  if (!Array.isArray(body.emails) || body.emails.length === 0) {
    return new Response(JSON.stringify({ error: 'Inga mottagare valda.' }), { status: 400 });
  }

  // Look up lead rows for the chosen emails, skipping unsubscribed ones
  const { data: leads, error: lookupErr } = await supabase
    .from('leads')
    .select('id, email, unsubscribed_at')
    .in('email', body.emails);

  if (lookupErr) {
    console.error('Lead lookup failed:', lookupErr);
    return new Response(JSON.stringify({ error: 'Kunde inte hämta leads.' }), { status: 500 });
  }

  const eligible = (leads || []).filter(l => l.email && !l.unsubscribed_at);
  const skipped = (leads || []).length - eligible.length;

  if (eligible.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Alla valda mottagare är avregistrerade.', skipped_unsubscribed: skipped }),
      { status: 400 }
    );
  }

  let sent = 0;
  let failed = 0;
  const sentEmails: string[] = [];

  // Send one-at-a-time so each recipient gets a unique unsubscribe token
  for (const lead of eligible) {
    try {
      const footer = unsubscribeFooter(signUnsubscribeToken(lead.id));
      await sendEmail({ to: [lead.email], subject, html: html + footer });
      sent++;
      sentEmails.push(lead.email);
    } catch (e) {
      console.error(`Send failed for ${lead.email}:`, e);
      failed++;
    }
  }

  if (sentEmails.length) {
    const { error: updErr } = await supabase
      .from('leads')
      .update({ last_emailed_at: new Date().toISOString() })
      .in('email', sentEmails);
    if (updErr) console.error('last_emailed_at update failed:', updErr);
  }

  return new Response(
    JSON.stringify({
      success: true,
      sent,
      failed,
      total: eligible.length,
      skipped_unsubscribed: skipped,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/arsalseemab/Desktop/github/begbilnorr_website && npm run build 2>&1 | tail -20
```

Expected: succeeds, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/leads-send.ts
git commit -m "feat: admin bulk-email endpoint with per-recipient unsubscribe token"
```

---

## Task 6: Update `/api/leads` to expose new columns

**Files:**
- Modify: `src/pages/api/leads.ts`

- [ ] **Step 1: Replace the select to include new fields**

Edit `src/pages/api/leads.ts` — no line is explicit because the current `.select('*')` already returns all columns. We only need to confirm that and make sure we also return `id` (already included by `*`).

Verify by running:

```bash
grep -n "select" /Users/arsalseemab/Desktop/github/begbilnorr_website/src/pages/api/leads.ts
```

Expected: `select('*')` on line 11. No code change needed — `select('*')` already picks up the new columns.

- [ ] **Step 2: Manually test via curl**

Start dev server:

```bash
cd /Users/arsalseemab/Desktop/github/begbilnorr_website && npm run dev
```

In another terminal:

```bash
AUTH=$(echo -n 'admin:Begbilnorr2026!' | base64)
curl -s http://localhost:4321/api/leads -H "Authorization: Basic $AUTH" | head -c 500
```

Expected: JSON array; each object has `id`, `unsubscribed_at`, `last_emailed_at` keys (values null for existing rows).

- [ ] **Step 3: Stop dev server, no commit needed**

No file changes. Move to Task 7.

---

## Task 7: Admin UI — add checkbox column + "Senast mejlad" column

**Files:**
- Modify: `src/pages/admin.astro`

- [ ] **Step 1: Update the leads table header**

Open `src/pages/admin.astro`, find the `<thead>` for the leads table (around line 336):

```html
<thead>
  <tr>
    <th>Namn</th>
    <th>E-post</th>
    <th>Telefon</th>
    <th>Källa</th>
    <th>Labels</th>
    <th>Antal</th>
    <th>UTM</th>
    <th>Datum</th>
  </tr>
</thead>
```

Replace with:

```html
<thead>
  <tr>
    <th style="width:36px;"><input type="checkbox" id="leadsSelectAll" title="Välj alla" /></th>
    <th>Namn</th>
    <th>E-post</th>
    <th>Telefon</th>
    <th>Källa</th>
    <th>Labels</th>
    <th>Antal</th>
    <th>Senast mejlad</th>
    <th>UTM</th>
    <th>Datum</th>
  </tr>
</thead>
```

- [ ] **Step 2: Update `renderLeads()` row template**

Find the `renderLeads` function (around line 2261). Replace the `leadsBody.innerHTML = filtered.map(l => { ... }).join('');` block with:

```typescript
    leadsBody.innerHTML = filtered.map(l => {
      const labels = (l.form_labels || []).map((lb: string) =>
        `<span class="lead-label ${getLabelClass(lb)}">${lb}</span>`
      ).join('');

      const utm = l.utm_data;
      const utmStr = utm
        ? `${utm.utm_source || ''}${utm.utm_medium ? ' / ' + utm.utm_medium : ''}${utm.utm_campaign ? ' / ' + utm.utm_campaign : ''}`
        : '-';

      const isUnsub = !!l.unsubscribed_at;
      const rowStyle = isUnsub ? 'opacity:0.45;' : '';
      const checkbox = l.email && !isUnsub
        ? `<input type="checkbox" class="lead-check" data-email="${l.email}" />`
        : '';
      const lastMailed = l.last_emailed_at
        ? formatDate(l.last_emailed_at)
        : '<span style="color:rgba(255,255,255,0.3);">—</span>';
      const unsubBadge = isUnsub
        ? ' <span class="badge badge-gray" style="font-size:10px;">Avregistrerad</span>'
        : '';

      return `<tr style="${rowStyle}">
        <td>${checkbox}</td>
        <td>${l.name || '-'}${unsubBadge}</td>
        <td>${l.email ? `<a href="mailto:${l.email}" style="color:#60a5fa;">${l.email}</a>` : '-'}</td>
        <td>${l.phone ? `<a href="tel:${l.phone}" style="color:#60a5fa;">${l.phone}</a>` : '-'}</td>
        <td>${(l.sources || []).join(', ') || '-'}</td>
        <td>${labels || '-'}</td>
        <td><span class="lead-count">${l.submission_count || 1}</span></td>
        <td style="white-space:nowrap;font-size:13px;">${lastMailed}</td>
        <td><span class="lead-utm">${utmStr}</span></td>
        <td style="white-space:nowrap;font-size:13px;color:rgba(255,255,255,0.5);">${formatDate(l.updated_at || l.created_at)}</td>
      </tr>`;
    }).join('');
```

- [ ] **Step 3: Update the empty-state colspan**

Find the `leadsBody.innerHTML = '<tr><td colspan="8"...>Laddar...` line in `loadLeads()` and in the error branch, and the similar `<tr id="leadsEmpty">` row in the HTML. Change every `colspan="8"` in the leads table to `colspan="10"`.

Run:

```bash
grep -n 'colspan="8"' /Users/arsalseemab/Desktop/github/begbilnorr_website/src/pages/admin.astro
```

For each line inside the leads-tab area, edit to `colspan="10"`.

- [ ] **Step 4: Build check**

```bash
cd /Users/arsalseemab/Desktop/github/begbilnorr_website && npm run build 2>&1 | tail -15
```

Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin.astro
git commit -m "feat(admin): checkbox + senast mejlad columns in leads table"
```

---

## Task 8: Admin UI — select-all, counter, send button

**Files:**
- Modify: `src/pages/admin.astro`

- [ ] **Step 1: Add toolbar markup above the leads table**

Find the `<div class="leads-search">` block (around line 330). Just before the `<div class="table-wrapper">` that follows, insert:

```html
        <div class="leads-bulk-toolbar" style="display:flex;align-items:center;gap:12px;margin:8px 0;flex-wrap:wrap;">
          <span id="leadsSelectedCount" style="font-size:13px;color:rgba(255,255,255,0.6);">0 valda</span>
          <button id="leadsSendBtn" class="btn btn-red" disabled style="opacity:0.5;cursor:not-allowed;">Skicka e-post till valda</button>
        </div>
```

- [ ] **Step 2: Add selection-tracking state**

Find `let allLeads: any[] = [];` (around line 2246) and add below it:

```typescript
  const selectedEmails = new Set<string>();
```

- [ ] **Step 3: Add selection update function**

Below the `renderLeads()` function (ends around line 2306), insert:

```typescript
  function updateSelectionUi() {
    const countEl = document.getElementById('leadsSelectedCount');
    const btn = document.getElementById('leadsSendBtn') as HTMLButtonElement | null;
    const selectAll = document.getElementById('leadsSelectAll') as HTMLInputElement | null;
    const count = selectedEmails.size;
    if (countEl) countEl.textContent = `${count} valda`;
    if (btn) {
      btn.disabled = count === 0;
      btn.style.opacity = count === 0 ? '0.5' : '1';
      btn.style.cursor = count === 0 ? 'not-allowed' : 'pointer';
      btn.textContent = count === 0 ? 'Skicka e-post till valda' : `Skicka e-post till ${count} valda`;
    }
    if (selectAll && leadsBody) {
      const boxes = leadsBody.querySelectorAll<HTMLInputElement>('.lead-check');
      const total = boxes.length;
      const checked = Array.from(boxes).filter(b => b.checked).length;
      selectAll.checked = total > 0 && checked === total;
      selectAll.indeterminate = checked > 0 && checked < total;
    }
  }
```

- [ ] **Step 4: Wire row checkbox events**

At the end of `renderLeads()` (just before its closing `}`), append:

```typescript
    // Restore prior selections after re-render (filter/search can re-render)
    leadsBody.querySelectorAll<HTMLInputElement>('.lead-check').forEach(cb => {
      const email = cb.dataset.email || '';
      if (selectedEmails.has(email)) cb.checked = true;
      cb.addEventListener('change', () => {
        if (cb.checked) selectedEmails.add(email);
        else selectedEmails.delete(email);
        updateSelectionUi();
      });
    });
    updateSelectionUi();
```

- [ ] **Step 5: Wire "select all" behaviour**

Find the `// Filter buttons` comment (around line 2320) and insert just above it:

```typescript
  const leadsSelectAll = document.getElementById('leadsSelectAll') as HTMLInputElement | null;
  leadsSelectAll?.addEventListener('change', () => {
    const boxes = leadsBody?.querySelectorAll<HTMLInputElement>('.lead-check') ?? [];
    boxes.forEach(cb => {
      cb.checked = leadsSelectAll.checked;
      const email = cb.dataset.email || '';
      if (cb.checked) selectedEmails.add(email);
      else selectedEmails.delete(email);
    });
    updateSelectionUi();
  });
```

- [ ] **Step 6: Build check**

```bash
cd /Users/arsalseemab/Desktop/github/begbilnorr_website && npm run build 2>&1 | tail -15
```

Expected: success.

- [ ] **Step 7: Manual browser check**

```bash
npm run dev
```

Visit `http://localhost:4321/admin`, log in, click the Leads tab:
- Tick individual rows → "N valda" updates, send button enables
- Tick "Välj alla" in header → all visible checkboxes tick
- Type in search → selections persist for rows that stay visible

Stop dev server.

- [ ] **Step 8: Commit**

```bash
git add src/pages/admin.astro
git commit -m "feat(admin): lead select-all, counter, and send button"
```

---

## Task 9: Admin UI — send modal

**Files:**
- Modify: `src/pages/admin.astro`

- [ ] **Step 1: Add modal markup**

Find the end of the leads-tab `<div class="tab-content" id="tab-leads">` section. Inside it, after the `</div>` that closes `.table-wrapper`, and before the tab's closing `</div>`, insert:

```html
        <div id="leadsSendModal" class="modal-overlay" style="display:none;">
          <div class="modal-card" style="max-width:640px;width:100%;background:#151515;border:1px solid #262626;border-radius:12px;padding:24px;">
            <h3 style="margin:0 0 4px;">Skicka e-post till valda leads</h3>
            <p id="leadsSendRecipients" style="margin:0 0 20px;color:rgba(255,255,255,0.5);font-size:13px;">0 mottagare</p>

            <label style="display:block;font-size:13px;margin-bottom:4px;">Ämne</label>
            <input id="leadsSendSubject" type="text" class="input" style="width:100%;margin-bottom:16px;" placeholder="Ex: Nya bilar i lager hos Begbilnorr" />

            <label style="display:block;font-size:13px;margin-bottom:4px;">HTML-innehåll</label>
            <textarea id="leadsSendHtml" class="input" style="width:100%;height:220px;font-family:monospace;font-size:13px;margin-bottom:8px;" placeholder="<h1>Hej!</h1><p>...</p>"></textarea>
            <p style="font-size:11px;color:rgba(255,255,255,0.4);margin:0 0 16px;">Ett avregistreringsblock läggs automatiskt till i botten av varje utskick.</p>

            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">
              <input id="leadsSendTestTo" type="email" class="input" placeholder="Test-epost" style="flex:1;min-width:180px;" />
              <button id="leadsSendTestBtn" class="btn btn-gray">Skicka test</button>
            </div>
            <p id="leadsSendMsg" style="margin:0 0 16px;font-size:13px;min-height:18px;"></p>

            <div style="display:flex;gap:8px;justify-content:flex-end;">
              <button id="leadsSendCancel" class="btn btn-gray">Avbryt</button>
              <button id="leadsSendConfirm" class="btn btn-red">Skicka nu</button>
            </div>
          </div>
        </div>
```

- [ ] **Step 2: Add modal styles (if `.modal-overlay` doesn't exist yet)**

Check:

```bash
grep -n "modal-overlay" /Users/arsalseemab/Desktop/github/begbilnorr_website/src/pages/admin.astro
```

If this selector is not defined in the `<style>` block, add to the admin stylesheet (search for a `.btn-gray` rule and append after it):

```css
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .modal-card .input { background: #0b0b0b; border: 1px solid #262626; border-radius: 8px; padding: 10px 12px; color: #fff; }
  .modal-card .input:focus { outline: none; border-color: var(--red, #E62E2D); }
```

(Skip this step if those rules already exist.)

- [ ] **Step 3: Build check**

```bash
cd /Users/arsalseemab/Desktop/github/begbilnorr_website && npm run build 2>&1 | tail -15
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin.astro
git commit -m "feat(admin): send-to-leads modal markup"
```

---

## Task 10: Admin UI — modal JS (open/close, test, send)

**Files:**
- Modify: `src/pages/admin.astro`

- [ ] **Step 1: Add modal wiring**

Find the `leadsSelectAll?.addEventListener(...)` block from Task 8 step 5. Just after its closing `});`, insert:

```typescript
  // Send modal
  const sendModal = document.getElementById('leadsSendModal') as HTMLDivElement | null;
  const sendBtn = document.getElementById('leadsSendBtn') as HTMLButtonElement | null;
  const sendRecipients = document.getElementById('leadsSendRecipients') as HTMLParagraphElement | null;
  const sendSubject = document.getElementById('leadsSendSubject') as HTMLInputElement | null;
  const sendHtml = document.getElementById('leadsSendHtml') as HTMLTextAreaElement | null;
  const sendTestTo = document.getElementById('leadsSendTestTo') as HTMLInputElement | null;
  const sendTestBtn = document.getElementById('leadsSendTestBtn') as HTMLButtonElement | null;
  const sendCancel = document.getElementById('leadsSendCancel') as HTMLButtonElement | null;
  const sendConfirm = document.getElementById('leadsSendConfirm') as HTMLButtonElement | null;
  const sendMsg = document.getElementById('leadsSendMsg') as HTMLParagraphElement | null;

  function setSendMsg(text: string, color: string) {
    if (sendMsg) { sendMsg.textContent = text; sendMsg.style.color = color; }
  }

  sendBtn?.addEventListener('click', () => {
    if (selectedEmails.size === 0 || !sendModal) return;
    if (sendRecipients) sendRecipients.textContent = `${selectedEmails.size} mottagare`;
    setSendMsg('', '#fff');
    sendModal.style.display = 'flex';
  });

  sendCancel?.addEventListener('click', () => {
    if (sendModal) sendModal.style.display = 'none';
  });

  sendTestBtn?.addEventListener('click', async () => {
    const to = sendTestTo?.value.trim();
    const subject = sendSubject?.value.trim();
    const html = sendHtml?.value.trim();
    if (!to) { setSendMsg('Ange test-epost.', '#EF4444'); return; }
    if (!subject || !html) { setSendMsg('Ämne och innehåll krävs.', '#EF4444'); return; }
    setSendMsg('Skickar test...', 'rgba(255,255,255,0.6)');
    try {
      const res = await fetch('/api/leads-send', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, html, testEmail: to }),
      });
      const data = await res.json();
      if (!res.ok) { setSendMsg(data.error || 'Test-utskick misslyckades.', '#EF4444'); return; }
      setSendMsg(`Test skickat till ${to}.`, '#10B981');
    } catch {
      setSendMsg('Nätverksfel. Försök igen.', '#EF4444');
    }
  });

  sendConfirm?.addEventListener('click', async () => {
    const subject = sendSubject?.value.trim();
    const html = sendHtml?.value.trim();
    if (!subject || !html) { setSendMsg('Ämne och innehåll krävs.', '#EF4444'); return; }
    if (selectedEmails.size === 0) { setSendMsg('Inga mottagare valda.', '#EF4444'); return; }
    if (!confirm(`Skicka till ${selectedEmails.size} leads?`)) return;

    setSendMsg(`Skickar till ${selectedEmails.size} mottagare...`, 'rgba(255,255,255,0.6)');
    sendConfirm.disabled = true;

    try {
      const res = await fetch('/api/leads-send', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: Array.from(selectedEmails), subject, html }),
      });
      const data = await res.json();
      if (!res.ok) { setSendMsg(data.error || 'Utskick misslyckades.', '#EF4444'); sendConfirm.disabled = false; return; }

      setSendMsg(
        `Skickat: ${data.sent} · Misslyckades: ${data.failed} · Avregistrerade (hoppade över): ${data.skipped_unsubscribed}`,
        '#10B981'
      );
      // Clear selection and reload leads to refresh last_emailed_at
      selectedEmails.clear();
      sendConfirm.disabled = false;
      await loadLeads();
      setTimeout(() => { if (sendModal) sendModal.style.display = 'none'; }, 2000);
    } catch {
      setSendMsg('Nätverksfel. Försök igen.', '#EF4444');
      sendConfirm.disabled = false;
    }
  });
```

- [ ] **Step 2: Build check**

```bash
cd /Users/arsalseemab/Desktop/github/begbilnorr_website && npm run build 2>&1 | tail -15
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin.astro
git commit -m "feat(admin): leads send modal wiring — open, test, send"
```

---

## Task 11: End-to-end smoke test

**Files:** (none — manual verification)

- [ ] **Step 1: Start local dev**

```bash
cd /Users/arsalseemab/Desktop/github/begbilnorr_website && npm run dev
```

- [ ] **Step 2: Log into admin**

Open `http://localhost:4321/admin` — log in with `admin` / `Begbilnorr2026!`.

- [ ] **Step 3: Leads tab — select and test-send**

- Go to Leads tab
- Tick 2 rows with valid emails
- Click "Skicka e-post till N valda"
- Fill subject = "Test från Begbilnorr", html = `<p>Hej, detta är ett test.</p>`
- Enter your own test email in "Test-epost", click "Skicka test"
- Expected: green message "Test skickat till …", email arrives in your inbox with `[TEST]` prefix and unsubscribe link in the footer

- [ ] **Step 4: Click the unsubscribe link in the test email**

- The link should land on `/api/unsubscribe?token=...`
- Page should render "Du är avregistrerad"
- The test token targets `test-preview` lead ID which does not exist, so no DB row is updated — this is expected

- [ ] **Step 5: Real broadcast to one lead**

- Back in admin, pick ONE of your own leads (e.g., use a row where email = your own address — or temporarily insert one)
- Select that single row
- Open send modal, subject = "Live test", html = `<p>Hej test.</p>`
- Click "Skicka nu" → confirm dialog
- Expected: green result summary, leads table reloads, "Senast mejlad" column now shows today for that row

- [ ] **Step 6: Click real unsubscribe link from the live email**

- Confirmation page shows
- Verify DB row is marked unsubscribed:

```bash
# Via MCP:
# mcp__supabase__execute_sql: SELECT email, unsubscribed_at FROM leads WHERE email = 'your@email.com';
```

Expected: `unsubscribed_at` is populated.

- [ ] **Step 7: Re-send to unsubscribed lead**

- Reload Leads tab — the unsubscribed row should be greyed out with an "Avregistrerad" badge, checkbox disabled
- Try to tick it → not possible
- This confirms the unsubscribe protection on the UI side

- [ ] **Step 8: Tampered token test**

In browser: visit `http://localhost:4321/api/unsubscribe?token=garbage`.
Expected: "Ogiltig länk" page with 400 status.

- [ ] **Step 9: Stop dev, commit anything leftover, push**

```bash
git status
# if anything unexpected, inspect; otherwise:
git push
```

---

## Rollback

If the feature needs to be reverted:

1. `git revert` the feature commits
2. Drop the new columns:
   ```sql
   ALTER TABLE leads DROP COLUMN unsubscribed_at, DROP COLUMN last_emailed_at;
   DROP INDEX IF EXISTS idx_leads_unsubscribed_at;
   ```
3. Remove `UNSUBSCRIBE_SECRET` from Vercel envs

---

## Spec Coverage Checklist

- Bulk email to leads → Tasks 5, 9, 10
- Select-all filtered → Task 8
- Per-lead checkbox → Tasks 7, 8
- Unsubscribe link + signed token → Tasks 3, 4, 5
- `last_emailed_at` tracking → Tasks 1, 5, 7
- `unsubscribed_at` filter + UI badge → Tasks 1, 5, 7
- Test-send mode → Tasks 5, 10
- Batched via existing `sendEmail()` → Task 5 (per-recipient so each gets unique token)
- Admin auth protection → Task 5 (reuses `verifyAdmin`)
- Smoke test checklist → Task 11
