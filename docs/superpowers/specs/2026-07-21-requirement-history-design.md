# Requirement Versioning / Change History — Design

**Date:** 2026-07-21
**Backlog item:** 34
**Builds on:** item 13 (attribution — `created_by`/`updated_by`, `src/main/identity.ts`, `src/renderer/src/attribution.ts`). Attribution records **who** last edited a requirement and **when**. It does not record **what** changed. This spec adds the **what**: a per-requirement, per-field change log, attributed to the author, shown as a timeline in the detail drawer.

## Goal

On every `updateRequirement`, snapshot each field that actually changed (old value → new value), stamped with the author (the same process identity attribution already stamps) and the timestamp. Surface the log as a read-only timeline in the requirement detail drawer. This is the system-of-record payoff of the identity work: "SRS-0012 status went Draft → Approved, by Grace, on 2026-07-21."

Non-goals: editing/reverting from the timeline, diffing arbitrary versions, history for anything but requirement core fields (see Scope). Read and record only.

## House conventions this must respect

- **End goal is a server.** History references its author by the same `users(id)` FK that `updated_by` uses — a roster row that resolves to a uuid, never a bare label or client-supplied integer. A server merge dedupes on uuid; a bare display string or renderer-asserted id would collide.
- **Renderer never asserts the author.** MAIN stamps `changed_by` from `currentUserRowId(db)` — the *same* value the surrounding `updateRequirement` already computes for `updated_by`. The renderer cannot name who made an edit (item-13 rule, tested).
- **Never fabricate history.** Legacy rows and every edit made before this feature shipped have no history rows and stay that way — exactly the item-13 stance on NULL `updated_by` ("unknown, not nobody"). A no-op update (nothing actually changed) writes zero rows.
- **One table, no new dependency.** Reuse the existing migration idiom, the `run()`/`lastError` store convention, and the drawer's existing per-requirement load pattern (`loadCustomFields`/`loadAcItems`).

## The lazy ladder decision: row-per-field, not row-per-edit-with-JSON

Two candidate shapes:

1. **Row-per-edit with a JSON diff blob** — one row per `updateRequirement` call, `changes` = `{"status":["Draft","Approved"],"text":[...]}`.
2. **Row-per-changed-field** — one row per `(field, old, new)` per edit.

**Chosen: row-per-changed-field.** Justification down the ladder:

- The **timeline UI wants per-field rows anyway** ("status: Draft → Approved"). Row-per-field renders with a plain `SELECT`; the JSON option makes every render parse and re-expand a blob — writing a serialize step on the way in and a parse step on the way out to store what columns already model. That is more code, not less.
- **Querying** ("every status change on this requirement") is a `WHERE field = 'status'` — trivial on rows, a JSON scan otherwise.
- SQLite has no native diff type; the blob would be hand-rolled JSON in a `TEXT` column — a bespoke format to maintain vs. three ordinary columns.
- Multi-field edits writing N rows is not a cost worth optimizing: an `updateRequirement` changes 1–2 fields in practice, and the rows that share one `changed_at` group into a single edit event in the UI for free (see Timeline UI). No `edit_id` grouping column needed — the timestamp is the group key.

`old_value`/`new_value` are `TEXT` (nullable). Enums/text/section-id all serialize to their string form; NULL text fields (`source`, `rationale`) store SQL NULL. No typed columns per field — one shape covers all tracked fields.

## Schema (`src/main/db/migrations.ts`)

New table, created with the existing `CREATE TABLE IF NOT EXISTS` block alongside the others; index added right after:

```sql
CREATE TABLE IF NOT EXISTS requirement_history (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  requirement_id INTEGER NOT NULL REFERENCES requirements(id),
  field          TEXT    NOT NULL,   -- 'text' | 'source' | 'rationale' | 'req_type' | 'status' | 'priority' | 'heading_id'
  old_value      TEXT,               -- NULL for a field that was empty before
  new_value      TEXT,               -- NULL for a field cleared to empty
  changed_by     INTEGER REFERENCES users(id),  -- NULL = unknown identity, same as updated_by
  changed_at     TEXT    NOT NULL    -- ISO string, equals the edit's updated_at
);
CREATE INDEX IF NOT EXISTS idx_req_history_req ON requirement_history(requirement_id);
```

- `changed_by` is **nullable and FK → users(id)** — mirrors `requirements.updated_by`. If identity is uninitialised, the stamp is NULL ("unknown"), never a fabricated id. Resolves to a display name via the existing roster (`userName`).
- No backfill, ever. Pre-history edits have no rows (never-fabricate rule).
- No `CHECK` on `field` — the value set is enforced TS-side by the tracked-field list, matching the codebase's enum-as-union convention (same call the connection-line spec made).

## Where the diff is computed — MAIN, inside `updateRequirement` (`src/main/handlers/requirements.ts`)

The diff is computed in main, comparing the **pre-update row** to the **resolved new values**, so it cannot be spoofed by the renderer (a renderer-supplied "what changed" list would be as untrustworthy as a renderer-supplied author). `updateRequirement` already fetches `existing` and already computes `currentUserRowId(db)` — both are reused; nothing new is trusted from `input`.

Today `updateRequirement` runs a bare `UPDATE`. It becomes a **transaction** wrapping the history inserts + the `UPDATE`, so a failure can't leave orphan history or history without its update:

```
export function updateRequirement(id, input) {
  const db = getDatabase()
  const existing = db.prepare('SELECT * FROM requirements WHERE id = ?').get(id)
  if (!existing) throw new Error(...)
  const ts = now()
  const author = currentUserRowId(db)

  // Resolve each field exactly as the UPDATE below does — same coercion, so the diff
  // matches what actually lands. { column, resolvedNew } for each tracked field.
  const next = {
    text:           input.text ?? existing.text,
    source:         input.source !== undefined ? (input.source || null) : existing.source,
    rationale:      input.rationale !== undefined ? (input.rationale || null) : existing.rationale,
    status:         input.status ?? existing.status,
    priority:       input.priority ?? existing.priority,
    req_type:       input.reqType ?? existing.req_type,
    heading_id:     input.headingId !== undefined ? input.headingId : existing.heading_id
  }

  db.transaction(() => {
    const insH = db.prepare(
      'INSERT INTO requirement_history (requirement_id, field, old_value, new_value, changed_by, changed_at) VALUES (?,?,?,?,?,?)'
    )
    for (const [col, newVal] of Object.entries(next)) {
      const oldVal = existing[col] ?? null
      if ((newVal ?? null) !== oldVal) {
        insH.run(id, col, strOrNull(oldVal), strOrNull(newVal), author, ts)
      }
    }
    db.prepare('UPDATE requirements SET text=?, ... , updated_at=?, updated_by=? WHERE id=?')
      .run(next.text, ..., ts, author, id)
  })()

  return rowToRequirement(db.prepare('SELECT * FROM requirements WHERE id = ?').get(id))
}
```

- `strOrNull` = `v == null ? null : String(v)` — `heading_id` (a number) and enums serialize to text; NULLs stay NULL. One two-line helper, no serialization framework.
- The comparison is on **resolved** values, so passing `{ status: 'Draft' }` when status is already `Draft` records nothing (no-op → zero rows). This is the never-fabricate invariant in code.
- `acceptance_criteria` is deliberately **not** in the tracked set even though it is a column on `requirements` — see Scope (the live AC feature is the `acceptance_criteria` *table*, not this legacy column).

## Fields tracked

The seven core fields the `updateRequirement` UPDATE already writes: **text, source, rationale, type (`req_type`), status, priority, section (`heading_id`)**.

- `heading_id` stores the raw id in `old_value`/`new_value`; the drawer resolves id → section title at render (falls back to the raw id if the heading was later deleted). Main does not resolve — keeps the record stable and the handler dumb.
- **Custom fields** (`requirement_custom_fields`) and **acceptance criteria** (`acceptance_criteria`) go through their *own* handlers (`customFields:update`, `acceptanceCriteria:update`), not `updateRequirement`, so they are **out of scope for this pass — a follow-up** (see Open Questions). Wiring them means the same diff-in-main pattern in two more handlers; not hard, just not this table's first cut.

## Types (`src/types/index.ts`)

```typescript
export interface RequirementHistoryEntry {
  id: number
  requirementId: number
  field: string          // one of the tracked column names
  oldValue: string | null
  newValue: string | null
  changedBy: number | null
  changedAt: string
}
```

No `UpdateRequirementInput` change — history is a side effect of the existing update, not a new input. A small `FIELD_LABELS: Record<string,string>` map (`req_type` → "Type", `heading_id` → "Section", etc.) can live in the drawer, not the shared types (renderer-only display concern).

## IPC

One new read-only channel — history is never written directly, only as a side effect of `requirements:update`:

- **`requirementHistory:list`** — `ipcMain.handle('requirementHistory:list', (_e, requirementId) => listRequirementHistory(requirementId))`, registered in `registerRequirementHandlers`.
- `listRequirementHistory(requirementId)` — `SELECT * FROM requirement_history WHERE requirement_id = ? ORDER BY changed_at DESC, id DESC`, mapped through a `rowToHistory`.

No create/update/delete IPC. (Retention pruning, if adopted, is a main-side maintenance job, not a renderer call — see Open Questions.)

## Files that change

| File | Change |
|---|---|
| `src/main/db/migrations.ts` | `requirement_history` table + index |
| `src/main/handlers/requirements.ts` | diff-in-main + history inserts inside a transactioned `updateRequirement`; `rowToHistory`, `listRequirementHistory`, IPC registration |
| `src/preload/index.ts` | `requirementHistory.list` bridge |
| `src/types/api.d.ts` | `requirementHistory.list` declaration |
| `src/types/index.ts` | `RequirementHistoryEntry` interface |
| `src/renderer/src/store/index.ts` | `history: RequirementHistoryEntry[]` state + `loadHistory(requirementId)` action (via `run()`); clear on `selectRequirement`; reload after `updateRequirement` |
| `src/renderer/src/components/RequirementDetail/index.tsx` | History timeline section + `FIELD_LABELS` |

## Store (`src/renderer/src/store/index.ts`)

Mirror the `customFields` pattern exactly:

- State: `history: RequirementHistoryEntry[]` (init `[]`).
- `loadHistory: (requirementId) => run(async () => { set({ history: await window.api.requirementHistory.list(requirementId) }) })`.
- `selectRequirement` already resets `customFields: [], acItems: []` on switch — add `history: []` there so a stale timeline never flashes.
- `updateRequirement` already refetches `updated`; after its `set`, call `await loadHistory(id)` (the edit just added rows) — same slot where it already calls `ensureAuthorKnown` to pull any newly-enrolled author into the roster, so `changedBy` resolves.

No undo entanglement: requirement field edits do **not** participate in the undo/redo stack today (that stack is architecture elements/connections only — verified in the store). So there is no undo path that could write or need to suppress history now. (If requirement edits ever join the stack, an undo would replay through `updateRequirement` and record a reverse-diff row — a genuine edit — which is the honest behaviour; flagged in Open Questions.)

## Timeline UI (`RequirementDetail`)

A new read-only **History** section, collapsed-by-default, at the bottom of the scroll area (after Custom Fields / before or after Traceability — a low-traffic reference panel, not a primary control). Loaded on requirement switch like `customFields`/`acItems` (the `useEffect` on `req.id` already calls `loadCustomFields`/`loadAcItems` — add `loadHistory(req.id)`).

- Rows come back newest-first. **Group consecutive rows that share `changedAt`** into one edit event (they came from one `updateRequirement` call) — a header line `{userName(users, changedBy)} · {new Date(changedAt).toLocaleString()}` (reuse `userName` from `attribution.ts` — a null/unknown author renders "—", same as the existing "Last modified by" line at the top of the drawer), then one line per field:
  - `**{FIELD_LABELS[field]}**  {old || '—'} → {new || '—'}`
  - `heading_id` old/new resolved to section titles via the store `headings` (fallback to raw id).
  - Long `text` diffs shown truncated (the point is "text was edited by X", not a word diff — a char-level diff is explicitly out of scope).
- Empty state: "No changes recorded yet." — honest for legacy/never-edited requirements; not an error.
- No controls in the section (no revert, no delete) — read-only, matching its scope.

This reuses the drawer's existing header pattern: the top already shows *last* editor via `userName(users, req.updatedBy)`; the timeline is the full list behind that one line.

## Testing

Main-process vitest runs against the **dual-copy better-sqlite3 alias** (ABI baseline) — the attribution tests already exercise `requirements.ts` there, so history tests slot into `requirements.test.ts` the same way. Each invariant from item-13's playbook gets a mutation-verified test:

1. **Diff is recorded, per field, in main** — `updateRequirement(id, { status: 'Approved', priority: 'High' })` → two `requirement_history` rows, `field` = `status`/`priority`, correct `old_value`/`new_value`, `changed_by` = `currentUserRowId(db)`, `changed_at` = the row's new `updated_at`. (Proves the diff runs in main and is attributed from process identity.)
2. **No fabricated history** — a legacy row inserted straight to the table (as the item-13 test does) then read: zero history rows. And a **no-op update** (`{ status: existingStatus }`) writes zero rows. (Proves the resolved-value comparison, not fabrication.)
3. **Author is never client-asserted** — `updateRequirement(id, { text: 'Y', changedBy: 999 } as any)` → the history row's `changed_by` is `currentUserRowId(db)`, not 999. (Parallel to the existing forged-author attribution test.)
4. **`heading_id` and nullable fields serialize** — changing `source` to `null` records `new_value = null`; changing section records the id as text.
5. **`requirementHistory:list` ordering** — returns newest-first (`changed_at DESC, id DESC`).

Renderer test (the gate that runs green): a focused `RequirementDetail` test with a mocked `requirementHistory.list` — the timeline renders grouped events, resolves author via `userName`, resolves section titles, and shows the empty state when history is `[]`.

## Scope / YAGNI

- **One table**, seven tracked fields, one read IPC. No `edit_id` grouping column (timestamp groups). No JSON blob. No versioned-snapshot rows (we store diffs, not full copies).
- **Custom fields + acceptance criteria history: follow-up** — same diff-in-main pattern, different handlers; not this cut.
- **No revert / restore-to-version** — read-only timeline. Reverting is a separate feature that would replay values through `updateRequirement` (and thus record its own forward diff).
- **No char-level text diff** — "text was edited", truncated old→new, not a word diff.
- **No retention/pruning** in v1 — the table grows unbounded (see Open Questions); a cap is a one-line `DELETE` if adopted, not a reason to defer the feature.

## Open questions for the user

1. **Retention.** History grows unbounded (one row per changed field per edit — small, but forever, and it rides inside the `.reqarch` file that gets copied/handed over). Options: keep everything (simplest, full record — the system-of-record goal argues for this); cap at N most-recent entries per requirement; or age-out past a date. **Default without an answer: keep everything.**
2. **Acceptance criteria + custom-field changes — now or follow-up?** They edit through their own handlers, so tracking them is a second (easy) pass, not free. Recommend shipping core-field history first, then extending. Confirm that split, or ask to bundle all three now.
3. **Undo/redo interaction.** Requirement field edits are **not** undoable today (the undo stack is architecture-only), so there is no interaction to resolve now. If requirement edits ever join the stack, should an undo record a reverse-diff history row (treat undo as a genuine edit — the honest, lazy default) or be suppressed as a "correction"? Flagging so the answer is on record before that day.
4. **Text-field granularity.** Is "text was edited, old → new (truncated)" enough, or is a word/char diff wanted for the requirement statement specifically? (Out of scope as drawn; asking before someone assumes it.)
