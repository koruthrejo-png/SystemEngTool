# Requirement Metadata & Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Status, Priority, and Type metadata to requirements — editable in the detail drawer, shown as colored chips in the table, filterable from a new filter toolbar (design-spec backlog items 1, 2, 3, 6).

**Architecture:** Three new TEXT columns on the `requirements` table (added via the existing `addColumnIfMissing` idempotent-migration pattern), flowing through the existing `requirements:update` IPC — **no new IPC channels**. Filtering is client-side over the already-loaded requirements array, with filter state in the Zustand store. UI follows the Industrial Precision token system; chips are a new shared primitive.

**Tech Stack:** Electron 31 + better-sqlite3, Zustand, React 18, Tailwind (semantic tokens in `tailwind.config.js`), Vitest + Testing Library.

## Global Constraints

- **PATH:** `npm`/`node` are not on the shell PATH. Prefix every shell command with:
  `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"`
- **No new dependencies.**
- **Colors/typography:** use only the semantic tokens in `tailwind.config.js` (`navy`, `action`, `workspace`, `line`, `ink`, `error` families). No new hex values.
- **Commit to `main`** after each task (project convention — no feature branches).
- **Pre-existing test failures:** all `src/main/**` tests fail under vitest with `ERR_DLOPEN_FAILED` because the better-sqlite3 binary is built for Electron ABI 125 while local node is ABI 127. **This is expected — do not rebuild the binary, do not chase these failures.** Main-process tests in this plan are written for suite coherence (they'll pass in an ABI-matched environment); functional verification of DB changes happens via typecheck + the running app (Task 6). Renderer tests (`src/renderer/**`, jsdom) run normally and MUST pass.
- **Enum values (exact strings, used everywhere):**
  - Status: `Draft` (default) | `Review` | `Approved` | `Rejected`
  - Priority: `High` | `Medium` (default) | `Low`
  - Type: `Functional` (default) | `Non-Functional` | `Interface` | `Performance` | `Constraint`

## Design decisions (locked in — do not re-litigate)

- DB column names: `status`, `priority`, `req_type` (TEXT NOT NULL with defaults). TS field for `req_type` is `reqType` (matches the `req_id` → `reqId` convention).
- Creation always uses the DB defaults; `CreateRequirementInput` is NOT extended (YAGNI). Edits go through `UpdateRequirementInput`.
- Filter toolbar uses compact native `Select` dropdowns (single-select with an "All" option) instead of the mockup's chip-dropdowns — consistent with the ratified-deviations pattern (native controls over custom chrome). "More Filters" from the mockup is realized as the Type filter.
- Filters reset to "All" when switching modules (consistent with the existing `showDeleted` reset in `selectModule`).
- In the table, Status and Priority render as colored chips; Type renders as plain text (matches mockup).
- Chip colors translate the Stitch M3 palette to Industrial Precision tokens:
  Approved → `bg-action-tint text-action-hover`; Draft/Medium → `bg-workspace text-ink-muted border border-line`; Review → `bg-navy/10 text-navy`; Rejected/High → `bg-error/10 text-error`; Low → `bg-workspace text-ink-faint border border-line`.
- Deferred minors folded in: toolbar-behavior tests for RequirementsList (Task 4); `vi.clearAllMocks()` in RequirementDetail's `beforeEach` (Task 5).

---

### Task 1: Schema, types, and requirements handler

**Files:**
- Modify: `src/main/db/migrations.ts` (add 3 `addColumnIfMissing` calls at the end of `runMigrations`)
- Modify: `src/types/index.ts` (enum consts/types; extend `Requirement`, `UpdateRequirementInput`)
- Modify: `src/main/handlers/requirements.ts` (`rowToRequirement`, `updateRequirement`)
- Test: `src/main/db/migrations.test.ts`, `src/main/handlers/requirements.test.ts` (append tests)

**Interfaces:**
- Consumes: existing `addColumnIfMissing`, `rowToRequirement`, `updateRequirement` patterns.
- Produces (later tasks rely on these exact names):
  - `REQUIREMENT_STATUSES`, `REQUIREMENT_PRIORITIES`, `REQUIREMENT_TYPES` — `readonly string[]` consts exported from `src/types/index.ts`
  - Types `RequirementStatus`, `RequirementPriority`, `RequirementType`
  - `Requirement` gains `status: RequirementStatus; priority: RequirementPriority; reqType: RequirementType`
  - `UpdateRequirementInput` gains the same three as optionals
  - No preload/api.d.ts changes needed — `requirements.update(id, input)` already carries `UpdateRequirementInput`.

- [ ] **Step 1: Write the (currently ABI-blocked) tests**

Append inside the `describe('runMigrations', ...)` block in `src/main/db/migrations.test.ts`:

```ts
  it('adds metadata columns to requirements table', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    db = new Database(join(tempDir, 'test.reqarch'))
    runMigrations(db)

    const cols = (db
      .prepare("SELECT name FROM pragma_table_info('requirements')")
      .all() as any[]).map((r) => r.name)

    expect(cols).toContain('status')
    expect(cols).toContain('priority')
    expect(cols).toContain('req_type')
  })
```

Append inside the `describe('requirements handler', ...)` block in `src/main/handlers/requirements.test.ts`:

```ts
  it('new requirements default to Draft / Medium / Functional', () => {
    const req = createRequirement({ moduleId, text: 'X' })
    expect(req.status).toBe('Draft')
    expect(req.priority).toBe('Medium')
    expect(req.reqType).toBe('Functional')
  })

  it('updateRequirement changes status, priority, and type without touching other fields', () => {
    const req = createRequirement({ moduleId, text: 'Keep this text' })
    const updated = updateRequirement(req.id, { status: 'Approved', priority: 'High', reqType: 'Interface' })
    expect(updated.status).toBe('Approved')
    expect(updated.priority).toBe('High')
    expect(updated.reqType).toBe('Interface')
    expect(updated.text).toBe('Keep this text')
  })
```

- [ ] **Step 2: Run the tests — confirm they fail for the expected (ABI) reason**

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && ./node_modules/.bin/vitest run src/main/db/migrations.test.ts src/main/handlers/requirements.test.ts`
Expected: FAIL with `ERR_DLOPEN_FAILED` / `NODE_MODULE_VERSION 125` (pre-existing ABI mismatch — see Global Constraints). Also expect a TypeScript-visible gap: `req.status` etc. don't exist yet — Step 5's typecheck is the real red/green gate for this task.

- [ ] **Step 3: Add migration columns**

At the end of `runMigrations` in `src/main/db/migrations.ts`, after the existing `conn_next_counter` line, add:

```ts
  addColumnIfMissing(db, 'requirements', 'status',   "TEXT NOT NULL DEFAULT 'Draft'")
  addColumnIfMissing(db, 'requirements', 'priority', "TEXT NOT NULL DEFAULT 'Medium'")
  addColumnIfMissing(db, 'requirements', 'req_type', "TEXT NOT NULL DEFAULT 'Functional'")
```

- [ ] **Step 4: Add types**

In `src/types/index.ts`, immediately above `export interface Requirement`:

```ts
export const REQUIREMENT_STATUSES = ['Draft', 'Review', 'Approved', 'Rejected'] as const
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number]

export const REQUIREMENT_PRIORITIES = ['High', 'Medium', 'Low'] as const
export type RequirementPriority = (typeof REQUIREMENT_PRIORITIES)[number]

export const REQUIREMENT_TYPES = ['Functional', 'Non-Functional', 'Interface', 'Performance', 'Constraint'] as const
export type RequirementType = (typeof REQUIREMENT_TYPES)[number]
```

In `Requirement`, after `rationale: string | null`:

```ts
  status: RequirementStatus
  priority: RequirementPriority
  reqType: RequirementType
```

In `UpdateRequirementInput`, after `rationale?: string`:

```ts
  status?: RequirementStatus
  priority?: RequirementPriority
  reqType?: RequirementType
```

- [ ] **Step 5: Update the handler**

In `src/main/handlers/requirements.ts`, `rowToRequirement` — add after the `source`/`rationale` line:

```ts
    status: row.status, priority: row.priority, reqType: row.req_type,
```

Replace the `updateRequirement` UPDATE statement and `.run(...)` args with:

```ts
  db.prepare(`
    UPDATE requirements SET text = ?, acceptance_criteria = ?, source = ?, rationale = ?, status = ?, priority = ?, req_type = ?, updated_at = ? WHERE id = ?
  `).run(
    input.text ?? existing.text,
    input.acceptanceCriteria !== undefined ? (input.acceptanceCriteria || null) : existing.acceptance_criteria,
    input.source !== undefined ? (input.source || null) : existing.source,
    input.rationale !== undefined ? (input.rationale || null) : existing.rationale,
    input.status ?? existing.status,
    input.priority ?? existing.priority,
    input.reqType ?? existing.req_type,
    now(), id
  )
```

- [ ] **Step 6: Typecheck (the real gate for this task)**

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && npm run typecheck`
Expected: PASS (both node and web configs, exit 0).

- [ ] **Step 7: Commit**

```bash
git add src/main/db/migrations.ts src/main/db/migrations.test.ts src/types/index.ts src/main/handlers/requirements.ts src/main/handlers/requirements.test.ts
git commit -m "feat(db): requirement status/priority/type columns + handler support"
```

---

### Task 2: Store filter state

**Files:**
- Modify: `src/renderer/src/store/index.ts`
- Test: `src/renderer/src/store/index.test.ts` (append tests)

**Interfaces:**
- Consumes: `RequirementStatus`, `RequirementPriority`, `RequirementType` from `../../../types` (Task 1).
- Produces (Task 4 relies on these exact names): store state `statusFilter: RequirementStatus | 'All'`, `priorityFilter: RequirementPriority | 'All'`, `typeFilter: RequirementType | 'All'` (all initialized `'All'`) and actions `setStatusFilter`, `setPriorityFilter`, `setTypeFilter` (each `(f) => void`). `selectModule` resets all three to `'All'`.

- [ ] **Step 1: Write the failing tests**

Append inside the `describe('store', ...)` block in `src/renderer/src/store/index.test.ts`:

```ts
  it('filter setters update filter state', () => {
    useStore.getState().setStatusFilter('Approved')
    useStore.getState().setPriorityFilter('High')
    useStore.getState().setTypeFilter('Functional')
    expect(useStore.getState().statusFilter).toBe('Approved')
    expect(useStore.getState().priorityFilter).toBe('High')
    expect(useStore.getState().typeFilter).toBe('Functional')
  })

  it('selectModule resets filters to All', async () => {
    useStore.setState({ statusFilter: 'Approved', priorityFilter: 'High', typeFilter: 'Functional' })
    await useStore.getState().selectModule(1)
    expect(useStore.getState().statusFilter).toBe('All')
    expect(useStore.getState().priorityFilter).toBe('All')
    expect(useStore.getState().typeFilter).toBe('All')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && ./node_modules/.bin/vitest run src/renderer/src/store/index.test.ts`
Expected: the two new tests FAIL (`setStatusFilter is not a function`); pre-existing tests in the file keep their current status.

- [ ] **Step 3: Implement**

In `src/renderer/src/store/index.ts`:

Add to the type import from `'../../../types'`: `RequirementStatus, RequirementPriority, RequirementType`.

In `interface Store`, after `deletedRequirements: Requirement[]`:

```ts
  statusFilter: RequirementStatus | 'All'
  priorityFilter: RequirementPriority | 'All'
  typeFilter: RequirementType | 'All'
```

In the actions section, after `setShowDeleted`:

```ts
  setStatusFilter: (f: RequirementStatus | 'All') => void
  setPriorityFilter: (f: RequirementPriority | 'All') => void
  setTypeFilter: (f: RequirementType | 'All') => void
```

In the initial state (after `customFields: [], showDeleted: false, deletedRequirements: [],`):

```ts
  statusFilter: 'All', priorityFilter: 'All', typeFilter: 'All',
```

Replace the first `set(...)` inside `selectModule` with:

```ts
    set({ selectedModuleId: id, requirements: [], selectedRequirementId: null, showDeleted: false, deletedRequirements: [], customFields: [], statusFilter: 'All', priorityFilter: 'All', typeFilter: 'All' })
```

After the `setShowDeleted` action, add:

```ts
  setStatusFilter: (f) => set({ statusFilter: f }),
  setPriorityFilter: (f) => set({ priorityFilter: f }),
  setTypeFilter: (f) => set({ typeFilter: f }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && ./node_modules/.bin/vitest run src/renderer/src/store/index.test.ts && npm run typecheck:web`
Expected: both new tests PASS; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/store/index.ts src/renderer/src/store/index.test.ts
git commit -m "feat(store): status/priority/type filter state"
```

---

### Task 3: Chip primitive

**Files:**
- Modify: `src/renderer/src/components/ui/index.tsx` (append `Chip`)
- Test: `src/renderer/src/components/ui/index.test.tsx` (append tests; add `Chip` to the existing import from `'./index'`)

**Interfaces:**
- Produces (Task 4 relies on this): `Chip({ value, className? })` — renders `value` as a pill; colors keyed by value string with a neutral fallback.

- [ ] **Step 1: Write the failing tests**

Append to `src/renderer/src/components/ui/index.test.tsx` (add `Chip` to the import from `'./index'`; reuse the file's existing render/screen imports):

```tsx
describe('Chip', () => {
  it('renders the value text', () => {
    render(<Chip value="Approved" />)
    expect(screen.getByText('Approved')).toBeInTheDocument()
  })

  it('applies error styling for Rejected and High', () => {
    render(<Chip value="Rejected" />)
    expect(screen.getByText('Rejected').className).toContain('text-error')
  })

  it('falls back to neutral styling for unknown values', () => {
    render(<Chip value="Whatever" />)
    expect(screen.getByText('Whatever').className).toContain('text-ink-muted')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && ./node_modules/.bin/vitest run src/renderer/src/components/ui/index.test.tsx`
Expected: new tests FAIL (`Chip` is not exported).

- [ ] **Step 3: Implement**

Append to `src/renderer/src/components/ui/index.tsx`:

```tsx
const CHIP_STYLES: Record<string, string> = {
  Approved: 'bg-action-tint text-action-hover',
  Draft: 'bg-workspace text-ink-muted border border-line',
  Review: 'bg-navy/10 text-navy',
  Rejected: 'bg-error/10 text-error',
  High: 'bg-error/10 text-error',
  Medium: 'bg-workspace text-ink-muted border border-line',
  Low: 'bg-workspace text-ink-faint border border-line'
}

export function Chip({ value, className = '' }: { value: string; className?: string }): JSX.Element {
  return (
    <span
      className={`inline-block w-fit px-2 py-0.5 rounded-full text-[11px] font-bold leading-4 whitespace-nowrap ${
        CHIP_STYLES[value] ?? 'bg-workspace text-ink-muted border border-line'
      } ${className}`}
    >
      {value}
    </span>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && ./node_modules/.bin/vitest run src/renderer/src/components/ui/index.test.tsx`
Expected: PASS (all tests in file).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ui/index.tsx src/renderer/src/components/ui/index.test.tsx
git commit -m "feat(ui): Chip primitive with status/priority color map"
```

---

### Task 4: Requirements table — metadata columns + filter toolbar

**Files:**
- Modify: `src/renderer/src/components/RequirementsList/index.tsx`
- Test: `src/renderer/src/components/RequirementsList/index.test.tsx` (full rewrite — folds in the deferred toolbar-behavior tests)

**Interfaces:**
- Consumes: store filter state/actions (Task 2), `Chip` (Task 3), `REQUIREMENT_STATUSES` / `REQUIREMENT_PRIORITIES` / `REQUIREMENT_TYPES` from `'../../../../types'` (Task 1), existing `Select`/`SectionLabel`/`Button` primitives.
- Produces: filter selects reachable via `aria-label="Filter by status"` / `"Filter by priority"` / `"Filter by type"` (Task 6 driver checks use these).

- [ ] **Step 1: Rewrite the test file (failing first)**

Replace the entire contents of `src/renderer/src/components/RequirementsList/index.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RequirementsList from './index'

const storeState: any = {}

vi.mock('../../store', () => ({
  useStore: () => storeState
}))

const req1 = {
  id: 1, moduleId: 1, reqId: 'SRS-0001', text: 'The system shall respond within 2s',
  acceptanceCriteria: null, source: null, rationale: null,
  status: 'Approved', priority: 'High', reqType: 'Functional',
  position: 0, deletedAt: null, createdAt: '', updatedAt: ''
}
const req2 = {
  id: 2, moduleId: 1, reqId: 'SRS-0002', text: 'The system shall log all faults',
  acceptanceCriteria: null, source: null, rationale: null,
  status: 'Draft', priority: 'Low', reqType: 'Non-Functional',
  position: 1, deletedAt: null, createdAt: '', updatedAt: ''
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(storeState, {
    selectedModuleId: 1,
    modules: [{ id: 1, projectId: 1, parentId: null, name: 'SRS', idPrefix: 'SRS', idPadding: 4, nextCounter: 3, position: 0, deletedAt: null, createdAt: '', updatedAt: '' }],
    requirements: [req1, req2],
    deletedRequirements: [],
    showDeleted: false,
    statusFilter: 'All', priorityFilter: 'All', typeFilter: 'All',
    selectedRequirementId: null,
    selectRequirement: vi.fn(),
    addRequirement: vi.fn().mockResolvedValue(undefined),
    removeRequirement: vi.fn().mockResolvedValue(undefined),
    restoreRequirement: vi.fn().mockResolvedValue(undefined),
    setShowDeleted: vi.fn().mockResolvedValue(undefined),
    setStatusFilter: vi.fn(),
    setPriorityFilter: vi.fn(),
    setTypeFilter: vi.fn()
  })
})

describe('RequirementsList', () => {
  it('renders requirement ID and text', () => {
    render(<RequirementsList />)
    expect(screen.getByText('SRS-0001')).toBeInTheDocument()
    expect(screen.getByText(/The system shall respond/)).toBeInTheDocument()
  })

  it('calls selectRequirement when a row is clicked', async () => {
    render(<RequirementsList />)
    await userEvent.click(screen.getByText('SRS-0001'))
    expect(storeState.selectRequirement).toHaveBeenCalledWith(1)
  })

  it('shows + New Requirement button', () => {
    render(<RequirementsList />)
    expect(screen.getByText('+ New Requirement')).toBeInTheDocument()
  })

  it('renders status and priority chips and type text', () => {
    render(<RequirementsList />)
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.getByText('High')).toBeInTheDocument()
    expect(screen.getByText('Functional')).toBeInTheDocument()
  })

  it('filters rows by status', () => {
    storeState.statusFilter = 'Approved'
    render(<RequirementsList />)
    expect(screen.getByText('SRS-0001')).toBeInTheDocument()
    expect(screen.queryByText('SRS-0002')).not.toBeInTheDocument()
  })

  it('item count reflects filtered rows', () => {
    storeState.priorityFilter = 'High'
    render(<RequirementsList />)
    expect(screen.getByText('1 item')).toBeInTheDocument()
  })

  it('filter selects call store setters', async () => {
    render(<RequirementsList />)
    await userEvent.selectOptions(screen.getByLabelText('Filter by status'), 'Approved')
    expect(storeState.setStatusFilter).toHaveBeenCalledWith('Approved')
    await userEvent.selectOptions(screen.getByLabelText('Filter by priority'), 'Low')
    expect(storeState.setPriorityFilter).toHaveBeenCalledWith('Low')
    await userEvent.selectOptions(screen.getByLabelText('Filter by type'), 'Interface')
    expect(storeState.setTypeFilter).toHaveBeenCalledWith('Interface')
  })

  it('show-deleted checkbox calls setShowDeleted', async () => {
    render(<RequirementsList />)
    await userEvent.click(screen.getByLabelText(/show deleted/i))
    expect(storeState.setShowDeleted).toHaveBeenCalledWith(true)
  })

  it('deleted view shows Restore and calls restoreRequirement', async () => {
    storeState.showDeleted = true
    storeState.deletedRequirements = [{ ...req1, id: 9, reqId: 'SRS-0009', deletedAt: '2026-07-03' }]
    render(<RequirementsList />)
    await userEvent.click(screen.getByText('Restore'))
    expect(storeState.restoreRequirement).toHaveBeenCalledWith(9)
  })

  it('row delete button calls removeRequirement', async () => {
    render(<RequirementsList />)
    await userEvent.click(screen.getAllByLabelText('Delete requirement')[0])
    expect(storeState.removeRequirement).toHaveBeenCalledWith(1)
  })
})
```

Note: `getByLabelText(/show deleted/i)` works because the existing checkbox is wrapped in a `<label>` with the "Show deleted" span — no component change needed for that.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && ./node_modules/.bin/vitest run src/renderer/src/components/RequirementsList/index.test.tsx`
Expected: chip/filter tests FAIL (no chips, no filter selects rendered); the three legacy behaviors PASS.

- [ ] **Step 3: Implement the component**

Replace the entire contents of `src/renderer/src/components/RequirementsList/index.tsx` with:

```tsx
import { useStore } from '../../store'
import { Button, Chip, SectionLabel, Select } from '../ui'
import { REQUIREMENT_STATUSES, REQUIREMENT_PRIORITIES, REQUIREMENT_TYPES } from '../../../../types'

const GRID = 'grid grid-cols-[90px_1.5fr_1fr_90px_1fr_100px_92px_80px_36px]'

export default function RequirementsList(): JSX.Element {
  const {
    selectedModuleId, modules, requirements, deletedRequirements,
    showDeleted, setShowDeleted,
    statusFilter, setStatusFilter,
    priorityFilter, setPriorityFilter,
    typeFilter, setTypeFilter,
    selectedRequirementId, selectRequirement,
    addRequirement, removeRequirement, restoreRequirement
  } = useStore()

  if (!selectedModuleId) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-ink-faint">
        Select a module to view its requirements.
      </div>
    )
  }

  const module = modules.find((m) => m.id === selectedModuleId)
  const displayed = (showDeleted ? deletedRequirements : requirements).filter((r) =>
    (statusFilter === 'All' || r.status === statusFilter) &&
    (priorityFilter === 'All' || r.priority === priorityFilter) &&
    (typeFilter === 'All' || r.reqType === typeFilter)
  )

  async function handleAdd(): Promise<void> {
    await addRequirement({ moduleId: selectedModuleId!, text: '' })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="h-12 px-4 border-b border-line flex items-center justify-between shrink-0 bg-white">
        <span className="text-lg font-semibold tracking-tight text-ink">{module?.name ?? 'Requirements'}</span>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-error"
            />
            <span className="text-xs text-ink-faint">Show deleted</span>
          </label>
          <span className="text-xs text-ink-faint">
            {displayed.length} item{displayed.length !== 1 ? 's' : ''}
          </span>
          {!showDeleted && <Button onClick={handleAdd}>+ New Requirement</Button>}
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="h-10 px-4 border-b border-line bg-white flex items-center gap-5 shrink-0">
        <FilterSelect label="Status" value={statusFilter} options={REQUIREMENT_STATUSES} onChange={setStatusFilter} />
        <FilterSelect label="Priority" value={priorityFilter} options={REQUIREMENT_PRIORITIES} onChange={setPriorityFilter} />
        <FilterSelect label="Type" value={typeFilter} options={REQUIREMENT_TYPES} onChange={setTypeFilter} />
      </div>

      {/* Column headers */}
      <div className={`${GRID} gap-x-3 px-4 py-2 border-b border-line bg-workspace shrink-0`}>
        <SectionLabel>ID</SectionLabel>
        <SectionLabel>Requirement</SectionLabel>
        <SectionLabel>Acceptance Criteria</SectionLabel>
        <SectionLabel>Source</SectionLabel>
        <SectionLabel>Rationale</SectionLabel>
        <SectionLabel>Type</SectionLabel>
        <SectionLabel>Status</SectionLabel>
        <SectionLabel>Priority</SectionLabel>
        <span />
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {displayed.length === 0 && (
          <div className="p-4 text-sm text-ink-faint">
            {showDeleted ? 'No deleted requirements.' : 'No requirements match.'}
          </div>
        )}
        {displayed.map((req, i) => (
          <div
            key={req.id}
            onClick={() => !showDeleted && selectRequirement(req.id)}
            className={[
              GRID,
              'gap-x-3 items-start px-4 py-3 border-b border-line/60 group border-l-2',
              i % 2 === 1 ? 'bg-workspace/50' : 'bg-white',
              showDeleted ? 'opacity-60 border-l-transparent' : 'cursor-pointer hover:bg-action-tint/20',
              !showDeleted && selectedRequirementId === req.id
                ? '!bg-action-tint/40 border-l-action'
                : 'border-l-transparent'
            ].join(' ')}
          >
            <span className="text-xs font-mono text-ink-faint pt-0.5 truncate">{req.reqId}</span>
            <span className="text-sm text-ink break-words pr-1">
              {req.text || <span className="text-ink-faint/50 italic">—</span>}
            </span>
            <span className="text-sm text-ink-muted break-words pr-1">
              {req.acceptanceCriteria || <span className="text-ink-faint/50">—</span>}
            </span>
            <span className="text-xs text-ink-muted truncate">
              {req.source || <span className="text-ink-faint/50">—</span>}
            </span>
            <span className="text-sm text-ink-muted break-words pr-1">
              {req.rationale || <span className="text-ink-faint/50">—</span>}
            </span>
            <span className="text-xs text-ink-muted pt-0.5 truncate">{req.reqType}</span>
            <div className="pt-0.5"><Chip value={req.status} /></div>
            <div className="pt-0.5"><Chip value={req.priority} /></div>
            <div className="flex items-start justify-center pt-0.5">
              {showDeleted ? (
                <button
                  onClick={(e) => { e.stopPropagation(); restoreRequirement(req.id) }}
                  className="text-xs text-action hover:text-action-hover font-medium whitespace-nowrap"
                >
                  Restore
                </button>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); removeRequirement(req.id) }}
                  aria-label="Delete requirement"
                  title="Delete requirement"
                  className="opacity-0 group-hover:opacity-100 text-ink-faint hover:text-error transition-opacity text-base leading-none"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FilterSelect<T extends string>({
  label, value, options, onChange
}: {
  label: string
  value: T | 'All'
  options: readonly T[]
  onChange: (value: T | 'All') => void
}): JSX.Element {
  return (
    <label className="flex items-center gap-1.5">
      <SectionLabel>{label}</SectionLabel>
      <Select
        aria-label={`Filter by ${label.toLowerCase()}`}
        value={value}
        onChange={(e) => onChange(e.target.value as T | 'All')}
        className="!w-auto !py-1 !px-2 !text-xs"
      >
        <option value="All">All</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </Select>
    </label>
  )
}
```

(Only intended behavior change to existing copy: empty-state text becomes "No requirements match." since filters can now empty the list.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && ./node_modules/.bin/vitest run src/renderer/src/components/RequirementsList/index.test.tsx && npm run typecheck:web`
Expected: all tests in file PASS; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/RequirementsList/index.tsx src/renderer/src/components/RequirementsList/index.test.tsx
git commit -m "feat(ui): metadata columns, chips, and filter toolbar in requirements table"
```

---

### Task 5: Detail drawer — metadata selects

**Files:**
- Modify: `src/renderer/src/components/RequirementDetail/index.tsx`
- Test: `src/renderer/src/components/RequirementDetail/index.test.tsx` (append tests + fold in `vi.clearAllMocks()` minor)

**Interfaces:**
- Consumes: `Select` primitive, enum consts/types from `'../../../../types'` (Task 1), existing `updateRequirement` store action.
- Produces: selects reachable via `aria-label="Type"` / `"Status"` / `"Priority"`; they save immediately on change (no blur needed).

- [ ] **Step 1: Update mocks + write the failing tests**

In `src/renderer/src/components/RequirementDetail/index.test.tsx`:

1. Add the new fields to the mock requirement in `storeState` (after `source: 'Customer spec', rationale: 'Performance SLA',`):

```ts
    status: 'Draft', priority: 'Medium', reqType: 'Functional',
```

2. Replace the existing `beforeEach(() => mockUpdateRequirement.mockClear())` with (deferred minor):

```ts
  beforeEach(() => vi.clearAllMocks())
```

3. Append inside the `describe('RequirementDetail', ...)` block:

```ts
  it('renders metadata selects with current values', () => {
    render(<RequirementDetail />)
    expect(screen.getByLabelText('Type')).toHaveValue('Functional')
    expect(screen.getByLabelText('Status')).toHaveValue('Draft')
    expect(screen.getByLabelText('Priority')).toHaveValue('Medium')
  })

  it('changing status saves immediately', async () => {
    render(<RequirementDetail />)
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Approved')
    expect(mockUpdateRequirement).toHaveBeenCalledWith(1, { status: 'Approved' })
  })

  it('changing priority saves immediately', async () => {
    render(<RequirementDetail />)
    await userEvent.selectOptions(screen.getByLabelText('Priority'), 'High')
    expect(mockUpdateRequirement).toHaveBeenCalledWith(1, { priority: 'High' })
  })
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && ./node_modules/.bin/vitest run src/renderer/src/components/RequirementDetail/index.test.tsx`
Expected: 3 new tests FAIL (`Unable to find a label with the text of: Type`); existing tests PASS.

- [ ] **Step 3: Implement**

In `src/renderer/src/components/RequirementDetail/index.tsx`:

1. Extend the ui import: `import { Button, Input, Select, Textarea, SectionLabel } from '../ui'`
2. Add a types import below it:

```ts
import { REQUIREMENT_STATUSES, REQUIREMENT_PRIORITIES, REQUIREMENT_TYPES } from '../../../../types'
import type { RequirementStatus, RequirementPriority, RequirementType } from '../../../../types'
```

3. In the JSX, insert as the FIRST child of the scroll container `<div className="flex-1 overflow-y-auto p-5 space-y-5">`, before `<Field label="Requirement">`:

```tsx
        <div className="grid grid-cols-3 gap-3">
          <Field label="Type">
            <Select
              aria-label="Type"
              value={req.reqType}
              onChange={(e) => updateRequirement(req.id, { reqType: e.target.value as RequirementType })}
            >
              {REQUIREMENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select
              aria-label="Status"
              value={req.status}
              onChange={(e) => updateRequirement(req.id, { status: e.target.value as RequirementStatus })}
            >
              {REQUIREMENT_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select
              aria-label="Priority"
              value={req.priority}
              onChange={(e) => updateRequirement(req.id, { priority: e.target.value as RequirementPriority })}
            >
              {REQUIREMENT_PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          </Field>
        </div>
```

No local state needed: the selects are controlled directly by `req.*`, and `updateRequirement` refreshes the store, which re-renders with the new value.

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && ./node_modules/.bin/vitest run src/renderer/src/components/RequirementDetail/index.test.tsx && npm run typecheck:web`
Expected: all tests in file PASS; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/RequirementDetail/index.tsx src/renderer/src/components/RequirementDetail/index.test.tsx
git commit -m "feat(ui): type/status/priority selects in requirement detail drawer"
```

---

### Task 6: Build, full-suite check, and running-app verification

**Files:**
- Modify: `handoff.md` (update current-state section)
- No source changes expected (fix regressions if found).

- [ ] **Step 1: Full test suite vs baseline**

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && ./node_modules/.bin/vitest run 2>&1 | tail -5`
Expected: every `src/renderer/**` test file passes. `src/main/**` failures are all `ERR_DLOPEN_FAILED` (ABI baseline — pre-change baseline was 45 failed / 40 passed; the failure count may grow only by the Task 1 main-process tests, which fail with the same ABI error). Any renderer failure or any non-ABI main failure must be fixed before proceeding.

- [ ] **Step 2: Build all targets**

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && npm run build`
Expected: typecheck (node + web) then electron-vite build for main/preload/renderer, exit 0.

- [ ] **Step 3: Verify in the running app**

Use the Playwright driver at `.claude/skills/run-app/driver.mjs` (same flow as UI-overhaul Task 9). Verify with an existing project (columns must be added to a pre-existing DB by the migration):

1. Requirements table shows TYPE / STATUS / PRIORITY columns; existing requirements show `Functional` / `Draft` chip / `Medium` chip (migration defaults applied to existing rows).
2. Detail drawer: change Status to `Approved` and Priority to `High` via the selects → table chips update immediately (Approved chip green-tinted, High chip red-tinted).
3. Filter toolbar: set Status filter to `Approved` → only the edited requirement remains; item count updates; set back to `All` → all rows return.
4. Type select: change a requirement to `Interface`, set Type filter to `Interface` → only that row remains.
5. Restart the app (or reopen the project) → edited status/priority/type persisted.
6. Switch modules → filters reset to All.

Expected: all six checks pass. Screenshot the filtered table state for the task report.

- [ ] **Step 4: Update handoff + commit**

Update `handoff.md`: mark Requirement Metadata & Filtering (backlog 1, 2, 3, 6) complete with the commit range, and note the next backlog candidates.

```bash
git add handoff.md
git commit -m "docs: requirement metadata & filtering complete — handoff updated"
```

---

## Self-Review Notes

- **Spec coverage:** backlog 1 (status + chips) → Tasks 1, 3, 4, 5; backlog 2 (priority + chips) → same; backlog 3 (filter toolbar: status, priority, More Filters→type) → Tasks 2, 4; backlog 6 (Type field) → Tasks 1, 4, 5. Mockup's MODIFIED column / row checkboxes / bulk actions are separate backlog items (5, 13) — intentionally out of scope.
- **Type consistency:** `reqType` (TS) ↔ `req_type` (DB) used consistently in Tasks 1, 4, 5; filter state names `statusFilter`/`priorityFilter`/`typeFilter` and setters `setStatusFilter`/`setPriorityFilter`/`setTypeFilter` match between Tasks 2 and 4; `Chip({ value })` matches between Tasks 3 and 4; enum const names match across all tasks.
- **Known constraint:** main-process TDD is ABI-blocked (documented in Global Constraints); the compensating verification is Task 6 Step 3 in the real app.
