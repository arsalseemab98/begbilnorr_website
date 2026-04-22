# Spec: Bulk email to leads from admin

**Date:** 2026-04-22
**Status:** Approved

## Problem

Every form submission on begbilnorr.se saves the visitor's email to `leads` (221 unique leads today). The admin can already see these leads, but the only outbound email tool — the newsletter composer — targets the 4 people who actively opted into the newsletter. There is no way to email the broader pool of form-fillers.

We want a hybrid workflow: admin picks which leads to include in a mailing (with a "select all" shortcut), composes a message, and sends. GDPR-compliant unsubscribe handling is required because these recipients did not explicitly opt into marketing.

## Scope

### In scope
- Checkbox selection per lead in the admin leads table
- "Välj alla" that selects all currently-filtered rows
- Send-email modal with subject + HTML body (reuse newsletter composer pattern)
- Test-send to a single email before broadcast
- Batched send via existing `sendEmail()` helper (Microsoft Graph)
- Unsubscribe link appended to every send; signed token prevents unsubscribing others
- `last_emailed_at` column on leads so admin sees who was already contacted
- Filter out unsubscribed leads automatically

### Out of scope (YAGNI)
- Segmentation beyond the existing source filter
- Open/click tracking
- Scheduled sends
- Template library (composer stays free-form HTML)
- Automatic resend on failure

## Data model

Add two nullable columns to `leads`:

| column            | type          | purpose                              |
|-------------------|---------------|--------------------------------------|
| `unsubscribed_at` | timestamptz   | GDPR opt-out timestamp, nullable     |
| `last_emailed_at` | timestamptz   | Last successful outbound send        |

No new table. `contact_submissions` and `newsletter_subscribers` are untouched.

## API

### `POST /api/leads-send` (admin-only)
**Body:** `{ emails: string[], subject: string, html: string, testEmail?: string }`

**Behaviour:**
- `verifyAdmin` — same pattern as `/api/newsletter-send`
- If `testEmail` is set: send once to that address with `[TEST]` subject prefix, ignore `emails`
- Otherwise: filter `emails` through `leads` table, exclude any row where `unsubscribed_at IS NOT NULL`
- Append unsubscribe footer HTML to body before sending (per-recipient link with signed token)
- Batch 10 recipients per `sendEmail()` call
- On batch success: `UPDATE leads SET last_emailed_at = now() WHERE email = ANY($batch)`
- Return `{ success, sent, failed, total, skipped_unsubscribed }`

**Unsubscribe footer HTML** (appended server-side, not composed by admin):
```
<hr>
<p style="font-size:12px;color:#666;">
  Du får detta mejl för att du kontaktat oss via begbilnorr.se.
  <a href="https://begbilnorr.se/api/unsubscribe?token={SIGNED_TOKEN}">Avregistrera dig här</a>.
</p>
```

### `GET /api/unsubscribe?token=...` (public)
- Verify HMAC token (secret: new env var `UNSUBSCRIBE_SECRET`)
- Token payload: `{ leadId, iat }`
- `UPDATE leads SET unsubscribed_at = now() WHERE id = $leadId`
- Render a small HTML confirmation page: "Du är avregistrerad från utskick från begbilnorr.se"
- Idempotent — re-clicking the link is a no-op

### Token signing
Use Node's built-in `crypto.createHmac('sha256', secret)` over `${leadId}.${iat}`. No JWT dependency. Token format: `${leadIdBase64}.${iatBase36}.${hmacBase64url}`.

## Admin UI changes

### Leads tab (existing `admin.astro`, tab `#tab-leads`)
Add above the table:
- **"Välj alla"** checkbox — toggles selection of all currently-rendered rows (respects active search/source filter)
- **"N valda"** counter
- **"Skicka e-post till valda (N)"** button — disabled when N=0, opens modal

Add to each row:
- Leading checkbox column
- "Senast mejlad" column — formatted date or `—`
- Leads with `unsubscribed_at` shown greyed out with badge "Avregistrerad", checkbox disabled

### Send-to-leads modal
Reuses the newsletter composer UI visually. Shows:
- Recipient count: "Skickar till 47 valda leads"
- Subject input
- HTML textarea (same as newsletter send)
- "Testa först" — sends to one test email
- "Skicka nu" — broadcasts, shows progress, result summary

## Error handling
- `/api/leads-send` failures on individual batches: log, increment `failed`, continue remaining batches. Final response shows counts so admin knows partial success.
- Missing `UNSUBSCRIBE_SECRET` env: `/api/leads-send` returns 500 with clear message, does not send.
- Invalid/expired unsubscribe token: render "Ogiltig länk" page with 400.

## Testing

Manual smoke test (no automated tests — codebase doesn't have a test harness):
1. Select 3 leads in admin, click send → receive the mail in a test inbox with unsubscribe link present
2. Click unsubscribe link → confirmation page shows, `leads.unsubscribed_at` populated
3. Re-send to same 3 leads → response shows `skipped_unsubscribed: 1`
4. Tamper with token query param → "Ogiltig länk" page
5. Test-send only goes to one address, does not update `last_emailed_at`

## Files touched

**New:**
- `src/pages/api/leads-send.ts`
- `src/pages/api/unsubscribe.ts`
- `src/lib/unsubscribe-token.ts` (sign/verify helpers)
- Migration adding `unsubscribed_at`, `last_emailed_at` to `leads`

**Modified:**
- `src/pages/admin.astro` — leads tab: checkbox column, select-all, send button, modal
- `src/pages/api/leads.ts` — include new columns in response

**Env:**
- Add `UNSUBSCRIBE_SECRET` (random 32+ byte string) to Vercel production/preview/development

## Open questions
None. Design approved by user on 2026-04-22.
