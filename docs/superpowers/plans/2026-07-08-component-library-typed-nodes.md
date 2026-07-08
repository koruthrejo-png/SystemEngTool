# Component Library Palette & Typed Nodes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface element types on the Architecture canvas — a left Component Library palette that drops typed nodes, the type name shown in each node header, and a total-connection port-count badge.

**Architecture:** Pure renderer feature on the existing typed-element data model (`element_types` seeded per project, `architecture_elements.element_type_id`, `elementTypes`/`connections` already in the Zustand store). `buildNodes` gains two params and derives `typeName` + `connectionCount` into `BlockNodeData`; `BlockNode` renders them; a new `ComponentLibrary` panel calls the existing `addElement` action with an `elementTypeId`. No backend, DB, IPC, or type-schema changes.

**Tech Stack:** React 18 + TypeScript, Zustand, @xyflow/react (React Flow v12), Tailwind (semantic tokens), Vitest + Testing Library.

## Global Constraints

- No new dependencies; no CDN references; no Material Symbols (use a color dot / existing glyphs).
- Semantic Tailwind tokens only (`navy`, `action`, `workspace`, `line`, `ink`/`ink-muted`/`ink-faint`) — no raw hexes in components (existing `NAVY = '#1a365d'` constant in `BlockNode.tsx` is the one sanctioned exception, reuse it).
- Do not rename or re-seed the built-in element types (`System / Subsystem / Component / Function / External`).
- Keep the toolbar `+ Object` button (untyped block) working.
- Run commands with `PATH` set to the Logi node dist (see repo handoff): `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"`. Use `./node_modules/.bin/vitest` and `./node_modules/typescript/bin/tsc` directly (`npm` shim is broken).
- Test baseline: 48 failed (47 sqlite-ABI + 1 pre-existing ArchitectureCanvas) / 180 passed. Failure composition must stay unchanged; new tests add to the passed count.
- End every commit message with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

## File Structure

- `src/renderer/src/components/ArchitectureCanvas/nodes.ts` — MODIFY: `buildNodes` gains `elementTypes` + `connections` params, derives `typeName` + `connectionCount`.
- `src/renderer/src/components/ArchitectureCanvas/nodes.test.ts` — MODIFY: update 5 `buildNodes` call sites; add typeName + connectionCount tests.
- `src/renderer/src/components/ArchitectureCanvas/BlockNode.tsx` — MODIFY: `BlockNodeData` gains `typeName`/`connectionCount`; header renders them.
- `src/renderer/src/components/ArchitectureCanvas/BlockNode.test.tsx` — MODIFY (or CREATE if absent): typeName + badge render assertions.
- `src/renderer/src/components/ArchitectureCanvas/ComponentLibrary.tsx` — CREATE: left palette panel, click-to-add typed node.
- `src/renderer/src/components/ArchitectureCanvas/ComponentLibrary.test.tsx` — CREATE: rows-per-type + click calls `addElement`.
- `src/renderer/src/components/ArchitectureCanvas/index.tsx` — MODIFY: pass `elementTypes`/`connections` to `buildNodes` (+ effect deps); wrap canvas in a flex row with `<ComponentLibrary />`.

---

### Task 1: buildNodes derives typeName + connectionCount

**Files:**
- Modify: `src/renderer/src/components/ArchitectureCanvas/nodes.ts` (imports + `buildNodes`)
- Modify: `src/renderer/src/components/ArchitectureCanvas/index.tsx` (call site + effect deps)
- Test: `src/renderer/src/components/ArchitectureCanvas/nodes.test.ts`

**Interfaces:**
- Produces: `buildNodes(elements: ArchitectureElement[], elementTypes: ElementType[], connections: ArchitectureConnection[], selectedId: number | null, onResizeEnd: (id: number, x: number, y: number, width: number, height: number) => void): Node[]`. Node `data` now also carries `typeName: string | null` and `connectionCount: number` (the `BlockNodeData` fields land in Task 2; adding them to the object here is forward-compatible — TypeScript will require the fields once Task 2 updates the `satisfies BlockNodeData` type, so both changes ship in this task's edits below).

Note: this task edits `BlockNode.tsx`'s `BlockNodeData` type only to add the two new fields (so `satisfies BlockNodeData` in `buildNodes` compiles). The header rendering that consumes them is Task 2.

- [ ] **Step 1: Add the two fields to `BlockNodeData`**

In `src/renderer/src/components/ArchitectureCanvas/BlockNode.tsx`, extend the type (rendering unchanged this task):

```ts
export type BlockNodeData = {
  label: string
  blockId: string
  color: string | null
  selected: boolean
  nested: boolean
  childCount: number
  typeName: string | null
  connectionCount: number
  onResizeEnd: (x: number, y: number, width: number, height: number) => void
}
```

- [ ] **Step 2: Write the failing tests**

Append to `src/renderer/src/components/ArchitectureCanvas/nodes.test.ts`. Check the existing `el(...)` factory and imports at the top of that file; if it does not already import `ElementType`/`ArchitectureConnection`, the test below constructs plain objects cast via the factory pattern already in use. Add:

```ts
it('resolves typeName from elementTypes and null when unknown/missing', () => {
  const types = [{ id: 5, projectId: 1, name: 'Sensor', color: null, isBuiltIn: true, deletedAt: null, createdAt: '', updatedAt: '' }]
  const nodes = buildNodes(
    [el({ id: 1, elementTypeId: 5 }), el({ id: 2, elementTypeId: 99 }), el({ id: 3, elementTypeId: null })],
    types as any, [], null, vi.fn()
  )
  expect((nodes[0].data as any).typeName).toBe('Sensor')
  expect((nodes[1].data as any).typeName).toBeNull() // unknown id
  expect((nodes[2].data as any).typeName).toBeNull() // no type
})

it('counts connections incident on each element (source or target), self-loop once', () => {
  const conns = [
    { id: 1, sourceId: 1, targetId: 2 },
    { id: 2, sourceId: 3, targetId: 1 },
    { id: 3, sourceId: 1, targetId: 1 } // self-loop
  ]
  const nodes = buildNodes(
    [el({ id: 1 }), el({ id: 2 }), el({ id: 3 })],
    [], conns as any, null, vi.fn()
  )
  const count = (id: string) => (nodes.find((n) => n.id === id)!.data as any).connectionCount
  expect(count('1')).toBe(3) // conn 1 (source) + conn 2 (target) + conn 3 (self, once)
  expect(count('2')).toBe(1)
  expect(count('3')).toBe(1)
})
```

Also update the five existing `buildNodes(...)` calls in this file (lines ~18, 23, 30, 37, 43) to the new signature by inserting `[], []` after the elements argument, e.g.:
`buildNodes(els, null, vi.fn())` → `buildNodes(els, [], [], null, vi.fn())`.

- [ ] **Step 3: Run tests to verify they fail**

```bash
export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"
./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/nodes.test.ts
```
Expected: FAIL — the two new tests error (wrong arity / `typeName` undefined) until `buildNodes` is updated.

- [ ] **Step 4: Update `buildNodes`**

In `nodes.ts`, extend the imports:

```ts
import type { ArchitectureElement, ElementType, ArchitectureConnection } from '../../../../types'
```

Change the signature and the `data` object. New signature + derivation:

```ts
export function buildNodes(
  elements: ArchitectureElement[],
  elementTypes: ElementType[],
  connections: ArchitectureConnection[],
  selectedId: number | null,
  onResizeEnd: (id: number, x: number, y: number, width: number, height: number) => void
): Node[] {
  const typeName = new Map(elementTypes.map((t) => [t.id, t.name]))
  // ... existing ordering logic unchanged (byId, ordered, placed, while-loop) ...
```

In the returned `data` object add the two fields (keep everything else):

```ts
    data: {
      label: el.name,
      blockId: el.blockId,
      color: el.color,
      selected: el.id === selectedId,
      nested: hasParent(el),
      childCount: elements.filter((c) => c.parentId === el.id).length,
      typeName: el.elementTypeId != null ? typeName.get(el.elementTypeId) ?? null : null,
      // ponytail: O(elements×connections) count, fine at desktop canvas scale
      connectionCount: connections.filter((c) => c.sourceId === el.id || c.targetId === el.id).length,
      onResizeEnd: (x: number, y: number, w: number, h: number) => onResizeEnd(el.id, x, y, w, h)
    } satisfies BlockNodeData,
```

- [ ] **Step 5: Update the `index.tsx` call site**

In `src/renderer/src/components/ArchitectureCanvas/index.tsx`, add `elementTypes` to the store destructure in `CanvasInner`:

```ts
  const {
    project, elements, connections, elementTypes, selectedElementId, selectedConnectionId,
    addElement, updateElement, removeElement, addConnection, removeConnection,
    selectElement, selectConnection
  } = useStore()
```

Change the `buildNodes` call and its effect deps:

```ts
  useEffect(() => {
    setNodes(buildNodes(elements, elementTypes, connections, selectedElementId, (id, x, y, width, height) => {
      // ... unchanged body ...
    }))
  }, [elements, elementTypes, connections, selectedElementId])
```

- [ ] **Step 6: Run tests + typecheck**

```bash
./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/nodes.test.ts
./node_modules/typescript/bin/tsc --noEmit -p tsconfig.web.json
```
Expected: nodes tests PASS; tsc exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/ArchitectureCanvas/nodes.ts src/renderer/src/components/ArchitectureCanvas/nodes.test.ts src/renderer/src/components/ArchitectureCanvas/BlockNode.tsx src/renderer/src/components/ArchitectureCanvas/index.tsx
git commit -m "feat(arch): buildNodes derives typeName + connectionCount

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: BlockNode header shows type name + port-count badge

**Files:**
- Modify: `src/renderer/src/components/ArchitectureCanvas/BlockNode.tsx` (header rendering)
- Test: `src/renderer/src/components/ArchitectureCanvas/BlockNode.test.tsx`

**Interfaces:**
- Consumes: `BlockNodeData.typeName` / `BlockNodeData.connectionCount` (added in Task 1).

- [ ] **Step 1: Check the existing test file**

Open `src/renderer/src/components/ArchitectureCanvas/BlockNode.test.tsx`. If it exists, note its render helper and the `data` object it builds (mock-capture style). If it does not exist, create it following the pattern below (React Flow nodes need a provider — use `ReactFlowProvider` wrapper as the other canvas component tests do).

- [ ] **Step 2: Write the failing tests**

Add (adapt the `data` factory to the file's existing one; include the two new fields):

```tsx
import { render, screen } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import BlockNode from './BlockNode'
import type { BlockNodeData } from './BlockNode'

function data(over: Partial<BlockNodeData>): BlockNodeData {
  return {
    label: '', blockId: 'SYS-001', color: null, selected: false, nested: false,
    childCount: 0, typeName: null, connectionCount: 0, onResizeEnd: () => {}, ...over
  }
}
function renderNode(d: BlockNodeData) {
  return render(
    <ReactFlowProvider>
      <BlockNode id="1" type="block" data={d as any} selected={false}
        dragging={false} zIndex={0} isConnectable positionAbsoluteX={0} positionAbsoluteY={0} />
    </ReactFlowProvider>
  )
}

it('shows the type name on an unnamed node instead of "Object"', () => {
  renderNode(data({ label: '', typeName: 'Subsystem' }))
  expect(screen.getByText('Subsystem')).toBeInTheDocument()
  expect(screen.queryByText('Object')).not.toBeInTheDocument()
})

it('falls back to "Object" on an unnamed node with no type', () => {
  renderNode(data({ label: '', typeName: null }))
  expect(screen.getByText('Object')).toBeInTheDocument()
})

it('renders the port-count badge only when connectionCount > 0', () => {
  const { rerender } = renderNode(data({ connectionCount: 0 }))
  expect(screen.queryByText(/⇆/)).not.toBeInTheDocument()
  rerender(
    <ReactFlowProvider>
      <BlockNode id="1" type="block" data={data({ connectionCount: 3 }) as any} selected={false}
        dragging={false} zIndex={0} isConnectable positionAbsoluteX={0} positionAbsoluteY={0} />
    </ReactFlowProvider>
  )
  expect(screen.getByText('⇆ 3')).toBeInTheDocument()
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"
./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/BlockNode.test.tsx
```
Expected: FAIL — "Object" still shown for typed unnamed node; no badge.

- [ ] **Step 4: Update the header rendering**

In `BlockNode.tsx`, in the header `<div data-testid="object-header" ...>`:

Replace the unnamed fallback `<span>Object</span>` with:

```tsx
        ) : (
          <span>{d.typeName ?? 'Object'}</span>
        )}
```

In the named branch, add the type tag before the label span:

```tsx
        {named ? (
          <span className="flex items-baseline gap-2 min-w-0 normal-case tracking-normal">
            {d.typeName && <span className="uppercase tracking-[0.05em] text-white/60 shrink-0">{d.typeName}</span>}
            <span className="text-[11px] truncate">{d.label}</span>
            <span className="font-mono font-medium text-white/70 shrink-0">{d.blockId}</span>
          </span>
        ) : (
```

In the right cluster `<span className="flex items-center gap-2 ...">`, add the badge after the `Contains` span:

```tsx
          {d.childCount > 0 && <span>Contains {d.childCount}</span>}
          {d.connectionCount > 0 && (
            <span className="border border-white/40 rounded px-1 leading-tight">⇆ {d.connectionCount}</span>
          )}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/BlockNode.test.tsx
./node_modules/typescript/bin/tsc --noEmit -p tsconfig.web.json
```
Expected: PASS; tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/ArchitectureCanvas/BlockNode.tsx src/renderer/src/components/ArchitectureCanvas/BlockNode.test.tsx
git commit -m "feat(arch): node header shows type name + port-count badge

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Component Library palette panel

**Files:**
- Create: `src/renderer/src/components/ArchitectureCanvas/ComponentLibrary.tsx`
- Create: `src/renderer/src/components/ArchitectureCanvas/ComponentLibrary.test.tsx`
- Modify: `src/renderer/src/components/ArchitectureCanvas/index.tsx` (wrap canvas in a flex row with the palette)

**Interfaces:**
- Consumes: store `elementTypes: ElementType[]`, `project`, and `addElement(input: CreateElementInput)` where `CreateElementInput` accepts `{ projectId, elementTypeId?, posX?, posY? }`.
- Produces: default-exported `ComponentLibrary(): JSX.Element`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/components/ArchitectureCanvas/ComponentLibrary.test.tsx`. Mock the store the way the other renderer component tests in this repo do (they call `useStore` and set state via `useStore.setState`; check `ElementPanel/index.test.tsx` for the exact mock idiom and follow it). Test:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { useStore } from '../../store'
import ComponentLibrary from './ComponentLibrary'

const addElement = vi.fn()

beforeEach(() => {
  addElement.mockReset()
  useStore.setState({
    project: { id: 7 } as any,
    elementTypes: [
      { id: 1, projectId: 7, name: 'System', color: null, isBuiltIn: true, deletedAt: null, createdAt: '', updatedAt: '' },
      { id: 2, projectId: 7, name: 'Component', color: '#42682d', isBuiltIn: true, deletedAt: null, createdAt: '', updatedAt: '' }
    ] as any,
    addElement
  })
})

it('renders one row per element type', () => {
  render(<ComponentLibrary />)
  expect(screen.getByRole('button', { name: 'Add System' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Add Component' })).toBeInTheDocument()
})

it('clicking a type adds an element of that type', () => {
  render(<ComponentLibrary />)
  fireEvent.click(screen.getByRole('button', { name: 'Add Component' }))
  expect(addElement).toHaveBeenCalledTimes(1)
  const arg = addElement.mock.calls[0][0]
  expect(arg.projectId).toBe(7)
  expect(arg.elementTypeId).toBe(2)
  expect(typeof arg.posX).toBe('number')
  expect(typeof arg.posY).toBe('number')
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"
./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/ComponentLibrary.test.tsx
```
Expected: FAIL — module `./ComponentLibrary` not found.

- [ ] **Step 3: Create the component**

`src/renderer/src/components/ArchitectureCanvas/ComponentLibrary.tsx`:

```tsx
import { useStore } from '../../store'

const NAVY = '#1a365d'

export default function ComponentLibrary(): JSX.Element {
  const { project, elementTypes, addElement } = useStore()

  function add(elementTypeId: number): void {
    if (!project) return
    addElement({
      projectId: project.id,
      elementTypeId,
      posX: 100 + Math.random() * 200,
      posY: 100 + Math.random() * 200
    })
  }

  return (
    <div className="w-52 shrink-0 bg-white border-r border-line flex flex-col">
      <div className="px-3 h-12 flex items-center text-[10px] font-bold uppercase tracking-[0.05em] text-ink-faint border-b border-line shrink-0">
        Component Library
      </div>
      <div className="flex-1 overflow-auto p-2 flex flex-col gap-1">
        {elementTypes.map((t) => (
          <button
            key={t.id}
            onClick={() => add(t.id)}
            aria-label={`Add ${t.name}`}
            className="flex items-center gap-2 px-2 py-2 rounded text-sm text-ink hover:bg-workspace text-left"
          >
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: t.color ?? NAVY }} />
            <span className="truncate">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/ComponentLibrary.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Wire the palette into the Architecture view**

In `index.tsx`, import it near the other local imports:

```ts
import ComponentLibrary from './ComponentLibrary'
```

Find the `CanvasInner` return — currently:

```tsx
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 h-12 bg-white border-b border-line shrink-0">
        <Button onClick={handleAddBlock}>+ Object</Button>
        <span className="text-xs text-ink-faint">Drag from a block's edge to connect</span>
      </div>
      <div className="flex-1">
        <ReactFlow ... >
```

Wrap it in a horizontal row with the palette on the left. Replace the outer `<div className="flex flex-col h-full">` open tag and add the palette so the structure becomes:

```tsx
    <div className="flex h-full">
      <ComponentLibrary />
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center gap-3 px-4 h-12 bg-white border-b border-line shrink-0">
          <Button onClick={handleAddBlock}>+ Object</Button>
          <span className="text-xs text-ink-faint">Drag from a block's edge to connect</span>
        </div>
        <div className="flex-1">
          <ReactFlow ... >
          ... unchanged ...
          </ReactFlow>
        </div>
      </div>
    </div>
```

(Only the wrapping changes — the toolbar, `<ReactFlow>` and its children stay exactly as they are. Ensure the closing tags balance: the added `<div className="flex flex-col flex-1 min-w-0">` needs a matching `</div>` before the outer close.)

- [ ] **Step 6: Typecheck + run the canvas test folder**

```bash
./node_modules/typescript/bin/tsc --noEmit -p tsconfig.web.json
./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas
```
Expected: tsc exit 0; ArchitectureCanvas suite shows the same 1 pre-existing failure and all else passing (new ComponentLibrary/BlockNode/nodes tests green).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/ArchitectureCanvas/ComponentLibrary.tsx src/renderer/src/components/ArchitectureCanvas/ComponentLibrary.test.tsx src/renderer/src/components/ArchitectureCanvas/index.tsx
git commit -m "feat(arch): Component Library palette — click a type to drop a typed node

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Build + live verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Full typecheck + suite + build**

```bash
export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"
./node_modules/typescript/bin/tsc --noEmit -p tsconfig.web.json
./node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json
./node_modules/.bin/vitest run
./node_modules/.bin/electron-vite build
```
Expected: both tsc exit 0; suite failure composition unchanged (48 failed = 47 sqlite-ABI + 1 pre-existing ArchitectureCanvas), passed count up by the new tests; build all 3 targets clean.

- [ ] **Step 2: Drive the running app (Playwright driver)**

Use `.claude/skills/run-app/driver.mjs` (FIFO stdin pattern — hold the write end open). Verify, capturing screenshots:
1. Architecture tab shows the left **Component Library** panel listing the 5 seeded types (System / Subsystem / Component / Function / External) with color dots.
2. Click a type (e.g. Component) → a node appears; its header shows the type name (uppercase).
3. `+ Object` still creates an untyped block (header shows "Object" / its name only).
4. Connect two nodes by dragging edge-to-edge → both nodes' headers gain the `⇆ N` badge; count matches.
5. Relaunch the app → the typed node and its connection persist (type name + badge still shown).

- [ ] **Step 3: Record results + update ledger and handoff**

Append a verification note to `.superpowers/sdd/progress.md` (new ledger section for this plan) and update `handoff.md` with a "Component Library & Typed Nodes — COMPLETE (backlog item 16)" entry and mark item 16 done in `docs/superpowers/specs/2026-07-02-ui-overhaul-design.md`. Commit docs.

```bash
git add .superpowers/sdd/progress.md handoff.md docs/superpowers/specs/2026-07-02-ui-overhaul-design.md
git commit -m "docs: component library + typed nodes complete (backlog item 16)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Self-Review

- **Spec coverage:** Part A (palette) → Task 3; Part B (type name in header) → Tasks 1+2; Part C (port-count badge) → Tasks 1+2; wiring (`buildNodes` signature, call site, deps) → Task 1; layout → Task 3; tests → each task; verification → Task 4. All spec sections covered.
- **Placeholder scan:** no TBD/TODO; all code shown; the one deliberate simplification carries a `ponytail:` comment.
- **Type consistency:** `buildNodes(elements, elementTypes, connections, selectedId, onResizeEnd)` identical across Task 1 body, index.tsx call site, and nodes.test.ts; `BlockNodeData.typeName` / `connectionCount` consistent across BlockNode, buildNodes, and tests; `addElement({ projectId, elementTypeId, posX, posY })` matches `CreateElementInput`.
```
