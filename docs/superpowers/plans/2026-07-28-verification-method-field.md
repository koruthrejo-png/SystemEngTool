# Verification Method Field — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `verificationMethod` enum field (Test / Analysis / Inspection / Demonstration) to requirements, surfaced in the drawer, table, and filter, tracked in change history, and round-tripping through CSV and ReqIF.

**Architecture:** Mirror the existing status/priority/type enum machinery end-to-end. New nullable `verification_method` TEXT column; read path maps it in `rowToRequirement`; write path adds it to `updateRequirement`'s tracked `next` map (which makes it the 11th history-tracked field for free); renderer adds a Select + table column + filter attr; the pure export modules add one column each.

**Tech Stack:** TypeScript (strict), Electron main + preact/React renderer, better-sqlite3, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-28-verification-method-field-design.md`

## Global Constraints

- **Field naming:** DB column `verification_method`; TS property `verificationMethod`. Exact.
- **Enum values, verbatim:** `['Test', 'Analysis', 'Inspection', 'Demonstration']` — no `N/A`/`None` member.
- **Nullable / optional:** the column has NO default (legacy rows → `NULL`); "unset" is `null`, not an enum value. This is a deliberate departure from the NOT-NULL enum convention used by status/priority/reqType.
- **Never fabricate:** no backfill on migration; a no-op update writes zero history rows; author/timestamp stamped by main (`currentUserRowId`), never client-asserted.
- **Round-trip mandatory:** any new column must flow through BOTH CSV and ReqIF export (item-32 lesson — a column that skips the pipeline is silently dropped).
- **Add to `UpdateRequirementInput` only, NOT `CreateRequirementInput`:** enums (status/priority) are not part of `createRequirement`; they are applied via `update`. Match that.
- **Test baseline:** full suite is currently **492 passed / 1 failed** (the 1 = pre-existing `App.test.tsx` "open" button, fails on base). Do not regress; the failing count stays at exactly that 1.
- Both typechecks (`npm run typecheck`) clean after every task.

---

### Task 1: Data model — type, migration, read mapping

**Files:**
- Modify: `src/types/index.ts` (after line 42, the `VERIFICATION_STATUSES` block; and `Requirement` + `UpdateRequirementInput`)
- Modify: `src/main/db/migrations.ts:231` (after the `verification_status` column add)
- Modify: `src/main/handlers/requirements.ts:18` (`rowToRequirement`)
- Test: `src/main/db/migrations.test.ts`, `src/main/handlers/requirements.test.ts`

**Interfaces:**
- Produces: `VERIFICATION_METHODS` (readonly tuple), `VerificationMethod` (union type), `Requirement.verificationMethod: VerificationMethod | null`, `UpdateRequirementInput.verificationMethod?: VerificationMethod`. DB column `requirements.verification_method TEXT` (nullable). `rowToRequirement` maps `row.verification_method` → `verificationMethod` (null passes through).

- [ ] **Step 1: Write the failing migration test**

In `src/main/db/migrations.test.ts`, add (place beside the existing column-presence tests):

```ts
it('adds a nullable verification_method column to requirements', () => {
  const db = freshDb()               // use the file's existing fresh-db helper
  runMigrations(db)
  const cols = db.prepare(`PRAGMA table_info(requirements)`).all() as any[]
  const col = cols.find((c) => c.name === 'verification_method')
  expect(col).toBeTruthy()
  expect(col.notnull).toBe(0)        // nullable
  expect(col.dflt_value).toBeNull()  // no default
})

it('re-running migrations leaves verification_method intact (idempotent)', () => {
  const db = freshDb()
  runMigrations(db)
  runMigrations(db)
  const cols = db.prepare(`PRAGMA table_info(requirements)`).all() as any[]
  expect(cols.filter((c) => c.name === 'verification_method')).toHaveLength(1)
})
```

(Match the exact helper names already used in `migrations.test.ts` — `freshDb`/`runMigrations` may be named differently; use whatever the neighbouring tests use.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/db/migrations.test.ts`
Expected: FAIL — `col` is `undefined` (column not added yet).

- [ ] **Step 3: Add the migration column**

In `src/main/db/migrations.ts`, immediately after line 231:

```ts
  addColumnIfMissing(db, 'requirements', 'verification_status', "TEXT NOT NULL DEFAULT 'Unverified'")
  addColumnIfMissing(db, 'requirements', 'verification_method', 'TEXT')
```

(No `NOT NULL`, no `DEFAULT` — nullable by design.)

- [ ] **Step 4: Run migration test to verify it passes**

Run: `npx vitest run src/main/db/migrations.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the type definitions**

In `src/types/index.ts`, after line 42 (the `VerificationStatus` type):

```ts
export const VERIFICATION_METHODS = ['Test', 'Analysis', 'Inspection', 'Demonstration'] as const
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number]
```

In the `Requirement` interface, after `verificationStatus: VerificationStatus`:

```ts
  verificationMethod: VerificationMethod | null
```

In `UpdateRequirementInput`, after `verificationStatus?: VerificationStatus`:

```ts
  verificationMethod?: VerificationMethod
```

(Do NOT touch `CreateRequirementInput` — see Global Constraints.)

- [ ] **Step 6: Map the column in the read path + write a read test**

In `src/main/handlers/requirements.ts`, in `rowToRequirement` (around line 24, next to `verificationStatus: row.verification_status`):

```ts
    verificationStatus: row.verification_status,
    verificationMethod: row.verification_method ?? null,
```

In `src/main/handlers/requirements.test.ts`, add:

```ts
it('rowToRequirement surfaces verificationMethod (null for legacy rows)', () => {
  expect(rowToRequirement({ verification_method: null }).verificationMethod).toBeNull()
  expect(rowToRequirement({ verification_method: 'Test' }).verificationMethod).toBe('Test')
})
```

(If `rowToRequirement` requires more fields to not throw, spread a minimal valid row like the neighbouring tests do.)

- [ ] **Step 7: Run tests + typecheck**

Run: `npx vitest run src/main/db/migrations.test.ts src/main/handlers/requirements.test.ts && npm run typecheck`
Expected: PASS, both typechecks clean.

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/main/db/migrations.ts src/main/handlers/requirements.ts src/main/db/migrations.test.ts src/main/handlers/requirements.test.ts
git commit -m "feat(reqs): verification_method column + type + read mapping (item 39)"
```

---

### Task 2: Handler write path + history tracking

**Files:**
- Modify: `src/main/handlers/requirements.ts:104-138` (`updateRequirement` — the `next` map + UPDATE statement)
- Test: `src/main/handlers/requirements.test.ts`

**Interfaces:**
- Consumes: `UpdateRequirementInput.verificationMethod` (Task 1), `verification_method` column (Task 1).
- Produces: `updateRequirement` persists `verification_method` and records a `requirement_history` row when it changes (11th tracked field). Blank/undefined leaves existing; author + timestamp stamped by main.

- [ ] **Step 1: Write the failing handler tests**

In `src/main/handlers/requirements.test.ts` (beside the existing history tests):

```ts
it('updateRequirement persists verificationMethod and records history', () => {
  const r = createRequirement({ moduleId, text: 'x' })
  updateRequirement(r.id, { verificationMethod: 'Test' })
  expect(getDatabase().prepare('SELECT verification_method FROM requirements WHERE id=?').get(r.id))
    .toEqual({ verification_method: 'Test' })
  const hist = getDatabase()
    .prepare("SELECT field, old_value, new_value FROM requirement_history WHERE requirement_id=? AND field='verification_method'")
    .all(r.id)
  expect(hist).toEqual([{ field: 'verification_method', old_value: null, new_value: 'Test' }])
})

it('a no-op verificationMethod update writes zero history rows', () => {
  const r = createRequirement({ moduleId, text: 'x' })
  updateRequirement(r.id, { verificationMethod: 'Test' })
  const before = getDatabase().prepare("SELECT COUNT(*) c FROM requirement_history WHERE requirement_id=?").get(r.id) as any
  updateRequirement(r.id, { verificationMethod: 'Test' })   // same value
  const after = getDatabase().prepare("SELECT COUNT(*) c FROM requirement_history WHERE requirement_id=?").get(r.id) as any
  expect(after.c).toBe(before.c)
})

it('omitting verificationMethod leaves the existing value', () => {
  const r = createRequirement({ moduleId, text: 'x' })
  updateRequirement(r.id, { verificationMethod: 'Analysis' })
  updateRequirement(r.id, { text: 'y' })                    // method absent
  expect((getDatabase().prepare('SELECT verification_method FROM requirements WHERE id=?').get(r.id) as any).verification_method)
    .toBe('Analysis')
})
```

(Reuse the file's existing setup — `moduleId`, the in-memory DB, `getDatabase`, `createRequirement`, `updateRequirement` imports.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/handlers/requirements.test.ts`
Expected: FAIL — `verification_method` not in the UPDATE, column stays NULL, no history row.

- [ ] **Step 3: Add the field to the `next` map**

In `src/main/handlers/requirements.ts`, in the `next` object (after line 113, the `verification_status` entry):

```ts
    verification_status: input.verificationStatus ?? existing.verification_status,
    verification_method: input.verificationMethod !== undefined ? input.verificationMethod : existing.verification_method,
    heading_id:          input.headingId !== undefined ? input.headingId : existing.heading_id
```

(Note: `!== undefined ? … : existing` — not `??` — because a caller could legitimately never send it, and there's no empty-string coercion for an enum. The history loop and diff logic already handle the rest generically.)

- [ ] **Step 4: Add the column to the UPDATE statement**

Replace the UPDATE at lines 132-138 so `verification_method` is set (added after `verification_status`):

```ts
    db.prepare(`
      UPDATE requirements SET text = ?, acceptance_criteria = ?, source = ?, rationale = ?, status = ?, priority = ?, req_type = ?, entry_type = ?, verification_status = ?, verification_method = ?, heading_id = ?, updated_at = ?, updated_by = ? WHERE id = ?
    `).run(
      next.text, next.acceptance_criteria, next.source, next.rationale, next.status,
      next.priority, next.req_type, next.entry_type, next.verification_status, next.verification_method, next.heading_id,
      ts, author, id
    )
```

(The `next` map already carries `verification_method`; the history loop at lines 125-130 records it automatically because it iterates `Object.entries(next)`.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/main/handlers/requirements.test.ts`
Expected: PASS (all three new tests + the existing history tests still green).

- [ ] **Step 6: Commit**

```bash
git add src/main/handlers/requirements.ts src/main/handlers/requirements.test.ts
git commit -m "feat(reqs): persist + history-track verification_method (item 39)"
```

---

### Task 3: Drawer Select + history label

**Files:**
- Modify: `src/renderer/src/components/RequirementDetail/index.tsx` (imports; Verification block ~126-136; `FIELD_LABELS` ~211-215)
- Test: `src/renderer/src/components/RequirementDetail/index.test.tsx` (or the neighbouring drawer test file)

**Interfaces:**
- Consumes: `VERIFICATION_METHODS`, `VerificationMethod`, `Requirement.verificationMethod` (Task 1); `updateRequirement` store action.
- Produces: a "Verification Method" Select in the drawer with a blank "— none —" option; a `verification_method` entry in `FIELD_LABELS` so history renders "Verification Method".

- [ ] **Step 1: Write the failing drawer test**

In the drawer test file, add:

```tsx
it('shows a Verification Method select with a blank option and saves the choice', () => {
  const updateRequirement = vi.fn()
  renderDrawer({ verificationMethod: null }, { updateRequirement })   // use the file's existing render helper + store mock
  const select = screen.getByLabelText('Verification Method') as HTMLSelectElement
  expect([...select.options].map((o) => o.value)).toEqual(['', 'Test', 'Analysis', 'Inspection', 'Demonstration'])
  fireEvent.change(select, { target: { value: 'Test' } })
  expect(updateRequirement).toHaveBeenCalledWith(expect.any(Number), { verificationMethod: 'Test' })
})
```

(Adapt `renderDrawer`/the store mock to the file's existing pattern; the mocked `req` needs `verificationMethod`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/components/RequirementDetail`
Expected: FAIL — no element labelled "Verification Method".

- [ ] **Step 3: Add the import**

In `src/renderer/src/components/RequirementDetail/index.tsx` line 4-5, extend the type imports to include `VERIFICATION_METHODS` (value import, line 4) and `VerificationMethod` (type import, line 5):

```ts
import { REQUIREMENT_STATUSES, REQUIREMENT_PRIORITIES, REQUIREMENT_TYPES, VERIFICATION_STATUSES, VERIFICATION_METHODS } from '../../../../types'
import type { RequirementStatus, RequirementPriority, RequirementType, Requirement, VerificationStatus, VerificationMethod, ArchitectureElement } from '../../../../types'
```

- [ ] **Step 4: Add the Select**

In `src/renderer/src/components/RequirementDetail/index.tsx`, immediately after the existing Verification `</Field>` (after line 136):

```tsx
        <Field label="Verification Method">
          <Select
            aria-label="Verification Method"
            value={req.verificationMethod ?? ''}
            onChange={(e) =>
              updateRequirement(req.id, { verificationMethod: (e.target.value || undefined) as VerificationMethod | undefined })
            }
          >
            <option value="">— none —</option>
            {VERIFICATION_METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
        </Field>
```

(Blank selection sends `undefined`, which — per Task 2's `!== undefined` guard — leaves the existing value; to actively clear to null a future change could send an explicit null, out of scope here. Note this in review if clearing is wanted.)

- [ ] **Step 5: Add the history label**

In `FIELD_LABELS` (line 213-214), add `verification_method`:

```ts
  entry_type: 'Entry Type', verification_status: 'Verification', verification_method: 'Verification Method', heading_id: 'Section'
```

- [ ] **Step 6: Run test + typecheck**

Run: `npx vitest run src/renderer/src/components/RequirementDetail && npm run typecheck`
Expected: PASS, typechecks clean.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/RequirementDetail/index.tsx src/renderer/src/components/RequirementDetail/index.test.tsx
git commit -m "feat(reqs): verification method drawer select + history label (item 39)"
```

---

### Task 4: Requirements table column

**Files:**
- Modify: `src/renderer/src/components/RequirementsList/index.tsx` (`DataColKey` line 14; `DEFAULT_DATA_COLUMNS` lines 80-90; `cell()` switch lines 240-274)
- Test: `src/renderer/src/components/RequirementsList/index.test.tsx`

**Interfaces:**
- Consumes: `Requirement.verificationMethod` (Task 1).
- Produces: a `verificationMethod` data column rendering the method text or `—` when null.

- [ ] **Step 1: Write the failing table test**

In `src/renderer/src/components/RequirementsList/index.test.tsx`, add (the test fixtures already set `verificationStatus`; add `verificationMethod`):

```tsx
it('renders the verification method column (— when unset)', () => {
  renderList([
    { ...baseReq, id: 1, reqId: 'R-1', verificationMethod: 'Test' },
    { ...baseReq, id: 2, reqId: 'R-2', verificationMethod: null },
  ])
  expect(screen.getByText('Test')).toBeInTheDocument()
  expect(screen.getAllByText('—').length).toBeGreaterThan(0)
})
```

(Use the file's existing render helper + `baseReq` fixture; add `verificationMethod` to that fixture too so types are satisfied.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/components/RequirementsList/index.test.tsx`
Expected: FAIL — method text not rendered (no column).

- [ ] **Step 3: Extend `DataColKey`**

Line 14 — add `'verificationMethod'`:

```ts
type DataColKey = 'reqId' | 'entryType' | 'text' | 'ac' | 'source' | 'rationale' | 'reqType' | 'status' | 'priority' | 'verificationMethod'
```

- [ ] **Step 4: Add the default column**

In `DEFAULT_DATA_COLUMNS` (after line 89, the `priority` entry):

```ts
  { key: 'priority', label: 'Priority', width: 80 },
  { key: 'verificationMethod', label: 'Verification Method', width: 140 }
```

(Adding a key changes `DEFAULT_KEYS`, so `loadColumns` detects the mismatch against any saved layout and falls back to defaults — the new column appears for existing users, at the cost of a one-time reset of saved column widths/order. Acceptable and consistent with prior column additions.)

- [ ] **Step 5: Render the cell**

In the `cell()` switch, after the `priority` case (line 273):

```ts
      case 'priority':
        return <div className="pt-0.5"><Chip value={req.priority} /></div>
      case 'verificationMethod':
        return <span className="text-xs text-ink-muted pt-0.5 truncate">{req.verificationMethod ?? '—'}</span>
```

(Plain text like `reqType`, not a `Chip` — a method is not a status.)

- [ ] **Step 6: Run test + typecheck**

Run: `npx vitest run src/renderer/src/components/RequirementsList/index.test.tsx && npm run typecheck`
Expected: PASS, typechecks clean.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/RequirementsList/index.tsx src/renderer/src/components/RequirementsList/index.test.tsx
git commit -m "feat(reqs): verification method table column (item 39)"
```

---

### Task 5: Filter attribute

**Files:**
- Modify: `src/renderer/src/components/RequirementsList/filter.ts` (`FilterAttrKey` line 8; import line 2; `FILTERABLE_ATTRS` lines 38-48)
- Test: `src/renderer/src/components/RequirementsList/filter.test.ts`

**Interfaces:**
- Consumes: `VERIFICATION_METHODS` (Task 1), `Requirement.verificationMethod`.
- Produces: a `verificationMethod` entry in `FilterAttrKey` + `FILTERABLE_ATTRS` (enum kind).

- [ ] **Step 1: Write the failing filter test**

In `filter.test.ts`:

```ts
it('filters by verification method (enum equals)', () => {
  const rows = [
    { ...baseReq, id: 1, verificationMethod: 'Test' },
    { ...baseReq, id: 2, verificationMethod: 'Analysis' },
    { ...baseReq, id: 3, verificationMethod: null },
  ] as Requirement[]
  const out = applyFilters(rows, [{ attr: 'verificationMethod', operator: 'is', value: 'Test' }], 'AND')
  expect(out.map((r) => r.id)).toEqual([1])
})
```

(Match the exact `FilterRule` shape + operator name the file uses — check `OPERATOR_LABELS` / existing enum tests for the correct `operator` value; adapt `baseReq`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/components/RequirementsList/filter.test.ts`
Expected: FAIL — `'verificationMethod'` not an allowed `FilterAttrKey` (type error or empty result).

- [ ] **Step 3: Extend the import + key union**

Line 2 — add `VERIFICATION_METHODS`:

```ts
import { REQUIREMENT_STATUSES, REQUIREMENT_PRIORITIES, REQUIREMENT_TYPES, VERIFICATION_STATUSES, VERIFICATION_METHODS } from '../../../../types'
```

Line 8 — add `'verificationMethod'` to the `FilterAttrKey` union:

```ts
  | 'reqId' | 'entryType' | 'text' | 'acceptanceCriteria' | 'source' | 'rationale' | 'reqType' | 'status' | 'priority' | 'verificationStatus' | 'verificationMethod'
```

- [ ] **Step 4: Add the filterable attr**

After line 47 (the `verificationStatus` entry) in `FILTERABLE_ATTRS`:

```ts
  { key: 'verificationStatus', label: 'Verification', kind: 'enum', options: VERIFICATION_STATUSES, get: (r) => r.verificationStatus ?? '' },
  { key: 'verificationMethod', label: 'Verification Method', kind: 'enum', options: VERIFICATION_METHODS, get: (r) => r.verificationMethod ?? '' }
```

- [ ] **Step 5: Run test + typecheck**

Run: `npx vitest run src/renderer/src/components/RequirementsList/filter.test.ts && npm run typecheck`
Expected: PASS, typechecks clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/RequirementsList/filter.ts src/renderer/src/components/RequirementsList/filter.test.ts
git commit -m "feat(reqs): filter by verification method (item 39)"
```

---

### Task 6: CSV round-trip

**Files:**
- Modify: `src/main/export/model.ts` (`ExportRow` line 17-area; `ParsedRow` line 33-area)
- Modify: `src/main/export/csv.ts` (`CORE_COLUMNS` line 3-6; `rowsToCsv` cells line 17-19; `parseCsv` mapping line 84-area)
- Modify: `src/main/export/merge.ts` (`ENUM_SETS` line 7-12; import line 2)
- Modify: `src/main/handlers/io.ts` (`assembleRows` line 62-74; `toUpdateInput` line 103-113)
- Test: `src/main/export/csv.test.ts`, `src/main/export/merge.test.ts`

**Interfaces:**
- Consumes: `VERIFICATION_METHODS` (Task 1), `verificationMethod` on requirements.
- Produces: `verification_method` column in the CSV; `ExportRow.verificationMethod: string` and `ParsedRow.verificationMethod: string` (`''` when unset); import validates non-blank against `VERIFICATION_METHODS` (blank = leave existing / null on create).

- [ ] **Step 1: Write the failing CSV + merge tests**

In `csv.test.ts`, extend the existing round-trip test (or add one) so a row with `verificationMethod: 'Test'` survives `rowsToCsv` → `parseCsv` with `verification_method` present, and the header includes `verification_method`:

```ts
it('round-trips verification_method through CSV', () => {
  const row = { ...baseExportRow, verificationMethod: 'Test' }   // baseExportRow = the file's existing fixture
  const csv = rowsToCsv([row], [])
  expect(csv.split('\n')[0]).toContain('verification_method')
  expect(parseCsv(csv)[0].verificationMethod).toBe('Test')
})

it('empty verification_method round-trips as blank', () => {
  const csv = rowsToCsv([{ ...baseExportRow, verificationMethod: '' }], [])
  expect(parseCsv(csv)[0].verificationMethod).toBe('')
})
```

In `merge.test.ts`:

```ts
it('rejects an invalid verification_method and skips the row', () => {
  const plan = planImport([{ ...baseParsedRow, reqId: '', text: 'x', verificationMethod: 'Bogus' }], new Map())
  expect(plan.skipped).toBe(1)
  expect(plan.errors[0]).toMatch(/verification_method/)
})

it('accepts a blank verification_method (leave existing)', () => {
  const plan = planImport([{ ...baseParsedRow, reqId: '', text: 'x', verificationMethod: '' }], new Map())
  expect(plan.actions).toHaveLength(1)
  expect(plan.skipped).toBe(0)
})
```

(Add `verificationMethod` to the test files' `baseExportRow`/`baseParsedRow` fixtures.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/export/csv.test.ts src/main/export/merge.test.ts`
Expected: FAIL — `verificationMethod` not on the row types / not in the header / not validated.

- [ ] **Step 3: Add to `ExportRow` and `ParsedRow`**

In `src/main/export/model.ts`, after `verificationStatus` in each interface:

```ts
// ExportRow (after line 17):
  verificationStatus: VerificationStatus
  verificationMethod: string          // '' when unset (nullable field)
```
```ts
// ParsedRow (after line 33):
  verificationStatus: string
  verificationMethod: string
```

- [ ] **Step 4: Add the CSV column**

In `src/main/export/csv.ts`:

`CORE_COLUMNS` (after `'verification_status'`):

```ts
  'source', 'rationale', 'entry_type', 'type', 'status', 'priority', 'verification_status', 'verification_method', 'derived_from'
```

`rowsToCsv` cells (after `r.verificationStatus`):

```ts
      r.source, r.rationale, r.entryType, r.reqType, r.status, r.priority, r.verificationStatus, r.verificationMethod, r.derivedFrom.join(';'),
```

`parseCsv` mapping (after the `verificationStatus` line):

```ts
    verificationStatus: at(cells, 'verification_status'),
    verificationMethod: at(cells, 'verification_method'),
```

- [ ] **Step 5: Add to `ENUM_SETS`**

In `src/main/export/merge.ts` line 2 import, add `VERIFICATION_METHODS`; then in `ENUM_SETS` (after the `verificationStatus` entry):

```ts
  { field: 'verificationStatus', label: 'verification_status', values: VERIFICATION_STATUSES },
  { field: 'verificationMethod', label: 'verification_method', values: VERIFICATION_METHODS }
```

(The existing `planImport` logic already treats blank as "leave existing" and validates non-blank — no logic change needed, just the set entry.)

- [ ] **Step 6: Wire the handler (assemble + apply)**

In `src/main/handlers/io.ts`, in `assembleRows` (after `verificationStatus: r.verificationStatus,` ~line 74):

```ts
    verificationStatus: r.verificationStatus,
    verificationMethod: r.verificationMethod ?? '',
```

In `toUpdateInput` (after `verificationStatus:` ~line 113), and add the type import `VerificationMethod` alongside the existing enum-cast imports at the top of `io.ts`:

```ts
    verificationStatus: (row.verificationStatus || undefined) as VerificationStatus | undefined,
    verificationMethod: (row.verificationMethod || undefined) as VerificationMethod | undefined,
```

- [ ] **Step 7: Run tests + typecheck**

Run: `npx vitest run src/main/export && npm run typecheck`
Expected: PASS, typechecks clean.

- [ ] **Step 8: Commit**

```bash
git add src/main/export/model.ts src/main/export/csv.ts src/main/export/merge.ts src/main/handlers/io.ts src/main/export/csv.test.ts src/main/export/merge.test.ts
git commit -m "feat(io): verification_method round-trips through CSV import/export (item 39)"
```

---

### Task 7: ReqIF export

**Files:**
- Modify: `src/main/export/reqif.ts` (`ENUMS` line 9-12; the `enumVals` array line 43)
- Test: `src/main/export/reqif.test.ts`

**Interfaces:**
- Consumes: `VERIFICATION_METHODS` (Task 1), `ExportRow.verificationMethod` (Task 6).
- Produces: ReqIF export emits a `verificationMethod` enum datatype/attribute and, per object, its value — **only when the method is non-empty** (nullable field; skip the attribute when `''`).

- [ ] **Step 1: Write the failing ReqIF test**

In `reqif.test.ts`:

```ts
it('emits a verificationMethod enum datatype and value when set', () => {
  const xml = rowsToReqif([{ ...baseExportRow, verificationMethod: 'Test' }])   // use the file's export fn + fixture
  expect(xml).toContain('DT-ENUM-verificationMethod')
  expect(xml).toContain('AD-ENUM-verificationMethod')
  expect(xml).toContain('ENUMVAL-verificationMethod-0')   // 'Test' is index 0
})

it('omits the verificationMethod value for a row with no method', () => {
  const xml = rowsToReqif([{ ...baseExportRow, verificationMethod: '' }])
  expect(xml).not.toContain('ENUMVAL-verificationMethod--1')   // no malformed -1 index
})
```

(Match the file's actual export function name — likely `rowsToReqif` or similar; add `verificationMethod` to `baseExportRow`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/export/reqif.test.ts`
Expected: FAIL — no `verificationMethod` datatype emitted.

- [ ] **Step 3: Add to `ENUMS` + import**

In `src/main/export/reqif.ts` line 3, add `VERIFICATION_METHODS` to the type import; then in `ENUMS` (line 9-12):

```ts
const ENUMS: Record<string, readonly string[]> = {
  type: REQUIREMENT_TYPES, status: REQUIREMENT_STATUSES, priority: REQUIREMENT_PRIORITIES,
  verificationStatus: VERIFICATION_STATUSES, verificationMethod: VERIFICATION_METHODS
}
```

(The datatype + attribute-definition generators at lines 29-30 iterate `Object.keys(ENUMS)`, so the new datatype/attr-def are emitted automatically.)

- [ ] **Step 4: Emit the per-object value, guarding the nullable case**

At line 43, the `enumVals` array currently maps four always-present enums. Replace it so `verificationMethod` is only included when non-empty (an empty method would produce `indexOf('') === -1` and a malformed `ENUMVAL-…--1`):

```ts
  const enumPairs: [string, string][] = [
    ['type', r.reqType], ['status', r.status], ['priority', r.priority], ['verificationStatus', r.verificationStatus]
  ]
  if (r.verificationMethod) enumPairs.push(['verificationMethod', r.verificationMethod])
  const enumVals = enumPairs.map(([name, val]) => {
    const i = ENUMS[name].indexOf(val)
    return `<ATTRIBUTE-VALUE-ENUMERATION><DEFINITION><ATTRIBUTE-DEFINITION-ENUMERATION-REF>AD-ENUM-${name}</ATTRIBUTE-DEFINITION-ENUMERATION-REF></DEFINITION><VALUES><ENUM-VALUE-REF>ENUMVAL-${name}-${i}</ENUM-VALUE-REF></VALUES></ATTRIBUTE-VALUE-ENUMERATION>`
  })
```

(Keep the exact string template that follows in the current code; only the array construction changes to the guarded `enumPairs` form.)

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/main/export/reqif.test.ts && npm run typecheck`
Expected: PASS, typechecks clean.

- [ ] **Step 6: Full-suite gate + commit**

Run: `npx vitest run && npm run typecheck`
Expected: **493 total, 492 passed / 1 failed** (the 1 = pre-existing `App.test.tsx` "open"). No other failures.

```bash
git add src/main/export/reqif.ts src/main/export/reqif.test.ts
git commit -m "feat(io): verification_method in ReqIF export (item 39)"
```

---

## Self-Review

**Spec coverage:**
- Nullable column, no default → Task 1 (migration `TEXT`, tests assert `notnull=0`, `dflt_value=null`). ✓
- Enum values Test/Analysis/Inspection/Demonstration → Task 1 (`VERIFICATION_METHODS`). ✓
- Type + union + Requirement + UpdateRequirementInput (not Create) → Task 1. ✓
- Handler read map + write + history (11th field) → Tasks 1, 2. ✓
- Drawer Select (blank option) + history label → Task 3. ✓
- Table column ("—" when unset) → Task 4. ✓
- Filter attribute → Task 5. ✓
- CSV round-trip (incl. blank/invalid semantics) → Task 6. ✓
- ReqIF export (guarded nullable value) → Task 7. ✓

**Placeholder scan:** all code steps carry real code; test fixtures reference the files' existing helpers (`freshDb`/`baseReq`/`baseExportRow`/`baseParsedRow`) with a note to match the exact local name — no invented functions.

**Type consistency:** `verificationMethod` (TS) / `verification_method` (DB/CSV) used consistently; `VerificationMethod | null` on `Requirement`, `VerificationMethod` (optional) on input, `string` on `ExportRow`/`ParsedRow` — the null↔'' boundary is crossed only in `assembleRows` (`?? ''`) and `toUpdateInput` (`|| undefined`), matching the existing `acceptanceCriteria` treatment.

## Notes for the executor
- Several tests say "use the file's existing helper/fixture" — open the neighbouring tests first and copy their setup exactly; do not invent a new harness.
- Adding the table column resets saved column layouts once (mismatch guard) — expected, not a bug.
- The blank drawer selection sends `undefined` (leaves existing), so the drawer cannot actively clear a method to null in v1 — mirrors the Source/Rationale drawer convention; flag if "clear method" is wanted.
