# Spec: Avoid duplicate lead emails

**Date:** 2026-04-22
**Status:** Approved

## Problem

We now send bulk emails to leads from the admin panel, and each successful send writes `leads.last_emailed_at`. The "Senast mejlad" column is visible, but there is no workflow support for avoiding a repeat send — the admin has to eyeball the date column while ticking rows, which will fail in practice. We need a lightweight way to filter out recently-emailed leads and a warning in the send modal if the admin is about to mail someone again.

## Scope

### In scope
- Dropdown above the leads table to hide leads mailed within a chosen window (7/14/30/90 days)
- "(N dolda)" indicator when the filter is active
- Warning line in the send modal if any selected recipient has `last_emailed_at` within the last 30 days

### Out of scope (YAGNI)
- Campaign history table or per-lead send log (option B/D from brainstorming — deferred)
- Sortable columns / click-to-sort on headers
- Auto-deselection of recently-mailed leads (admin keeps full control)
- Custom day windows beyond the four presets

## Data model

No schema changes. Uses the existing `leads.last_emailed_at timestamptz` column.

## UI

### 1. Filter dropdown in the leads-tab toolbar
Positioned next to the existing search input. Options (values are days, `0` means no filter):

| Label                  | Value |
|------------------------|-------|
| Visa alla              | `0`   |
| Dölj senaste 7 dagar   | `7`   |
| Dölj senaste 14 dagar  | `14`  |
| Dölj senaste 30 dagar  | `30`  |
| Dölj senaste 90 dagar  | `90`  |

Default: `0` (no hiding).

### 2. Client-side filter in `renderLeads()`
Add one more predicate inside the existing `filtered = allLeads.filter(...)` chain:
- If `days > 0` and `lead.last_emailed_at` is a date within `now - days`: exclude the row.

Placed AFTER the existing source-filter and search-match checks, so it composes cleanly.

### 3. Hidden-count indicator
Small muted text next to `leadsSelectedCount` (same toolbar row):
- When filter is active and any rows are hidden: `"12 dolda"`
- When filter is active but no rows hidden (everyone is eligible): empty
- When filter is inactive: empty

### 4. Send-modal warning
When the admin clicks the send button and the modal opens, compute:

```
const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
const recent = Array.from(selectedEmails)
  .filter(email => {
    const lead = allLeads.find(l => l.email === email);
    return lead?.last_emailed_at && new Date(lead.last_emailed_at).getTime() > cutoff;
  }).length;
```

If `recent > 0`, render a yellow warning line in the modal **above** the Ämne label:

```
⚠ 3 av 12 valda leads har fått mejl de senaste 30 dagarna.
```

If `recent === 0`, the line is empty / hidden. No modal behaviour change — admin can still send.

## Interaction with existing features

- **Select-all + filter:** "Välj alla" already operates on visible rows only (DOM checkboxes). Once the new filter hides a row, "Välj alla" correctly ignores it. No change needed.
- **Search:** composes with the new filter (AND). A lead must pass both to be rendered.
- **`renderLeads` re-run after send:** The table reloads via `loadLeads()` after a successful send. Newly-updated `last_emailed_at` will then be reflected. If the filter is active, those leads will immediately disappear from view.

## Error handling

- Unparseable `last_emailed_at`: treat as "never mailed" (keep the lead visible). `new Date(invalid).getTime()` returns `NaN` so a `> cutoff` comparison is false — no special code needed, but worth a comment.
- Empty selection in modal: warning count is `0`, warning line is hidden. No regression.

## Testing

Manual smoke test (no test harness in repo):
1. Admin → Leads tab → set filter to "7 dagar". Leads mailed today/yesterday disappear; rest remain. Counter shows "N dolda".
2. Set filter to "Visa alla". All leads return.
3. Type in search while filter is active: both filters compose (AND).
4. Tick several leads including some not-recently-mailed and some mailed <30d ago. Open send modal. Warning line appears with the correct count.
5. Tick only leads never mailed. Open modal. No warning line.

## Files touched

**Modified:**
- `src/pages/admin.astro`
  - Toolbar: add filter `<select id="leadsHideRecent">`
  - `renderLeads()`: add window predicate + update "dolda" indicator
  - Send modal: add `<p id="leadsSendWarning">` line
  - Modal open handler: compute `recent` count and populate the warning

No backend changes. No new files.

## Open questions
None.
