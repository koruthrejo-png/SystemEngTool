# Row Checkboxes & Bulk Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add row checkboxes with select-all to the requirements table and a bulk-action bar (set status, set priority, delete selected) — design-spec backlog item 5.

**Architecture:** Selection is renderer-only Zustand state (`checkedIds: number[]`). Bulk operations loop the existing per-row IPC (`requirements:update` / `requirements:delete`) via `Promise.all` — **no new IPC channels, no main-process changes** (single-user local sqlite; N sequential-ish calls are cheap; non-atomicity accepted at this scale). The checked set clears whenever the visible list's scope changes (module switch, show-deleted toggle, any filter change) so bulk actions can never target hidden rows.

**Tech Stack:** Zustand, React 18, Tailwind semantic tokens, Vitest + Testing Library (jsdom).

## Global Constraints

- **PATH:** `npm`/`node` are not on the shell PATH. Prefix every shell command with:
  `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"`
- **Broken npm shim:** the `npm` wrapper in that distribution is broken — never run `npm run …`; use the binaries directly: `./node_modules/.bin/vitest`, `./node_modules/.bin/tsc`, `./node_modules/.bin/electron-vite`.
- **Typecheck commands:** `./node_modules/.bin/tsc --noEmit -p tsconfig.node.json --composite false` and `./node_modules/.bin/tsc --noEmit -p tsconfig.web.json --composite false`.
- **No new dependencies.** Colors/typography only from the semantic tokens in `tailwind.config.js` (`navy`, `action`, `workspace`, `line`, `ink`, `error` families). No new hex values.
- **Commit to `main`** after each task (project convention — no feature branches).
- **Pre-existing test failures:** all `src/main/**` tests fail under vitest with `ERR_DLOPEN_FAILED` (better-sqlite3 binary is Electron ABI 125, local node is ABI 127) plus 1 pre-existing ArchitectureCanvas failure — accepted baseline (48 failed / 55 passed before this feature). Do not rebuild the binary or chase these. This feature touches only renderer code; all renderer tests MUST pass.
- **Checkboxes and bulk bar exist only in the active view** — never in the show-deleted view.

## Design decisions (locked in — do not re-litigate)

- `checkedIds` is `number[]` (not `Set`) for simple immutable updates.
- Select-all targets exactly the currently **displayed** (filtered) rows.
- Bulk bar appears only when `checkedIds.length > 0`: "N selected", a Set-status select, a Set-priority select, Delete selected, Clear.
- Bulk selects use a disabled placeholder option (`value=""`) and apply on change; after any bulk op `checkedIds` clears, unmounting the bar.
- `updateRequirements` re-fetches the module's list once after `Promise.all` (server is source of truth for updated rows); `removeRequirements` filters the local array (matches existing single-delete behavior).
- Checkbox column is the new first grid column (28px); grid becomes 10 columns.
- Row checkbox clicks must not trigger row selection (stopPropagation on the cell wrapper).

---

### Task 1: Store — checked state + bulk actions

**Files:**
- Modify: `src/renderer/src/store/index.ts`
- Test: `src/renderer/src/store/index.test.ts` (append tests)

**Interfaces:**
- Consumes: existing `window.api.requirements.update/delete/list`, `UpdateRequirementInput` (already imported in the store).
- Produces (Task 2 relies on these exact names):
  - state `checkedIds: number[]` (initial `[]`)
  - `toggleChecked(id: number): void`
  - `setChecked(ids: number[]): void`
  - `updateRequirements(ids: number[], patch: UpdateRequirementInput): Promise<void>`
  - `removeRequirements(ids: number[]): Promise<void>`
  - `selectModule`, `setShowDeleted`, `setStatusFilter`, `setPriorityFilter`, `setTypeFilter` all reset `checkedIds` to `[]`.

- [ ] **Step 1: Write the failing tests**

Append inside the `describe('store', ...)` block in `src/renderer/src/store/index.test.ts`:

```ts
  it('toggleChecked adds then removes an id', () => {
    useStore.setState({ checkedIds: [] })
    useStore.getState().toggleChecked(1)
    expect(useStore.getState().checkedIds).toEqual([1])
    useStore.getState().toggleChecked(2)
    expect(useStore.getState().checkedIds).toEqual([1, 2])
    useStore.getState().toggleChecked(1)
    expect(useStore.getState().checkedIds).toEqual([2])
  })

  it('setChecked replaces the checked set', () => {
    useStore.setState({ checkedIds: [1] })
    useStore.getState().setChecked([2, 3])
    expect(useStore.getState().checkedIds).toEqual([2, 3])
    useStore.getState().setChecked([])
    expect(useStore.getState().checkedIds).toEqual([])
  })

  it('filter setters and selectModule clear checkedIds', async () => {
    useStore.setState({ checkedIds: [1] })
    useStore.getState().setStatusFilter('Approved')
    expect(useStore.getState().checkedIds).toEqual([])

    useStore.setState({ checkedIds: [1] })
    useStore.getState().setPriorityFilter('High')
    expect(useStore.getState().checkedIds).toEqual([])

    useStore.setState({ checkedIds: [1] })
    useStore.getState().setTypeFilter('Functional')
    expect(useStore.getState().checkedIds).toEqual([])

    useStore.setState({ checkedIds: [1] })
    await useStore.getState().selectModule(1)
    expect(useStore.getState().checkedIds).toEqual([])
  })

  it('updateRequirements patches each id, reloads the list, clears checked', async () => {
    useStore.setState({ selectedModuleId: 1, checkedIds: [1], requirements: [mockReq] })
    await useStore.getState().updateRequirements([1], { status: 'Approved' })
    expect(window.api.requirements.update).toHaveBeenCalledWith(1, { status: 'Approved' })
    expect(window.api.requirements.list).toHaveBeenCalledWith(1)
    expect(useStore.getState().checkedIds).toEqual([])
  })

  it('removeRequirements deletes each id, removes rows locally, clears checked and selection', async () => {
    useStore.setState({
      selectedModuleId: 1, checkedIds: [1],
      requirements: [mockReq], selectedRequirementId: 1
    })
    await useStore.getState().removeRequirements([1])
    expect(window.api.requirements.delete).toHaveBeenCalledWith(1)
    expect(useStore.getState().requirements).toEqual([])
    expect(useStore.getState().checkedIds).toEqual([])
    expect(useStore.getState().selectedRequirementId).toBeNull()
  })
```

Note: the file's existing `window.api` stub already mocks `requirements.update`, `requirements.delete`, and `requirements.list` — no stub changes needed.

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && ./node_modules/.bin/vitest run src/renderer/src/store/index.test.ts`
Expected: the 5 new tests FAIL (`toggleChecked is not a function` etc.); pre-existing tests keep passing.

- [ ] **Step 3: Implement**

In `src/renderer/src/store/index.ts`:

In `interface Store`, after `typeFilter: RequirementType | 'All'`:

```ts
  checkedIds: number[]
```

In the actions section, after `setTypeFilter`:

```ts
  toggleChecked: (id: number) => void
  setChecked: (ids: number[]) => void
  updateRequirements: (ids: number[], patch: UpdateRequirementInput) => Promise<void>
  removeRequirements: (ids: number[]) => Promise<void>
```

In the initial state, after `statusFilter: 'All', priorityFilter: 'All', typeFilter: 'All',`:

```ts
  checkedIds: [],
```

In `selectModule`, add `checkedIds: []` to the first `set(...)` object (alongside the existing filter resets):

```ts
    set({ selectedModuleId: id, requirements: [], selectedRequirementId: null, showDeleted: false, deletedRequirements: [], customFields: [], statusFilter: 'All', priorityFilter: 'All', typeFilter: 'All', checkedIds: [] })
```

In `setShowDeleted`, add `checkedIds: []` to its first `set(...)`:

```ts
    set({ showDeleted: show, selectedRequirementId: null, customFields: [], checkedIds: [] })
```

Replace the three filter setters with:

```ts
  setStatusFilter: (f) => set({ statusFilter: f, checkedIds: [] }),
  setPriorityFilter: (f) => set({ priorityFilter: f, checkedIds: [] }),
  setTypeFilter: (f) => set({ typeFilter: f, checkedIds: [] }),
```

After the filter setters, add:

```ts
  toggleChecked: (id) => set((s) => ({
    checkedIds: s.checkedIds.includes(id)
      ? s.checkedIds.filter((c) => c !== id)
      : [...s.checkedIds, id]
  })),

  setChecked: (ids) => set({ checkedIds: ids }),

  updateRequirements: async (ids, patch) => {
    await Promise.all(ids.map((id) => window.api.requirements.update(id, patch)))
    const { selectedModuleId } = get()
    if (!selectedModuleId) return
    const requirements = await window.api.requirements.list(selectedModuleId)
    set({ requirements, checkedIds: [] })
  },

  removeRequirements: async (ids) => {
    await Promise.all(ids.map((id) => window.api.requirements.delete(id)))
    set((s) => ({
      requirements: s.requirements.filter((r) => !ids.includes(r.id)),
      checkedIds: [],
      selectedRequirementId:
        s.selectedRequirementId !== null && ids.includes(s.selectedRequirementId)
          ? null
          : s.selectedRequirementId
    }))
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && ./node_modules/.bin/vitest run src/renderer/src/store/index.test.ts && ./node_modules/.bin/tsc --noEmit -p tsconfig.web.json --composite false`
Expected: all tests in file PASS; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/store/index.ts src/renderer/src/store/index.test.ts
git commit -m "feat(store): checked-row state and bulk update/delete actions"
```

---

### Task 2: Requirements table — checkbox column + bulk bar

**Files:**
- Modify: `src/renderer/src/components/RequirementsList/index.tsx`
- Test: `src/renderer/src/components/RequirementsList/index.test.tsx` (modify mock + append tests)

**Interfaces:**
- Consumes: store additions from Task 1 (`checkedIds`, `toggleChecked`, `setChecked`, `updateRequirements`, `removeRequirements`); existing `Chip`/`Select`/`SectionLabel`/`Button` primitives; `REQUIREMENT_STATUSES`/`REQUIREMENT_PRIORITIES` from types.
- Produces: row checkboxes reachable via `aria-label="Select SRS-0001"` (pattern `Select ${reqId}`), header checkbox via `aria-label="Select all"`, bulk selects via `aria-label="Set status"` / `"Set priority"`, buttons with text `Delete selected` and `Clear` (Task 3 driver checks use these).

- [ ] **Step 1: Update the test mock and write the failing tests**

In `src/renderer/src/components/RequirementsList/index.test.tsx`, inside the `beforeEach`'s `Object.assign(storeState, { ... })`, add after `setTypeFilter: vi.fn()`:

```ts
    checkedIds: [],
    toggleChecked: vi.fn(),
    setChecked: vi.fn(),
    updateRequirements: vi.fn().mockResolvedValue(undefined),
    removeRequirements: vi.fn().mockResolvedValue(undefined)
```

(Remember the comma after `setTypeFilter: vi.fn()`.)

Append inside the `describe('RequirementsList', ...)` block:

```tsx
  it('renders a checkbox per row and a select-all in the header', () => {
    render(<RequirementsList />)
    expect(screen.getByLabelText('Select SRS-0001')).toBeInTheDocument()
    expect(screen.getByLabelText('Select SRS-0002')).toBeInTheDocument()
    expect(screen.getByLabelText('Select all')).toBeInTheDocument()
  })

  it('row checkbox calls toggleChecked without selecting the row', async () => {
    render(<RequirementsList />)
    await userEvent.click(screen.getByLabelText('Select SRS-0001'))
    expect(storeState.toggleChecked).toHaveBeenCalledWith(1)
    expect(storeState.selectRequirement).not.toHaveBeenCalled()
  })

  it('select-all checks all displayed rows, unchecks when all checked', async () => {
    render(<RequirementsList />)
    await userEvent.click(screen.getByLabelText('Select all'))
    expect(storeState.setChecked).toHaveBeenCalledWith([1, 2])

    storeState.setChecked.mockClear()
    storeState.checkedIds = [1, 2]
    render(<RequirementsList />)
    await userEvent.click(screen.getAllByLabelText('Select all')[1])
    expect(storeState.setChecked).toHaveBeenCalledWith([])
  })

  it('bulk bar hidden when nothing checked, shows count when checked', () => {
    render(<RequirementsList />)
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()

    storeState.checkedIds = [1]
    render(<RequirementsList />)
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('bulk set-status applies to checked ids', async () => {
    storeState.checkedIds = [1, 2]
    render(<RequirementsList />)
    await userEvent.selectOptions(screen.getByLabelText('Set status'), 'Approved')
    expect(storeState.updateRequirements).toHaveBeenCalledWith([1, 2], { status: 'Approved' })
  })

  it('bulk set-priority applies to checked ids', async () => {
    storeState.checkedIds = [1]
    render(<RequirementsList />)
    await userEvent.selectOptions(screen.getByLabelText('Set priority'), 'Low')
    expect(storeState.updateRequirements).toHaveBeenCalledWith([1], { priority: 'Low' })
  })

  it('Delete selected and Clear act on the checked set', async () => {
    storeState.checkedIds = [1, 2]
    render(<RequirementsList />)
    await userEvent.click(screen.getByText('Delete selected'))
    expect(storeState.removeRequirements).toHaveBeenCalledWith([1, 2])
    await userEvent.click(screen.getByText('Clear'))
    expect(storeState.setChecked).toHaveBeenCalledWith([])
  })

  it('no checkboxes or bulk bar in the deleted view', () => {
    storeState.showDeleted = true
    storeState.checkedIds = [1]
    storeState.deletedRequirements = [{ ...req1, id: 9, reqId: 'SRS-0009', deletedAt: '2026-07-04' }]
    render(<RequirementsList />)
    expect(screen.queryByLabelText(/Select /)).not.toBeInTheDocument()
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && ./node_modules/.bin/vitest run src/renderer/src/components/RequirementsList/index.test.tsx`
Expected: the 8 new tests FAIL (no checkboxes/bulk bar rendered); the 10 pre-existing tests PASS.

- [ ] **Step 3: Implement the component**

In `src/renderer/src/components/RequirementsList/index.tsx`, make these exact changes:

1. Change the GRID constant (checkbox column added as first column, 10 columns total):

```tsx
const GRID = 'grid grid-cols-[28px_90px_1.5fr_1fr_90px_1fr_100px_92px_80px_36px]'
```

2. Extend the store destructuring — after `typeFilter, setTypeFilter,` add:

```tsx
    checkedIds, toggleChecked, setChecked,
    updateRequirements, removeRequirements,
```

3. After the `displayed` computation, add:

```tsx
  const allChecked = displayed.length > 0 && displayed.every((r) => checkedIds.includes(r.id))
```

4. Insert the bulk bar between the filter toolbar `</div>` and the `{/* Column headers */}` comment:

```tsx
      {/* Bulk actions */}
      {!showDeleted && checkedIds.length > 0 && (
        <div className="h-10 px-4 border-b border-line bg-action-tint/30 flex items-center gap-4 shrink-0">
          <span className="text-xs font-medium text-ink">{checkedIds.length} selected</span>
          <BulkSelect label="Set status" options={REQUIREMENT_STATUSES} onApply={(v) => updateRequirements(checkedIds, { status: v })} />
          <BulkSelect label="Set priority" options={REQUIREMENT_PRIORITIES} onApply={(v) => updateRequirements(checkedIds, { priority: v })} />
          <button
            onClick={() => removeRequirements(checkedIds)}
            className="text-xs text-error hover:underline font-medium"
          >
            Delete selected
          </button>
          <button
            onClick={() => setChecked([])}
            className="text-xs text-ink-faint hover:text-ink"
          >
            Clear
          </button>
        </div>
      )}
```

5. In the column-headers row, insert as the FIRST child (before `<SectionLabel>ID</SectionLabel>`):

```tsx
        <span className="flex items-center">
          {!showDeleted && (
            <input
              type="checkbox"
              aria-label="Select all"
              checked={allChecked}
              onChange={() => setChecked(allChecked ? [] : displayed.map((r) => r.id))}
              className="w-3.5 h-3.5 rounded accent-action"
            />
          )}
        </span>
```

6. In the data row, insert as the FIRST child (before the reqId `<span>`):

```tsx
            <div className="flex items-start pt-1" onClick={(e) => e.stopPropagation()}>
              {!showDeleted && (
                <input
                  type="checkbox"
                  aria-label={`Select ${req.reqId}`}
                  checked={checkedIds.includes(req.id)}
                  onChange={() => toggleChecked(req.id)}
                  className="w-3.5 h-3.5 rounded accent-action"
                />
              )}
            </div>
```

7. Append the `BulkSelect` helper at the end of the file, after `FilterSelect`:

```tsx
function BulkSelect<T extends string>({
  label, options, onApply
}: {
  label: string
  options: readonly T[]
  onApply: (value: T) => void
}): JSX.Element {
  return (
    <Select
      aria-label={label}
      value=""
      onChange={(e) => { if (e.target.value) onApply(e.target.value as T) }}
      className="!w-auto !py-1 !px-2 !text-xs"
    >
      <option value="" disabled>{label}…</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </Select>
  )
}
```

(`REQUIREMENT_STATUSES` and `REQUIREMENT_PRIORITIES` are already imported in this file from Task 4 of the metadata plan — no import changes needed.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && ./node_modules/.bin/vitest run src/renderer/src/components/RequirementsList/index.test.tsx && ./node_modules/.bin/tsc --noEmit -p tsconfig.web.json --composite false`
Expected: all 18 tests PASS; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/RequirementsList/index.tsx src/renderer/src/components/RequirementsList/index.test.tsx
git commit -m "feat(ui): row checkboxes, select-all, and bulk-action bar in requirements table"
```

---

### Task 3: Verification — suite, build, running app

**Files:**
- No source changes expected (fix regressions if found).

- [ ] **Step 1: Full test suite vs baseline**

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && ./node_modules/.bin/vitest run 2>&1 | tail -5`
Expected: failure set identical to baseline (48 failed / 55 passed before this feature — all `src/main/**` ABI failures + 1 pre-existing ArchitectureCanvas test). Every renderer file passes. Any new failure must be fixed before proceeding.

- [ ] **Step 2: Build all targets**

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && ./node_modules/.bin/tsc --noEmit -p tsconfig.node.json --composite false && ./node_modules/.bin/tsc --noEmit -p tsconfig.web.json --composite false && ./node_modules/.bin/electron-vite build`
Expected: exit 0, main/preload/renderer bundles built.

- [ ] **Step 3: Verify in the running app**

Use the Playwright driver at `.claude/skills/run-app/driver.mjs` (stdin REPL; pipe commands with sleeps; screenshots to the session scratchpad via `SCREENSHOT_DIR`). To change React-controlled checkboxes/selects, use `eval` with native-setter + change-event dispatch. Verify:

1. Table rows show checkboxes; header shows select-all; deleted view shows neither.
2. Check one row → bulk bar appears with "1 selected".
3. Select-all → all displayed rows checked, count matches item count.
4. Set status → `Approved` on the checked set → chips update in the table, bulk bar disappears (checked set cleared).
5. Check a row → Delete selected → row leaves the table; enable "Show deleted" → the row is there; Restore it.
6. Apply a status filter, verify the checked set cleared (bulk bar gone) after changing the filter.

Take screenshots of: bulk bar visible with selection, and the table after a bulk status change.

- [ ] **Step 4: Commit any fixes; report**

If regressions were found and fixed, commit them. Report results per checklist item.

---

## Self-Review Notes

- **Spec coverage:** backlog item 5 = "Row checkboxes + bulk actions" — checkboxes (Task 2 items 5-6), select-all (Task 2 item 5), bulk actions delete/status/priority (Tasks 1-2). Mockup shows checkboxes only; the bulk bar's concrete actions are this plan's design decision (recorded above).
- **Type consistency:** `checkedIds`/`toggleChecked`/`setChecked`/`updateRequirements`/`removeRequirements` match between Task 1 (store) and Task 2 (component + mocks); `UpdateRequirementInput` patch shape matches store signature; aria-labels in Task 2 tests match Task 2 component code and Task 3 driver checks.
- **Placeholder scan:** clean — every code step carries complete code.
