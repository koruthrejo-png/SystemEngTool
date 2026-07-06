# Requirement Hierarchy & Derivation Traceability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nested module tree (high-level → technical), derives-from links between any two requirements, and a filterable Derivation Coverage card on the Dashboard.

**Architecture:** The modules table and sidebar tree recursion ALREADY support `parent_id` — this plan adds the missing pieces: `moveModule` with cycle guard + delete-reparent in main, a new `requirement_links` table + handlers, store state for req links, add-submodule/move UI on the existing `ModuleNode`, a "Traceability" section in the requirement drawer, and a `derivationStats` pure helper + card on the Dashboard.

**Tech Stack:** Electron IPC (better-sqlite3) → preload → zustand store → React; vitest + @testing-library/react.

Spec: `docs/superpowers/specs/2026-07-06-requirement-hierarchy-design.md`

## Global Constraints

- Renderer NEVER touches the DB directly — all data flows through `window.api` (preload) → `ipcMain.handle` (main). Every new `window.api` method appears in BOTH `src/preload/index.ts` and `src/types/api.d.ts`.
- Tailwind semantic tokens only in classNames (`text-ink`, `bg-workspace`, `border-line`, `bg-action`, `text-error`, etc.; `bg-white`/`text-white` established convention).
- Soft deletes (`deleted_at`) everywhere; link listings join out soft-deleted requirements.
- Tests: `./node_modules/.bin/vitest run <paths>` — NEVER `npm run` (npm shim broken). Typechecks: `./node_modules/.bin/tsc --noEmit -p tsconfig.web.json` AND `-p tsconfig.node.json` — both clean.
- Do NOT write vitest tests under `src/main/**` (better-sqlite3 ABI mismatch; baseline = 47 main-process failures + 1 pre-existing ArchitectureCanvas failure). Main-process code is verified by typecheck + live app checks. All renderer tests must pass.
- Commits go straight to `main`. Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- PATH prefix required in every shell: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"`.
- Out of scope: req×req matrix tab, drag-and-drop module reordering, link types beyond derives-from, orphaned-link cleanup, persisted sidebar collapse state.

---

### Task 1: Modules backend — moveModule with cycle guard, delete-reparent, IPC/preload mirrors

**Files:**
- Modify: `src/main/handlers/modules.ts`
- Modify: `src/preload/index.ts` (modules group, after `restore`)
- Modify: `src/types/api.d.ts` (modules group, after `restore`)

**Interfaces:**
- Consumes: existing `rowToModule`, `now()`, `getDatabase()`; `modules.parent_id` column already exists in the schema (src/main/db/migrations.ts:21) and `createModule` already accepts `input.parentId`.
- Produces (Tasks 3-4 rely on): `window.api.modules.move(id: number, newParentId: number | null): Promise<Module>`; `deleteModule` now reparents child modules to the deleted module's parent before soft-deleting.

No vitest here (main-process). TDD is deferred to the store/UI layers; this task is verified by typecheck now and live checks post-plan.

- [ ] **Step 1: Implement `moveModule` and reparenting `deleteModule`**

In `src/main/handlers/modules.ts`, add after `updateModule`:

```ts
export function moveModule(id: number, newParentId: number | null): Module {
  const db = getDatabase()
  if (newParentId != null) {
    // Cycle guard: walk up from the target; hitting `id` means target is self or a descendant.
    let cur: number | null = newParentId
    while (cur != null) {
      if (cur === id) throw new Error('Cannot move a module into itself or its descendants')
      const row = db.prepare('SELECT parent_id FROM modules WHERE id = ?').get(cur) as any
      if (!row) throw new Error(`Module ${cur} not found`)
      cur = row.parent_id ?? null
    }
  }
  db.prepare('UPDATE modules SET parent_id = ?, updated_at = ? WHERE id = ?').run(newParentId, now(), id)
  return rowToModule(db.prepare('SELECT * FROM modules WHERE id = ?').get(id))
}
```

Replace the existing `deleteModule` body (children move up to the deleted module's parent, mirroring `deleteHeading`):

```ts
export function deleteModule(id: number): void {
  const db = getDatabase()
  db.transaction(() => {
    const mod = db.prepare('SELECT parent_id FROM modules WHERE id = ?').get(id) as any
    const ts = now()
    db.prepare('UPDATE modules SET parent_id = ?, updated_at = ? WHERE parent_id = ? AND deleted_at IS NULL')
      .run(mod?.parent_id ?? null, ts, id)
    db.prepare('UPDATE modules SET deleted_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id)
  })()
}
```

Register in `registerModuleHandlers()`:

```ts
  ipcMain.handle('modules:move', (_e, id: number, newParentId: number | null) => moveModule(id, newParentId))
```

- [ ] **Step 2: Preload + api.d.ts mirrors**

`src/preload/index.ts`, inside the `modules` group after `restore`:

```ts
    move: (id: number, newParentId: number | null): Promise<Module> => ipcRenderer.invoke('modules:move', id, newParentId),
```

`src/types/api.d.ts`, inside `modules` after `restore(id: number): Promise<void>`:

```ts
        move(id: number, newParentId: number | null): Promise<Module>
```

- [ ] **Step 3: Typecheck both configs**

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.node.json
./node_modules/.bin/tsc --noEmit -p tsconfig.web.json
```
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/main/handlers/modules.ts src/preload/index.ts src/types/api.d.ts
git commit -m "feat(modules): moveModule with cycle guard; deleteModule reparents children

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: requirement_links backend — table, handlers, preload bridge

**Files:**
- Modify: `src/main/db/migrations.ts` (new table in the `db.exec` block, after `req_headings`)
- Create: `src/main/handlers/requirementLinks.ts`
- Modify: `src/main/index.ts` (import + register)
- Modify: `src/types/index.ts` (add `RequirementLink`)
- Modify: `src/preload/index.ts`, `src/types/api.d.ts` (new `reqLinks` group)

**Interfaces:**
- Produces (Tasks 3-6 rely on): type `RequirementLink { parentReqId: number; childReqId: number }` (child derives from parent); `window.api.reqLinks.add(parentReqId, childReqId): Promise<void>`, `.remove(parentReqId, childReqId): Promise<void>`, `.listByProject(projectId): Promise<RequirementLink[]>`.
- Note: like the sibling `element_requirement_links` table, `requirement_links` carries no timestamps (deliberate consistency deviation from the spec's "timestamps" mention — the spec's own edge-case section never uses them).

- [ ] **Step 1: Migration**

In `src/main/db/migrations.ts`, append inside the `db.exec` template string after the `req_headings` table:

```sql
    CREATE TABLE IF NOT EXISTS requirement_links (
      parent_req_id INTEGER NOT NULL REFERENCES requirements(id),
      child_req_id  INTEGER NOT NULL REFERENCES requirements(id),
      PRIMARY KEY (parent_req_id, child_req_id)
    );
```

- [ ] **Step 2: Type**

In `src/types/index.ts` (next to `ElementRequirementLink`):

```ts
// Derivation link: child requirement derives from parent requirement.
export interface RequirementLink {
  parentReqId: number
  childReqId: number
}
```

- [ ] **Step 3: Handlers**

Create `src/main/handlers/requirementLinks.ts`:

```ts
import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import type { RequirementLink } from '../../types'

export function addRequirementLink(parentReqId: number, childReqId: number): void {
  const db = getDatabase()
  if (parentReqId === childReqId) throw new Error('A requirement cannot derive from itself')
  // Cycle guard: walk ancestors of parentReqId; reaching childReqId means this link closes a cycle.
  const parentsOf = db.prepare('SELECT parent_req_id FROM requirement_links WHERE child_req_id = ?')
  const seen = new Set<number>()
  const stack = [parentReqId]
  while (stack.length > 0) {
    const cur = stack.pop() as number
    if (cur === childReqId) throw new Error('Link would create a derivation cycle')
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const row of parentsOf.all(cur) as any[]) stack.push(row.parent_req_id)
  }
  db.prepare('INSERT OR IGNORE INTO requirement_links (parent_req_id, child_req_id) VALUES (?, ?)')
    .run(parentReqId, childReqId)
}

export function removeRequirementLink(parentReqId: number, childReqId: number): void {
  getDatabase()
    .prepare('DELETE FROM requirement_links WHERE parent_req_id = ? AND child_req_id = ?')
    .run(parentReqId, childReqId)
}

export function listRequirementLinksByProject(projectId: number): RequirementLink[] {
  return getDatabase().prepare(`
    SELECT l.parent_req_id AS parentReqId, l.child_req_id AS childReqId
    FROM requirement_links l
    JOIN requirements p ON p.id = l.parent_req_id
    JOIN modules pm ON pm.id = p.module_id
    JOIN requirements c ON c.id = l.child_req_id
    JOIN modules cm ON cm.id = c.module_id
    WHERE pm.project_id = ? AND cm.project_id = ?
      AND p.deleted_at IS NULL AND c.deleted_at IS NULL
  `).all(projectId, projectId) as RequirementLink[]
}

export function registerRequirementLinkHandlers(): void {
  ipcMain.handle('reqLinks:add', (_e, parentReqId: number, childReqId: number) => addRequirementLink(parentReqId, childReqId))
  ipcMain.handle('reqLinks:remove', (_e, parentReqId: number, childReqId: number) => removeRequirementLink(parentReqId, childReqId))
  ipcMain.handle('reqLinks:listByProject', (_e, projectId: number) => listRequirementLinksByProject(projectId))
}
```

In `src/main/index.ts`: `import { registerRequirementLinkHandlers } from './handlers/requirementLinks'` and call `registerRequirementLinkHandlers()` next to the other registrations inside `app.whenReady().then(...)`.

- [ ] **Step 4: Preload + api.d.ts**

`src/preload/index.ts` — add `RequirementLink` to the type imports and a new group after `elementLinks`:

```ts
  reqLinks: {
    add: (parentReqId: number, childReqId: number): Promise<void> => ipcRenderer.invoke('reqLinks:add', parentReqId, childReqId),
    remove: (parentReqId: number, childReqId: number): Promise<void> => ipcRenderer.invoke('reqLinks:remove', parentReqId, childReqId),
    listByProject: (projectId: number): Promise<RequirementLink[]> => ipcRenderer.invoke('reqLinks:listByProject', projectId)
  },
```

`src/types/api.d.ts` — add `RequirementLink` to the imports and mirror after `elementLinks`:

```ts
      reqLinks: {
        add(parentReqId: number, childReqId: number): Promise<void>
        remove(parentReqId: number, childReqId: number): Promise<void>
        listByProject(projectId: number): Promise<RequirementLink[]>
      }
```

- [ ] **Step 5: Typecheck + commit**

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.node.json
./node_modules/.bin/tsc --noEmit -p tsconfig.web.json
git add src/main/db/migrations.ts src/main/handlers/requirementLinks.ts src/main/index.ts src/types/index.ts src/preload/index.ts src/types/api.d.ts
git commit -m "feat(reqlinks): requirement_links table, cycle-guarded handlers, preload bridge

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Store — reqLinks state, moveModule, removeModule re-sync fix

**Files:**
- Modify: `src/renderer/src/store/index.ts`
- Test: `src/renderer/src/store/index.test.ts` (append tests + extend the `window.api` stub)

**Interfaces:**
- Consumes: Task 1's `window.api.modules.move`, Task 2's `window.api.reqLinks.*` and `RequirementLink`.
- Produces (Tasks 4-6 rely on): store fields `reqLinks: RequirementLink[]`; actions `moveModule(id: number, newParentId: number | null): Promise<void>`, `addReqLink(parentReqId: number, childReqId: number): Promise<void>`, `removeReqLink(parentReqId: number, childReqId: number): Promise<void>`; `loadTraceability` now also fetches `reqLinks`.
- Also fixes a latent staleness bug: `removeModule` currently filters only the deleted module locally, but Task 1's `deleteModule` reparents children in the DB — the store must re-sync `modules` from the DB after delete (same class of bug as the canvas `removeElement` fix e45f819).

- [ ] **Step 1: Write the failing tests**

In `src/renderer/src/store/index.test.ts`:

1. Extend the `window.api` stub's `modules` group with:

```ts
      move: vi.fn().mockResolvedValue({ ...mockModule, parentId: 2 }),
```

2. Add a `reqLinks` group to the stub (after `elementLinks`):

```ts
    reqLinks: {
      add: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      listByProject: vi.fn().mockResolvedValue([{ parentReqId: 1, childReqId: 2 }])
    },
```

3. Append tests at the end of the file's main `describe` block:

```ts
  it('moveModule calls the api and re-syncs the module list', async () => {
    await useStore.getState().loadProject()
    await useStore.getState().moveModule(1, 2)
    expect(window.api.modules.move).toHaveBeenCalledWith(1, 2)
    expect(window.api.modules.list).toHaveBeenCalledTimes(2) // loadProject + re-sync
  })

  it('removeModule re-syncs modules from the DB (reparented children)', async () => {
    await useStore.getState().loadProject()
    ;(window.api.modules.list as any).mockResolvedValueOnce([])
    await useStore.getState().removeModule(1)
    expect(window.api.modules.delete).toHaveBeenCalledWith(1)
    expect(useStore.getState().modules).toEqual([]) // state comes from the re-fetch, not a local filter
  })

  it('loadTraceability also loads requirement links', async () => {
    await useStore.getState().loadProject()
    await useStore.getState().loadTraceability()
    expect(window.api.reqLinks.listByProject).toHaveBeenCalledWith(1)
    expect(useStore.getState().reqLinks).toEqual([{ parentReqId: 1, childReqId: 2 }])
  })

  it('addReqLink and removeReqLink call the api and refetch links', async () => {
    await useStore.getState().loadProject()
    await useStore.getState().addReqLink(1, 2)
    expect(window.api.reqLinks.add).toHaveBeenCalledWith(1, 2)
    expect(useStore.getState().reqLinks).toEqual([{ parentReqId: 1, childReqId: 2 }])
    await useStore.getState().removeReqLink(1, 2)
    expect(window.api.reqLinks.remove).toHaveBeenCalledWith(1, 2)
  })
```

4. UPDATE the existing test `removeModule removes from list and clears selection if selected` (src/renderer/src/store/index.test.ts:92-97) — the new implementation re-fetches instead of filtering locally, so stub the refetch to return an empty list:

```ts
  it('removeModule removes from list and clears selection if selected', async () => {
    useStore.setState({ project: mockProject, modules: [mockModule], selectedModuleId: 1 })
    ;(window.api.modules.list as any).mockResolvedValueOnce([])
    await useStore.getState().removeModule(1)
    expect(useStore.getState().modules).toHaveLength(0)
    expect(useStore.getState().selectedModuleId).toBeNull()
  })
```

NOTE: if the file's `beforeEach` calls `vi.clearAllMocks()`, the `toHaveBeenCalledTimes(2)` count in the moveModule test holds per-test as written. If the suite resets differently, mirror the surrounding tests' setup idiom — keep the assertions the same.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `./node_modules/.bin/vitest run src/renderer/src/store/index.test.ts`
Expected: FAIL — `moveModule`/`addReqLink`/`removeReqLink` are not functions; `reqLinks` undefined. Pre-existing tests still pass.

- [ ] **Step 3: Implement store additions**

In `src/renderer/src/store/index.ts`:

1. Add `RequirementLink` to the type import block.
2. `Store` interface — after `traceLinks: ElementRequirementLink[]` add:

```ts
  reqLinks: RequirementLink[]
```

After `removeModule: (id: number) => Promise<void>` add:

```ts
  moveModule: (id: number, newParentId: number | null) => Promise<void>
```

After `toggleTraceLink: ...` add:

```ts
  addReqLink: (parentReqId: number, childReqId: number) => Promise<void>
  removeReqLink: (parentReqId: number, childReqId: number) => Promise<void>
```

3. Initial state — after `traceLinks: [],` add `reqLinks: [],`.
4. Replace `removeModule` and add `moveModule` after it:

```ts
  removeModule: async (id) => {
    await window.api.modules.delete(id)
    const { project, selectedModuleId } = get()
    const modules = project ? await window.api.modules.list(project.id) : []
    set({ modules, selectedModuleId: selectedModuleId === id ? null : selectedModuleId })
  },

  moveModule: async (id, newParentId) => {
    await window.api.modules.move(id, newParentId)
    const { project } = get()
    if (!project) return
    set({ modules: await window.api.modules.list(project.id) })
  },
```

5. Replace `loadTraceability` with the 4-way fetch:

```ts
  loadTraceability: async () => {
    const { project } = get()
    if (!project) return
    const [projectRequirements, elements, traceLinks, reqLinks] = await Promise.all([
      window.api.requirements.listByProject(project.id),
      window.api.elements.list(project.id),
      window.api.elementLinks.listByProject(project.id),
      window.api.reqLinks.listByProject(project.id)
    ])
    set({ projectRequirements, elements, traceLinks, reqLinks })
  },
```

6. Add after `toggleTraceLink`:

```ts
  addReqLink: async (parentReqId, childReqId) => {
    await window.api.reqLinks.add(parentReqId, childReqId)
    const { project } = get()
    if (!project) return
    set({ reqLinks: await window.api.reqLinks.listByProject(project.id) })
  },

  removeReqLink: async (parentReqId, childReqId) => {
    await window.api.reqLinks.remove(parentReqId, childReqId)
    const { project } = get()
    if (!project) return
    set({ reqLinks: await window.api.reqLinks.listByProject(project.id) })
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./node_modules/.bin/vitest run src/renderer/src/store/index.test.ts`
Expected: PASS (all pre-existing + 4 new).

- [ ] **Step 5: Full renderer check + typecheck + commit**

```bash
./node_modules/.bin/vitest run src/renderer
./node_modules/.bin/tsc --noEmit -p tsconfig.web.json
git add src/renderer/src/store/index.ts src/renderer/src/store/index.test.ts
git commit -m "feat(store): reqLinks state + moveModule; removeModule re-syncs after reparenting delete

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
Expected: suite green except the 1 pre-existing ArchitectureCanvas failure.

---

### Task 4: Module tree UI — pure helpers, add-submodule, move-to picker

**Files:**
- Create: `src/renderer/src/components/ModuleTree/moduleTree.ts`
- Test: `src/renderer/src/components/ModuleTree/moduleTree.test.ts`
- Modify: `src/renderer/src/components/ModuleTree/ModuleNode.tsx`
- Modify: `src/renderer/src/components/ModuleTree/index.tsx`
- Test: `src/renderer/src/components/ModuleTree/index.test.tsx` (create)

**Interfaces:**
- Consumes: store `addModule` (already accepts `CreateModuleInput` with `parentId`), Task 3's `moveModule`; existing `NewModuleForm` (already takes a `parentId` prop).
- Produces (Task 6 reuses): `moduleTree.ts` exports `topLevelModules(modules: Module[]): Module[]` (orphan-safe), `childrenOf(modules: Module[], parentId: number): Module[]`, `descendantIds(modules: Module[], rootId: number): Set<number>`, `flattenTree(modules: Module[]): { module: Module; depth: number }[]` (depth-first, for indented selects).

- [ ] **Step 1: Write the failing helper tests**

Create `src/renderer/src/components/ModuleTree/moduleTree.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { topLevelModules, childrenOf, descendantIds, flattenTree } from './moduleTree'
import type { Module } from '../../../../types'

const mod = (id: number, parentId: number | null, name = `M${id}`): Module => ({
  id, projectId: 1, parentId, name, idPrefix: 'M', idPadding: 4,
  nextCounter: 1, position: 0, deletedAt: null, createdAt: '', updatedAt: ''
})

describe('moduleTree helpers', () => {
  const mods = [mod(1, null), mod(2, 1), mod(3, 2), mod(4, null), mod(5, 99)] // 5 has dangling parent

  it('topLevelModules includes null-parent and orphaned modules', () => {
    expect(topLevelModules(mods).map((m) => m.id)).toEqual([1, 4, 5])
  })

  it('childrenOf returns direct children only', () => {
    expect(childrenOf(mods, 1).map((m) => m.id)).toEqual([2])
    expect(childrenOf(mods, 2).map((m) => m.id)).toEqual([3])
    expect(childrenOf(mods, 4)).toEqual([])
  })

  it('descendantIds walks the whole subtree', () => {
    expect([...descendantIds(mods, 1)].sort()).toEqual([2, 3])
    expect(descendantIds(mods, 4).size).toBe(0)
  })

  it('flattenTree yields depth-first order with depths', () => {
    expect(flattenTree(mods).map((e) => [e.module.id, e.depth])).toEqual([
      [1, 0], [2, 1], [3, 2], [4, 0], [5, 0]
    ])
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/ModuleTree/moduleTree.test.ts`
Expected: FAIL — cannot resolve `./moduleTree`.

- [ ] **Step 3: Implement `moduleTree.ts`**

```ts
import type { Module } from '../../../../types'

// Orphan-safe: a module whose parent is missing (corruption) renders as top-level, never vanishes.
export function topLevelModules(modules: Module[]): Module[] {
  return modules.filter((m) => m.parentId === null || !modules.some((p) => p.id === m.parentId))
}

export function childrenOf(modules: Module[], parentId: number): Module[] {
  return modules.filter((m) => m.parentId === parentId)
}

export function descendantIds(modules: Module[], rootId: number): Set<number> {
  const ids = new Set<number>()
  const walk = (id: number): void => {
    for (const m of modules) {
      if (m.parentId === id && !ids.has(m.id)) {
        ids.add(m.id)
        walk(m.id)
      }
    }
  }
  walk(rootId)
  return ids
}

export function flattenTree(modules: Module[]): { module: Module; depth: number }[] {
  const out: { module: Module; depth: number }[] = []
  const visit = (mods: Module[], depth: number): void => {
    for (const m of mods) {
      out.push({ module: m, depth })
      visit(childrenOf(modules, m.id), depth + 1)
    }
  }
  visit(topLevelModules(modules), 0)
  return out
}
```

Run: `./node_modules/.bin/vitest run src/renderer/src/components/ModuleTree/moduleTree.test.ts` — expected PASS (4 tests).

- [ ] **Step 4: Write the failing component test**

Create `src/renderer/src/components/ModuleTree/index.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import ModuleTree from './index'

const storeState: any = {}

vi.mock('../../store', () => ({
  useStore: () => storeState
}))

const mod = (id: number, parentId: number | null, name: string): any => ({
  id, projectId: 1, parentId, name, idPrefix: 'M', idPadding: 4,
  nextCounter: 1, position: 0, deletedAt: null, createdAt: '', updatedAt: ''
})

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(storeState, {
    project: { id: 1, name: 'Demo' },
    modules: [mod(1, null, 'System'), mod(2, 1, 'Software'), mod(3, null, 'Hardware')],
    selectedModuleId: null,
    selectModule: vi.fn().mockResolvedValue(undefined),
    addModule: vi.fn().mockResolvedValue(undefined),
    updateModule: vi.fn().mockResolvedValue(undefined),
    removeModule: vi.fn().mockResolvedValue(undefined),
    moveModule: vi.fn().mockResolvedValue(undefined)
  })
})

describe('ModuleTree hierarchy', () => {
  it('renders nested modules', () => {
    render(<ModuleTree />)
    expect(screen.getByText('System')).toBeInTheDocument()
    expect(screen.getByText('Software')).toBeInTheDocument()
    expect(screen.getByText('Hardware')).toBeInTheDocument()
  })

  it('opens the add-submodule form scoped to the parent and submits with parentId', async () => {
    render(<ModuleTree />)
    fireEvent.click(screen.getByLabelText('Add submodule to System'))
    fireEvent.change(screen.getByPlaceholderText('Module name'), { target: { value: 'Subsystem' } })
    fireEvent.change(screen.getByPlaceholderText('ID prefix (e.g. SRS)'), { target: { value: 'SUB' } })
    fireEvent.submit(screen.getByPlaceholderText('Module name').closest('form')!)
    expect(storeState.addModule).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 1, name: 'Subsystem', idPrefix: 'SUB' })
    )
  })

  it('move picker excludes self and descendants and calls moveModule', () => {
    render(<ModuleTree />)
    fireEvent.click(screen.getByLabelText('Move System'))
    const select = screen.getByLabelText('Move System to')
    const options = within(select).getAllByRole('option').map((o) => o.textContent)
    expect(options).toContain('(top level)')
    expect(options).toContain('Hardware')
    expect(options).not.toContain('System') // self
    expect(options).not.toContain('Software') // descendant
    fireEvent.change(select, { target: { value: '3' } })
    expect(storeState.moveModule).toHaveBeenCalledWith(1, 3)
  })

  it('move to top level passes null', () => {
    render(<ModuleTree />)
    fireEvent.click(screen.getByLabelText('Move Software'))
    fireEvent.change(screen.getByLabelText('Move Software to'), { target: { value: '' } })
    expect(storeState.moveModule).toHaveBeenCalledWith(2, null)
  })
})
```

- [ ] **Step 5: Run to verify fail**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/ModuleTree/index.test.tsx`
Expected: FAIL — `Add submodule to System` / `Move System` labels don't exist.

- [ ] **Step 6: Implement the UI**

`src/renderer/src/components/ModuleTree/ModuleNode.tsx` — full replacement:

```tsx
import { useState } from 'react'
import type { Module, CreateModuleInput } from '../../../../types'
import { childrenOf, descendantIds } from './moduleTree'
import NewModuleForm from './NewModuleForm'

interface Props {
  module: Module
  allModules: Module[]
  depth: number
  projectId: number
  selectedModuleId: number | null
  onSelect: (id: number) => void
  onDelete: (id: number) => void
  onRename: (id: number, name: string) => void
  onAddChild: (input: CreateModuleInput) => Promise<void>
  onMove: (id: number, newParentId: number | null) => void
}

export default function ModuleNode({
  module, allModules, depth, projectId, selectedModuleId,
  onSelect, onDelete, onRename, onAddChild, onMove
}: Props): JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(module.name)
  const [addingChild, setAddingChild] = useState(false)
  const [moving, setMoving] = useState(false)
  const children = childrenOf(allModules, module.id)
  const isSelected = selectedModuleId === module.id
  const excluded = descendantIds(allModules, module.id)
  const moveTargets = allModules.filter((m) => m.id !== module.id && !excluded.has(m.id))

  function handleContextMenu(e: React.MouseEvent): void {
    e.preventDefault()
    const choice = window.confirm(`Rename "${module.name}"?\nOK = Rename   Cancel = Delete`)
    if (choice) { setRenameValue(module.name); setRenaming(true) }
    else if (window.confirm(`Delete "${module.name}"?`)) onDelete(module.id)
  }

  return (
    <div>
      <div
        style={{ paddingLeft: `${(depth + 1) * 12}px` }}
        className={`group flex items-center gap-1.5 pr-2 py-1.5 mx-2 my-0.5 cursor-pointer text-sm rounded select-none transition-colors
          ${isSelected ? 'bg-action-tint text-ink font-medium' : 'hover:bg-workspace text-ink-muted'}`}
        onClick={() => onSelect(module.id)}
        onContextMenu={handleContextMenu}
      >
        <button className="w-4 shrink-0 text-ink-faint hover:text-ink-muted"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}>
          {children.length > 0 ? (expanded ? '▾' : '▸') : ''}
        </button>
        <svg className="w-3.5 h-3.5 shrink-0 text-ink-faint" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M2 5.5A1.5 1.5 0 013.5 4h4.379a1.5 1.5 0 011.06.44l1.122 1.12a1.5 1.5 0 001.06.44H16.5A1.5 1.5 0 0118 7.5v7A1.5 1.5 0 0116.5 16h-13A1.5 1.5 0 012 14.5v-9z" />
        </svg>
        {renaming ? (
          <form onSubmit={(e) => { e.preventDefault(); if (renameValue.trim()) onRename(module.id, renameValue.trim()); setRenaming(false) }}
            onClick={(e) => e.stopPropagation()}>
            <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => setRenaming(false)}
              className="text-sm border border-action rounded px-1 py-0 w-32 focus:outline-none" />
          </form>
        ) : (
          <span className="truncate flex-1">{module.name}</span>
        )}
        {!renaming && (
          <span className="hidden group-hover:flex items-center gap-0.5 shrink-0">
            <button
              aria-label={`Add submodule to ${module.name}`}
              title="Add submodule"
              className="px-1 text-ink-faint hover:text-action leading-none"
              onClick={(e) => { e.stopPropagation(); setAddingChild(true); setExpanded(true) }}
            >
              +
            </button>
            <button
              aria-label={`Move ${module.name}`}
              title="Move to…"
              className="px-1 text-ink-faint hover:text-action leading-none"
              onClick={(e) => { e.stopPropagation(); setMoving((v) => !v) }}
            >
              ⇄
            </button>
          </span>
        )}
      </div>
      {moving && (
        <div style={{ paddingLeft: `${(depth + 2) * 12}px` }} className="pr-3 py-1" onClick={(e) => e.stopPropagation()}>
          <select
            aria-label={`Move ${module.name} to`}
            autoFocus
            defaultValue={module.parentId === null ? '' : String(module.parentId)}
            onChange={(e) => {
              onMove(module.id, e.target.value === '' ? null : Number(e.target.value))
              setMoving(false)
            }}
            onBlur={() => setMoving(false)}
            className="w-full text-xs border border-line rounded px-1 py-1 bg-white text-ink focus:outline-none focus:border-action"
          >
            <option value="">(top level)</option>
            {moveTargets.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      )}
      {addingChild && (
        <div style={{ paddingLeft: `${(depth + 2) * 12}px` }} className="pr-3">
          <NewModuleForm projectId={projectId} parentId={module.id}
            onSubmit={async (input) => { await onAddChild(input); setAddingChild(false) }}
            onCancel={() => setAddingChild(false)} />
        </div>
      )}
      {expanded && children.map((child) => (
        <ModuleNode key={child.id} module={child} allModules={allModules} depth={depth + 1}
          projectId={projectId} selectedModuleId={selectedModuleId}
          onSelect={onSelect} onDelete={onDelete} onRename={onRename}
          onAddChild={onAddChild} onMove={onMove} />
      ))}
    </div>
  )
}
```

`src/renderer/src/components/ModuleTree/index.tsx` — update the store destructure to add `moveModule`, replace the `topLevel` computation and the `ModuleNode` render:

```tsx
import { topLevelModules } from './moduleTree'
```

```tsx
  const { project, modules, selectedModuleId, selectModule, addModule, updateModule, removeModule, moveModule } = useStore()
```

```tsx
  const topLevel = topLevelModules(modules)
```

```tsx
        {topLevel.map((mod) => (
          <ModuleNode key={mod.id} module={mod} allModules={modules} depth={0}
            projectId={project.id}
            selectedModuleId={selectedModuleId} onSelect={selectModule}
            onDelete={removeModule}
            onRename={(id, name) => updateModule(id, { name })}
            onAddChild={addModule}
            onMove={moveModule} />
        ))}
```

- [ ] **Step 7: Run component tests, full suite, typecheck**

```bash
./node_modules/.bin/vitest run src/renderer/src/components/ModuleTree
./node_modules/.bin/vitest run src/renderer
./node_modules/.bin/tsc --noEmit -p tsconfig.web.json
```
Expected: ModuleTree 8 tests pass; suite green except 1 pre-existing ArchitectureCanvas failure; typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/ModuleTree
git commit -m "feat(modules): sidebar tree — add submodule, move-to picker, orphan-safe helpers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Requirement drawer — Traceability section (derives-from links)

**Files:**
- Modify: `src/renderer/src/components/RequirementDetail/index.tsx`
- Test: `src/renderer/src/components/RequirementDetail/traceability.test.tsx` (create — keep the existing `index.test.tsx` untouched)

**Interfaces:**
- Consumes: store `reqLinks`, `projectRequirements`, `modules`, `loadTraceability`, `addReqLink`, `removeReqLink`, `openRequirement` (Task 3); `flattenTree` from Task 4.
- Produces: nothing consumed later.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/components/RequirementDetail/traceability.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import RequirementDetail from './index'

const storeState: any = {}

vi.mock('../../store', () => ({
  useStore: () => storeState
}))

const req = (id: number, moduleId: number, text: string): any => ({
  id, moduleId, reqId: `R-${id}`, text,
  acceptanceCriteria: null, source: null, rationale: null,
  status: 'Draft', priority: 'Medium', reqType: 'Functional',
  headingId: null, position: 0, deletedAt: null, createdAt: '', updatedAt: ''
})

const mod = (id: number, parentId: number | null, name: string): any => ({
  id, projectId: 1, parentId, name, idPrefix: 'M', idPadding: 4,
  nextCounter: 1, position: 0, deletedAt: null, createdAt: '', updatedAt: ''
})

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(storeState, {
    selectedRequirementId: 2,
    requirements: [req(2, 2, 'Low level req')],
    projectRequirements: [req(1, 1, 'High level req'), req(2, 2, 'Low level req'), req(3, 1, 'Unlinked high')],
    modules: [mod(1, null, 'System'), mod(2, 1, 'Software')],
    headings: [],
    customFields: [],
    reqLinks: [{ parentReqId: 1, childReqId: 2 }],
    loadCustomFields: vi.fn().mockResolvedValue(undefined),
    addCustomField: vi.fn(), updateCustomField: vi.fn(), removeCustomField: vi.fn(),
    updateRequirement: vi.fn().mockResolvedValue(undefined),
    loadTraceability: vi.fn().mockResolvedValue(undefined),
    addReqLink: vi.fn().mockResolvedValue(undefined),
    removeReqLink: vi.fn().mockResolvedValue(undefined),
    openRequirement: vi.fn().mockResolvedValue(undefined)
  })
})

describe('RequirementDetail traceability section', () => {
  it('loads links on mount and lists parents with remove + navigate', () => {
    render(<RequirementDetail />)
    expect(storeState.loadTraceability).toHaveBeenCalled()
    const parents = screen.getByTestId('derives-from')
    expect(within(parents).getByText('R-1')).toBeInTheDocument()
    fireEvent.click(within(parents).getByText('R-1').closest('button')!)
    expect(storeState.openRequirement).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
    fireEvent.click(within(parents).getByLabelText('Remove link to R-1'))
    expect(storeState.removeReqLink).toHaveBeenCalledWith(1, 2)
  })

  it('adds a parent link via the module + requirement picker', () => {
    render(<RequirementDetail />)
    const section = screen.getByTestId('traceability-section')
    fireEvent.change(within(section).getByLabelText('Link module'), { target: { value: '1' } })
    fireEvent.change(within(section).getByLabelText('Link requirement'), { target: { value: '3' } })
    fireEvent.click(within(section).getByText('Add as parent'))
    expect(storeState.addReqLink).toHaveBeenCalledWith(3, 2) // parent = picked req, child = current
    fireEvent.click(within(section).getByText('Add as child'))
    expect(storeState.addReqLink).toHaveBeenCalledWith(2, 3) // parent = current, child = picked
  })

  it('picker excludes self and already-linked requirements', () => {
    render(<RequirementDetail />)
    const section = screen.getByTestId('traceability-section')
    fireEvent.change(within(section).getByLabelText('Link module'), { target: { value: '1' } })
    const options = within(within(section).getByLabelText('Link requirement') as HTMLElement)
      .getAllByRole('option').map((o) => o.textContent)
    expect(options.join()).toContain('R-3')
    expect(options.join()).not.toContain('R-1') // already linked as parent
  })

  it('shows the derived-by list with the child count', () => {
    storeState.selectedRequirementId = 1
    storeState.requirements = [req(1, 1, 'High level req')]
    render(<RequirementDetail />)
    const children = screen.getByTestId('derived-by')
    expect(within(children).getByText('R-2')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/RequirementDetail/traceability.test.tsx`
Expected: FAIL — `traceability-section` test id does not exist.

- [ ] **Step 3: Implement the section**

In `src/renderer/src/components/RequirementDetail/index.tsx`:

1. Extend imports:

```tsx
import type { RequirementStatus, RequirementPriority, RequirementType, Requirement } from '../../../../types'
import { flattenTree } from '../ModuleTree/moduleTree'
```

2. After the Custom Fields block (inside the scroll area), add:

```tsx
        <TraceabilitySection req={req} />
```

3. Add at file end (after `Field`):

```tsx
function TraceabilitySection({ req }: { req: Requirement }): JSX.Element {
  const {
    modules, projectRequirements, reqLinks,
    loadTraceability, addReqLink, removeReqLink, openRequirement
  } = useStore()
  const [pickModuleId, setPickModuleId] = useState<string>('')
  const [pickReqId, setPickReqId] = useState<string>('')

  useEffect(() => { loadTraceability() }, [req.id])

  const byId = new Map(projectRequirements.map((r) => [r.id, r]))
  const parents = reqLinks.filter((l) => l.childReqId === req.id)
    .map((l) => byId.get(l.parentReqId)).filter((r): r is Requirement => r !== undefined)
  const children = reqLinks.filter((l) => l.parentReqId === req.id)
    .map((l) => byId.get(l.childReqId)).filter((r): r is Requirement => r !== undefined)
  const linkedIds = new Set([req.id, ...parents.map((r) => r.id), ...children.map((r) => r.id)])
  const candidates = pickModuleId === ''
    ? []
    : projectRequirements.filter((r) => r.moduleId === Number(pickModuleId) && !linkedIds.has(r.id))
  const picked = pickReqId === '' ? null : byId.get(Number(pickReqId)) ?? null

  function LinkList({ title, reqs, testId, removeAs }: {
    title: string
    reqs: Requirement[]
    testId: string
    removeAs: 'parent' | 'child'
  }): JSX.Element {
    return (
      <div data-testid={testId} className="space-y-1">
        <div className="text-xs font-medium text-ink-muted">{title}</div>
        {reqs.length === 0 && <div className="text-xs text-ink-faint">None.</div>}
        {reqs.map((r) => (
          <div key={r.id} className="flex items-center gap-2">
            <button onClick={() => openRequirement(r)}
              className="flex-1 min-w-0 text-left flex gap-2 items-baseline hover:bg-action-tint/20 rounded px-1 py-0.5">
              <span className="text-xs font-mono text-ink-faint shrink-0">{r.reqId}</span>
              <span className="text-xs text-ink truncate">{r.text || '—'}</span>
            </button>
            <button
              aria-label={`Remove link to ${r.reqId}`}
              onClick={() => removeAs === 'parent' ? removeReqLink(r.id, req.id) : removeReqLink(req.id, r.id)}
              className="text-ink-faint hover:text-error text-lg leading-none px-1"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div data-testid="traceability-section" className="space-y-3 pt-2 border-t border-line">
      <SectionLabel className="block pt-2">Traceability</SectionLabel>
      <LinkList title="Derives from" reqs={parents} testId="derives-from" removeAs="parent" />
      <LinkList title="Derived by" reqs={children} testId="derived-by" removeAs="child" />
      <div className="space-y-2">
        <div className="flex gap-2">
          <Select aria-label="Link module" value={pickModuleId}
            onChange={(e) => { setPickModuleId(e.target.value); setPickReqId('') }} className="flex-1">
            <option value="">Pick module…</option>
            {flattenTree(modules).map(({ module: m, depth }) => (
              <option key={m.id} value={m.id}>{' '.repeat(depth * 2)}{m.name}</option>
            ))}
          </Select>
          <Select aria-label="Link requirement" value={pickReqId}
            onChange={(e) => setPickReqId(e.target.value)} className="flex-1">
            <option value="">Pick requirement…</option>
            {candidates.map((r) => (
              <option key={r.id} value={r.id}>{r.reqId} {r.text.slice(0, 40)}</option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" className="!px-2 !py-1 !text-xs" disabled={!picked}
            onClick={() => { if (picked) { addReqLink(picked.id, req.id); setPickReqId('') } }}>
            Add as parent
          </Button>
          <Button variant="ghost" className="!px-2 !py-1 !text-xs" disabled={!picked}
            onClick={() => { if (picked) { addReqLink(req.id, picked.id); setPickReqId('') } }}>
            Add as child
          </Button>
        </div>
      </div>
    </div>
  )
}
```

NOTE: check the `Button` primitive supports `disabled` passthrough (`src/renderer/src/components/ui/index.tsx`) — it spreads HTML props in this codebase; if not, add `disabled?: boolean` passthrough there as part of this task.

- [ ] **Step 4: Run tests**

```bash
./node_modules/.bin/vitest run src/renderer/src/components/RequirementDetail
./node_modules/.bin/tsc --noEmit -p tsconfig.web.json
```
Expected: new file 4/4 + existing `index.test.tsx` still green (its store mock may need the new members — `reqLinks: []`, `projectRequirements: []`, `modules: []`, `loadTraceability`, `addReqLink`, `removeReqLink`, `openRequirement` as `vi.fn()` — add them to its `storeState` if it fails); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/RequirementDetail
git commit -m "feat(reqlinks): traceability section in requirement drawer — derives-from/derived-by

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Dashboard — derivationStats helper + filterable Derivation Coverage card

**Files:**
- Modify: `src/renderer/src/components/Dashboard/stats.ts`
- Modify: `src/renderer/src/components/Dashboard/stats.test.ts` (append)
- Modify: `src/renderer/src/components/Dashboard/index.tsx`
- Modify: `src/renderer/src/components/Dashboard/index.test.tsx` (append + extend mock)

**Interfaces:**
- Consumes: store `reqLinks` (Task 3), `RequirementLink` type (Task 2), `flattenTree` (Task 4), existing `openRequirement`.
- Produces: `derivationStats(requirements: Requirement[], reqLinks: RequirementLink[], moduleId: number | null, direction: 'hasParent' | 'hasChildren'): { total: number; linked: number; pct: number; unlinked: Requirement[] }` exported from `Dashboard/stats.ts`.

- [ ] **Step 1: Write the failing stats tests**

Append to `src/renderer/src/components/Dashboard/stats.test.ts` (extend the import with `derivationStats`):

```ts
describe('derivationStats', () => {
  const links = [{ parentReqId: 1, childReqId: 3 }] // req 3 (module 2) derives from req 1 (module 1)
  const reqs = [
    req({ id: 1, moduleId: 1 }), req({ id: 2, moduleId: 1 }),
    req({ id: 3, moduleId: 2 }), req({ id: 4, moduleId: 2 })
  ]

  it('hasChildren: high-level reqs with at least one derived child', () => {
    const s = derivationStats(reqs, links, 1, 'hasChildren')
    expect(s).toMatchObject({ total: 2, linked: 1, pct: 50 })
    expect(s.unlinked.map((r) => r.id)).toEqual([2])
  })

  it('hasParent: low-level reqs traced to a parent', () => {
    const s = derivationStats(reqs, links, 2, 'hasParent')
    expect(s).toMatchObject({ total: 2, linked: 1, pct: 50 })
    expect(s.unlinked.map((r) => r.id)).toEqual([4])
  })

  it('All modules scope and empty input', () => {
    expect(derivationStats(reqs, links, null, 'hasParent').total).toBe(4)
    expect(derivationStats([], [], null, 'hasChildren')).toMatchObject({ total: 0, linked: 0, pct: 0, unlinked: [] })
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/Dashboard/stats.test.ts`
Expected: FAIL — `derivationStats` not exported.

- [ ] **Step 3: Implement `derivationStats`**

In `src/renderer/src/components/Dashboard/stats.ts` — add `RequirementLink` to the type import and append:

```ts
export interface DerivationStats {
  total: number
  linked: number
  pct: number
  unlinked: Requirement[]
}

export function derivationStats(
  requirements: Requirement[],
  reqLinks: RequirementLink[],
  moduleId: number | null,
  direction: 'hasParent' | 'hasChildren'
): DerivationStats {
  const scoped = moduleId === null ? requirements : requirements.filter((r) => r.moduleId === moduleId)
  const linkedIds = direction === 'hasParent'
    ? new Set(reqLinks.map((l) => l.childReqId))
    : new Set(reqLinks.map((l) => l.parentReqId))
  const unlinked = scoped.filter((r) => !linkedIds.has(r.id))
  const linked = scoped.length - unlinked.length
  return {
    total: scoped.length,
    linked,
    pct: scoped.length === 0 ? 0 : Math.round((linked / scoped.length) * 100),
    unlinked
  }
}
```

Run: `./node_modules/.bin/vitest run src/renderer/src/components/Dashboard/stats.test.ts` — expected PASS.

- [ ] **Step 4: Write the failing card tests**

In `src/renderer/src/components/Dashboard/index.test.tsx`:

1. Extend the `beforeEach` `storeState` with:

```ts
    reqLinks: [{ parentReqId: 1, childReqId: 2 }],
```

2. Append tests:

```tsx
  it('renders derivation coverage with module and direction filters', () => {
    render(<Dashboard />)
    const card = screen.getByTestId('derivation-coverage')
    // default: All modules, direction hasParent → req 1 unlinked (no parent), req 2 linked
    expect(within(card).getByText('1 / 2 linked')).toBeInTheDocument()
    expect(within(card).getByText('SRS-1')).toBeInTheDocument() // unlinked list
    fireEvent.click(within(card).getByText('Has children'))
    // hasChildren → req 1 linked (has child), req 2 unlinked
    expect(within(card).getByText('SRS-2')).toBeInTheDocument()
    fireEvent.click(within(card).getByText('SRS-2').closest('button')!)
    expect(storeState.openRequirement).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }))
  })

  it('derivation module filter narrows the scope', () => {
    render(<Dashboard />)
    const card = screen.getByTestId('derivation-coverage')
    fireEvent.change(within(card).getByLabelText('Derivation module filter'), { target: { value: '1' } })
    expect(within(card).getByText('1 / 2 linked')).toBeInTheDocument()
  })
```

- [ ] **Step 5: Run to verify fail**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/Dashboard/index.test.tsx`
Expected: FAIL — `derivation-coverage` test id does not exist.

- [ ] **Step 6: Implement the card**

In `src/renderer/src/components/Dashboard/index.tsx`:

1. Extend imports:

```tsx
import { useEffect, useState } from 'react'
import { computeStats, timeAgo, derivationStats } from './stats'
import { flattenTree } from '../ModuleTree/moduleTree'
import type { Module, Requirement, RequirementLink } from '../../../../types'
```

2. Destructure `reqLinks` from the store in `Dashboard` and add a full-width row between the donut/bars grid and the activity/gaps grid:

```tsx
        <DerivationCard
          requirements={projectRequirements}
          reqLinks={reqLinks}
          modules={modules}
          onOpen={openRequirement}
        />
```

3. Add the component at file end:

```tsx
function DerivationCard({
  requirements, reqLinks, modules, onOpen
}: {
  requirements: Requirement[]
  reqLinks: RequirementLink[]
  modules: Module[]
  onOpen: (req: Requirement) => Promise<void>
}): JSX.Element {
  const [moduleId, setModuleId] = useState<string>('')
  const [direction, setDirection] = useState<'hasParent' | 'hasChildren'>('hasParent')
  const s = derivationStats(requirements, reqLinks, moduleId === '' ? null : Number(moduleId), direction)
  return (
    <div className="bg-white border border-line rounded p-4" data-testid="derivation-coverage">
      <div className="flex items-center justify-between mb-3 gap-3">
        <SectionLabel>Derivation Coverage</SectionLabel>
        <div className="flex items-center gap-2">
          <select
            aria-label="Derivation module filter"
            value={moduleId}
            onChange={(e) => setModuleId(e.target.value)}
            className="text-xs border border-line rounded px-1.5 py-1 bg-white text-ink focus:outline-none focus:border-action"
          >
            <option value="">All modules</option>
            {flattenTree(modules).map(({ module: m, depth }) => (
              <option key={m.id} value={m.id}>{' '.repeat(depth * 2)}{m.name}</option>
            ))}
          </select>
          <span className="flex rounded border border-line overflow-hidden text-xs">
            {([['hasParent', 'Has parent'], ['hasChildren', 'Has children']] as const).map(([dir, label]) => (
              <button
                key={dir}
                onClick={() => setDirection(dir)}
                className={`px-2 py-1 ${direction === dir ? 'bg-action text-white' : 'bg-white text-ink-muted hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-sm font-semibold text-ink">{s.linked} / {s.total} linked</span>
        <span className="flex-1 h-1.5 rounded bg-line overflow-hidden">
          <span className="block h-full bg-action" style={{ width: `${s.pct}%` }} />
        </span>
        <span className="text-sm font-semibold text-ink">{s.pct}%</span>
      </div>
      {s.total === 0 && <div className="text-xs text-ink-faint">No requirements in scope.</div>}
      {s.total > 0 && s.unlinked.length === 0 && (
        <div className="text-xs text-ink-faint">Every requirement in scope is linked.</div>
      )}
      {s.unlinked.length > 0 && (
        <div className="divide-y divide-line/60 max-h-56 overflow-y-auto">
          {s.unlinked.map((r) => (
            <button key={r.id} onClick={() => onOpen(r)}
              className="w-full text-left py-1.5 px-1 rounded flex gap-2 items-baseline hover:bg-action-tint/20">
              <span className="text-xs font-mono text-ink-faint shrink-0">{r.reqId}</span>
              <span className="text-xs text-ink truncate">{r.text || '—'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Full suite + typecheck**

```bash
./node_modules/.bin/vitest run src/renderer
./node_modules/.bin/tsc --noEmit -p tsconfig.web.json
```
Expected: green except 1 pre-existing ArchitectureCanvas failure; typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/Dashboard
git commit -m "feat(dashboard): filterable derivation coverage card — module + direction, unlinked list

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Verification — full suite, typechecks, build

**Files:** none (verification only; fix regressions if found and document them).

- [ ] **Step 1: Full suite vs baseline**

Run: `./node_modules/.bin/vitest run`
Expected: failures = 47 main-process ABI + 1 pre-existing ArchitectureCanvas, nothing else.

- [ ] **Step 2: Both typechecks**

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.node.json
./node_modules/.bin/tsc --noEmit -p tsconfig.web.json
```
Expected: clean.

- [ ] **Step 3: Build**

Run: `./node_modules/.bin/electron-vite build`
Expected: 3 targets build clean.

- [ ] **Step 4: Commit (only if fixes were needed)**

If Steps 1-3 forced changes, commit them with a message describing the fix; otherwise nothing to commit.

---

## Post-plan verification (controller, not a task)

Launch via the Playwright driver against the SmokeTest project: create a submodule under SRS (appears indented, chevron works); move it to top level and back (cycle guard: moving SRS under its own child must fail silently in UI / error in main log); open a requirement → Traceability section → add "derives from" link to a req in another module; verify link appears in both requirements' sections (derives-from on one, derived-by on the other); Dashboard → Derivation Coverage: filter by each module and toggle direction, confirm counts match the created links; click an unlinked req → drawer opens on it; relaunch app → links and module tree persist.
