# Canvas Block Resize, Nesting & 4-Side Handles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Architecture blocks can be resized with drag handles, embedded inside one another by dragging, and connected from all four sides (top/bottom added) — with size, nesting, and handle choice persisted.

**Architecture:** The DB already stores `width`/`height`/`parent_id` on `architecture_elements` and `elementToNode` already maps `parentId` — this plan adds the interaction UI. React Flow v12 primitives do the heavy lifting: `NodeResizer` for resize, parent/child nodes for nesting (drop-to-nest resolved by a pure geometry module we can unit-test), `ConnectionMode.Loose` + four named source handles for 4-side connections. Connections gain `source_handle`/`target_handle` columns so the chosen side survives relaunch. Deleting a parent reparents its children to the grandparent (position preserved) instead of orphaning them.

**Tech Stack:** @xyflow/react 12 (`NodeResizer`, `ConnectionMode`, `useReactFlow`), Zustand, better-sqlite3, Vitest + Testing Library (jsdom), Playwright driver for app verification.

## Global Constraints

- **PATH:** `npm`/`node` are not on the shell PATH. Prefix every shell command with:
  `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"`
- **Broken npm shim:** never run `npm run …`; use the binaries directly: `./node_modules/.bin/vitest`, `./node_modules/.bin/tsc`, `./node_modules/.bin/electron-vite`.
- **Typecheck commands:** `./node_modules/.bin/tsc --noEmit -p tsconfig.node.json --composite false` and `./node_modules/.bin/tsc --noEmit -p tsconfig.web.json --composite false`.
- **No new dependencies.** Colors only from semantic tokens in `tailwind.config.js` or values already present in the file being edited (e.g. `#1a365d` NAVY already in BlockNode).
- **Commit to `main`** after each task (project convention — no feature branches).
- **Pre-existing test failures:** all `src/main/**` tests fail under vitest with `ERR_DLOPEN_FAILED` (better-sqlite3 is an Electron-ABI binary; local node is ABI 127) plus 1 pre-existing ArchitectureCanvas failure. Accepted baseline before this feature: **48 failed / 74 passed**. Do not rebuild the binary or chase these. Main-process changes in this plan are gated by typecheck + Task 4 running-app checks; all renderer tests MUST pass.

## Design decisions (locked in — do not re-litigate)

- Child element positions are stored **parent-relative** in the DB (this is what React Flow's `node.position` is for nested nodes, and what the existing `onNodeDragStop` already saves). Root elements are absolute.
- Drop-to-nest: on drag stop, the dragged node's **center point** decides containment; if it lies inside more than one candidate, the **smallest-area** candidate (innermost) wins. The dragged node itself and its descendants are never candidates (cycle guard).
- Un-nest by dragging out: `extent: 'parent'` is **removed** so children can leave their parent; dropping with center outside every candidate clears `parentId`.
- Deleting an element reparents its children to the deleted element's own parent (grandparent), adding the deleted parent's position to each child's (both are relative to the grandparent, so geometry is preserved). Existing behavior of soft-deleting the element's connections is kept.
- All four handles are **source-type** with ids `left`/`right`/`top`/`bottom`; `connectionMode={ConnectionMode.Loose}` makes them dual-purpose. Legacy connections (NULL handles) default to `sourceHandle: 'right'`, `targetHandle: 'left'` at edge-mapping time — the exact look they had before this feature.
- Resize: `NodeResizer` visible only on the selected node, `minWidth 140`, `minHeight 60`; final size persisted once on `onResizeEnd` via the existing `elements:update` IPC. No new IPC channels anywhere in this plan.
- React Flow v12 requires parents to appear **before** their children in the `nodes` array — `buildNodes` guarantees this ordering. An element whose `parentId` points at a missing element (not in the loaded list) renders as a root (orphan guard).

---

### Task 1: Main process — connection handle columns + delete-reparents-children

**Files:**
- Modify: `src/main/db/migrations.ts` (append two `addColumnIfMissing` lines)
- Modify: `src/main/handlers/connections.ts` (rowToConnection, INSERT)
- Modify: `src/main/handlers/elements.ts` (deleteElement)
- Modify: `src/types/index.ts` (ArchitectureConnection, CreateConnectionInput)

No runnable tests in this task (all `src/main/**` tests are ABI-blocked baseline). Gate: both typechecks; behavior is exercised end-to-end in Task 4.

**Interfaces:**
- Produces (Tasks 3–4 rely on these exact names): `ArchitectureConnection.sourceHandle: string | null`, `ArchitectureConnection.targetHandle: string | null`, `CreateConnectionInput.sourceHandle?: string | null`, `CreateConnectionInput.targetHandle?: string | null`. DB columns `source_handle`, `target_handle` (TEXT, nullable). `deleteElement` reparents children.

- [ ] **Step 1: Migration columns**

In `src/main/db/migrations.ts`, after the `addColumnIfMissing(db, 'requirements', 'req_type', ...)` line, add:

```ts
  addColumnIfMissing(db, 'architecture_connections', 'source_handle', 'TEXT')
  addColumnIfMissing(db, 'architecture_connections', 'target_handle', 'TEXT')
```

- [ ] **Step 2: Types**

In `src/types/index.ts`, inside `interface ArchitectureConnection`, after `targetId: number`:

```ts
  sourceHandle: string | null
  targetHandle: string | null
```

Inside `interface CreateConnectionInput`, after `targetId: number`:

```ts
  sourceHandle?: string | null
  targetHandle?: string | null
```

- [ ] **Step 3: Connections handler**

In `src/main/handlers/connections.ts`:

In `rowToConnection`, after `sourceId: row.source_id, targetId: row.target_id,` add:

```ts
    sourceHandle: row.source_handle ?? null, targetHandle: row.target_handle ?? null,
```

Replace the INSERT statement in `createConnection` with:

```ts
    const r = db.prepare(`
      INSERT INTO architecture_connections
        (project_id, conn_id, source_id, target_id, source_handle, target_handle, name, connection_type_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.projectId, connId, input.sourceId, input.targetId,
      input.sourceHandle ?? null, input.targetHandle ?? null,
      input.name ?? null, input.connectionTypeId ?? null, ts, ts
    )
```

- [ ] **Step 4: deleteElement reparents children**

In `src/main/handlers/elements.ts`, replace the body of `deleteElement` with:

```ts
export function deleteElement(id: number): void {
  const ts = now()
  const db = getDatabase()
  db.transaction(() => {
    const parent = db.prepare(
      'SELECT parent_id, pos_x, pos_y FROM architecture_elements WHERE id = ?'
    ).get(id) as any
    if (parent) {
      // children become siblings of the deleted element; positions stay
      // geometrically fixed because both are relative to the same grandparent
      db.prepare(`
        UPDATE architecture_elements
        SET parent_id = ?, pos_x = pos_x + ?, pos_y = pos_y + ?, updated_at = ?
        WHERE parent_id = ? AND deleted_at IS NULL
      `).run(parent.parent_id ?? null, parent.pos_x, parent.pos_y, ts, id)
    }
    db.prepare(
      'UPDATE architecture_connections SET deleted_at = ?, updated_at = ? WHERE (source_id = ? OR target_id = ?) AND deleted_at IS NULL'
    ).run(ts, ts, id, id)
    db.prepare(
      'UPDATE architecture_elements SET deleted_at = ?, updated_at = ? WHERE id = ?'
    ).run(ts, ts, id)
  })()
}
```

- [ ] **Step 5: Typecheck both configs**

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && ./node_modules/.bin/tsc --noEmit -p tsconfig.node.json --composite false && ./node_modules/.bin/tsc --noEmit -p tsconfig.web.json --composite false`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/main/db/migrations.ts src/main/handlers/connections.ts src/main/handlers/elements.ts src/types/index.ts
git commit -m "feat(db): connection handle columns; deleting an element reparents its children"
```

---

### Task 2: Pure node-graph module + drop-to-nest wiring in the canvas

**Files:**
- Create: `src/renderer/src/components/ArchitectureCanvas/nodes.ts`
- Create: `src/renderer/src/components/ArchitectureCanvas/nodes.test.ts`
- Modify: `src/renderer/src/components/ArchitectureCanvas/index.tsx`
- Modify: `src/renderer/src/components/ArchitectureCanvas/index.test.tsx` (extend the `@xyflow/react` mock)

**Interfaces:**
- Consumes: `ArchitectureElement` from `src/types` (fields `id`, `parentId`, `posX`, `posY`, `width`, `height`, `name`, `blockId`, `color`); `BlockNodeData` from `./BlockNode`.
- Produces (Task 3 modifies `buildNodes`'s data payload, Task 4's checks depend on behavior):
  - `buildNodes(elements: ArchitectureElement[], selectedId: number | null, onResizeEnd: (id: number, width: number, height: number) => void): Node[]` — parents-first order, orphan guard, no `extent`.
  - `resolveDrop(draggedId: number, draggedAbs: { x: number; y: number }, elements: ArchitectureElement[]): { parentId: number | null; posX: number; posY: number }`
  - `absolutePosition(el: ArchitectureElement, byId: Map<number, ArchitectureElement>): { x: number; y: number }`

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/src/components/ArchitectureCanvas/nodes.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { buildNodes, resolveDrop } from './nodes'
import type { ArchitectureElement } from '../../../../types'

function el(partial: Partial<ArchitectureElement> & { id: number }): ArchitectureElement {
  return {
    projectId: 1, parentId: null, blockId: `SYS-${partial.id}`, name: `E${partial.id}`,
    elementTypeId: null, description: null, color: null,
    posX: 0, posY: 0, width: 160, height: 80,
    deletedAt: null, createdAt: '', updatedAt: '',
    ...partial
  }
}

describe('buildNodes', () => {
  it('orders parents before children regardless of input order', () => {
    const els = [el({ id: 3, parentId: 2 }), el({ id: 2, parentId: 1 }), el({ id: 1 })]
    const ids = buildNodes(els, null, vi.fn()).map((n) => n.id)
    expect(ids).toEqual(['1', '2', '3'])
  })

  it('sets parentId without extent so children can be dragged out', () => {
    const nodes = buildNodes([el({ id: 1 }), el({ id: 2, parentId: 1 })], null, vi.fn())
    const child = nodes.find((n) => n.id === '2')!
    expect(child.parentId).toBe('1')
    expect(child.extent).toBeUndefined()
  })

  it('renders an element whose parent is missing as a root (orphan guard)', () => {
    const nodes = buildNodes([el({ id: 2, parentId: 99 })], null, vi.fn())
    expect(nodes).toHaveLength(1)
    expect(nodes[0].parentId).toBeUndefined()
  })

  it('wires onResizeEnd through node data with the element id', () => {
    const spy = vi.fn()
    const nodes = buildNodes([el({ id: 7 })], null, spy)
    ;(nodes[0].data as { onResizeEnd: (w: number, h: number) => void }).onResizeEnd(300, 200)
    expect(spy).toHaveBeenCalledWith(7, 300, 200)
  })
})

describe('resolveDrop', () => {
  const container = el({ id: 1, posX: 100, posY: 100, width: 400, height: 300 })
  const small = el({ id: 2, posX: 600, posY: 600 })

  it('nests when the dragged center lands inside another block, storing parent-relative position', () => {
    // dragged abs (150,150), size 160x80 → center (230,190) inside container (100..500, 100..400)
    const r = resolveDrop(2, { x: 150, y: 150 }, [container, small])
    expect(r).toEqual({ parentId: 1, posX: 50, posY: 50 })
  })

  it('clears parent when dropped outside every candidate', () => {
    const nested = { ...small, parentId: 1, posX: 50, posY: 50 }
    const r = resolveDrop(2, { x: 900, y: 900 }, [container, nested])
    expect(r).toEqual({ parentId: null, posX: 900, posY: 900 })
  })

  it('picks the innermost (smallest) candidate when containers overlap', () => {
    const outer = el({ id: 1, posX: 0, posY: 0, width: 800, height: 600 })
    const inner = el({ id: 2, parentId: 1, posX: 100, posY: 100, width: 300, height: 200 })
    // dragged center (230,190) is inside both; inner wins; pos relative to inner's abs (100,100)
    const r = resolveDrop(3, { x: 150, y: 150 }, [outer, inner, el({ id: 3 })])
    expect(r).toEqual({ parentId: 2, posX: 50, posY: 50 })
  })

  it('never nests a node into itself or its own descendants', () => {
    const parent = el({ id: 1, posX: 0, posY: 0, width: 800, height: 600 })
    const child = { ...el({ id: 2, posX: 10, posY: 10, width: 700, height: 500 }), parentId: 1 }
    // dragging the PARENT over its child's area must not nest into the child
    const r = resolveDrop(1, { x: 50, y: 50 }, [parent, child])
    expect(r).toEqual({ parentId: null, posX: 50, posY: 50 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && ./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/nodes.test.ts`
Expected: FAIL — `Cannot find module './nodes'`.

- [ ] **Step 3: Implement the module**

Create `src/renderer/src/components/ArchitectureCanvas/nodes.ts`:

```ts
import type { Node } from '@xyflow/react'
import type { ArchitectureElement } from '../../../../types'
import type { BlockNodeData } from './BlockNode'

export function absolutePosition(
  el: ArchitectureElement,
  byId: Map<number, ArchitectureElement>
): { x: number; y: number } {
  let x = el.posX
  let y = el.posY
  let parent = el.parentId !== null ? byId.get(el.parentId) : undefined
  while (parent) {
    x += parent.posX
    y += parent.posY
    parent = parent.parentId !== null ? byId.get(parent.parentId) : undefined
  }
  return { x, y }
}

function descendantIds(rootId: number, elements: ArchitectureElement[]): Set<number> {
  const ids = new Set<number>()
  let added = true
  while (added) {
    added = false
    for (const el of elements) {
      if (el.parentId !== null && !ids.has(el.id) && (el.parentId === rootId || ids.has(el.parentId))) {
        ids.add(el.id)
        added = true
      }
    }
  }
  return ids
}

// React Flow requires parents before children in the nodes array.
export function buildNodes(
  elements: ArchitectureElement[],
  selectedId: number | null,
  onResizeEnd: (id: number, width: number, height: number) => void
): Node[] {
  const byId = new Map(elements.map((e) => [e.id, e]))
  const ordered: ArchitectureElement[] = []
  const placed = new Set<number>()
  const hasParent = (el: ArchitectureElement): boolean =>
    el.parentId !== null && byId.has(el.parentId)

  let remaining = elements
  while (remaining.length > 0) {
    const ready = remaining.filter((el) => !hasParent(el) || placed.has(el.parentId!))
    if (ready.length === 0) break // parentId cycle in data — render the rest as-is
    for (const el of ready) {
      ordered.push(el)
      placed.add(el.id)
    }
    remaining = remaining.filter((el) => !placed.has(el.id))
  }
  ordered.push(...remaining)

  return ordered.map((el) => ({
    id: String(el.id),
    type: 'block',
    position: { x: el.posX, y: el.posY },
    ...(hasParent(el) ? { parentId: String(el.parentId) } : {}),
    data: {
      label: el.name,
      blockId: el.blockId,
      color: el.color,
      selected: el.id === selectedId,
      onResizeEnd: (w: number, h: number) => onResizeEnd(el.id, w, h)
    } satisfies BlockNodeData,
    style: { width: el.width, height: el.height }
  }))
}

// Decides the nesting outcome of a drag: dragged node's center point picks
// the innermost containing block; outside everything → root.
export function resolveDrop(
  draggedId: number,
  draggedAbs: { x: number; y: number },
  elements: ArchitectureElement[]
): { parentId: number | null; posX: number; posY: number } {
  const byId = new Map(elements.map((e) => [e.id, e]))
  const dragged = byId.get(draggedId)
  if (!dragged) return { parentId: null, posX: draggedAbs.x, posY: draggedAbs.y }

  const excluded = descendantIds(draggedId, elements)
  excluded.add(draggedId)

  const center = {
    x: draggedAbs.x + dragged.width / 2,
    y: draggedAbs.y + dragged.height / 2
  }

  let best: { el: ArchitectureElement; abs: { x: number; y: number }; area: number } | null = null
  for (const el of elements) {
    if (excluded.has(el.id)) continue
    const abs = absolutePosition(el, byId)
    const inside =
      center.x >= abs.x && center.x <= abs.x + el.width &&
      center.y >= abs.y && center.y <= abs.y + el.height
    if (!inside) continue
    const area = el.width * el.height
    if (best === null || area < best.area) best = { el, abs, area }
  }

  if (best === null) return { parentId: null, posX: draggedAbs.x, posY: draggedAbs.y }
  return {
    parentId: best.el.id,
    posX: draggedAbs.x - best.abs.x,
    posY: draggedAbs.y - best.abs.y
  }
}
```

Note: `BlockNodeData` does not have `onResizeEnd` yet — add it now (Task 3 renders the resizer). In `src/renderer/src/components/ArchitectureCanvas/BlockNode.tsx`, change the type to:

```ts
export type BlockNodeData = {
  label: string
  blockId: string
  color: string | null
  selected: boolean
  onResizeEnd: (width: number, height: number) => void
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && ./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/nodes.test.ts`
Expected: 8/8 PASS.

- [ ] **Step 5: Wire the canvas**

In `src/renderer/src/components/ArchitectureCanvas/index.tsx`:

1. Delete the whole `elementToNode` function and its `import('../../../../types')` usage.
2. Change the `@xyflow/react` import to add `useReactFlow`:

```ts
import {
  ReactFlow, Background, BackgroundVariant, Controls, ReactFlowProvider,
  useNodesState, useEdgesState, useReactFlow,
  type Node, type Edge, type Connection
} from '@xyflow/react'
```

3. Add imports:

```ts
import { buildNodes, resolveDrop } from './nodes'
```

4. `useReactFlow` must be called under the provider. Rename the exported component's inner canvas: wrap the existing content in a new inner component. Replace the current component structure with:

```tsx
export default function ArchitectureCanvas(): JSX.Element {
  const { project } = useStore()

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ink-faint text-sm">
        Open or create a project to start building your architecture.
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  )
}

function CanvasInner(): JSX.Element {
  // move here UNCHANGED from the old component body: the full useStore()
  // destructuring, useNodesState/useEdgesState, both useEffects, onConnect,
  // handleAddBlock, onNodeClick, onEdgeClick, onPaneClick, onNodeDragStop,
  // onNodesDelete, onEdgesDelete, and the returned JSX from
  // <div className="flex flex-col h-full"> down to its closing tag
  // (i.e. everything that was previously inside <ReactFlowProvider>).
}
```

Inside `CanvasInner` (which keeps all existing hooks/handlers), make these changes:

5. Get the internal-node accessor: after the `useEdgesState` line add:

```ts
  const { getInternalNode } = useReactFlow()
```

6. Replace the nodes-deriving effect body with:

```ts
  useEffect(() => {
    setNodes(buildNodes(elements, selectedElementId, (id, width, height) => updateElement(id, { width, height })))
  }, [elements, selectedElementId])
```

7. Replace `onNodeDragStop` with:

```ts
  function onNodeDragStop(_: unknown, node: Node): void {
    const abs = getInternalNode(node.id)?.internals.positionAbsolute ?? node.position
    const id = Number(node.id)
    const el = elements.find((e) => e.id === id)
    const drop = resolveDrop(id, abs, elements)
    if (el && drop.parentId !== el.parentId) {
      updateElement(id, drop)
    } else {
      updateElement(id, { posX: node.position.x, posY: node.position.y })
    }
  }
```

- [ ] **Step 6: Extend the canvas test mock and run the component tests**

In `src/renderer/src/components/ArchitectureCanvas/index.test.tsx`, inside the `vi.mock('@xyflow/react', ...)` factory object, add:

```ts
  useReactFlow: () => ({ getInternalNode: vi.fn() }),
  ConnectionMode: { Loose: 'loose', Strict: 'strict' },
  NodeResizer: () => null,
```

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && ./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/ && ./node_modules/.bin/tsc --noEmit -p tsconfig.web.json --composite false`
Expected: `nodes.test.ts` 8/8 pass; `index.test.tsx` same pass/fail shape as baseline (3 pass, 1 pre-existing failure — the "connection mode toggle" test was already failing before this plan); typecheck exit 0. BlockNode still compiles because `BlockNodeData.onResizeEnd` is only consumed via `d.selected`-style reads (the resizer arrives in Task 3) — but the type change is already in place, so `buildNodes`'s `satisfies` clause typechecks.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/ArchitectureCanvas/nodes.ts src/renderer/src/components/ArchitectureCanvas/nodes.test.ts src/renderer/src/components/ArchitectureCanvas/index.tsx src/renderer/src/components/ArchitectureCanvas/index.test.tsx src/renderer/src/components/ArchitectureCanvas/BlockNode.tsx
git commit -m "feat(canvas): drop-to-nest with pure geometry module; parents-first node ordering"
```

---

### Task 3: BlockNode resizer + four handles; loose connections with persisted handle sides

**Files:**
- Modify: `src/renderer/src/components/ArchitectureCanvas/BlockNode.tsx`
- Create: `src/renderer/src/components/ArchitectureCanvas/BlockNode.test.tsx`
- Modify: `src/renderer/src/components/ArchitectureCanvas/index.tsx` (ConnectionMode, onConnect, edge mapping)

**Interfaces:**
- Consumes: `BlockNodeData.onResizeEnd` (Task 2), `CreateConnectionInput.sourceHandle/targetHandle` (Task 1).
- Produces: four handles with ids `left`/`right`/`top`/`bottom` (Task 4's driver checks count `.react-flow__handle` per node and connect top→bottom); resizer visible on selection.

- [ ] **Step 1: Write the failing BlockNode tests**

Create `src/renderer/src/components/ArchitectureCanvas/BlockNode.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import BlockNode, { type BlockNodeData } from './BlockNode'

const handleSpy = vi.fn()
const resizerSpy = vi.fn()

vi.mock('@xyflow/react', () => ({
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  Handle: (props: any) => { handleSpy(props); return null },
  NodeResizer: (props: any) => { resizerSpy(props); return null }
}))

const data: BlockNodeData = {
  label: 'Engine', blockId: 'SYS-001', color: null, selected: true,
  onResizeEnd: vi.fn()
}

describe('BlockNode', () => {
  it('renders four source handles: left, right, top, bottom', () => {
    handleSpy.mockClear()
    render(<BlockNode data={data} {...({} as any)} />)
    const ids = handleSpy.mock.calls.map(([p]) => p.id).sort()
    expect(ids).toEqual(['bottom', 'left', 'right', 'top'])
    expect(handleSpy.mock.calls.every(([p]) => p.type === 'source')).toBe(true)
  })

  it('shows the resizer only when selected, with min size and resize-end wiring', () => {
    resizerSpy.mockClear()
    render(<BlockNode data={data} {...({} as any)} />)
    const props = resizerSpy.mock.calls[0][0]
    expect(props.isVisible).toBe(true)
    expect(props.minWidth).toBe(140)
    expect(props.minHeight).toBe(60)
    props.onResizeEnd(null, { width: 320, height: 180 })
    expect(data.onResizeEnd).toHaveBeenCalledWith(320, 180)

    resizerSpy.mockClear()
    render(<BlockNode data={{ ...data, selected: false }} {...({} as any)} />)
    expect(resizerSpy.mock.calls[0][0].isVisible).toBe(false)
  })

  it('still renders block id and name', () => {
    render(<BlockNode data={data} {...({} as any)} />)
    expect(screen.getAllByText('SYS-001').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Engine').length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && ./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/BlockNode.test.tsx`
Expected: FAIL — only 2 handles rendered, no `NodeResizer` call.

- [ ] **Step 3: Implement BlockNode**

Replace the component body of `src/renderer/src/components/ArchitectureCanvas/BlockNode.tsx` (keep the `BlockNodeData` type from Task 2) with:

```tsx
import { memo } from 'react'
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react'

export type BlockNodeData = {
  label: string
  blockId: string
  color: string | null
  selected: boolean
  onResizeEnd: (width: number, height: number) => void
}

const NAVY = '#1a365d'

export default memo(function BlockNode({ data }: NodeProps) {
  const d = data as BlockNodeData
  const headerColor = d.color ?? NAVY
  return (
    <div
      style={{ borderColor: headerColor }}
      className={`bg-white border rounded-t text-sm select-none h-full w-full flex flex-col
        ${d.selected ? 'ring-2 ring-action/60' : ''}`}
    >
      <NodeResizer
        isVisible={d.selected}
        minWidth={140}
        minHeight={60}
        onResizeEnd={(_, params) => d.onResizeEnd(params.width, params.height)}
      />
      <div
        style={{ background: headerColor }}
        className="px-3 py-1 text-[10px] font-bold uppercase tracking-[0.05em] text-white shrink-0"
      >
        Block
      </div>
      <div className="px-3 py-2 flex-1 min-h-0">
        <div className="text-[11px] text-ink-faint font-mono mb-0.5">{d.blockId}</div>
        <div className="font-medium text-ink truncate">
          {d.label || <span className="text-ink-faint/50 italic">Unnamed</span>}
        </div>
      </div>
      <Handle id="left" type="source" position={Position.Left} className="!w-2 !h-2 !bg-action" />
      <Handle id="right" type="source" position={Position.Right} className="!w-2 !h-2 !bg-action" />
      <Handle id="top" type="source" position={Position.Top} className="!w-2 !h-2 !bg-action" />
      <Handle id="bottom" type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-action" />
    </div>
  )
})
```

Notes: `overflow-hidden` is intentionally dropped from the outer div (it would clip nested child nodes rendered inside the parent's bounds); `minWidth: 140` moves from inline style to the resizer's `minWidth`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && ./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/BlockNode.test.tsx`
Expected: 3/3 PASS.

- [ ] **Step 5: Canvas — loose mode + handle persistence**

In `src/renderer/src/components/ArchitectureCanvas/index.tsx`:

1. Add `ConnectionMode` to the `@xyflow/react` import list.
2. In the edges-deriving effect, add handle fields to the edge object after `target: String(c.targetId),`:

```ts
        sourceHandle: c.sourceHandle ?? 'right',
        targetHandle: c.targetHandle ?? 'left',
```

3. In `onConnect`, pass the handles through:

```ts
  const onConnect = useCallback((params: Connection) => {
    if (!project) return
    addConnection({
      projectId: project.id,
      sourceId: Number(params.source),
      targetId: Number(params.target),
      sourceHandle: params.sourceHandle ?? null,
      targetHandle: params.targetHandle ?? null
    })
  }, [project, addConnection])
```

4. On the `<ReactFlow>` element add:

```tsx
            connectionMode={ConnectionMode.Loose}
```

- [ ] **Step 6: Run canvas tests + typecheck**

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && ./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/ && ./node_modules/.bin/tsc --noEmit -p tsconfig.web.json --composite false`
Expected: BlockNode 3/3, nodes 8/8, index.test.tsx unchanged vs baseline (1 pre-existing failure); typecheck exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/ArchitectureCanvas/BlockNode.tsx src/renderer/src/components/ArchitectureCanvas/BlockNode.test.tsx src/renderer/src/components/ArchitectureCanvas/index.tsx
git commit -m "feat(canvas): NodeResizer on selection, 4-side loose handles with persisted sides"
```

---

### Task 4: Verification — suite, build, running app (real mouse drags)

**Files:**
- Modify: `.claude/skills/run-app/driver.mjs` (add a `mouse` command — tooling only)
- No app-source changes expected (fix regressions if found).

- [ ] **Step 1: Add a real-mouse command to the driver**

In `.claude/skills/run-app/driver.mjs`, add to `COMMANDS` (after `resize`):

```js
  // real OS-level input via Playwright — needed for drag interactions (React Flow)
  async mouse(arg) {
    if (!page) return console.log('ERROR: launch first');
    const [action, x, y] = arg.split(/\s+/);
    const px = Number(x), py = Number(y);
    if (action === 'move') await page.mouse.move(px, py, { steps: 10 });
    else if (action === 'down') await page.mouse.down();
    else if (action === 'up') await page.mouse.up();
    else if (action === 'drag') { // drag CURRENT→x,y: usage: mouse drag 500 300
      await page.mouse.down(); await page.mouse.move(px, py, { steps: 15 }); await page.mouse.up();
    }
    else return console.log('unknown mouse action:', action);
    console.log('mouse', action, px, py, 'OK');
  },
```

- [ ] **Step 2: Full test suite vs baseline**

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && ./node_modules/.bin/vitest run 2>&1 | tail -5`
Expected: 48 failed (identical composition to baseline: `src/main/**` ABI + 1 pre-existing ArchitectureCanvas test), passed ≥ 85 (74 baseline + 11 new). Any new failure must be fixed before proceeding.

- [ ] **Step 3: Build all targets**

Run: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" && ./node_modules/.bin/tsc --noEmit -p tsconfig.node.json --composite false && ./node_modules/.bin/tsc --noEmit -p tsconfig.web.json --composite false && ./node_modules/.bin/electron-vite build`
Expected: exit 0.

- [ ] **Step 4: Running-app checks (Playwright driver)**

Use `.claude/skills/run-app/driver.mjs` (stdin REPL; pipe commands with sleeps; `SCREENSHOT_DIR` to the session scratchpad; `resize 1400x900` first). Switch to the Architecture tab (`click-text Architecture`). Get element coordinates via `eval` + `getBoundingClientRect`, then drive `mouse` for drags. Verify:

1. **Handles:** each `.react-flow__node` contains 4 `.react-flow__handle` elements.
2. **Resize:** click a block (selects it) → `.react-flow__resize-control` elements appear. Mouse-drag the bottom-right control by (+80,+60) → block grows. Query `window` store or `eval` on `api.elements.list` via the store to confirm width/height persisted; relaunch → size retained.
3. **Nest:** create two blocks; enlarge one (resize or `eval` store `updateElement(id, { width: 400, height: 300 })`); mouse-drag the small block's header so its center lands inside the big one; drop → `elements.list` shows `parentId` set and parent-relative pos. Drag the PARENT → child follows (screenshot before/after). Drag child back out to empty canvas → `parentId` null.
4. **Top/bottom connect:** mouse-drag from one block's top handle to another block's bottom handle → edge appears; `connections.list` shows `sourceHandle: 'top'`, `targetHandle: 'bottom'`; relaunch → edge still attached to the same sides (screenshot).
5. **Delete parent keeps children:** with a nested child, select the parent and press Delete → child remains on canvas at the same visual spot with `parentId` of the deleted block's parent (null if it was root).
6. **Legacy edges:** any connection created before this feature still renders right→left.

If a mouse-drag proves flaky in the driver, fall back for THAT check to store-level `eval` (e.g. `updateElement` with `parentId`) to verify persistence + rendering, and say so explicitly in the report — but attempt the real drag first; the `mouse` command exists precisely for this.

Take screenshots: resized block, nested blocks (child inside parent), top↔bottom connection.

- [ ] **Step 5: Commit tooling + any fixes; report**

```bash
git add .claude/skills/run-app/driver.mjs
git commit -m "chore(tooling): mouse command in app driver for real drag interactions"
```
Commit any regression fixes separately. Report results per checklist item.

---

## Self-Review Notes

- **Spec coverage:** resize ↔ Task 3 (NodeResizer) + Task 2 (`onResizeEnd` plumbing) + persistence via existing `width`/`height` columns; embed ↔ Task 2 (resolveDrop, buildNodes ordering) + Task 1 (delete-reparent safety); top/bottom points ↔ Task 3 (4 handles, loose mode) + Task 1 (handle columns). All three user asks covered; verification in Task 4.
- **Type consistency:** `BlockNodeData.onResizeEnd(width, height)` defined in Task 2, consumed in Task 3; `buildNodes(elements, selectedId, onResizeEnd)` signature identical in Task 2 tests, implementation, and canvas wiring; `sourceHandle`/`targetHandle` names identical across Task 1 types/handler and Task 3 canvas usage.
- **Placeholder scan:** clean — every code step carries complete code.
- **Known accepted risks:** `index.test.tsx`'s pre-existing failing test ("connection mode toggle") stays failing — baseline; nested-child rendering inside a parent relies on RF's own child rendering (no `overflow-hidden` on the node div, noted in Task 3).
