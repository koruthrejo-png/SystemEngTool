# Row Context Menu — More Actions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the requirements-table right-click context menu (today only "Add entry below") with Duplicate, Move to section, Copy ID, and Delete.

**Architecture:** Pure renderer extension of the existing `ctxMenu` popover in `RequirementsList/index.tsx`. No new IPC. Every action reuses an existing store action except Duplicate, which needs a new `duplicateRequirement` store action (a `run()` action returns void, and `CreateRequirementInput` has no enum fields, so Duplicate must create-then-update-enums in the store where it can hold the created row — the same create-then-update pattern `io.ts` import uses).

**Tech Stack:** TypeScript (strict), React renderer, Zustand store, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-28-row-context-menu-actions-design.md`

## Global Constraints

- No new IPC channels. Reuse existing store actions (`updateRequirement`, `removeRequirement`) + one new store action (`duplicateRequirement`) that calls existing `window.api.requirements.create`/`update`.
- **Delete = soft delete** via the existing `removeRequirement` (row moves to "Show deleted", restorable). Rendered as destructive (red text) below a divider, after all other items.
- **Duplicate:** new row gets a **fresh reqId minted by the backend** (never copied). Inserts directly below the source (`afterId`). Copies the scalar fields — text, acceptanceCriteria, source, rationale, headingId (via create) + status, priority, reqType, entryType, verificationStatus, verificationMethod (via a follow-up update, since `CreateRequirementInput` lacks enums). **Custom fields are NOT copied** (deferred — separate handler). The new row is selected.
- **Copy ID:** `navigator.clipboard.writeText(req.reqId)` — the human-facing string reqId (e.g. `THM-0001`), not the numeric row id.
- **Move to section:** lists the module's headings as numbered outline titles via `buildOutline(headings, [])` + a "(none)" option; sets `heading_id` via `updateRequirement(id, { headingId })`. Implemented as an in-popover submenu toggle (not a hover flyout).
- Every action **closes the menu** (`setCtxMenu(null)`) on activation.
- The context menu only opens when `!showDeleted` (existing guard) — do not change that.
- TypeScript strict; `npm run typecheck` clean.
- **Test baseline:** full suite is **507 passed / 1 failed** (the 1 = pre-existing `App.test.tsx` "open" button, fails on base). Do not regress; the failing count stays exactly 1.

---

### Task 1: `duplicateRequirement` store action

**Files:**
- Modify: `src/renderer/src/store/index.ts` (interface near line 119 beside `addRequirementBelow`; implementation near line 287 beside `addRequirementBelow`)
- Test: `src/renderer/src/store/index.test.ts`

**Interfaces:**
- Consumes: `window.api.requirements.create(input): Promise<Requirement>`, `window.api.requirements.update(id, input): Promise<Requirement>`, `window.api.requirements.list(moduleId): Promise<Requirement[]>` (all already exist); the store's `run`/`ensureAuthorKnown` helpers.
- Produces: `duplicateRequirement: (id: number) => Promise<void>` on the store — clones the row below itself, copying scalar + enum fields (NOT custom fields), selecting the new row.

- [ ] **Step 1: Write the failing store test**

In `src/renderer/src/store/index.test.ts`, add (match the file's existing `window.api` mock + `useStore` reset pattern — open the file and copy how sibling tests like `addRequirementBelow`/`updateRequirement` are tested):

```ts
it('duplicateRequirement clones scalar + enum fields below the source, selects the new row', async () => {
  const src = {
    id: 1, moduleId: 7, reqId: 'R-1', text: 'orig', acceptanceCriteria: 'ac', source: 'src', rationale: 'why',
    status: 'Approved', priority: 'High', reqType: 'Functional', entryType: 'Requirement',
    verificationStatus: 'Passed', verificationMethod: 'Test', headingId: 3, position: 0,
    deletedAt: null, createdAt: '', updatedAt: '', createdBy: 1, updatedBy: 1
  }
  const created = { ...src, id: 2, reqId: 'R-2', text: 'orig' }
  const createMock = vi.fn().mockResolvedValue(created)
  const updateMock = vi.fn().mockResolvedValue({ ...created })
  const listMock = vi.fn().mockResolvedValue([src, created])
  ;(window.api.requirements.create as any) = createMock
  ;(window.api.requirements.update as any) = updateMock
  ;(window.api.requirements.list as any) = listMock

  useStore.setState({ requirements: [src as any] })
  await useStore.getState().duplicateRequirement(1)

  expect(createMock).toHaveBeenCalledWith({
    moduleId: 7, text: 'orig', acceptanceCriteria: 'ac', source: 'src', rationale: 'why', headingId: 3, afterId: 1
  })
  expect(updateMock).toHaveBeenCalledWith(2, {
    status: 'Approved', priority: 'High', reqType: 'Functional', entryType: 'Requirement',
    verificationStatus: 'Passed', verificationMethod: 'Test'
  })
  expect(useStore.getState().selectedRequirementId).toBe(2)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/store/index.test.ts -t duplicateRequirement`
Expected: FAIL — `duplicateRequirement is not a function`.

- [ ] **Step 3: Add the interface entry**

In `src/renderer/src/store/index.ts`, in the store type near line 119 (after `addRequirementBelow`):

```ts
  addRequirementBelow: (afterId: number) => Promise<void>
  duplicateRequirement: (id: number) => Promise<void>
```

- [ ] **Step 4: Add the implementation**

In `src/renderer/src/store/index.ts`, immediately after the `addRequirementBelow` implementation (after line 293):

```ts
  // Clone a requirement directly below itself: create carries the scalar fields it accepts,
  // then a follow-up update copies the enum fields (CreateRequirementInput has no enum fields —
  // same create-then-update path the CSV import uses). Custom fields are intentionally not copied.
  // reqId is minted fresh by the backend; renumbering is server-side, so reload the module list.
  duplicateRequirement: (id) => run(async () => {
    const src = get().requirements.find((r) => r.id === id)
    if (!src) return
    const created = await window.api.requirements.create({
      moduleId: src.moduleId,
      text: src.text,
      acceptanceCriteria: src.acceptanceCriteria ?? undefined,
      source: src.source ?? undefined,
      rationale: src.rationale ?? undefined,
      headingId: src.headingId,
      afterId: id
    })
    const updated = await window.api.requirements.update(created.id, {
      status: src.status,
      priority: src.priority,
      reqType: src.reqType,
      entryType: src.entryType,
      verificationStatus: src.verificationStatus,
      verificationMethod: src.verificationMethod ?? undefined
    })
    set({ requirements: await window.api.requirements.list(src.moduleId), selectedRequirementId: updated.id })
    await ensureAuthorKnown(updated.updatedBy, get, set)
  }),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/store/index.test.ts -t duplicateRequirement`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/store/index.ts src/renderer/src/store/index.test.ts
git commit -m "feat(reqs): duplicateRequirement store action (item 43)"
```

---

### Task 2: Context-menu flat actions — Duplicate, Copy ID, Delete

**Files:**
- Modify: `src/renderer/src/components/RequirementsList/index.tsx` (store destructure ~line 118; the `ctxMenu` popover render ~lines 634-659)
- Test: `src/renderer/src/components/RequirementsList/index.test.tsx`

**Interfaces:**
- Consumes: `duplicateRequirement` (Task 1), existing `removeRequirement`, `requirements` list; `navigator.clipboard`.
- Produces: three new `role="menuitem"` buttons in the existing context-menu popover — Duplicate, Copy ID, and (below a divider, red) Delete — plus the existing "Add entry below".

- [ ] **Step 1: Write the failing render tests**

In `src/renderer/src/components/RequirementsList/index.test.tsx`, add (match the file's existing render helper + store mock; the mock store must now expose `duplicateRequirement`, `removeRequirement`, and `requirements` containing the row being right-clicked):

```tsx
function openCtxMenu() {
  // right-click the row whose reqId cell is 'R-1' (adapt to the file's fixture)
  const idCell = screen.getByText('R-1')
  fireEvent.contextMenu(idCell)
}

it('context menu shows Duplicate, Copy ID and Delete', () => {
  renderList([{ ...baseReq, id: 1, reqId: 'R-1' }])
  openCtxMenu()
  expect(screen.getByRole('menuitem', { name: 'Duplicate' })).toBeInTheDocument()
  expect(screen.getByRole('menuitem', { name: 'Copy ID' })).toBeInTheDocument()
  expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
})

it('Duplicate calls duplicateRequirement with the row id and closes the menu', () => {
  const duplicateRequirement = vi.fn()
  renderList([{ ...baseReq, id: 1, reqId: 'R-1' }], { duplicateRequirement })
  openCtxMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }))
  expect(duplicateRequirement).toHaveBeenCalledWith(1)
  expect(screen.queryByRole('menuitem', { name: 'Duplicate' })).not.toBeInTheDocument()
})

it('Copy ID writes the reqId string to the clipboard', () => {
  const writeText = vi.fn()
  Object.assign(navigator, { clipboard: { writeText } })
  renderList([{ ...baseReq, id: 1, reqId: 'R-1' }])
  openCtxMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Copy ID' }))
  expect(writeText).toHaveBeenCalledWith('R-1')
})

it('Delete calls removeRequirement with the row id', () => {
  const removeRequirement = vi.fn()
  renderList([{ ...baseReq, id: 1, reqId: 'R-1' }], { removeRequirement })
  openCtxMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
  expect(removeRequirement).toHaveBeenCalledWith(1)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/src/components/RequirementsList/index.test.tsx -t "context menu"`
Expected: FAIL — only "Add entry below" exists; the new menuitems are not found.

- [ ] **Step 3: Add the new store actions to the destructure**

In `src/renderer/src/components/RequirementsList/index.tsx` (~line 118), add `duplicateRequirement` to the destructured store actions (it sits beside the existing `addRequirement, addRequirementBelow, updateRequirement, removeRequirement`):

```ts
    addRequirement, addRequirementBelow, duplicateRequirement, updateRequirement, removeRequirement, restoreRequirement,
```

- [ ] **Step 4: Add the flat menu items**

In the `ctxMenu` popover (after the existing "Add entry below" `<button>`, before the popover's closing `</div>`), compute the source row and add the items. Replace the single-button body of the popover's inner `<div role="menu">` so it reads:

```tsx
          <div
            role="menu"
            style={{ top: ctxMenu.y, left: ctxMenu.x }}
            className="fixed z-50 min-w-[190px] bg-white border border-line rounded shadow-lg py-1 text-sm"
          >
            <button
              role="menuitem"
              onClick={() => { addRequirementBelow(ctxMenu.reqId); setCtxMenu(null) }}
              className="w-full text-left px-3 py-1.5 text-ink hover:bg-action-tint/40"
            >
              Add entry below
            </button>
            <button
              role="menuitem"
              onClick={() => { duplicateRequirement(ctxMenu.reqId); setCtxMenu(null) }}
              className="w-full text-left px-3 py-1.5 text-ink hover:bg-action-tint/40"
            >
              Duplicate
            </button>
            <button
              role="menuitem"
              onClick={() => {
                const r = requirements.find((x) => x.id === ctxMenu.reqId)
                if (r) navigator.clipboard.writeText(r.reqId)
                setCtxMenu(null)
              }}
              className="w-full text-left px-3 py-1.5 text-ink hover:bg-action-tint/40"
            >
              Copy ID
            </button>
            <div className="my-1 border-t border-line" />
            <button
              role="menuitem"
              onClick={() => { removeRequirement(ctxMenu.reqId); setCtxMenu(null) }}
              className="w-full text-left px-3 py-1.5 text-error hover:bg-error/10"
            >
              Delete
            </button>
          </div>
```

(Task 3 will insert the "Move to section" item and its submenu view between "Copy ID" and the divider.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/components/RequirementsList/index.test.tsx -t "context menu"`
Expected: PASS (the 4 new tests + the existing context-menu test still green).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/RequirementsList/index.tsx src/renderer/src/components/RequirementsList/index.test.tsx
git commit -m "feat(reqs): context-menu Duplicate / Copy ID / Delete (item 43)"
```

---

### Task 3: Context-menu "Move to section" submenu

**Files:**
- Modify: `src/renderer/src/components/RequirementsList/index.tsx` (a new `ctxSubmenu` state near the `ctxMenu` state ~line 136; the `onContextMenu` handler ~line 565 to reset it; the popover render to add the item + submenu view)
- Test: `src/renderer/src/components/RequirementsList/index.test.tsx`

**Interfaces:**
- Consumes: `headings`, `buildOutline` (already imported), `updateRequirement` (already destructured).
- Produces: a "Move to section" menuitem that toggles the popover to a section-picker view (numbered headings + "(none)"); picking a section calls `updateRequirement(id, { headingId })`.

- [ ] **Step 1: Write the failing submenu tests**

In `src/renderer/src/components/RequirementsList/index.test.tsx` add (the render helper's mock store must expose `headings` with at least one heading, and `updateRequirement`):

```tsx
it('Move to section opens a section picker listing headings and (none)', () => {
  renderList([{ ...baseReq, id: 1, reqId: 'R-1' }], { headings: [{ id: 5, moduleId: 7, parentId: null, title: 'Intro', position: 0, deletedAt: null, createdAt: '', updatedAt: '' }] })
  fireEvent.contextMenu(screen.getByText('R-1'))
  fireEvent.click(screen.getByRole('menuitem', { name: /Move to section/ }))
  expect(screen.getByRole('menuitem', { name: /Intro/ })).toBeInTheDocument()
  expect(screen.getByRole('menuitem', { name: '(none)' })).toBeInTheDocument()
})

it('picking a section calls updateRequirement with that headingId and closes', () => {
  const updateRequirement = vi.fn()
  renderList([{ ...baseReq, id: 1, reqId: 'R-1' }], {
    updateRequirement,
    headings: [{ id: 5, moduleId: 7, parentId: null, title: 'Intro', position: 0, deletedAt: null, createdAt: '', updatedAt: '' }]
  })
  fireEvent.contextMenu(screen.getByText('R-1'))
  fireEvent.click(screen.getByRole('menuitem', { name: /Move to section/ }))
  fireEvent.click(screen.getByRole('menuitem', { name: /Intro/ }))
  expect(updateRequirement).toHaveBeenCalledWith(1, { headingId: 5 })
  expect(screen.queryByRole('menuitem', { name: /Intro/ })).not.toBeInTheDocument()
})

it('picking (none) clears the section (headingId null)', () => {
  const updateRequirement = vi.fn()
  renderList([{ ...baseReq, id: 1, reqId: 'R-1' }], {
    updateRequirement,
    headings: [{ id: 5, moduleId: 7, parentId: null, title: 'Intro', position: 0, deletedAt: null, createdAt: '', updatedAt: '' }]
  })
  fireEvent.contextMenu(screen.getByText('R-1'))
  fireEvent.click(screen.getByRole('menuitem', { name: /Move to section/ }))
  fireEvent.click(screen.getByRole('menuitem', { name: '(none)' }))
  expect(updateRequirement).toHaveBeenCalledWith(1, { headingId: null })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/src/components/RequirementsList/index.test.tsx -t "section"`
Expected: FAIL — no "Move to section" menuitem.

- [ ] **Step 3: Add the submenu state + reset on open**

In `src/renderer/src/components/RequirementsList/index.tsx`, add a state beside the `ctxMenu` state (~line 136):

```ts
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; reqId: number } | null>(null)
  const [ctxSubmenu, setCtxSubmenu] = useState<'section' | null>(null)
```

In the row `onContextMenu` handler (~line 565), reset the submenu when the menu opens:

```tsx
                    onContextMenu={(e) => {
                      if (showDeleted) return
                      e.preventDefault()
                      setHighlightedId(req.id)
                      setCtxSubmenu(null)
                      setCtxMenu({ x: e.clientX, y: e.clientY, reqId: req.id })
                    }}
```

- [ ] **Step 4: Render the item + the section-picker view**

In the `ctxMenu` popover's inner `<div role="menu">`, insert the "Move to section" button between the "Copy ID" button and the divider, and wrap the whole item list so the submenu view replaces it when active. Structure the `role="menu"` body as:

```tsx
            {ctxSubmenu === 'section' ? (
              <div className="max-h-72 overflow-auto">
                <button
                  role="menuitem"
                  onClick={() => setCtxSubmenu(null)}
                  className="w-full text-left px-3 py-1.5 text-ink-faint hover:bg-action-tint/40"
                >
                  ‹ Back
                </button>
                <button
                  role="menuitem"
                  onClick={() => { updateRequirement(ctxMenu.reqId, { headingId: null }); setCtxMenu(null) }}
                  className="w-full text-left px-3 py-1.5 text-ink hover:bg-action-tint/40"
                >
                  (none)
                </button>
                {buildOutline(headings, []).map((row) =>
                  row.kind === 'heading' ? (
                    <button
                      key={row.heading.id}
                      role="menuitem"
                      onClick={() => { updateRequirement(ctxMenu.reqId, { headingId: row.heading.id }); setCtxMenu(null) }}
                      className="w-full text-left px-3 py-1.5 text-ink hover:bg-action-tint/40"
                    >
                      <span className="font-mono text-xs text-ink-faint mr-2">{row.number}</span>{row.heading.title}
                    </button>
                  ) : null
                )}
              </div>
            ) : (
              <>
                {/* the flat items from Task 2: Add entry below, Duplicate, Copy ID, then Move to section, divider, Delete */}
                {/* ...existing Add entry below / Duplicate / Copy ID buttons... */}
                <button
                  role="menuitem"
                  onClick={() => setCtxSubmenu('section')}
                  className="w-full text-left px-3 py-1.5 text-ink hover:bg-action-tint/40"
                >
                  Move to section ›
                </button>
                {/* ...divider + Delete... */}
              </>
            )}
```

Concretely: take the five buttons from Task 2, wrap them in the `ctxSubmenu === 'section' ? (...) : (<>...</>)` conditional shown above, and place the new "Move to section ›" button between "Copy ID" and the `<div className="my-1 border-t border-line" />` divider. `row.number` and `row.heading.title` come from `buildOutline` (already imported at the top of the file).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/components/RequirementsList/index.test.tsx -t "section"`
Expected: PASS (3 new tests; the Task 2 context-menu tests still green — Duplicate/Copy ID/Delete still reachable in the default view).

- [ ] **Step 6: Full-suite gate + commit**

Run: `npx vitest run && npm run typecheck`
Expected: **510 total, 509 passed / 1 failed** (the 1 = pre-existing `App.test.tsx` "open"; ~9 new tests across the 3 tasks). No other failures.

```bash
git add src/renderer/src/components/RequirementsList/index.tsx src/renderer/src/components/RequirementsList/index.test.tsx
git commit -m "feat(reqs): context-menu Move to section submenu (item 43)"
```

---

## Self-Review

**Spec coverage:**
- Duplicate (fresh reqId, below source, scalar+enum copy, custom fields deferred, selected) → Task 1 (store action) + Task 2 (menu item). ✓
- Move to section (heading submenu + "(none)", sets headingId) → Task 3. ✓
- Copy ID (clipboard, reqId string) → Task 2. ✓
- Delete (soft delete, red, divider, last) → Task 2. ✓
- Add entry below (unchanged) → preserved in Task 2's popover rewrite. ✓
- Menu closes on every action → every `onClick` calls `setCtxMenu(null)`. ✓
- No new IPC → confirmed: all via existing store/api + the new `duplicateRequirement` (which uses existing `create`/`update`/`list`). ✓

**Placeholder scan:** all code steps carry real code; the one prose direction (Task 3 Step 4 "take the five buttons from Task 2 and wrap them") references the exact buttons written verbatim in Task 2 and shows the wrapping conditional in full — no "similar to" hand-waving of unshown code.

**Type consistency:** `duplicateRequirement: (id: number) => Promise<void>` matches between the interface (Task 1 Step 3), impl (Step 4), destructure (Task 2 Step 3), and call sites. `ctxMenu.reqId` is the numeric row id throughout; Copy ID resolves it to the string `reqId` via `requirements.find`. `ctxSubmenu: 'section' | null`.

## Notes for the executor
- Tests say "match the file's existing render helper / store mock / fixture" — open the neighbouring tests first and copy their setup (how `renderList`/`baseReq`/the store mock are built, and how a partial store override is passed). Do not invent a harness. The store mock must expose `duplicateRequirement`, `headings`, and `requirements` for the new tests.
- Known accepted minor: Duplicate creates the row at defaults then updates it to the source's enum values, so the duplicate's change-history gets rows for those initial enum settings. Truthful (the duplicate action set them) and harmless; do not try to suppress history for the duplicate.
- `removeRequirement` already prunes `checkedIds` in the store — Delete needs no extra bookkeeping in the component.
