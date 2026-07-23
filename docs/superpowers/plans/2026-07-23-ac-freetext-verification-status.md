# AC Free-Text + Verification Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the structured acceptance-criteria checklist with a free-text AC field plus one per-requirement Verification status, and fix the item-32 CSV/ReqIF AC round-trip as a side effect.

**Architecture:** AC returns to the existing (currently dead) `requirements.acceptance_criteria` TEXT column. A new `verification_status` column holds a single tracker per requirement (`Unverified | In Progress | Passed | Failed`). The `acceptance_criteria` child table, its handler/IPC, store slices, and drawer checklist are removed; a migration collapses any existing child items back into the free-text column and drops the table.

**Tech Stack:** Electron + better-sqlite3 (main), React + Zustand (renderer), Vitest, electron-vite, Tailwind.

## Global Constraints

- Verification values, verbatim: `['Unverified', 'In Progress', 'Passed', 'Failed']`, default `'Unverified'`.
- Enum invariants are TS-enforced, NOT schema CHECKs (matches `status`/`priority`/`req_type`). Column is `TEXT NOT NULL DEFAULT 'Unverified'`.
- Attribution is stamped by main only — never pass author fields from the renderer.
- **Main-process DB tests are dark in this environment** (better-sqlite3 is an Electron-ABI-125 binary; node vitest throws `ERR_DLOPEN_FAILED`). For backend/migration tasks: author the test, gate locally on **typecheck + Task 5 live-verify**. Renderer (jsdom) and pure export-module tests DO run — gate those on green vitest.
- Typechecks: `npm run typecheck` (runs node + web). Build: `npm run build`. Renderer/pure tests: `npx vitest run <path>`.
- Commit after each task. Work on `main` (repo convention).

---

### Task 1: Backend foundation — verification column, enum, chip (additive, nothing removed)

**Files:**
- Modify: `src/types/index.ts` (add enum + fields; AC types stay)
- Modify: `src/main/db/migrations.ts` (add column only)
- Modify: `src/main/handlers/requirements.ts` (`rowToRequirement`, `updateRequirement`)
- Modify: `src/renderer/src/components/ui/index.tsx` (`CHIP_STYLES`)
- Test: `src/main/handlers/requirements.test.ts` (author; dark locally)

**Interfaces:**
- Produces: `VERIFICATION_STATUSES`, `VerificationStatus`, `Requirement.verificationStatus`, `UpdateRequirementInput.verificationStatus`.

- [ ] **Step 1: Add the enum + type fields**

In `src/types/index.ts`, after the `REQUIREMENT_TYPES` block (before the `// Entry Type is free-form` comment) add:

```ts
export const VERIFICATION_STATUSES = ['Unverified', 'In Progress', 'Passed', 'Failed'] as const
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number]
```

In `interface Requirement`, after `entryType: string` add:

```ts
  verificationStatus: VerificationStatus
```

In `interface UpdateRequirementInput`, after `entryType?: string` add:

```ts
  verificationStatus?: VerificationStatus
```

(Leave `AC_STATUSES`, `AcStatus`, `AcceptanceCriterion`, `UpdateAcceptanceCriterionInput` untouched — removed in Task 3.)

- [ ] **Step 2: Add the DB column**

In `src/main/db/migrations.ts`, alongside the other `addColumnIfMissing(db, 'requirements', ...)` calls (near the `entry_type` line), add:

```ts
  addColumnIfMissing(db, 'requirements', 'verification_status', "TEXT NOT NULL DEFAULT 'Unverified'")
```

(Do NOT touch the child-table DDL or the item-7 split block yet.)

- [ ] **Step 3: Map + persist verification in the handler**

In `src/main/handlers/requirements.ts` `rowToRequirement`, after `entryType: row.entry_type,` add:

```ts
    verificationStatus: row.verification_status,
```

In `updateRequirement`, add `verification_status = ?` to the SET list (after `entry_type = ?`):

```ts
    UPDATE requirements SET text = ?, acceptance_criteria = ?, source = ?, rationale = ?, status = ?, priority = ?, req_type = ?, entry_type = ?, verification_status = ?, heading_id = ?, updated_at = ?, updated_by = ? WHERE id = ?
```

and the matching bound value (after the `input.entryType ?? existing.entry_type,` line):

```ts
    input.verificationStatus ?? existing.verification_status,
```

(`createRequirement` needs no change — the column's `DEFAULT 'Unverified'` applies on INSERT.)

- [ ] **Step 4: Add the In Progress chip color**

In `src/renderer/src/components/ui/index.tsx` `CHIP_STYLES`, after the `Failed:` line add:

```ts
  'In Progress': 'bg-amber-100 text-amber-800'
```

- [ ] **Step 5: Author the handler test** (dark locally — runs in CI/electron)

In `src/main/handlers/requirements.test.ts`, add:

```ts
it('defaults verification_status to Unverified and updates it', () => {
  const req = createRequirement({ moduleId, text: 'R' })
  expect(req.verificationStatus).toBe('Unverified')
  const updated = updateRequirement(req.id, { verificationStatus: 'Passed' })
  expect(updated.verificationStatus).toBe('Passed')
  // blank/omitted leaves existing
  const again = updateRequirement(req.id, { text: 'R2' })
  expect(again.verificationStatus).toBe('Passed')
})
```

(Use the file's existing module/db setup for `moduleId`; mirror a neighboring test's arrange block.)

- [ ] **Step 6: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both clean. (Main test suite stays dark — do not chase `ERR_DLOPEN_FAILED`.)

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/main/db/migrations.ts src/main/handlers/requirements.ts src/main/handlers/requirements.test.ts src/renderer/src/components/ui/index.tsx
git commit -m "feat(requirements): add verification_status column + In Progress chip"
```

---

### Task 2: Drawer + table + store swap to free-text AC and Verification (stop using AC child IPC)

**Files:**
- Modify: `src/renderer/src/store/index.ts` (remove AC slices/loaders; drop `listByModule` call)
- Delete: `src/renderer/src/store/acSummary.ts`
- Modify: `src/renderer/src/components/RequirementDetail/index.tsx` (checklist → Textarea + Verification select)
- Modify: `src/renderer/src/components/RequirementsList/index.tsx` (ac cell → free text)
- Modify: `src/renderer/src/components/RequirementsList/filter.ts` (add verificationStatus attr)
- Delete: `src/renderer/src/store/acceptanceCriteria.test.ts`, `src/renderer/src/store/acSummary.test.ts`, `src/renderer/src/components/RequirementDetail/acceptance.test.tsx`
- Modify: renderer tests that mock `acItems`/`acSummary`/AC store fns (see Step 8)

**Interfaces:**
- Consumes: `Requirement.verificationStatus`, `UpdateRequirementInput.verificationStatus` (Task 1).
- Produces: store no longer exposes `acItems`/`acSummary`/`loadAcItems`/`addAcItem`/`updateAcItem`/`removeAcItem`/`moveAcItem`.

- [ ] **Step 1: Simplify the store**

In `src/renderer/src/store/index.ts`:
- Remove the import line `  AcceptanceCriterion, UpdateAcceptanceCriterionInput,` from the types import block.
- Remove `import { summarize, type AcSummaryEntry } from './acSummary'`.
- Remove the state fields `acItems: AcceptanceCriterion[]` and `acSummary: Record<number, AcSummaryEntry>` from the interface.
- Remove the action signatures `loadAcItems`, `addAcItem`, `updateAcItem`, `removeAcItem`, `moveAcItem`.
- In the initial state, change `acItems: [], acSummary: {}, showDeleted: false, ...` → drop `acItems: [], acSummary: {},`.
- In `selectModule`'s `set({ selectedModuleId: id, ... })`, remove `acItems: [], acSummary: {},`.
- In the module-load `Promise.all`, drop `window.api.acceptanceCriteria.listByModule(id)` and the `moduleAcItems` binding; change the `set` to `set({ requirements, headings })`.
- In `selectRequirement`, change `set({ selectedRequirementId: id, customFields: [], acItems: [] })` → `set({ selectedRequirementId: id, customFields: [] })`.
- Delete the `loadAcItems`/`addAcItem`/`updateAcItem`/`removeAcItem`/`moveAcItem` action bodies.
- Delete the `refreshAc` helper function at the bottom of the file.

- [ ] **Step 2: Delete the summary helper + its test**

```bash
git rm src/renderer/src/store/acSummary.ts src/renderer/src/store/acSummary.test.ts src/renderer/src/store/acceptanceCriteria.test.ts
```

- [ ] **Step 3: Drawer — Verification select + AC textarea**

In `src/renderer/src/components/RequirementDetail/index.tsx`:
- In the `useStore()` destructure, remove `acItems, loadAcItems, addAcItem, updateAcItem, removeAcItem, moveAcItem`.
- Imports: from `../ui` drop `Chip` if now unused; from types drop `AcStatus`, `AcceptanceCriterion` if imported; add `VERIFICATION_STATUSES, VerificationStatus`. Ensure `AC_STATUSES` import is removed.
- Remove the `localAcTexts` state, `newAcRef`, `focusNewAc`, the two AC sync `useEffect`s, and `handleAddCriterion`.
- Add local AC state near `const [rationale, setRationale] = useState('')`:

```tsx
  const [ac, setAc] = useState('')
```

- In the `req?.id` effect, add `setAc(req.acceptanceCriteria ?? '')` and remove `setLocalAcTexts({})` / `focusNewAc.current = false` / `loadAcItems(req.id)`.
- Update `save()` to include AC:

```tsx
  function save(): void {
    updateRequirement(req!.id, {
      text,
      acceptanceCriteria: ac || undefined,
      source: source || undefined,
      rationale: rationale || undefined
    })
  }
```

- Add a Verification `Field` immediately after the closing `</div>` of the `grid grid-cols-3` properties block (before the `Section` Field):

```tsx
        <Field label="Verification">
          <Select
            aria-label="Verification"
            value={req.verificationStatus}
            onChange={(e) => updateRequirement(req.id, { verificationStatus: e.target.value as VerificationStatus })}
          >
            {VERIFICATION_STATUSES.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </Select>
        </Field>
```

- Replace the entire `<div data-testid="ac-section" ...> ... </div>` block with:

```tsx
        <Field label="Acceptance Criteria">
          <Textarea value={ac} onChange={(e) => setAc(e.target.value)} onBlur={save} rows={4} />
        </Field>
```

- [ ] **Step 4: Table — ac cell renders free text**

In `src/renderer/src/components/RequirementsList/index.tsx`, replace the `case 'ac':` return block (the `acSummary[req.id]` badge) with an inline-editable cell mirroring `source`/`rationale`:

```tsx
      case 'ac':
        return (
          <EditableCell key={req.acceptanceCriteria ?? ''} value={req.acceptanceCriteria ?? ''} multiline
            onSave={(v) => updateRequirement(req.id, { acceptanceCriteria: v })} />
        )
```

Remove `acSummary` from the `useStore` destructure in this file (search for `acSummary,`).

- [ ] **Step 5: Filter — verificationStatus attr**

In `src/renderer/src/components/RequirementsList/filter.ts`:
- Add `'verificationStatus'` to the `FilterAttrKey` union.
- Import `VERIFICATION_STATUSES` alongside the other enum imports.
- Add to `FILTERABLE_ATTRS` after the `priority` entry:

```ts
  { key: 'verificationStatus', label: 'Verification', kind: 'enum', options: VERIFICATION_STATUSES, get: (r) => r.verificationStatus ?? '' }
```

- [ ] **Step 6: Delete the drawer AC test**

```bash
git rm src/renderer/src/components/RequirementDetail/acceptance.test.tsx
```

- [ ] **Step 7: Update remaining renderer test mocks**

Grep for stale references and fix each so mocks/store shapes compile:

Run: `grep -rln "acItems\|acSummary\|loadAcItems\|addAcItem\|updateAcItem\|removeAcItem\|moveAcItem\|acceptanceCriteria\.\(list\|create\|move\)" src/renderer`

For each hit in a `*.test.tsx`/`*.test.ts` (e.g. `App.test.tsx`, `RequirementDetail/index.test.tsx`, `RequirementsList/index.test.tsx`, `store/index.test.ts`, `Dashboard/*`, `GlobalSearch`, `ElementPanel`, `TraceabilityMatrix`): remove the removed store keys from any `baseStore`/mock object and delete assertions that exercise the checklist. Add `verificationStatus: 'Unverified'` to any inline `Requirement` fixture that now fails typecheck.

- [ ] **Step 8: Add a Verification drawer test**

In `src/renderer/src/components/RequirementDetail/index.test.tsx` (or a sibling), add:

```tsx
it('changing Verification calls updateRequirement', () => {
  const updateRequirement = vi.fn()
  // render with a selected requirement whose verificationStatus is 'Unverified' (use file's helper)
  // ...
  fireEvent.change(screen.getByLabelText('Verification'), { target: { value: 'Passed' } })
  expect(updateRequirement).toHaveBeenCalledWith(expect.any(Number), { verificationStatus: 'Passed' })
})
```

Mirror the existing `Status`/`Priority` select test in the same file for the render/mock scaffold.

- [ ] **Step 9: Run renderer tests + typecheck**

Run: `npx vitest run src/renderer && npm run typecheck`
Expected: green; typecheck clean. (Backend AC handler/IPC still exist but are now uncalled — that's fine until Task 3.)

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(requirements): free-text AC field + Verification select; drop checklist UI/store"
```

---

### Task 3: Remove dead AC backend + collapse migration + drop AC types

**Files:**
- Delete: `src/main/handlers/acceptanceCriteria.ts`
- Modify: `src/main/index.ts` (remove import + registration)
- Modify: `src/preload/index.ts` (remove `acceptanceCriteria` bridge + type import)
- Modify: `src/types/api.d.ts` (remove `acceptanceCriteria` block + type import)
- Modify: `src/types/index.ts` (remove `AC_STATUSES`/`AcStatus`/`AcceptanceCriterion`/`UpdateAcceptanceCriterionInput`)
- Modify: `src/main/db/migrations.ts` (remove child-table DDL + item-7 split; add collapse+drop)

**Interfaces:**
- Consumes: nothing new. This task only deletes now-unused surface.

- [ ] **Step 1: Delete the handler + registration**

```bash
git rm src/main/handlers/acceptanceCriteria.ts
```
In `src/main/index.ts` remove `import { registerAcceptanceCriteriaHandlers } from './handlers/acceptanceCriteria'` and the `registerAcceptanceCriteriaHandlers()` call.

- [ ] **Step 2: Remove preload + api bridge**

In `src/preload/index.ts` remove the `acceptanceCriteria: { ... }` object and the `AcceptanceCriterion, UpdateAcceptanceCriterionInput,` from its types import.
In `src/types/api.d.ts` remove the `acceptanceCriteria: { ... }` block and the `AcceptanceCriterion, UpdateAcceptanceCriterionInput,` import.

- [ ] **Step 3: Remove the AC types**

In `src/types/index.ts` delete `AC_STATUSES`, `AcStatus`, `AcceptanceCriterion`, and `UpdateAcceptanceCriterionInput`.

- [ ] **Step 4: Replace the migration**

In `src/main/db/migrations.ts`:
- Delete the `CREATE TABLE IF NOT EXISTS acceptance_criteria (...)` block from the DDL.
- Replace the entire item-7 "split legacy free-text acceptance_criteria into checklist items" block with:

```ts
  // Item-7 reversal: acceptance criteria return to a free-text column on requirements.
  // Collapse any existing child-table items back into requirements.acceptance_criteria
  // (joined by newline, ordered by position), leave verification_status at its default,
  // then drop the table. Guarded on the table existing → idempotent: once dropped this is a
  // no-op, and fresh installs never create it. Requirement text/IDs are untouched.
  const acTableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='acceptance_criteria'")
    .get()
  if (acTableExists) {
    const withItems = db
      .prepare('SELECT DISTINCT requirement_id FROM acceptance_criteria')
      .all() as { requirement_id: number }[]
    const getItems = db.prepare('SELECT text FROM acceptance_criteria WHERE requirement_id = ? ORDER BY position, id')
    const setAc = db.prepare('UPDATE requirements SET acceptance_criteria = ? WHERE id = ?')
    db.transaction(() => {
      for (const { requirement_id } of withItems) {
        const joined = (getItems.all(requirement_id) as { text: string }[]).map((r) => r.text).join('\n')
        setAc.run(joined, requirement_id)
      }
      db.exec('DROP TABLE acceptance_criteria')
    })()
  }
```

- [ ] **Step 5: Author a migration test** (dark locally — runs in CI/electron)

In `src/main/db/migrations.test.ts` (or the existing `folderSplit.test.ts` sibling), add a test that: creates a DB with the old `acceptance_criteria` child table + two items on a requirement, runs `runMigrations`, then asserts the requirement's `acceptance_criteria` column equals the two texts joined by `\n`, `verification_status = 'Unverified'`, and `SELECT name FROM sqlite_master WHERE name='acceptance_criteria'` returns nothing. Mirror `folderSplit.test.ts`'s DB-bootstrap pattern.

- [ ] **Step 6: Typecheck + build + renderer tests**

Run: `npm run typecheck && npm run build && npx vitest run src/renderer`
Expected: all clean/green. No remaining references to AC child types.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove AC child table/handler/IPC; migrate AC back to requirements column"
```

---

### Task 4: Item 32 export/import — round-trip AC + verification_status

**Files:**
- Modify: `src/main/export/model.ts` (`ExportRow`, `ParsedRow`)
- Modify: `src/main/export/csv.ts` (`CORE_COLUMNS`, writer, parser)
- Modify: `src/main/export/reqif.ts` (verification enum)
- Modify: `src/main/export/merge.ts` (`ENUM_SETS`)
- Modify: `src/main/handlers/io.ts` (`assembleRows`, `toUpdateInput`)
- Test: `src/main/export/csv.test.ts`, `src/main/export/merge.test.ts`, `src/main/export/reqif.test.ts` (these run under node vitest — pure modules)

**Interfaces:**
- Consumes: `VERIFICATION_STATUSES` (Task 1).
- Produces: `verification_status` CSV column; AC round-trips via the live `acceptance_criteria` column.

- [ ] **Step 1: Write failing round-trip tests**

In `src/main/export/csv.test.ts` add:

```ts
it('round-trips verification_status', () => {
  const row = { reqId: 'R-1', module: '', section: '', text: 'T', acceptanceCriteria: 'AC line 1\nAC line 2',
    source: '', rationale: '', entryType: 'Requirement', reqType: 'Functional', status: 'Draft',
    priority: 'Medium', verificationStatus: 'Passed', derivedFrom: [], custom: {} }
  const csv = rowsToCsv([row as any], [])
  expect(csv.split('\n')[0]).toContain('verification_status')
  const parsed = parseCsv(csv)
  expect(parsed[0].verificationStatus).toBe('Passed')
  expect(parsed[0].acceptanceCriteria).toBe('AC line 1\nAC line 2')
})
```

In `src/main/export/merge.test.ts` add:

```ts
it('skips a row with invalid verification_status', () => {
  const rows = [{ reqId: '', section: '', text: 'T', acceptanceCriteria: '', source: '', rationale: '',
    entryType: '', reqType: 'Functional', status: 'Draft', priority: 'Medium',
    verificationStatus: 'Bogus', derivedFrom: [], custom: {} }]
  const plan = planImport(rows as any, new Map())
  expect(plan.skipped).toBe(1)
  expect(plan.errors[0]).toContain('verification_status')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/export/csv.test.ts src/main/export/merge.test.ts`
Expected: FAIL (property/column missing).

- [ ] **Step 3: Add the field to the model**

In `src/main/export/model.ts`: add `verificationStatus: VerificationStatus` to `ExportRow` (import `VerificationStatus`), and `verificationStatus: string` to `ParsedRow`.

- [ ] **Step 4: Wire CSV**

In `src/main/export/csv.ts`:
- `CORE_COLUMNS`: insert `'verification_status'` after `'priority'`.
- In `rowsToCsv` cells array, after `r.priority,` add `r.verificationStatus,`.
- In `parseCsv` returned object, after `priority: at(cells, 'priority'),` add `verificationStatus: at(cells, 'verification_status'),`.

- [ ] **Step 5: Wire merge validation**

In `src/main/export/merge.ts`, import `VERIFICATION_STATUSES` and add to `ENUM_SETS`:

```ts
  { field: 'verificationStatus', label: 'verification_status', values: VERIFICATION_STATUSES }
```

- [ ] **Step 6: Wire reqif**

In `src/main/export/reqif.ts`: import `VERIFICATION_STATUSES`; add `verificationStatus: VERIFICATION_STATUSES` to the `ENUMS` map; add `${enumDatatype('verificationStatus', VERIFICATION_STATUSES)}` to the `<DATATYPES>` block; add `['verificationStatus', r.verificationStatus]` to the `enumVals` array in `specObject`.

- [ ] **Step 7: Wire io.ts**

In `src/main/handlers/io.ts`:
- Import `VerificationStatus` in the types import.
- In `assembleRows`'s `ExportRow` object, after `priority: r.priority,` add `verificationStatus: r.verificationStatus,`.
- In `toUpdateInput`, after the `reqType:` line add `verificationStatus: (row.verificationStatus || undefined) as VerificationStatus | undefined,`.

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/main/export && npm run typecheck`
Expected: PASS; typecheck clean. Update any existing export test whose header/column-count assertion now includes `verification_status`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(export): round-trip acceptance_criteria + verification_status through CSV/ReqIF"
```

---

### Task 5: Live-verify + docs

**Files:**
- Modify: `handoff.md`, `.superpowers/sdd/progress.md`

- [ ] **Step 1: Full gate**

Run: `npm run typecheck && npm run build && npx vitest run src/renderer src/main/export`
Expected: typechecks clean, build clean (3 targets), renderer + pure-export tests green.

- [ ] **Step 2: Migration live-verify** (real DBs)

Launch the built app via the driver (`.claude/skills/run-app/driver.mjs`). Open `Satellite Demo` (had 3 AC items across 2 reqs) and `SmokeTest` (1 item). Confirm via `sqlite3` on each `.reqarch`:
- `SELECT name FROM sqlite_master WHERE name='acceptance_criteria'` → empty (table dropped).
- affected requirements' `acceptance_criteria` column holds the joined text; `verification_status='Unverified'`.
- requirement `req_id`s unchanged; relaunch → still no table, no re-collapse.

- [ ] **Step 3: Drawer + table live-verify**

In `Satellite Demo`: edit a requirement's AC textarea → persists on blur + shows in the table's AC cell (truncated). Change Verification select to each value → persists; the drawer shows the right chip vocabulary. Verify the requirements-table AC column shows free text (no `passed/total` badge).

- [ ] **Step 4: Item 32 round-trip live-verify** (dialog stub)

Stub the save/open dialogs in main via the driver's `maineval` (`electron.dialog.showSaveDialog`/`showOpenDialog` → fixed scratch path — osascript keystrokes are blocked by macOS Accessibility, error 1002). Export a module to CSV; confirm `acceptance_criteria` and `verification_status` columns are populated (including a requirement that has AC). Edit a row's AC + verification, re-import; confirm both round-trip and update-not-duplicate. Import a row with `verification_status=Bogus`; confirm skipped + `lastError` banner. Clean up any rows added to a real project afterward (hard-delete via sqlite; reset the module `next_counter`).

- [ ] **Step 5: Update docs**

Add a COMPLETE section to `handoff.md` and a ledger section to `.superpowers/sdd/progress.md` summarizing the change, the migration, the item-32 fix, and live-verify results. Note the superseded item-7 checklist.

- [ ] **Step 6: Commit**

```bash
git add handoff.md .superpowers/sdd/progress.md
git commit -m "docs: AC free-text + verification status complete; item-32 AC round-trip fixed"
```

---

## Self-Review

- **Spec coverage:** data model (T1), enum+chip (T1), removed surface (T2 UI/store, T3 backend/types), drawer+table UI (T2), migration collapse/drop (T3), export/import AC+verification (T4), filter (T2), verification plan (T5). All spec sections mapped.
- **Placeholders:** test scaffolds in T2/T5 reference "the file's existing helper" — acceptable (the render harness varies per test file and must be reused, not reinvented); all code edits are concrete.
- **Type consistency:** `verificationStatus` / `verification_status` / `VerificationStatus` / `VERIFICATION_STATUSES` used consistently; `updateRequirement({ verificationStatus })` matches `UpdateRequirementInput`; `ExportRow.verificationStatus: VerificationStatus`, `ParsedRow.verificationStatus: string`, `ENUM_SETS.field: 'verificationStatus'` all align.
- **Green-between-tasks:** T1 additive; T2 removes UI/store usage (dead backend still compiles); T3 removes dead backend + types (no remaining references); T4 additive to export. Each boundary compiles.
