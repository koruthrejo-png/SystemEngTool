# Requirement Change History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On every `updateRequirement`, record each field that actually changed (old → new), attributed to the process identity, and surface it as a read-only timeline in the requirement detail drawer.

**Architecture:** One new `requirement_history` table (row-per-changed-field). The diff is computed in MAIN inside `updateRequirement`, comparing the pre-update row to the resolved new values, wrapped in a transaction with the `UPDATE`. `changed_by` is stamped from `currentUserRowId(db)` — never from the renderer. A single read-only IPC (`requirementHistory:list`) feeds a collapsed timeline section in the drawer, mirroring the existing `customFields` load pattern.

**Tech Stack:** Electron + better-sqlite3 (dual-copy ABI alias for tests), TypeScript, Zustand store, React drawer, vitest.

## Global Constraints

- **Renderer never asserts the author.** `changed_by` is stamped in MAIN from `currentUserRowId(db)` — the same value `updateRequirement` writes to `updated_by`. A `changedBy` (or any author field) arriving in `input` is ignored. (item-13 rule, tested.)
- **Never fabricate history.** No backfill, ever. Legacy rows and pre-feature edits have zero history rows. A no-op update (resolved value equals existing) writes zero rows.
- **`changed_by` is nullable, FK → users(id).** NULL means "unknown identity", never a fabricated id — mirrors `requirements.updated_by`.
- **One table, no new dependency.** Reuse the existing migration idiom, the `run()`/`lastError` store convention, and the drawer's per-requirement load pattern.
- **Tracked field set = all 10 columns `updateRequirement` writes** (user decision 2026-07-24): `text`, `acceptance_criteria`, `source`, `rationale`, `status`, `priority`, `req_type`, `entry_type`, `verification_status`, `heading_id`. (Supersedes the spec's 7-field list, which predated the AC-child-table removal.)
- **Retention: keep everything** (user decision 2026-07-24). No pruning in v1.
- Main-process handler tests run green via `npx vitest run` (dual-copy better-sqlite3 alias) — confirmed 2026-07-24 (`requirements.test.ts` 18/18). TDD is real red→green here.

---

## File Structure

| File | Change |
|---|---|
| `src/main/db/migrations.ts` | `requirement_history` table + index in the `CREATE TABLE IF NOT EXISTS` block |
| `src/main/db/migrations.test.ts` | assert the table + index exist after `runMigrations` |
| `src/types/index.ts` | `RequirementHistoryEntry` interface |
| `src/main/handlers/requirements.ts` | diff-in-main + history inserts inside a transactioned `updateRequirement`; `strOrNull`, `rowToHistory`, `listRequirementHistory`; IPC registration |
| `src/main/handlers/requirements.test.ts` | 5 history invariants (mutation-verified) |
| `src/preload/index.ts` | `requirementHistory.list` bridge |
| `src/types/api.d.ts` | `requirementHistory.list` declaration |
| `src/renderer/src/store/index.ts` | `history` state + `loadHistory`; reset in `selectRequirement`; reload after `updateRequirement` |
| `src/renderer/src/components/RequirementDetail/index.tsx` | History timeline section + `FIELD_LABELS` |
| `src/renderer/src/components/RequirementDetail/*.test.tsx` | timeline renders grouped events / empty state |

---

## Task 1: Schema — `requirement_history` table + index

**Files:**
- Modify: `src/main/db/migrations.ts` (inside the `db.exec(\`...\`)` CREATE block, before the closing `\`)` at ~line 197)
- Test: `src/main/db/migrations.test.ts`

**Interfaces:**
- Produces: table `requirement_history(id, requirement_id, field, old_value, new_value, changed_by, changed_at)` + index `idx_req_history_req` on `requirement_id`.

- [ ] **Step 1: Write the failing test**

Add to `src/main/db/migrations.test.ts` (follow the file's existing setup — it opens a temp db and calls `runMigrations`/`openDatabase`; match whichever it uses):

```typescript
it('creates the requirement_history table with the expected columns', () => {
  const cols = (getDatabase()
    .prepare("PRAGMA table_info(requirement_history)")
    .all() as { name: string }[]).map((c) => c.name)
  expect(cols).toEqual(
    expect.arrayContaining(['id', 'requirement_id', 'field', 'old_value', 'new_value', 'changed_by', 'changed_at'])
  )
})

it('creates the requirement_history index', () => {
  const idx = getDatabase()
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_req_history_req'")
    .get()
  expect(idx).toBeTruthy()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/db/migrations.test.ts`
Expected: FAIL — `PRAGMA table_info(requirement_history)` returns `[]`, so `cols` is empty and the `arrayContaining` assertion fails; index query returns `undefined`.

- [ ] **Step 3: Add the table + index to the CREATE block**

In `src/main/db/migrations.ts`, immediately before the closing `\`)` that ends the big `db.exec` template (currently line ~197, right after the `architectures` table), add:

```sql
    CREATE TABLE IF NOT EXISTS requirement_history (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      requirement_id INTEGER NOT NULL REFERENCES requirements(id),
      field          TEXT    NOT NULL,
      old_value      TEXT,
      new_value      TEXT,
      changed_by     INTEGER REFERENCES users(id),
      changed_at     TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_req_history_req ON requirement_history(requirement_id);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/db/migrations.test.ts`
Expected: PASS (all tests, including the two new ones).

- [ ] **Step 5: Commit**

```bash
git add src/main/db/migrations.ts src/main/db/migrations.test.ts
git commit -m "feat(history): add requirement_history table + index

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Types + diff-in-main + list + IPC

**Files:**
- Modify: `src/types/index.ts` (add `RequirementHistoryEntry`)
- Modify: `src/main/handlers/requirements.ts` (`strOrNull`, transactioned diff in `updateRequirement`, `rowToHistory`, `listRequirementHistory`, IPC registration)
- Test: `src/main/handlers/requirements.test.ts`

**Interfaces:**
- Consumes: `currentUserRowId(db)` (already imported), the `existing` row already fetched in `updateRequirement`.
- Produces:
  - `RequirementHistoryEntry` — `{ id: number; requirementId: number; field: string; oldValue: string | null; newValue: string | null; changedBy: number | null; changedAt: string }`
  - `listRequirementHistory(requirementId: number): RequirementHistoryEntry[]` — newest-first.
  - IPC channel `requirementHistory:list` returning the above.

- [ ] **Step 1: Add the type**

In `src/types/index.ts` add (near the other requirement types):

```typescript
export interface RequirementHistoryEntry {
  id: number
  requirementId: number
  field: string
  oldValue: string | null
  newValue: string | null
  changedBy: number | null
  changedAt: string
}
```

- [ ] **Step 2: Write the failing tests**

Add to `src/main/handlers/requirements.test.ts`. Import `updateRequirement`, `listRequirementHistory`, and `getDatabase`/`setMe`/`initIdentity` as needed (the file already imports most). Identity setup: the file's `beforeEach` opens a db; for author assertions call `initIdentity(tempDir)` + `setMe({ displayName: 'Grace' })` inside the test (match how existing attribution tests in this file establish identity — reuse that exact pattern).

```typescript
describe('requirement history', () => {
  it('records one row per changed field, attributed from process identity', () => {
    initIdentity(tempDir); setMe({ displayName: 'Grace' })
    const r = createRequirement({ moduleId, text: 'X' })
    updateRequirement(r.id, { status: 'Approved', priority: 'High' })
    const rows = listRequirementHistory(r.id)
    const byField = Object.fromEntries(rows.map((h) => [h.field, h]))
    expect(rows).toHaveLength(2)
    expect(byField.status.oldValue).toBe('Draft')
    expect(byField.status.newValue).toBe('Approved')
    expect(byField.priority.oldValue).toBe('Medium')
    expect(byField.priority.newValue).toBe('High')
    const author = currentUserRowId(getDatabase())
    expect(byField.status.changedBy).toBe(author)
    // changed_at equals the requirement's new updated_at (same edit event)
    const updatedAt = listRequirements(moduleId).find((x) => x.id === r.id)!.updatedAt
    expect(byField.status.changedAt).toBe(updatedAt)
  })

  it('writes zero rows for a no-op update (never fabricate)', () => {
    const r = createRequirement({ moduleId, text: 'X' })  // status defaults to 'Draft'
    updateRequirement(r.id, { status: 'Draft' })
    expect(listRequirementHistory(r.id)).toHaveLength(0)
  })

  it('ignores a client-asserted author', () => {
    initIdentity(tempDir); setMe({ displayName: 'Grace' })
    const r = createRequirement({ moduleId, text: 'X' })
    updateRequirement(r.id, { text: 'Y', changedBy: 999 } as any)
    const author = currentUserRowId(getDatabase())
    expect(listRequirementHistory(r.id)[0].changedBy).toBe(author)
    expect(author).not.toBe(999)
  })

  it('serializes nullable and numeric fields', () => {
    const r = createRequirement({ moduleId, text: 'X', source: 'RFC' })
    updateRequirement(r.id, { source: '' })   // cleared → null
    const cleared = listRequirementHistory(r.id).find((h) => h.field === 'source')!
    expect(cleared.oldValue).toBe('RFC')
    expect(cleared.newValue).toBeNull()
    // acceptance_criteria is tracked (all-10 field set)
    updateRequirement(r.id, { acceptanceCriteria: 'must boot in 5s' })
    const ac = listRequirementHistory(r.id).find((h) => h.field === 'acceptance_criteria')!
    expect(ac.newValue).toBe('must boot in 5s')
  })

  it('lists newest-first', () => {
    const r = createRequirement({ moduleId, text: 'X' })
    updateRequirement(r.id, { status: 'Approved' })
    updateRequirement(r.id, { priority: 'High' })
    const fields = listRequirementHistory(r.id).map((h) => h.field)
    expect(fields[0]).toBe('priority')   // most recent first
    expect(fields).toContain('status')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/main/handlers/requirements.test.ts`
Expected: FAIL — `listRequirementHistory` is not exported / undefined.

- [ ] **Step 4: Implement diff-in-main + list + IPC**

In `src/main/handlers/requirements.ts`:

Add a helper near the top (after `now`):

```typescript
function strOrNull(v: unknown): string | null { return v == null ? null : String(v) }

function rowToHistory(row: any): RequirementHistoryEntry {
  return {
    id: row.id, requirementId: row.requirement_id, field: row.field,
    oldValue: row.old_value ?? null, newValue: row.new_value ?? null,
    changedBy: row.changed_by ?? null, changedAt: row.changed_at
  }
}
```

Add `RequirementHistoryEntry` to the type import from `'../../types'`.

Replace the body of `updateRequirement` (lines ~84–106) with the transactioned version. The `next` map lists all 10 tracked columns with the **same coercion** the UPDATE already uses, so the diff matches what lands:

```typescript
export function updateRequirement(id: number, input: UpdateRequirementInput): Requirement {
  const db = getDatabase()
  const existing = db.prepare('SELECT * FROM requirements WHERE id = ?').get(id) as any
  if (!existing) throw new Error(`Requirement ${id} not found`)
  const ts = now()
  const author = currentUserRowId(db)

  // Resolve each tracked field exactly as the UPDATE does, so the recorded diff matches
  // what actually persists. Keys are the requirement column names.
  const next: Record<string, unknown> = {
    text:                input.text ?? existing.text,
    acceptance_criteria: input.acceptanceCriteria !== undefined ? (input.acceptanceCriteria || null) : existing.acceptance_criteria,
    source:              input.source !== undefined ? (input.source || null) : existing.source,
    rationale:           input.rationale !== undefined ? (input.rationale || null) : existing.rationale,
    status:              input.status ?? existing.status,
    priority:            input.priority ?? existing.priority,
    req_type:            input.reqType ?? existing.req_type,
    entry_type:          input.entryType ?? existing.entry_type,
    verification_status: input.verificationStatus ?? existing.verification_status,
    heading_id:          input.headingId !== undefined ? input.headingId : existing.heading_id
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
    // `created_by` is deliberately absent from the SET list — who wrote it first never changes.
    db.prepare(`
      UPDATE requirements SET text = ?, acceptance_criteria = ?, source = ?, rationale = ?, status = ?, priority = ?, req_type = ?, entry_type = ?, verification_status = ?, heading_id = ?, updated_at = ?, updated_by = ? WHERE id = ?
    `).run(
      next.text, next.acceptance_criteria, next.source, next.rationale, next.status,
      next.priority, next.req_type, next.entry_type, next.verification_status, next.heading_id,
      ts, author, id
    )
  })()

  return rowToRequirement(db.prepare('SELECT * FROM requirements WHERE id = ?').get(id))
}

export function listRequirementHistory(requirementId: number): RequirementHistoryEntry[] {
  return (getDatabase()
    .prepare('SELECT * FROM requirement_history WHERE requirement_id = ? ORDER BY changed_at DESC, id DESC')
    .all(requirementId) as any[]).map(rowToHistory)
}
```

Register the IPC in `registerRequirementHandlers`:

```typescript
  ipcMain.handle('requirementHistory:list', (_e, requirementId: number) => listRequirementHistory(requirementId))
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/main/handlers/requirements.test.ts`
Expected: PASS (all, including the 18 pre-existing + 5 new).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/main/handlers/requirements.ts src/main/handlers/requirements.test.ts
git commit -m "feat(history): record + list per-field requirement change history in main

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Preload bridge + api type + store

**Files:**
- Modify: `src/preload/index.ts` (add `requirementHistory.list`)
- Modify: `src/types/api.d.ts` (declare `requirementHistory.list`)
- Modify: `src/renderer/src/store/index.ts` (`history` state, `loadHistory`, reset in `selectRequirement`, reload after `updateRequirement`)

**Interfaces:**
- Consumes: `requirementHistory:list` IPC, `RequirementHistoryEntry`.
- Produces: `window.api.requirementHistory.list(id) => Promise<RequirementHistoryEntry[]>`; store `history: RequirementHistoryEntry[]` + `loadHistory(id)`.

- [ ] **Step 1: Add the preload bridge**

In `src/preload/index.ts`, alongside the other requirement-related bridges (e.g. `customFields`), add:

```typescript
  requirementHistory: {
    list: (requirementId: number) => ipcRenderer.invoke('requirementHistory:list', requirementId)
  },
```

- [ ] **Step 2: Declare it in the api types**

In `src/types/api.d.ts`, add to the `window.api` interface (import/reference `RequirementHistoryEntry` the same way the file references other requirement types):

```typescript
    requirementHistory: {
      list: (requirementId: number) => Promise<RequirementHistoryEntry[]>
    }
```

- [ ] **Step 3: Add store state + action**

In `src/renderer/src/store/index.ts`:

1. Import `RequirementHistoryEntry` in the types import.
2. Add to the state interface (near `customFields: RequirementCustomField[]`): `history: RequirementHistoryEntry[]`.
3. Add to the interface's action list (near `loadCustomFields`): `loadHistory: (requirementId: number) => Promise<void>`.
4. Add to the initial state (near `customFields: []`): `history: [],`.
5. Reset in `selectRequirement` — change `set({ selectedRequirementId: id, customFields: [] })` to `set({ selectedRequirementId: id, customFields: [], history: [] })`.
6. Implement the action (mirror `loadCustomFields`):

```typescript
  loadHistory: (requirementId) => run(async () => {
    set({ history: await window.api.requirementHistory.list(requirementId) })
  }),
```

7. In `updateRequirement`, after `ensureAuthorKnown(...)`, reload the timeline (the edit just added rows):

```typescript
  updateRequirement: (id, input) => run(async () => {
    const updated = await window.api.requirements.update(id, input)
    set((s) => ({ requirements: s.requirements.map((r) => (r.id === id ? updated : r)) }))
    await ensureAuthorKnown(updated.updatedBy, get, set)
    if (get().selectedRequirementId === id) await get().loadHistory(id)
  }),
```

(The `selectedRequirementId === id` guard avoids loading history for a bulk/off-screen edit.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean (both node + web configs).

- [ ] **Step 5: Commit**

```bash
git add src/preload/index.ts src/types/api.d.ts src/renderer/src/store/index.ts
git commit -m "feat(history): preload bridge + store loadHistory wiring

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: History timeline in the drawer

**Files:**
- Modify: `src/renderer/src/components/RequirementDetail/index.tsx`
- Test: `src/renderer/src/components/RequirementDetail/history.test.tsx` (new focused test) OR extend an existing `RequirementDetail` test file if one exists — check first with `ls src/renderer/src/components/RequirementDetail/`.

**Interfaces:**
- Consumes: store `history`, `loadHistory`, `users`, `headings`; `userName` from `attribution.ts`.
- Produces: a collapsed-by-default **History** section rendering grouped edit events.

- [ ] **Step 1: Write the failing renderer test**

Create `src/renderer/src/components/RequirementDetail/history.test.tsx`. Follow the existing `RequirementDetail` test setup (there is an OOM-loop hazard noted in the handoff — use the same stable-store-mock pattern the other drawer tests use; copy their `useStore` mock scaffolding rather than inventing one). Two cases:

```typescript
it('renders grouped history events with author and field labels', async () => {
  // store mock: history = two rows sharing changedAt, users roster has the author,
  // headings empty. Render RequirementDetail with a selected requirement.
  // Expand the History section, then assert:
  expect(screen.getByText('Status')).toBeInTheDocument()
  expect(screen.getByText(/Draft/)).toBeInTheDocument()
  expect(screen.getByText(/Approved/)).toBeInTheDocument()
  expect(screen.getByText('Grace')).toBeInTheDocument()   // grouped header author
})

it('shows the empty state when there is no history', async () => {
  // store mock: history = []
  expect(screen.getByText('No changes recorded yet.')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/components/RequirementDetail/history.test.tsx`
Expected: FAIL — the History section / empty-state text does not exist yet.

- [ ] **Step 3: Implement the timeline**

In `src/renderer/src/components/RequirementDetail/index.tsx`:

1. Pull `history, loadHistory, users, headings` from `useStore()` (add to the existing destructure).
2. In the `useEffect` on `req.id` that already calls `loadCustomFields(req.id)`, add `loadHistory(req.id)`.
3. Add the label map near the top of the file (renderer-only display concern — not shared types):

```typescript
const FIELD_LABELS: Record<string, string> = {
  text: 'Text', acceptance_criteria: 'Acceptance Criteria', source: 'Source',
  rationale: 'Rationale', status: 'Status', priority: 'Priority', req_type: 'Type',
  entry_type: 'Entry Type', verification_status: 'Verification', heading_id: 'Section'
}
```

4. Add a `HistorySection` component and render it after `<TraceabilitySection req={req} />` (or wherever the drawer's low-traffic sections end). Collapsed-by-default via local `useState`. Group consecutive rows sharing `changedAt` into one event:

```typescript
function HistorySection({ req }: { req: Requirement }): JSX.Element {
  const { history, users, headings } = useStore()
  const [open, setOpen] = useState(false)

  // Rows arrive newest-first; group by changedAt (one updateRequirement call = one event).
  const events: { at: string; by: number | null; rows: typeof history }[] = []
  for (const h of history) {
    const last = events[events.length - 1]
    if (last && last.at === h.changedAt) last.rows.push(h)
    else events.push({ at: h.changedAt, by: h.changedBy, rows: [h] })
  }

  const sectionTitle = (raw: string | null): string => {
    if (raw == null) return '—'
    return headings.find((s) => String(s.id) === raw)?.title ?? raw
  }
  const display = (field: string, v: string | null): string => {
    if (field === 'heading_id') return sectionTitle(v)
    if (v == null || v === '') return '—'
    return v.length > 80 ? v.slice(0, 80) + '…' : v
  }

  return (
    <div>
      <SectionLabel className="block pt-2">
        <button type="button" onClick={() => setOpen((o) => !o)}>
          History {open ? '▾' : '▸'}
        </button>
      </SectionLabel>
      {open && (
        history.length === 0
          ? <p className="text-sm text-slate-500">No changes recorded yet.</p>
          : <ul>
              {events.map((ev, i) => (
                <li key={i} className="pb-2">
                  <div className="text-xs text-slate-500">
                    {userName(users, ev.by)} · {new Date(ev.at).toLocaleString()}
                  </div>
                  {ev.rows.map((h) => (
                    <div key={h.id} className="text-sm">
                      <strong>{FIELD_LABELS[h.field] ?? h.field}</strong>{' '}
                      {display(h.field, h.oldValue)} → {display(h.field, h.newValue)}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
      )}
    </div>
  )
}
```

(Match the actual heading title field name — the store `headings` items expose their display title; verify the property name in `src/types/index.ts` and use it. If it is not `title`, adjust `sectionTitle`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/components/RequirementDetail/history.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + full suite**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck clean; suite green except the known pre-existing `App.test.tsx` "open" button failure (fails on base too — not introduced here).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/RequirementDetail/
git commit -m "feat(history): read-only change-history timeline in the requirement drawer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Build gate + live-verify + docs

**Files:**
- Modify: handoff.md / `.superpowers/sdd/progress.md` ledger section, backlog item 34 mark done.

- [ ] **Step 1: Full gate**

Run: `npm run typecheck && npx electron-vite build && npx vitest run`
Expected: typecheck clean; 3-target build clean; suite green except the known `App.test.tsx` pre-existing failure.

- [ ] **Step 2: Live-verify in the running app** (driver at `.claude/skills/run-app/driver.mjs`)

- Open a requirement, change Status Draft→Approved and Priority→High; open the History section → one grouped event, author = your identity, two field lines.
- Change Verification and Acceptance Criteria; confirm both appear (proves the all-10 field set, not just the spec's 7).
- Re-select a never-edited requirement → "No changes recorded yet."
- Switch between requirements → no stale timeline flash (reset on select).

- [ ] **Step 3: Update docs**

Append a session section to `handoff.md` and a ledger section to `.superpowers/sdd/progress.md`. Mark backlog item 34 done in `docs/superpowers/specs/2026-07-02-ui-overhaul-design.md` §6. Note carried follow-ups: custom-field + (future) AC-item-table history is out of scope (all-10 covers the AC *column*); retention is unbounded by decision.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs(history): backlog item 34 complete — requirement change-history timeline

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** schema (T1) ✓; diff-in-main + transaction + attribution + no-fabricate + list + IPC (T2) ✓; types (T2) ✓; preload/api/store (T3) ✓; timeline UI + FIELD_LABELS + grouping + section-title resolve + empty state (T4) ✓; tests — 5 main invariants (T2) + renderer grouped/empty (T4) ✓. Deviations from spec, all deliberate and user-approved: tracked set is **all 10 fields** (spec said 7; AC child table no longer exists) and retention = keep everything (spec's default).

**Placeholders:** none — every code step carries full code. Two "verify the property name" notes (heading title field, drawer test mock scaffolding) point the implementer at the exact existing source to copy, not at invention.

**Type consistency:** `RequirementHistoryEntry` fields (`requirementId`/`oldValue`/`newValue`/`changedBy`/`changedAt`) are identical across T2 (definition), T3 (store), T4 (UI). `listRequirementHistory` / `loadHistory` / `requirementHistory.list` names consistent across tasks. Column names in the `next` map match the `UPDATE` SET list and the migration.
