# Architecture Left-Nav + Per-Architecture Interfaces + Object-Name Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move architecture navigation from the top sub-tab strip to a left sidebar (shelving the Component Library), mirror that navigation in the Interfaces tab to browse interfaces per architecture, and add mandatory source/target object-name columns to the Interface Register.

**Architecture:** Pure renderer change on the shipped Multiple Architectures data model. A new `ArchitectureNav` left sidebar replaces `ArchitectureTabs`; the Component Library is unmounted and its typed-block role moves to a type-picker on the canvas `+ Object` button. A new `InterfaceNav` sidebar sets a session-only `interfaceArchFilter` that the register applies client-side to already-loaded rows. `buildInterfaceRows` gains `fromName`/`toName` rendered as mandatory columns.

**Tech Stack:** Electron + React + TS + Zustand + Tailwind (semantic tokens). No DB/migration/handler/preload/type-shape changes.

## Global Constraints

- Renderer never touches the DB — this whole plan is renderer-only; no `window.api`/handler/preload/`src/types` changes.
- `src/main/**` vitest fails on the known better-sqlite3 ABI mismatch — ACCEPTED baseline. This plan touches no main code; renderer/pure-helper vitest DOES run and is the gate.
- Never use `npm run`. Use `./node_modules/.bin/*` (`tsc`, `vitest`, `electron-vite`). `node` is on PATH; if a binary needs it: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"`.
- Both typechecks: `./node_modules/.bin/tsc -p tsconfig.web.json --noEmit && ./node_modules/.bin/tsc -p tsconfig.node.json --noEmit`
- Renderer test: `./node_modules/.bin/vitest run <path>`
- Token classes (match the app): active nav row `bg-white border border-line text-ink`; inactive `text-ink-muted hover:bg-white/60`; sidebars `w-56 shrink-0 border-r`; label-caps via the `SectionLabel` primitive from `../ui`.
- Interface Register mandatory columns, exact order: **Interface ID | From | From Name | To | To Name**, then the optional/toggleable columns. From Name / To Name are NEVER in the toggleable set.
- `interfaceArchFilter` is session-only (never persisted); default `'all'`; reset to `'all'` on project load.
- Component Library file `ComponentLibrary.tsx` is UNMOUNTED, not deleted. `ArchitectureTabs.tsx` + its test ARE deleted.
- Commit after each task with a `feat(arch):` / `test(arch):` message.

---

### Task 1: Store — `interfaceArchFilter` session state

**Files:**
- Modify: `src/renderer/src/store/index.ts`
- Test: `src/renderer/src/store/interfaceArchFilter.test.ts` (new)

**Interfaces:**
- Produces (store): state `interfaceArchFilter: number | 'all'` (default `'all'`); action `setInterfaceArchFilter: (f: number | 'all') => void`; reset to `'all'` inside `loadProject`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/store/interfaceArchFilter.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from './index'

beforeEach(() => {
  useStore.setState({ interfaceArchFilter: 'all' })
})

describe('interfaceArchFilter', () => {
  it('defaults to "all"', () => {
    expect(useStore.getState().interfaceArchFilter).toBe('all')
  })

  it('setInterfaceArchFilter updates the filter', () => {
    useStore.getState().setInterfaceArchFilter(7)
    expect(useStore.getState().interfaceArchFilter).toBe(7)
    useStore.getState().setInterfaceArchFilter('all')
    expect(useStore.getState().interfaceArchFilter).toBe('all')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run src/renderer/src/store/interfaceArchFilter.test.ts`
Expected: FAIL — `setInterfaceArchFilter` is not a function / `interfaceArchFilter` undefined.

- [ ] **Step 3: Implement the store changes**

In `src/renderer/src/store/index.ts`:

Add to the state interface (near `selectedConnectionId: number | null` at line ~49):
```typescript
  interfaceArchFilter: number | 'all'
  setInterfaceArchFilter: (f: number | 'all') => void
```

Add the initial value in the default state object (near `selectedElementId: null, selectedConnectionId: null,` around line 145):
```typescript
  interfaceArchFilter: 'all',
```

Add the setter (near the other simple setters, e.g. below `selectConnection` around line 518):
```typescript
  setInterfaceArchFilter: (f) => set({ interfaceArchFilter: f }),
```

Reset it on project load — in `loadProject`, the existing `set(...)` call (line ~156) is:
```typescript
    set({ project, modules, undoStack: [], redoStack: [] })
```
change it to:
```typescript
    set({ project, modules, undoStack: [], redoStack: [], interfaceArchFilter: 'all' })
```

- [ ] **Step 4: Run to verify it passes**

Run: `./node_modules/.bin/vitest run src/renderer/src/store/interfaceArchFilter.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Full store suite + web typecheck**

Run: `./node_modules/.bin/vitest run src/renderer/src/store`
Expected: no new failures.
Run: `./node_modules/.bin/tsc -p tsconfig.web.json --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/store/index.ts src/renderer/src/store/interfaceArchFilter.test.ts
git commit -m "feat(arch): store interfaceArchFilter session state"
```

---

### Task 2: `ArchitectureNav` left sidebar replaces the top strip

**Files:**
- Create: `src/renderer/src/components/ArchitectureCanvas/ArchitectureNav.tsx`
- Test: `src/renderer/src/components/ArchitectureCanvas/ArchitectureNav.test.tsx` (new)
- Delete: `src/renderer/src/components/ArchitectureCanvas/ArchitectureTabs.tsx`, `src/renderer/src/components/ArchitectureCanvas/ArchitectureTabs.test.tsx`
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: store `architectures`, `activeArchitectureId`, `setActiveArchitecture`, `addArchitecture`, `renameArchitecture`, `removeArchitecture` (all shipped).
- Produces: `ArchitectureNav` default export (a left sidebar). App renders it left of the canvas; the top strip is gone.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/components/ArchitectureCanvas/ArchitectureNav.test.tsx`:

```typescript
import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ArchitectureNav from './ArchitectureNav'
import { useStore } from '../../store'

vi.mock('../../store')

const arch = (id: number, name: string) => ({ id, projectId: 1, name, position: id, deletedAt: null, createdAt: '', updatedAt: '' })

beforeEach(() => {
  ;(useStore as any).mockReturnValue({
    architectures: [arch(10, 'Default'), arch(11, 'Comms')], activeArchitectureId: 10,
    setActiveArchitecture: vi.fn(), addArchitecture: vi.fn(), renameArchitecture: vi.fn(), removeArchitecture: vi.fn()
  })
})

it('renders a row per architecture and switches on click', () => {
  const setActive = vi.fn()
  ;(useStore as any).mockReturnValue({
    architectures: [arch(10, 'Default'), arch(11, 'Comms')], activeArchitectureId: 10,
    setActiveArchitecture: setActive, addArchitecture: vi.fn(), renameArchitecture: vi.fn(), removeArchitecture: vi.fn()
  })
  render(<ArchitectureNav />)
  expect(screen.getByText('Default')).toBeInTheDocument()
  fireEvent.click(screen.getByText('Comms'))
  expect(setActive).toHaveBeenCalledWith(11)
})

it('creates a new architecture via the + New affordance', () => {
  const addArchitecture = vi.fn()
  ;(useStore as any).mockReturnValue({
    architectures: [arch(10, 'Default')], activeArchitectureId: 10,
    setActiveArchitecture: vi.fn(), addArchitecture, renameArchitecture: vi.fn(), removeArchitecture: vi.fn()
  })
  render(<ArchitectureNav />)
  fireEvent.click(screen.getByLabelText('New architecture'))
  const input = screen.getByPlaceholderText('Architecture name')
  fireEvent.change(input, { target: { value: 'Power' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(addArchitecture).toHaveBeenCalledWith('Power')
})

it('hides delete when only one architecture exists', () => {
  ;(useStore as any).mockReturnValue({
    architectures: [arch(10, 'Default')], activeArchitectureId: 10,
    setActiveArchitecture: vi.fn(), addArchitecture: vi.fn(), renameArchitecture: vi.fn(), removeArchitecture: vi.fn()
  })
  render(<ArchitectureNav />)
  expect(screen.queryByLabelText('Delete Default')).toBeNull()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/ArchitectureNav.test.tsx`
Expected: FAIL — cannot find `./ArchitectureNav`.

- [ ] **Step 3: Implement the component**

Create `src/renderer/src/components/ArchitectureCanvas/ArchitectureNav.tsx`:

```tsx
import { useState } from 'react'
import { useStore } from '../../store'
import { SectionLabel } from '../ui'

export default function ArchitectureNav(): JSX.Element {
  const { architectures, activeArchitectureId, setActiveArchitecture, addArchitecture, renameArchitecture, removeArchitecture } = useStore()
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [adding, setAdding] = useState(false)
  const [addValue, setAddValue] = useState('')

  function commitRename(id: number): void {
    const v = renameValue.trim()
    if (v) renameArchitecture(id, v)
    setRenamingId(null)
  }
  function commitAdd(): void {
    const v = addValue.trim()
    if (v) addArchitecture(v)
    setAdding(false); setAddValue('')
  }

  return (
    <div className="flex flex-col h-full w-56 shrink-0 border-r border-line bg-workspace">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <SectionLabel>Architectures</SectionLabel>
        <button
          aria-label="New architecture"
          onClick={() => setAdding(true)}
          className="text-ink-muted hover:text-ink leading-none text-base px-1"
        >+</button>
      </div>
      {adding && (
        <div className="px-3 pb-2">
          <input
            autoFocus
            placeholder="Architecture name"
            value={addValue}
            onChange={(e) => setAddValue(e.target.value)}
            onBlur={commitAdd}
            onKeyDown={(e) => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') { setAdding(false); setAddValue('') } }}
            className="w-full px-2 py-1 text-sm rounded border border-action bg-white text-ink"
          />
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {architectures.map((a) => {
          const active = a.id === activeArchitectureId
          if (renamingId === a.id) {
            return (
              <input
                key={a.id}
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => commitRename(a.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitRename(a.id); if (e.key === 'Escape') setRenamingId(null) }}
                className="w-full px-2 py-1 text-sm rounded border border-action bg-white text-ink"
              />
            )
          }
          return (
            <div
              key={a.id}
              onClick={() => !active && setActiveArchitecture(a.id)}
              onDoubleClick={() => { setRenamingId(a.id); setRenameValue(a.name) }}
              className={`group flex items-center gap-1 px-3 py-1.5 text-sm rounded cursor-pointer
                ${active ? 'bg-white border border-line text-ink' : 'text-ink-muted hover:bg-white/60'}`}
            >
              <span className="truncate flex-1">{a.name}</span>
              {architectures.length > 1 && (
                <button
                  aria-label={`Delete ${a.name}`}
                  onClick={(e) => { e.stopPropagation(); if (window.confirm('Delete this architecture and all its blocks?')) removeArchitecture(a.id) }}
                  className="opacity-0 group-hover:opacity-100 text-ink-faint hover:text-error leading-none"
                >×</button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/ArchitectureNav.test.tsx`
Expected: PASS (all three cases).

- [ ] **Step 5: Delete the old strip + wire the sidebar into App.tsx**

Delete the files:
```bash
git rm src/renderer/src/components/ArchitectureCanvas/ArchitectureTabs.tsx src/renderer/src/components/ArchitectureCanvas/ArchitectureTabs.test.tsx
```

In `src/renderer/src/App.tsx`:
- Replace the import line `import ArchitectureTabs from './components/ArchitectureCanvas/ArchitectureTabs'` with:
```typescript
import ArchitectureNav from './components/ArchitectureCanvas/ArchitectureNav'
```
- Replace the entire `panel-architecture` block (currently the strip-above-canvas layout) with the sidebar-left layout:
```tsx
        <div data-testid="panel-architecture" className="flex flex-1 overflow-hidden">
          <ArchitectureNav />
          <div className="flex-1 overflow-hidden">
            <ArchitectureCanvas />
          </div>
          {(selectedElementId !== null || selectedConnectionId !== null) && (
            <Panel className="w-96 shrink-0 border-l overflow-y-auto">
              {selectedElementId !== null ? <ElementPanel /> : <ConnectionPanel />}
            </Panel>
          )}
        </div>
```
(The tab-entry effect still calls `loadArchitectures()` — leave it unchanged.)

- [ ] **Step 6: Typecheck + full renderer suite**

Run: `./node_modules/.bin/tsc -p tsconfig.web.json --noEmit && ./node_modules/.bin/tsc -p tsconfig.node.json --noEmit`
Expected: clean (no dangling `ArchitectureTabs` reference).
Run: `./node_modules/.bin/vitest run src/renderer`
Expected: no new failures. (The deleted `ArchitectureTabs.test.tsx` is gone; `App.test.tsx`'s store mock already carries the architecture actions from the prior feature.)

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/ArchitectureCanvas/ArchitectureNav.tsx src/renderer/src/components/ArchitectureCanvas/ArchitectureNav.test.tsx src/renderer/src/App.tsx
git commit -m "feat(arch): ArchitectureNav left sidebar replaces top strip"
```

---

### Task 3: Shelve Component Library; type-picker on `+ Object`

**Files:**
- Modify: `src/renderer/src/components/ArchitectureCanvas/index.tsx`

**Interfaces:**
- Consumes: store `elementTypes` (already destructured in this file), `addElement`.
- Produces: no exports change. Canvas no longer renders `ComponentLibrary`; `+ Object` creates a block of the selected type.

Note: `ComponentLibrary.tsx` is NOT deleted — only its render + import are removed from `index.tsx`.

- [ ] **Step 1: Remove the Component Library render + import**

In `src/renderer/src/components/ArchitectureCanvas/index.tsx`:
- Delete the import line `import ComponentLibrary from './ComponentLibrary'` (line ~13).
- In the returned JSX, the outer wrapper currently is:
```tsx
    <div className="flex h-full">
      <ComponentLibrary />
      <div className="flex flex-col flex-1 min-w-0">
```
Remove `<ComponentLibrary />` so it reads:
```tsx
    <div className="flex h-full">
      <div className="flex flex-col flex-1 min-w-0">
```

- [ ] **Step 2: Add the type picker + type-aware create**

Ensure `Select` is imported from `../ui` — the current import is `import { Button } from '../ui'`; change it to:
```typescript
import { Button, Select } from '../ui'
```

Add local state for the picked type. Near the top of the component body (after the `useStore()` destructure that includes `elementTypes`, around line 71), add:
```typescript
  const [newTypeId, setNewTypeId] = useState<string>('')
```
(Confirm `useState` is imported from `'react'` at the top of the file; it is used elsewhere — if not, add it to the React import.)

Replace `handleAddBlock` (line ~135) with a version that stamps the chosen type:
```typescript
  function handleAddBlock(): void {
    if (!project) return
    addElement({
      projectId: project.id,
      elementTypeId: newTypeId ? Number(newTypeId) : null,
      posX: 100 + Math.random() * 200,
      posY: 100 + Math.random() * 200
    })
  }
```

In the toolbar, replace the single `+ Object` button line (line ~186):
```tsx
          <Button onClick={handleAddBlock}>+ Object</Button>
```
with the button plus a type `Select`:
```tsx
          <Button onClick={handleAddBlock}>+ Object</Button>
          <Select value={newTypeId} onChange={(e) => setNewTypeId(e.target.value)} className="w-40">
            <option value="">Untyped</option>
            {elementTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
```
(`elementTypes` is already in the `useStore()` destructure at line ~68. If TS complains that `Select` does not accept `className`, drop the `className="w-40"` — the shared `Select` primitive forwards standard props; verify against `src/renderer/src/components/ui/index.tsx` and match its prop contract.)

- [ ] **Step 3: Typecheck**

Run: `./node_modules/.bin/tsc -p tsconfig.web.json --noEmit && ./node_modules/.bin/tsc -p tsconfig.node.json --noEmit`
Expected: clean.

- [ ] **Step 4: Full renderer suite (regressions)**

Run: `./node_modules/.bin/vitest run src/renderer`
Expected: no new failures. (If an `ArchitectureCanvas/index.test.tsx` asserted the Component Library rendered, update that assertion to reflect its removal; the pre-existing stale "connection mode toggle" test noted in the ledger stays as-is.)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ArchitectureCanvas/index.tsx
git commit -m "feat(arch): shelve Component Library; type picker on + Object"
```

---

### Task 4: Interface Register — `fromName`/`toName` + mandatory name columns

**Files:**
- Modify: `src/renderer/src/components/InterfaceRegister/rows.ts`
- Test: `src/renderer/src/components/InterfaceRegister/rows.test.ts`
- Modify: `src/renderer/src/components/InterfaceRegister/index.tsx`

**Interfaces:**
- Consumes: `ArchitectureElement.name` (already on the type), `ArchitectureConnection.architectureId` (shipped), the existing `elemById` map in `buildInterfaceRows`.
- Produces: `InterfaceRow` gains `fromName: string`, `toName: string`, and `architectureId: number | null` (the last consumed by Task 5's client-side filter). Register renders mandatory **From Name** / **To Name** columns in the order `Interface ID | From | From Name | To | To Name | …optional`.

- [ ] **Step 1: Write the failing test (extend rows.test.ts)**

Add to `src/renderer/src/components/InterfaceRegister/rows.test.ts`:

```typescript
it('maps fromName and toName from the source/target elements', () => {
  const elements = [
    { id: 1, projectId: 1, architectureId: null, parentId: null, blockId: 'SYS-001', name: 'Pump', elementTypeId: null, posX: 0, posY: 0, width: 160, height: 80, deletedAt: null, createdAt: '', updatedAt: '' },
    { id: 2, projectId: 1, architectureId: null, parentId: null, blockId: 'SYS-002', name: 'Valve', elementTypeId: null, posX: 0, posY: 0, width: 160, height: 80, deletedAt: null, createdAt: '', updatedAt: '' }
  ] as any[]
  const connections = [{ id: 1, projectId: 1, architectureId: null, connId: 'ICN-0001', sourceId: 1, targetId: 2, sourceHandle: null, targetHandle: null, name: null, connectionTypeId: null, description: null, deletedAt: null, createdAt: '', updatedAt: '' }] as any[]
  const rows = buildInterfaceRows(connections, elements, [], [], [])
  expect(rows[0].fromName).toBe('Pump')
  expect(rows[0].toName).toBe('Valve')
})

it('leaves fromName/toName empty when the element is missing', () => {
  const connections = [{ id: 1, projectId: 1, architectureId: null, connId: 'ICN-0002', sourceId: 99, targetId: 98, sourceHandle: null, targetHandle: null, name: null, connectionTypeId: null, description: null, deletedAt: null, createdAt: '', updatedAt: '' }] as any[]
  const rows = buildInterfaceRows(connections, [], [], [], [])
  expect(rows[0].fromName).toBe('')
  expect(rows[0].toName).toBe('')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/InterfaceRegister/rows.test.ts`
Expected: FAIL — `fromName`/`toName` missing on `InterfaceRow`.

- [ ] **Step 3: Add the fields to the helper**

In `src/renderer/src/components/InterfaceRegister/rows.ts`:
- Add to the `InterfaceRow` interface (after `toId: string`):
```typescript
  fromName: string
  toName: string
  architectureId: number | null
```
- In the `connections.map((c) => { ... })` return object, alongside `fromId`/`toId`, add:
```typescript
      fromName: elemById.get(c.sourceId)?.name ?? '',
      toName: elemById.get(c.targetId)?.name ?? '',
      architectureId: c.architectureId,
```
(`architectureId` is not displayed as a column; Task 5's filter reads it. The name-mapping test in Step 1 does not assert it, which is fine.)

- [ ] **Step 4: Run to verify it passes**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/InterfaceRegister/rows.test.ts`
Expected: PASS.

- [ ] **Step 5: Render the mandatory columns**

In `src/renderer/src/components/InterfaceRegister/index.tsx`:

In the `<thead>` row, the current mandatory headers are:
```tsx
              <th className="px-4 py-2"><SectionLabel>Interface ID</SectionLabel></th>
              <th className="px-4 py-2"><SectionLabel>From</SectionLabel></th>
              <th className="px-4 py-2"><SectionLabel>To</SectionLabel></th>
```
Replace with the five-column mandatory order:
```tsx
              <th className="px-4 py-2"><SectionLabel>Interface ID</SectionLabel></th>
              <th className="px-4 py-2"><SectionLabel>From</SectionLabel></th>
              <th className="px-4 py-2"><SectionLabel>From Name</SectionLabel></th>
              <th className="px-4 py-2"><SectionLabel>To</SectionLabel></th>
              <th className="px-4 py-2"><SectionLabel>To Name</SectionLabel></th>
```

In the `<tbody>` row, the current mandatory cells are:
```tsx
                <td className="px-4 py-2 font-mono text-ink">{row.interfaceId}</td>
                <td className="px-4 py-2 font-mono text-ink-muted">{row.fromId}</td>
                <td className="px-4 py-2 font-mono text-ink-muted">{row.toId}</td>
```
Replace with:
```tsx
                <td className="px-4 py-2 font-mono text-ink">{row.interfaceId}</td>
                <td className="px-4 py-2 font-mono text-ink-muted">{row.fromId}</td>
                <td className="px-4 py-2 text-ink-muted">{row.fromName || '—'}</td>
                <td className="px-4 py-2 font-mono text-ink-muted">{row.toId}</td>
                <td className="px-4 py-2 text-ink-muted">{row.toName || '—'}</td>
```

Update the empty-state `colSpan` — it is currently `3 + optionalCols.length`; change to:
```tsx
              <tr><td colSpan={5 + optionalCols.length} className="px-4 py-6 text-center text-ink-faint">No interfaces yet.</td></tr>
```

- [ ] **Step 6: Typecheck + full renderer suite**

Run: `./node_modules/.bin/tsc -p tsconfig.web.json --noEmit && ./node_modules/.bin/tsc -p tsconfig.node.json --noEmit`
Expected: clean.
Run: `./node_modules/.bin/vitest run src/renderer/src/components/InterfaceRegister`
Expected: no new failures.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/InterfaceRegister/rows.ts src/renderer/src/components/InterfaceRegister/rows.test.ts src/renderer/src/components/InterfaceRegister/index.tsx
git commit -m "feat(arch): mandatory From Name / To Name columns in Interface Register"
```

---

### Task 5: `InterfaceNav` sidebar + client-side filter + scoped create + live-verify

**Files:**
- Create: `src/renderer/src/components/InterfaceRegister/InterfaceNav.tsx`
- Test: `src/renderer/src/components/InterfaceRegister/InterfaceNav.test.tsx` (new)
- Modify: `src/renderer/src/components/InterfaceRegister/index.tsx`
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: store `architectures`, `interfaceArchFilter`, `setInterfaceArchFilter` (Task 1).
- Produces: `InterfaceNav` default export. Register filters visible rows by `interfaceArchFilter`; `+ New Interface` element pickers + create stamp scope to the selected architecture.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/components/InterfaceRegister/InterfaceNav.test.tsx`:

```typescript
import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import InterfaceNav from './InterfaceNav'
import { useStore } from '../../store'

vi.mock('../../store')

const arch = (id: number, name: string) => ({ id, projectId: 1, name, position: id, deletedAt: null, createdAt: '', updatedAt: '' })

beforeEach(() => {
  ;(useStore as any).mockReturnValue({
    architectures: [arch(10, 'Default'), arch(11, 'Comms')],
    interfaceArchFilter: 'all', setInterfaceArchFilter: vi.fn()
  })
})

it('renders All architectures plus one entry per architecture', () => {
  render(<InterfaceNav />)
  expect(screen.getByText('All architectures')).toBeInTheDocument()
  expect(screen.getByText('Default')).toBeInTheDocument()
  expect(screen.getByText('Comms')).toBeInTheDocument()
})

it('sets the filter to an architecture id on click', () => {
  const setFilter = vi.fn()
  ;(useStore as any).mockReturnValue({
    architectures: [arch(10, 'Default'), arch(11, 'Comms')],
    interfaceArchFilter: 'all', setInterfaceArchFilter: setFilter
  })
  render(<InterfaceNav />)
  fireEvent.click(screen.getByText('Comms'))
  expect(setFilter).toHaveBeenCalledWith(11)
})

it('sets the filter back to all', () => {
  const setFilter = vi.fn()
  ;(useStore as any).mockReturnValue({
    architectures: [arch(10, 'Default')],
    interfaceArchFilter: 10, setInterfaceArchFilter: setFilter
  })
  render(<InterfaceNav />)
  fireEvent.click(screen.getByText('All architectures'))
  expect(setFilter).toHaveBeenCalledWith('all')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/InterfaceRegister/InterfaceNav.test.tsx`
Expected: FAIL — cannot find `./InterfaceNav`.

- [ ] **Step 3: Implement the component**

Create `src/renderer/src/components/InterfaceRegister/InterfaceNav.tsx`:

```tsx
import { useStore } from '../../store'
import { SectionLabel } from '../ui'

export default function InterfaceNav(): JSX.Element {
  const { architectures, interfaceArchFilter, setInterfaceArchFilter } = useStore() as any

  const rowCls = (active: boolean): string =>
    `px-3 py-1.5 text-sm rounded cursor-pointer truncate ${active ? 'bg-white border border-line text-ink' : 'text-ink-muted hover:bg-white/60'}`

  return (
    <div className="flex flex-col h-full w-56 shrink-0 border-r border-line bg-workspace">
      <div className="px-4 pt-4 pb-2">
        <SectionLabel>Architectures</SectionLabel>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        <div className={rowCls(interfaceArchFilter === 'all')} onClick={() => setInterfaceArchFilter('all')}>
          All architectures
        </div>
        {architectures.map((a: any) => (
          <div key={a.id} className={rowCls(interfaceArchFilter === a.id)} onClick={() => setInterfaceArchFilter(a.id)}>
            {a.name}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/InterfaceRegister/InterfaceNav.test.tsx`
Expected: PASS (all three cases).

- [ ] **Step 5: Apply the filter + scope create in the register**

In `src/renderer/src/components/InterfaceRegister/index.tsx`:

Add `interfaceArchFilter` to the store destructure (line ~10-12):
```typescript
  const {
    project, connections, elements, connectionTypes, projectConnectionCustomFields, architectures,
    interfaceArchFilter, loadInterfaces, addConnection, selectConnection
  } = useStore() as any
```

After `const rows = buildInterfaceRows(...)` (line ~21), derive the visible rows and the pickable elements:
```typescript
  const visibleRows = interfaceArchFilter === 'all' ? rows : rows.filter((r) => r.architectureId === interfaceArchFilter)
  const pickElements = interfaceArchFilter === 'all' ? elements : elements.filter((el: any) => el.architectureId === interfaceArchFilter)
```

(`InterfaceRow.architectureId` was added in Task 4, so `r.architectureId` is available here.)

Update `createInterface` to stamp the selected architecture:
```typescript
  async function createInterface(): Promise<void> {
    if (!project || !sourceId || !targetId) return
    const arch = interfaceArchFilter === 'all' ? {} : { architectureId: interfaceArchFilter }
    await addConnection({ projectId: project.id, sourceId: Number(sourceId), targetId: Number(targetId), ...arch })
    await loadInterfaces()
    setShowNew(false); setSourceId(''); setTargetId('')
  }
```

Replace the interface count and the row map to use `visibleRows`:
- The count span: `{rows.length} interfaces` → `{visibleRows.length} interfaces`.
- The `<tbody>` `{rows.map(...)}` → `{visibleRows.map(...)}`.
- The empty-state condition `rows.length === 0` → `visibleRows.length === 0`.

Replace BOTH `elements.map(...)` picker loops in the `+ New Interface` form with `pickElements.map(...)`:
```tsx
              {pickElements.map((el: any) => <option key={el.id} value={el.id}>{el.blockId} — {el.name}</option>)}
```
(both the From `Select` and the To `Select`).

- [ ] **Step 6: Wire `InterfaceNav` into the Interfaces panel in App.tsx**

In `src/renderer/src/App.tsx`:
- Add the import near the other component imports:
```typescript
import InterfaceNav from './components/InterfaceRegister/InterfaceNav'
```
- Replace the `panel-interfaces` block:
```tsx
        <div data-testid="panel-interfaces" className="flex flex-1 overflow-hidden">
          <InterfaceNav />
          <div className="flex-1 overflow-hidden">
            <InterfaceRegister />
          </div>
          {selectedConnectionId !== null && (
            <Panel className="w-96 shrink-0 border-l overflow-y-auto">
              <ConnectionPanel />
            </Panel>
          )}
        </div>
```

- [ ] **Step 7: Typecheck + full renderer suite**

Run: `./node_modules/.bin/tsc -p tsconfig.web.json --noEmit && ./node_modules/.bin/tsc -p tsconfig.node.json --noEmit`
Expected: clean.
Run: `./node_modules/.bin/vitest run src/renderer`
Expected: no new failures. (If an existing InterfaceRegister test asserts on `rows.length`/element pickers, update it to the `visibleRows`/`pickElements` behavior; if a mock lacks `interfaceArchFilter`, add `interfaceArchFilter: 'all'`.)

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/InterfaceRegister/InterfaceNav.tsx src/renderer/src/components/InterfaceRegister/InterfaceNav.test.tsx src/renderer/src/components/InterfaceRegister/index.tsx src/renderer/src/components/InterfaceRegister/rows.ts src/renderer/src/App.tsx
git commit -m "feat(arch): InterfaceNav per-architecture filter + scoped create"
```

- [ ] **Step 9: Build + live-verify in the running app**

Build: `./node_modules/.bin/electron-vite build` (expected clean), then drive with the Playwright driver (`.claude/skills/run-app/driver.mjs`; read the run-app skill first). Confirm and report each:
1. **Architecture tab:** left sidebar lists architectures (no top strip); click switches the canvas; `+ New` creates; double-click renames; `×` deletes (confirm dialog; last one has no `×`).
2. **Component Library gone:** no left palette; the `+ Object` toolbar has a type `Select`; picking a type + `+ Object` adds a typed block; "Untyped" + `+ Object` adds an untyped block.
3. **Interfaces tab:** left sidebar shows "All architectures" + one entry per architecture; selecting an architecture filters the register to that architecture's interfaces; "All" shows every interface.
4. **Object-name columns:** From Name / To Name columns show the source/target object names, positioned `Interface ID | From | From Name | To | To Name`.
5. **Scoped create:** with a specific architecture selected, `+ New Interface` pickers list only that architecture's elements and the created interface belongs to it (Architecture column shows it).

Report exactly what was observed; do not claim a check you did not run.

---

## Self-Review Notes

- **Spec coverage:** left-nav replaces strip → Task 2; Component Library shelved + type-picker `+ Object` → Task 3; Interfaces per-architecture nav (All + per-arch, client-side filter, session state) → Tasks 1+5; scoped create → Task 5; mandatory From/To Name columns → Task 4. Every spec requirement maps to a task.
- **Type consistency:** `interfaceArchFilter: number | 'all'` and `setInterfaceArchFilter` used identically in Tasks 1/5; `InterfaceRow` gains `fromName`/`toName`/`architectureId` all in Task 4, and Task 5 only consumes `architectureId` — no interface is extended in two tasks. `addConnection` already accepts `architectureId` (shipped in Multiple Architectures).
- **Renderer-only:** no `window.api`/handler/preload/`src/types` edits anywhere; all data (`architectures`, `elements`, `connections` with `architectureId`) is already loaded by `loadArchitectures`/`loadInterfaces`.
- **Deletions:** `ArchitectureTabs.tsx` + test deleted (Task 2); `ComponentLibrary.tsx` retained, only unmounted (Task 3).
- **Deferred (unchanged):** architecture/interface nav a11y (`role`/keyboard) rides the batched a11y follow-up ticket.
