# Architecture Canvas Undo/Redo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-level undo/redo to the architecture canvas covering create, delete, and property edits of blocks and connections.

**Architecture:** Inverse-command stack held in the zustand store (`undoStack`/`redoStack`, session-only). Commands issue raw `window.api` IPC calls; after each undo/redo the store re-fetches via `loadArchitecture()`. Soft-deletes give stable IDs, so undo/redo of create/delete is a `delete` ↔ `restore` pair — one new IPC primitive.

**Tech Stack:** Electron (main + preload IPC), better-sqlite3, React + zustand, @xyflow/react, Vitest + Testing Library.

## Global Constraints

- Deletes are soft (`deleted_at`); rows are never hard-deleted. Restore = `deleted_at = NULL`.
- Undo must persist to the DB via IPC — in-memory-only undo desyncs on the next `loadArchitecture()`.
- History is session-only; cleared on `loadProject`. No durability across restart.
- Move/resize/nest are OUT of scope — no undo command for geometry/parent-only patches.
- Follow existing patterns: handler `now()`/`rowTo*` helpers, `ipcMain.handle` registration, preload `ipcRenderer.invoke`, store actions returning `Promise<void>`.

---

### Task 1: Restore IPC primitives (elements + connections)

**Files:**
- Modify: `src/main/handlers/elements.ts`
- Modify: `src/main/handlers/connections.ts`
- Test: `src/main/handlers/elements.test.ts`, `src/main/handlers/connections.test.ts`

**Interfaces:**
- Produces: `restoreElement(id: number): ArchitectureElement`, IPC `elements:restore`; `restoreConnection(id: number): ArchitectureConnection`, IPC `connections:restore`. Both clear `deleted_at`.

- [ ] **Step 1: Write the failing test — elements restore**

Add to `src/main/handlers/elements.test.ts` (import `restoreElement` in the existing import from `./elements`):

```ts
  it('restoreElement clears deleted_at and returns the row to the list', () => {
    const a = createElement({ projectId })
    deleteElement(a.id)
    expect(listElements(projectId)).toHaveLength(0)
    const restored = restoreElement(a.id)
    expect(restored.deletedAt).toBeNull()
    expect(listElements(projectId)).toHaveLength(1)
  })
```

- [ ] **Step 2: Write the failing test — connections restore**

Add to `src/main/handlers/connections.test.ts` (import `restoreConnection` alongside the existing connections imports; create two elements first if the file's pattern needs valid source/target — follow the existing `createConnection` test setup in that file):

```ts
  it('restoreConnection clears deleted_at and returns the row to the list', () => {
    const a = createElement({ projectId })
    const b = createElement({ projectId })
    const conn = createConnection({ projectId, sourceId: a.id, targetId: b.id })
    deleteConnection(conn.id)
    expect(listConnections(projectId)).toHaveLength(0)
    const restored = restoreConnection(conn.id)
    expect(restored.deletedAt).toBeNull()
    expect(listConnections(projectId)).toHaveLength(1)
  })
```

(If `createElement`/`deleteConnection` are not yet imported in `connections.test.ts`, add them to the imports from `./elements` and `./connections`.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- src/main/handlers/elements.test.ts src/main/handlers/connections.test.ts`
Expected: FAIL — `restoreElement`/`restoreConnection` is not a function.

- [ ] **Step 4: Implement `restoreElement`**

In `src/main/handlers/elements.ts`, add after `deleteElement`:

```ts
export function restoreElement(id: number): ArchitectureElement {
  const db = getDatabase()
  db.prepare('UPDATE architecture_elements SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(now(), id)
  return rowToElement(db.prepare('SELECT * FROM architecture_elements WHERE id = ?').get(id))
}
```

In `registerElementHandlers`, add:

```ts
  ipcMain.handle('elements:restore', (_e, id: number) => restoreElement(id))
```

- [ ] **Step 5: Implement `restoreConnection`**

In `src/main/handlers/connections.ts`, add after `deleteConnection`:

```ts
export function restoreConnection(id: number): ArchitectureConnection {
  const db = getDatabase()
  db.prepare('UPDATE architecture_connections SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(now(), id)
  return rowToConnection(db.prepare('SELECT * FROM architecture_connections WHERE id = ?').get(id))
}
```

In `registerConnectionHandlers`, add:

```ts
  ipcMain.handle('connections:restore', (_e, id: number) => restoreConnection(id))
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- src/main/handlers/elements.test.ts src/main/handlers/connections.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main/handlers/elements.ts src/main/handlers/connections.ts src/main/handlers/elements.test.ts src/main/handlers/connections.test.ts
git commit -m "feat(arch): restore IPC for soft-deleted elements and connections"
```

---

### Task 2: Preload bridge + API types for restore

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Modify: `src/types/api.d.ts`

**Interfaces:**
- Consumes: `elements:restore`, `connections:restore` IPC channels (Task 1).
- Produces: `window.api.elements.restore(id): Promise<ArchitectureElement>`, `window.api.connections.restore(id): Promise<ArchitectureConnection>`.

- [ ] **Step 1: Add preload bridge methods**

In `src/preload/index.ts`, in the `elements` object add after `delete`:

```ts
    restore: (id: number): Promise<ArchitectureElement> => ipcRenderer.invoke('elements:restore', id)
```

(Add a comma after the existing `delete` line.) In the `connections` object add after `delete`:

```ts
    restore: (id: number): Promise<ArchitectureConnection> => ipcRenderer.invoke('connections:restore', id)
```

- [ ] **Step 2: Add types to `src/types/api.d.ts`**

In the `elements` block add after `delete(...)`:

```ts
        restore(id: number): Promise<ArchitectureElement>
```

In the `connections` block add after `delete(...)`:

```ts
        restore(id: number): Promise<ArchitectureConnection>
```

- [ ] **Step 3: Mirror in `src/preload/index.d.ts`**

Add the same `restore` signatures to the `elements` and `connections` blocks in `src/preload/index.d.ts` (this file mirrors `api.d.ts`; if it re-exports the same `Api` type instead of duplicating, no change is needed — verify by reading the file first).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors about missing `restore`).

- [ ] **Step 5: Commit**

```bash
git add src/preload/index.ts src/preload/index.d.ts src/types/api.d.ts
git commit -m "feat(arch): expose elements/connections restore over preload bridge"
```

---

### Task 3: Undo stack scaffolding + create commands

**Files:**
- Modify: `src/renderer/src/store/index.ts`
- Test: `src/renderer/src/store/index.test.ts`

**Interfaces:**
- Consumes: `window.api.elements.restore`, `window.api.connections.restore` (Task 2); existing `loadArchitecture`, `loadProject`.
- Produces: store `undoStack: UndoCommand[]`, `redoStack: UndoCommand[]`, `undo(): Promise<void>`, `redo(): Promise<void>`, `clearHistory(): void`; module helper `pushUndo(cmd)`; `addElement`/`addConnection` now push create commands (`undo`=delete, `redo`=restore).
- `interface UndoCommand { undo: () => Promise<void>; redo: () => Promise<void> }`

- [ ] **Step 1: Extend the store test mock**

In `src/renderer/src/store/index.test.ts`, add to the `elements` mock object: `restore: vi.fn().mockResolvedValue(mockElement)`. Add to the `connections` mock object: `create: vi.fn().mockResolvedValue(mockConn)` and `restore: vi.fn().mockResolvedValue(mockConn)` (keep existing `list`/`delete`).

- [ ] **Step 2: Write the failing test — create undo/redo**

Add a new `describe` block to `src/renderer/src/store/index.test.ts`:

```ts
describe('undo/redo — create', () => {
  beforeEach(async () => {
    useStore.setState({ project: mockProject as any, elements: [], connections: [], undoStack: [], redoStack: [] })
    vi.clearAllMocks()
  })

  it('addElement pushes an undo command; undo deletes, redo restores', async () => {
    await useStore.getState().addElement({ projectId: 1 })
    expect(useStore.getState().undoStack).toHaveLength(1)

    await useStore.getState().undo()
    expect(window.api.elements.delete).toHaveBeenCalledWith(1)
    expect(useStore.getState().undoStack).toHaveLength(0)
    expect(useStore.getState().redoStack).toHaveLength(1)

    await useStore.getState().redo()
    expect(window.api.elements.restore).toHaveBeenCalledWith(1)
    expect(useStore.getState().undoStack).toHaveLength(1)
    expect(useStore.getState().redoStack).toHaveLength(0)
  })

  it('a new action clears the redo stack', async () => {
    await useStore.getState().addElement({ projectId: 1 })
    await useStore.getState().undo()
    expect(useStore.getState().redoStack).toHaveLength(1)
    await useStore.getState().addConnection({ projectId: 1, sourceId: 1, targetId: 2, sourceHandle: null, targetHandle: null })
    expect(useStore.getState().redoStack).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/renderer/src/store/index.test.ts`
Expected: FAIL — `undoStack` undefined / `undo is not a function`.

- [ ] **Step 4: Add the `UndoCommand` type and interface fields**

In `src/renderer/src/store/index.ts`, above `interface Store` add:

```ts
interface UndoCommand {
  undo: () => Promise<void>
  redo: () => Promise<void>
}
```

In `interface Store`, in the architecture section add:

```ts
  undoStack: UndoCommand[]
  redoStack: UndoCommand[]
  undo: () => Promise<void>
  redo: () => Promise<void>
  clearHistory: () => void
```

- [ ] **Step 5: Add initial state, the `pushUndo` helper, and undo/redo/clearHistory actions**

In the `create<Store>` initial-state object (near `traceLinks: [], reqLinks: [],`) add:

```ts
  undoStack: [], redoStack: [],
```

Add the module-level helper near `refreshAc` at the bottom of the file:

```ts
function pushUndo(cmd: UndoCommand): void {
  useStore.setState((s) => ({ undoStack: [...s.undoStack, cmd], redoStack: [] }))
}
```

Add these actions inside the store object (e.g. after `clearHistory` placeholder / near the architecture actions):

```ts
  undo: async () => {
    const { undoStack, redoStack } = get()
    if (undoStack.length === 0) return
    const cmd = undoStack[undoStack.length - 1]
    await cmd.undo()
    set({ undoStack: undoStack.slice(0, -1), redoStack: [...redoStack, cmd] })
    // ponytail: full re-fetch keeps the store in sync with the DB after undo; cheap at diagram scale
    await get().loadArchitecture()
  },

  redo: async () => {
    const { undoStack, redoStack } = get()
    if (redoStack.length === 0) return
    const cmd = redoStack[redoStack.length - 1]
    await cmd.redo()
    set({ redoStack: redoStack.slice(0, -1), undoStack: [...undoStack, cmd] })
    await get().loadArchitecture()
  },

  clearHistory: () => set({ undoStack: [], redoStack: [] }),
```

- [ ] **Step 6: Clear history on project load**

In `loadProject`, change `set({ project, modules })` to:

```ts
    set({ project, modules, undoStack: [], redoStack: [] })
```

- [ ] **Step 7: Push create commands in `addElement` / `addConnection`**

Replace `addElement` with:

```ts
  addElement: async (input) => {
    const el = await window.api.elements.create(input)
    set((s) => ({ elements: [...s.elements, el], selectedElementId: el.id, selectedConnectionId: null }))
    pushUndo({
      undo: async () => { await window.api.elements.delete(el.id) },
      redo: async () => { await window.api.elements.restore(el.id) }
    })
  },
```

Replace `addConnection` with:

```ts
  addConnection: async (input) => {
    const conn = await window.api.connections.create(input)
    set((s) => ({ connections: [...s.connections, conn], selectedConnectionId: conn.id, selectedElementId: null }))
    pushUndo({
      undo: async () => { await window.api.connections.delete(conn.id) },
      redo: async () => { await window.api.connections.restore(conn.id) }
    })
  },
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- src/renderer/src/store/index.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/store/index.ts src/renderer/src/store/index.test.ts
git commit -m "feat(arch): undo/redo stack with create commands"
```

---

### Task 4: Delete commands (with cascade restore)

**Files:**
- Modify: `src/renderer/src/store/index.ts`
- Test: `src/renderer/src/store/index.test.ts`

**Interfaces:**
- Consumes: `pushUndo`, restore IPC (Task 3/2).
- Produces: `removeElement`/`removeConnection` push delete commands. Element delete undo captures children `{id, parentId, posX, posY}` and touched connection IDs from the store before deleting, then on undo restores the element, restores those connections, and updates each child back.

- [ ] **Step 1: Write the failing test — delete undo restores element + cascade**

Add to `src/renderer/src/store/index.test.ts`:

```ts
describe('undo/redo — delete', () => {
  const child = { ...mockElement, id: 2, parentId: 1, posX: 10, posY: 20 }
  const conn = { ...mockConn, id: 5, sourceId: 1, targetId: 3 }

  beforeEach(() => {
    useStore.setState({
      project: mockProject as any,
      elements: [mockElement, child],
      connections: [conn],
      undoStack: [], redoStack: []
    })
    vi.clearAllMocks()
  })

  it('removeElement undo restores the element, its connections, and reparents children back', async () => {
    await useStore.getState().removeElement(1)
    expect(window.api.elements.delete).toHaveBeenCalledWith(1)
    expect(useStore.getState().undoStack).toHaveLength(1)

    await useStore.getState().undo()
    expect(window.api.elements.restore).toHaveBeenCalledWith(1)
    expect(window.api.connections.restore).toHaveBeenCalledWith(5)
    expect(window.api.elements.update).toHaveBeenCalledWith(2, { parentId: 1, posX: 10, posY: 20 })
  })

  it('removeConnection undo restores, redo re-deletes', async () => {
    await useStore.getState().removeConnection(5)
    await useStore.getState().undo()
    expect(window.api.connections.restore).toHaveBeenCalledWith(5)
    await useStore.getState().redo()
    expect(window.api.connections.delete).toHaveBeenCalledWith(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/renderer/src/store/index.test.ts`
Expected: FAIL — no undo command pushed by `removeElement`/`removeConnection` (undoStack length 0).

- [ ] **Step 3: Rewrite `removeElement` to capture cascade and push a command**

Replace `removeElement` with:

```ts
  removeElement: async (id) => {
    const state = get()
    const childSnaps = state.elements
      .filter((e) => e.parentId === id)
      .map((e) => ({ id: e.id, parentId: e.parentId, posX: e.posX, posY: e.posY }))
    const connIds = state.connections
      .filter((c) => c.sourceId === id || c.targetId === id)
      .map((c) => c.id)

    await window.api.elements.delete(id)
    const { project } = get()
    if (!project) return
    const [elements, connections] = await Promise.all([
      window.api.elements.list(project.id),
      window.api.connections.list(project.id)
    ])
    set((s) => ({
      elements,
      connections,
      selectedElementId: s.selectedElementId === id ? null : s.selectedElementId
    }))

    pushUndo({
      undo: async () => {
        await window.api.elements.restore(id)
        for (const cid of connIds) await window.api.connections.restore(cid)
        for (const c of childSnaps) {
          await window.api.elements.update(c.id, { parentId: c.parentId, posX: c.posX, posY: c.posY })
        }
      },
      redo: async () => { await window.api.elements.delete(id) }
    })
  },
```

- [ ] **Step 4: Rewrite `removeConnection` to push a command**

Replace `removeConnection` with:

```ts
  removeConnection: async (id) => {
    await window.api.connections.delete(id)
    set((s) => ({
      connections: s.connections.filter((c) => c.id !== id),
      selectedConnectionId: s.selectedConnectionId === id ? null : s.selectedConnectionId
    }))
    pushUndo({
      undo: async () => { await window.api.connections.restore(id) },
      redo: async () => { await window.api.connections.delete(id) }
    })
  },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/renderer/src/store/index.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/store/index.ts src/renderer/src/store/index.test.ts
git commit -m "feat(arch): undo/redo delete commands with cascade restore"
```

---

### Task 5: Property-edit commands

**Files:**
- Modify: `src/renderer/src/store/index.ts`
- Test: `src/renderer/src/store/index.test.ts`

**Interfaces:**
- Produces: `updateElement`/`updateConnection` push an edit command **only** when the patch contains ≥1 property key. Element property keys: `name`, `color`, `elementTypeId`, `description`, `blockId`. Connection property keys: `name`, `connectionTypeId`, `description`, `connId`. Geometry/parent patches push nothing.

- [ ] **Step 1: Write the failing test — edit undo/redo and move-is-ignored**

Add to `src/renderer/src/store/index.test.ts`:

```ts
describe('undo/redo — edit', () => {
  beforeEach(() => {
    useStore.setState({
      project: mockProject as any,
      elements: [{ ...mockElement, name: 'Old' }],
      connections: [{ ...mockConn, name: 'OldConn' }],
      undoStack: [], redoStack: []
    })
    vi.clearAllMocks()
  })

  it('updateElement with a name change pushes an edit command; undo restores the old name', async () => {
    await useStore.getState().updateElement(1, { name: 'New' })
    expect(useStore.getState().undoStack).toHaveLength(1)
    await useStore.getState().undo()
    expect(window.api.elements.update).toHaveBeenLastCalledWith(1, { name: 'Old' })
  })

  it('updateElement with only position does NOT push a command', async () => {
    await useStore.getState().updateElement(1, { posX: 5, posY: 6 })
    expect(useStore.getState().undoStack).toHaveLength(0)
  })

  it('updateConnection with a name change pushes an edit command', async () => {
    await useStore.getState().updateConnection(1, { name: 'NewConn' })
    expect(useStore.getState().undoStack).toHaveLength(1)
    await useStore.getState().undo()
    expect(window.api.connections.update).toHaveBeenLastCalledWith(1, { name: 'OldConn' })
  })
})
```

Ensure `window.api.connections.update` is a mock (`update: vi.fn().mockResolvedValue(mockConn)`); add it to the `connections` mock object if missing.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/renderer/src/store/index.test.ts`
Expected: FAIL — edit pushes nothing (undoStack length 0).

- [ ] **Step 3: Add property-key constants**

In `src/renderer/src/store/index.ts`, near the top (after imports), add:

```ts
const ELEMENT_PROP_KEYS = ['name', 'color', 'elementTypeId', 'description', 'blockId'] as const
const CONNECTION_PROP_KEYS = ['name', 'connectionTypeId', 'description', 'connId'] as const
```

- [ ] **Step 4: Rewrite `updateElement` to push edit commands**

Replace `updateElement` with:

```ts
  updateElement: async (id, input) => {
    const before = get().elements.find((e) => e.id === id)
    const editKeys = ELEMENT_PROP_KEYS.filter((k) => k in input)
    const updated = await window.api.elements.update(id, input)
    set((s) => ({ elements: s.elements.map((e) => (e.id === id ? updated : e)) }))
    if (before && editKeys.length > 0) {
      const prev: UpdateElementInput = {}
      for (const k of editKeys) (prev as Record<string, unknown>)[k] = (before as Record<string, unknown>)[k]
      pushUndo({
        undo: async () => { await window.api.elements.update(id, prev) },
        redo: async () => { await window.api.elements.update(id, input) }
      })
    }
  },
```

- [ ] **Step 5: Rewrite `updateConnection` to push edit commands**

Replace `updateConnection` with:

```ts
  updateConnection: async (id, input) => {
    const before = get().connections.find((c) => c.id === id)
    const editKeys = CONNECTION_PROP_KEYS.filter((k) => k in input)
    const updated = await window.api.connections.update(id, input)
    set((s) => ({ connections: s.connections.map((c) => (c.id === id ? updated : c)) }))
    if (before && editKeys.length > 0) {
      const prev: UpdateConnectionInput = {}
      for (const k of editKeys) (prev as Record<string, unknown>)[k] = (before as Record<string, unknown>)[k]
      pushUndo({
        undo: async () => { await window.api.connections.update(id, prev) },
        redo: async () => { await window.api.connections.update(id, input) }
      })
    }
  },
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- src/renderer/src/store/index.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/store/index.ts src/renderer/src/store/index.test.ts
git commit -m "feat(arch): undo/redo property-edit commands (geometry excluded)"
```

---

### Task 6: Canvas UI — toolbar buttons + keyboard shortcuts

**Files:**
- Modify: `src/renderer/src/components/ArchitectureCanvas/index.tsx`
- Test: `src/renderer/src/components/ArchitectureCanvas/index.test.tsx`

**Interfaces:**
- Consumes: store `undo`, `redo`, `undoStack`, `redoStack` (Task 3).
- Produces: undo/redo toolbar buttons (disabled when the stack is empty) and a `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` keydown listener scoped to `CanvasInner`.

- [ ] **Step 1: Extend the component test mock and add button assertions**

In `src/renderer/src/components/ArchitectureCanvas/index.test.tsx`, add to the mocked `useStore` return object:

```ts
    undo: vi.fn(),
    redo: vi.fn(),
    undoStack: [],
    redoStack: [],
```

Add a test:

```ts
  it('renders undo and redo buttons, disabled when history is empty', () => {
    render(<ArchitectureCanvas />)
    expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /redo/i })).toBeDisabled()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/renderer/src/components/ArchitectureCanvas/index.test.tsx`
Expected: FAIL — no button named undo/redo.

- [ ] **Step 3: Wire store values, keyboard, and buttons in `CanvasInner`**

In `src/renderer/src/components/ArchitectureCanvas/index.tsx`:

Add `undo, redo, undoStack, redoStack` to the `useStore()` destructure in `CanvasInner`.

Add this effect inside `CanvasInner` (after the existing `useEffect`s):

```tsx
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      if (e.shiftKey) void redo()
      else void undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])
```

In the header toolbar, after the `+ Object` button, add:

```tsx
          <div className="flex items-center gap-1">
            <button
              onClick={() => void undo()}
              disabled={undoStack.length === 0}
              aria-label="Undo"
              title="Undo (Cmd/Ctrl+Z)"
              className="p-1.5 rounded hover:bg-workspace text-ink-muted leading-none text-base disabled:opacity-40 disabled:hover:bg-transparent"
            >↶</button>
            <button
              onClick={() => void redo()}
              disabled={redoStack.length === 0}
              aria-label="Redo"
              title="Redo (Cmd/Ctrl+Shift+Z)"
              className="p-1.5 rounded hover:bg-workspace text-ink-muted leading-none text-base disabled:opacity-40 disabled:hover:bg-transparent"
            >↷</button>
          </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/renderer/src/components/ArchitectureCanvas/index.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full check — typecheck + all tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/ArchitectureCanvas/index.tsx src/renderer/src/components/ArchitectureCanvas/index.test.tsx
git commit -m "feat(arch): undo/redo toolbar buttons and keyboard shortcuts"
```

---

## Notes for the implementer

- `mockProject` in the store test uses camelCase (`elemNextCounter`, etc.) — that's the renderer `Project` shape, fine for `setState`.
- If `npm test` is watch-mode by default in this repo, use `npm test -- --run <path>` (Vitest) for one-shot runs.
- Do not add undo commands to drag/resize/nest paths (`onNodeDragStop`, resize callback) — geometry is intentionally out of scope.
