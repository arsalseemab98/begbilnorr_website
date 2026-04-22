# Avoid Duplicate Lead Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a client-side filter that hides leads mailed in the last N days, an indicator for hidden count, and a pre-send warning if any selected recipient was mailed within 30 days.

**Architecture:** All changes live in `src/pages/admin.astro`. No schema changes, no new endpoints. The leads-tab data already carries `last_emailed_at` from `/api/leads`, so the filter composes with existing source/search filters as a pure front-end step. The send-modal warning uses the same `allLeads` array the rest of the leads tab reads from.

**Tech Stack:** Astro 5 SSR, TypeScript inline in the `.astro` file, plain DOM.

**No test harness in this repo.** Verification is via `npm run build` and manual browser check.

---

## File Structure

**Modified (only):**
- `src/pages/admin.astro` — leads tab toolbar + `renderLeads()` + send-modal markup/JS

---

## Task 1: Toolbar — add "Dölj nyligen mejlade" dropdown and "N dolda" indicator

**Files:**
- Modify: `/Users/arsalseemab/Desktop/github/begbilnorr_website/src/pages/admin.astro`

- [ ] **Step 1: Find the existing bulk toolbar**

Run:

```bash
grep -n "leads-bulk-toolbar" /Users/arsalseemab/Desktop/github/begbilnorr_website/src/pages/admin.astro
```

Expected: one match. The block looks like:

```html
        <div class="leads-bulk-toolbar" style="display:flex;align-items:center;gap:12px;margin:8px 0;flex-wrap:wrap;">
          <span id="leadsSelectedCount" style="font-size:13px;color:rgba(255,255,255,0.6);">0 valda</span>
          <button id="leadsSendBtn" class="btn btn-red" disabled style="opacity:0.5;cursor:not-allowed;">Skicka e-post till valda</button>
        </div>
```

- [ ] **Step 2: Add dropdown and hidden-count span**

Replace the block above with:

```html
        <div class="leads-bulk-toolbar" style="display:flex;align-items:center;gap:12px;margin:8px 0;flex-wrap:wrap;">
          <span id="leadsSelectedCount" style="font-size:13px;color:rgba(255,255,255,0.6);">0 valda</span>
          <span id="leadsHiddenCount" style="font-size:13px;color:rgba(255,255,255,0.4);"></span>
          <label style="font-size:13px;color:rgba(255,255,255,0.6);display:flex;align-items:center;gap:6px;">
            Dölj nyligen mejlade:
            <select id="leadsHideRecent" class="input" style="padding:4px 8px;font-size:13px;">
              <option value="0">Visa alla</option>
              <option value="7">Senaste 7 dagar</option>
              <option value="14">Senaste 14 dagar</option>
              <option value="30">Senaste 30 dagar</option>
              <option value="90">Senaste 90 dagar</option>
            </select>
          </label>
          <button id="leadsSendBtn" class="btn btn-red" disabled style="opacity:0.5;cursor:not-allowed;">Skicka e-post till valda</button>
        </div>
```

- [ ] **Step 3: Build check**

```bash
cd /Users/arsalseemab/Desktop/github/begbilnorr_website && npm run build 2>&1 | tail -8
```

Expected: `[build] Complete!`

- [ ] **Step 4: Commit**

```bash
cd /Users/arsalseemab/Desktop/github/begbilnorr_website && git add src/pages/admin.astro && git commit -m "feat(admin): add leads filter dropdown and hidden-count indicator"
```

---

## Task 2: `renderLeads()` — apply window filter + update hidden-count

**Files:**
- Modify: `/Users/arsalseemab/Desktop/github/begbilnorr_website/src/pages/admin.astro`

- [ ] **Step 1: Locate the filter chain**

Run:

```bash
grep -n "const filtered = allLeads.filter" /Users/arsalseemab/Desktop/github/begbilnorr_website/src/pages/admin.astro
```

Expected: one match inside `renderLeads()`. The block looks like:

```typescript
    const filtered = allLeads.filter(l => {
      if (leadsFilter !== 'all') {
        const sources = l.sources || [];
        if (!sources.includes(leadsFilter)) return false;
      }
      if (search) {
        const haystack = `${l.name || ''} ${l.email || ''} ${l.phone || ''}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
```

- [ ] **Step 2: Add a module-level state for the hide-recent window**

Find this line (it lives just above `renderLeads()`):

```typescript
  let leadsFilter = 'all';
```

And replace with:

```typescript
  let leadsFilter = 'all';
  let leadsHideDays = 0;
```

- [ ] **Step 3: Extend the filter chain with the window predicate**

Replace the `const filtered = ...` block (located in Step 1) with:

```typescript
    const hideCutoff = leadsHideDays > 0 ? Date.now() - leadsHideDays * 24 * 60 * 60 * 1000 : 0;
    const filtered = allLeads.filter(l => {
      if (leadsFilter !== 'all') {
        const sources = l.sources || [];
        if (!sources.includes(leadsFilter)) return false;
      }
      if (search) {
        const haystack = `${l.name || ''} ${l.email || ''} ${l.phone || ''}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      if (hideCutoff > 0 && l.last_emailed_at) {
        // new Date(invalid).getTime() → NaN, which fails the > cutoff comparison, so invalid dates fall through harmlessly
        const ts = new Date(l.last_emailed_at).getTime();
        if (ts > hideCutoff) return false;
      }
      return true;
    });
```

- [ ] **Step 4: Update the "dolda" indicator inside `renderLeads()`**

At the very END of `renderLeads()`, just after the `updateSelectionUi();` call that was added in the previous feature, append:

```typescript
    const hiddenEl = document.getElementById('leadsHiddenCount');
    if (hiddenEl) {
      const hidden = allLeads.length - filtered.length;
      hiddenEl.textContent = leadsHideDays > 0 && hidden > 0 ? `${hidden} dolda` : '';
    }
```

- [ ] **Step 5: Wire the dropdown change event**

Find this block (added in the previous feature, near the select-all wiring):

```typescript
  const leadsSelectAll = document.getElementById('leadsSelectAll') as HTMLInputElement | null;
  leadsSelectAll?.addEventListener('change', () => {
    ...
  });
```

Just BEFORE this block, insert:

```typescript
  const leadsHideRecent = document.getElementById('leadsHideRecent') as HTMLSelectElement | null;
  leadsHideRecent?.addEventListener('change', () => {
    leadsHideDays = parseInt(leadsHideRecent.value, 10) || 0;
    renderLeads();
  });

```

(Blank line after so the select-all block is visually separated.)

- [ ] **Step 6: Build check**

```bash
cd /Users/arsalseemab/Desktop/github/begbilnorr_website && npm run build 2>&1 | tail -8
```

Expected: success.

- [ ] **Step 7: Sanity grep**

```bash
grep -c "leadsHideDays" /Users/arsalseemab/Desktop/github/begbilnorr_website/src/pages/admin.astro
grep -c "leadsHiddenCount" /Users/arsalseemab/Desktop/github/begbilnorr_website/src/pages/admin.astro
grep -c "leadsHideRecent" /Users/arsalseemab/Desktop/github/begbilnorr_website/src/pages/admin.astro
```

Expected: `leadsHideDays` ≥ 4 (declaration + 3 reads), `leadsHiddenCount` = 2 (HTML id + getElementById), `leadsHideRecent` = 3 (HTML id + const + listener).

- [ ] **Step 8: Commit**

```bash
cd /Users/arsalseemab/Desktop/github/begbilnorr_website && git add src/pages/admin.astro && git commit -m "feat(admin): hide leads mailed within chosen window"
```

---

## Task 3: Send modal — pre-send warning for recently mailed recipients

**Files:**
- Modify: `/Users/arsalseemab/Desktop/github/begbilnorr_website/src/pages/admin.astro`

- [ ] **Step 1: Add warning paragraph to send modal markup**

Find this block (from the send-modal markup, inside the leads tab):

```html
            <h3 style="margin:0 0 4px;">Skicka e-post till valda leads</h3>
            <p id="leadsSendRecipients" style="margin:0 0 20px;color:rgba(255,255,255,0.5);font-size:13px;">0 mottagare</p>

            <label style="display:block;font-size:13px;margin-bottom:4px;">Ämne</label>
```

Insert a new `<p id="leadsSendWarning">` between `leadsSendRecipients` and the Ämne label. Replace with:

```html
            <h3 style="margin:0 0 4px;">Skicka e-post till valda leads</h3>
            <p id="leadsSendRecipients" style="margin:0 0 20px;color:rgba(255,255,255,0.5);font-size:13px;">0 mottagare</p>

            <p id="leadsSendWarning" style="margin:0 0 16px;padding:10px 12px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);border-radius:8px;color:#FBBF24;font-size:13px;display:none;"></p>

            <label style="display:block;font-size:13px;margin-bottom:4px;">Ämne</label>
```

- [ ] **Step 2: Populate the warning when the modal opens**

Find the existing `sendBtn?.addEventListener('click', ...)` handler. It looks like:

```typescript
  sendBtn?.addEventListener('click', () => {
    if (selectedEmails.size === 0 || !sendModal) return;
    if (sendRecipients) sendRecipients.textContent = `${selectedEmails.size} mottagare`;
    setSendMsg('', '#fff');
    sendModal.style.display = 'flex';
  });
```

Replace with:

```typescript
  sendBtn?.addEventListener('click', () => {
    if (selectedEmails.size === 0 || !sendModal) return;
    if (sendRecipients) sendRecipients.textContent = `${selectedEmails.size} mottagare`;

    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recent = Array.from(selectedEmails).filter(email => {
      const lead = allLeads.find(l => l.email === email);
      if (!lead?.last_emailed_at) return false;
      const ts = new Date(lead.last_emailed_at).getTime();
      return ts > cutoff;
    }).length;

    const warn = document.getElementById('leadsSendWarning') as HTMLParagraphElement | null;
    if (warn) {
      if (recent > 0) {
        warn.textContent = `⚠ ${recent} av ${selectedEmails.size} valda leads har fått mejl de senaste 30 dagarna.`;
        warn.style.display = 'block';
      } else {
        warn.textContent = '';
        warn.style.display = 'none';
      }
    }

    setSendMsg('', '#fff');
    sendModal.style.display = 'flex';
  });
```

- [ ] **Step 3: Build check**

```bash
cd /Users/arsalseemab/Desktop/github/begbilnorr_website && npm run build 2>&1 | tail -8
```

Expected: success.

- [ ] **Step 4: Sanity grep**

```bash
grep -c "leadsSendWarning" /Users/arsalseemab/Desktop/github/begbilnorr_website/src/pages/admin.astro
```

Expected: 2 (markup id + getElementById in handler).

- [ ] **Step 5: Commit**

```bash
cd /Users/arsalseemab/Desktop/github/begbilnorr_website && git add src/pages/admin.astro && git commit -m "feat(admin): warn in send modal when recipients were mailed recently"
```

---

## Task 4: Manual smoke test

**Files:** (none — manual)

- [ ] **Step 1: Start dev server**

```bash
cd /Users/arsalseemab/Desktop/github/begbilnorr_website && npm run dev
```

- [ ] **Step 2: Open admin and go to Leads**

Browse to `http://localhost:4321/admin`, log in, click **Leads**.

- [ ] **Step 3: Verify new dropdown**

Above the leads table, a "Dölj nyligen mejlade: [Visa alla ▾]" dropdown is visible. Default is "Visa alla"; table shows all leads.

- [ ] **Step 4: Exercise the filter**

Select "Senaste 30 dagar". Any leads mailed within 30 days disappear. If any do, "N dolda" appears next to "0 valda". Switch back to "Visa alla" → all leads return; "dolda" text clears.

- [ ] **Step 5: Compose with search + source filter**

With the window filter active, type an email fragment in search. The combined result is rows that match the search AND aren't recently mailed. Switch source-filter buttons to verify they also compose.

- [ ] **Step 6: Modal warning — positive case**

With the window filter off, tick a lead that was mailed in the last 30 days (if you don't have one, mail yourself via Task 5 of the previous feature's smoke test first). Click **Skicka e-post till valda**. In the modal, a yellow warning: `⚠ 1 av 1 valda leads har fått mejl de senaste 30 dagarna.` Close the modal.

- [ ] **Step 7: Modal warning — negative case**

Tick only leads where "Senast mejlad" is `—`. Open the send modal. No warning line is visible.

- [ ] **Step 8: Stop dev**

`Ctrl-C` in the dev terminal. No leftover commits expected.

---

## Rollback

If this needs to be reverted:

```bash
git revert <task-1-sha> <task-2-sha> <task-3-sha>
```

No schema, env, or server changes to undo.

---

## Spec Coverage Checklist

- Dropdown with 5 preset windows → Task 1
- Client-side filter in `renderLeads()` → Task 2
- "N dolda" indicator → Tasks 1 (markup) + 2 (update logic)
- Send-modal warning paragraph → Task 3
- 30-day cutoff logic in send-modal open handler → Task 3
- Composes with existing source filter + search → Task 2 (predicate added to the same chain)
- Select-all respects new filter → no code change needed (select-all already operates on DOM checkboxes)
- Smoke test → Task 4
