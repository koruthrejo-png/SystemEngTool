# Connection Line Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-connection line style (solid/dashed/dotted) + independent start/end arrow markers, plus Delete-key removal of a selected connection — all undoable.

**Architecture:** Additive backend (3 nullable columns on `architecture_connections`); newly drawn connections default to a single filled target arrow while legacy (NULL) rows stay bare via render-time fallbacks. Styling edited per connection in the properties drawer, flowing through the existing `updateConnection` undo capture. Edges render via two pure helpers (`dashArray`, `edgeMarker`). Delete/Backspace on a selected connection routes through the existing `removeConnection` (which already pushes a restore-undo).

**Tech Stack:** Electron + React + TS + Zustand + Tailwind (semantic tokens) + better-sqlite3 + @xyflow/react 12.11.1.

Spec: `docs/superpowers/specs/2026-07-14-connection-line-editing-design.md`.

## Global Constraints

- Never `npm run`. Use `./node_modules/.bin/*` (`tsc`, `vitest`, `electron-vite`). `node` is on PATH; if a binary needs it: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"`.
- Both typechecks: `./node_modules/.bin/tsc -p tsconfig.web.json --noEmit && ./node_modules/.bin/tsc -p tsconfig.node.json --noEmit`
- Renderer test: `./node_modules/.bin/vitest run <path>`
- `src/main/**` vitest fails on the known better-sqlite3 ABI mismatch — ACCEPTED baseline. The gate is the renderer/pure-helper vitest, which runs. There is also one pre-existing ArchitectureCanvas failure historically ("connection mode toggle") — treat any pre-existing red as baseline; the bar is NO NEW failures.
- Additive backend only: 3 new nullable columns via `addColumnIfMissing`, no backfill, no changes to existing columns/handlers beyond the additive edits described.
- Enum values are TS-enforced (no DB `CHECK`), matching codebase convention.
- `line_style` values: `solid` | `dashed` | `dotted`. Marker values: `none` | `arrow` (open) | `arrowclosed` (filled).
- New connection defaults (written at INSERT): `line_style='solid'`, `marker_start='none'`, `marker_end='arrowclosed'`. Legacy NULL rows render as `solid` / `none` / `none` (bare).
- Commit after each task with a `feat(arch):` / `test(arch):` message.

---

### Task 1: Backend — columns, types, handler defaults + passthrough

**Files:**
- Modify: `src/main/db/migrations.ts`
- Modify: `src/types/index.ts`
- Modify: `src/main/handlers/connections.ts`
- Modify: `src/preload/index.ts` (only if a type import is needed — see Step 6)
- Modify: `src/types/api.d.ts` (only if a type import is needed — see Step 6)

**Interfaces:**
- Produces (types): `LINE_STYLES`, `LineStyle`, `EDGE_MARKERS`, `EdgeMarker`; `ArchitectureConnection.lineStyle/markerStart/markerEnd` (`LineStyle|null` / `EdgeMarker|null`); `UpdateConnectionInput.lineStyle?/markerStart?/markerEnd?`.
- Produces (behavior): `createConnection` stamps `solid`/`none`/`arrowclosed`; `updateConnection` partial-updates the 3 columns.

- [ ] **Step 1: Add the columns**

In `src/main/db/migrations.ts`, next to the existing `addColumnIfMissing(db, 'architecture_connections', 'source_handle', 'TEXT')` / `'target_handle'` calls (~line 202-203), add:

```typescript
  addColumnIfMissing(db, 'architecture_connections', 'line_style', 'TEXT')
  addColumnIfMissing(db, 'architecture_connections', 'marker_start', 'TEXT')
  addColumnIfMissing(db, 'architecture_connections', 'marker_end', 'TEXT')
```

No backfill.

- [ ] **Step 2: Add the type unions + interface fields**

In `src/types/index.ts`, immediately before `export interface ArchitectureConnection {` (~line 196), add:

```typescript
export const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const
export type LineStyle = (typeof LINE_STYLES)[number]

export const EDGE_MARKERS = ['none', 'arrow', 'arrowclosed'] as const
export type EdgeMarker = (typeof EDGE_MARKERS)[number]
```

Then in the `ArchitectureConnection` interface, after `connectionTypeId: number | null` (line 206), add:

```typescript
  lineStyle: LineStyle | null
  markerStart: EdgeMarker | null
  markerEnd: EdgeMarker | null
```

Then in `UpdateConnectionInput` (the interface with `connId?`, `name?`, `connectionTypeId?`, `description?`, ~line 259-264), add:

```typescript
  lineStyle?: LineStyle
  markerStart?: EdgeMarker
  markerEnd?: EdgeMarker
```

(`CreateConnectionInput` is unchanged — defaults are applied server-side.)

- [ ] **Step 3: Map the columns in `rowToConnection`**

In `src/main/handlers/connections.ts`, in `rowToConnection` (~line 8-16), add to the returned object (after `connectionTypeId: row.connection_type_id ?? null,`):

```typescript
    lineStyle: row.line_style ?? null, markerStart: row.marker_start ?? null, markerEnd: row.marker_end ?? null,
```

- [ ] **Step 4: Stamp defaults in `createConnection`**

In `createConnection`, extend the INSERT. Replace the existing INSERT statement:

```typescript
    const r = db.prepare(`
      INSERT INTO architecture_connections
        (project_id, architecture_id, conn_id, source_id, target_id, source_handle, target_handle, name, connection_type_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.projectId, architectureId, connId, input.sourceId, input.targetId,
      input.sourceHandle ?? null, input.targetHandle ?? null,
      input.name ?? null, input.connectionTypeId ?? null, ts, ts
    )
```

with (adds 3 columns + 3 literal default values):

```typescript
    const r = db.prepare(`
      INSERT INTO architecture_connections
        (project_id, architecture_id, conn_id, source_id, target_id, source_handle, target_handle, name, connection_type_id, line_style, marker_start, marker_end, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.projectId, architectureId, connId, input.sourceId, input.targetId,
      input.sourceHandle ?? null, input.targetHandle ?? null,
      input.name ?? null, input.connectionTypeId ?? null,
      'solid', 'none', 'arrowclosed', ts, ts
    )
```

- [ ] **Step 5: Partial-update the columns in `updateConnection`**

In `updateConnection`, replace the existing UPDATE:

```typescript
  db.prepare(`
    UPDATE architecture_connections SET
      conn_id = ?, name = ?, connection_type_id = ?, description = ?, updated_at = ?
    WHERE id = ?
  `).run(
    input.connId ?? existing.conn_id,
    'name' in input ? (input.name ?? null) : existing.name,
    'connectionTypeId' in input ? (input.connectionTypeId ?? null) : existing.connection_type_id,
    'description' in input ? (input.description ?? null) : existing.description,
    now(), id
  )
```

with (adds the 3 columns using the same `'key' in input ? … : existing.col` idiom):

```typescript
  db.prepare(`
    UPDATE architecture_connections SET
      conn_id = ?, name = ?, connection_type_id = ?, description = ?,
      line_style = ?, marker_start = ?, marker_end = ?, updated_at = ?
    WHERE id = ?
  `).run(
    input.connId ?? existing.conn_id,
    'name' in input ? (input.name ?? null) : existing.name,
    'connectionTypeId' in input ? (input.connectionTypeId ?? null) : existing.connection_type_id,
    'description' in input ? (input.description ?? null) : existing.description,
    'lineStyle' in input ? input.lineStyle : existing.line_style,
    'markerStart' in input ? input.markerStart : existing.marker_start,
    'markerEnd' in input ? input.markerEnd : existing.marker_end,
    now(), id
  )
```

- [ ] **Step 6: Confirm preload/api types still compile**

`connections.update(id, input)` in `src/preload/index.ts` and `src/types/api.d.ts` already forward an arbitrary `UpdateConnectionInput`, so no signature change is needed — the widened `UpdateConnectionInput` from Step 2 flows through. Open both files and verify `UpdateConnectionInput` is the declared param type for `connections.update`; if either file inlines a narrower literal type instead of referencing `UpdateConnectionInput`, widen it there too. (Expected: no change required.)

- [ ] **Step 7: Typecheck**

Run: `./node_modules/.bin/tsc -p tsconfig.web.json --noEmit && ./node_modules/.bin/tsc -p tsconfig.node.json --noEmit`
Expected: clean. (No renderer unit test in this task — the backend is on the accepted sqlite ABI baseline; behavior is verified by typecheck here and live-verify in Task 7.)

- [ ] **Step 8: Commit**

```bash
git add src/main/db/migrations.ts src/types/index.ts src/main/handlers/connections.ts src/preload/index.ts src/types/api.d.ts
git commit -m "feat(arch): connection line_style + marker columns — schema, types, handler defaults"
```

---

### Task 2: Store — make style edits undoable

**Files:**
- Modify: `src/renderer/src/store/index.ts`
- Test: `src/renderer/src/store/connectionStyle.test.ts` (new)

**Interfaces:**
- Consumes: `UpdateConnectionInput` (Task 1), `window.api.connections.update`.
- Produces: no new action — extends `CONNECTION_PROP_KEYS` so `updateConnection` captures `lineStyle`/`markerStart`/`markerEnd` edits into the undo stack.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/store/connectionStyle.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useStore } from './index'
import type { ArchitectureConnection } from '../../../../types'

const conn = (over: Partial<ArchitectureConnection> = {}): ArchitectureConnection => ({
  id: 1, projectId: 1, architectureId: 1, connId: 'ICN-0001', sourceId: 10, targetId: 20,
  sourceHandle: null, targetHandle: null, name: null, connectionTypeId: null,
  lineStyle: 'solid', markerStart: 'none', markerEnd: 'arrowclosed',
  description: null, deletedAt: null, createdAt: '', updatedAt: '', ...over
})

beforeEach(() => {
  ;(window as any).api = {
    connections: {
      update: vi.fn(async (_id: number, input: any) => conn({ ...input }))
    }
  }
  useStore.setState({ connections: [conn()], undoStack: [], redoStack: [] })
})

describe('updateConnection style edits are undoable', () => {
  it('captures a lineStyle change; the pushed undo command replays the previous value', async () => {
    await useStore.getState().updateConnection(1, { lineStyle: 'dashed' })
    expect((window as any).api.connections.update).toHaveBeenLastCalledWith(1, { lineStyle: 'dashed' })
    expect(useStore.getState().undoStack.length).toBe(1)

    // Invoke the captured undo command DIRECTLY. Do NOT call the store's `undo()` action:
    // it runs `loadArchitecture()` in a finally block, which touches many other `window.api.*`
    // methods this focused test does not mock. The command itself is the unit under test.
    await useStore.getState().undoStack[0].undo()
    expect((window as any).api.connections.update).toHaveBeenLastCalledWith(1, { lineStyle: 'solid' })
  })

  it('captures markerStart and markerEnd changes', async () => {
    await useStore.getState().updateConnection(1, { markerEnd: 'arrow' })
    expect(useStore.getState().undoStack.length).toBe(1)
    await useStore.getState().updateConnection(1, { markerStart: 'arrow' })
    expect(useStore.getState().undoStack.length).toBe(2)
  })
})
```

Note: the store's `UndoCommand` items expose `.undo()`/`.redo()` async methods (see `pushUndo` usage in the store); calling `undoStack[0].undo()` directly exercises exactly the captured revert without the `undo()` action's full-diagram re-fetch.

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run src/renderer/src/store/connectionStyle.test.ts`
Expected: FAIL — `undoStack.length` is 0 (the style keys are not in `CONNECTION_PROP_KEYS`, so `updateConnection`'s `changed` check sees no tracked change and pushes no undo).

- [ ] **Step 3: Extend `CONNECTION_PROP_KEYS`**

In `src/renderer/src/store/index.ts`, change (~line 22):

```typescript
const CONNECTION_PROP_KEYS = ['name', 'connectionTypeId', 'description', 'connId'] as const
```

to:

```typescript
const CONNECTION_PROP_KEYS = ['name', 'connectionTypeId', 'description', 'connId', 'lineStyle', 'markerStart', 'markerEnd'] as const
```

No other change — `updateConnection` already diffs `editKeys` and pushes an undo when a tracked key changes.

- [ ] **Step 4: Run to verify it passes**

Run: `./node_modules/.bin/vitest run src/renderer/src/store/connectionStyle.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Full store suite + typecheck**

Run: `./node_modules/.bin/vitest run src/renderer/src/store`
Expected: no new failures.
Run: `./node_modules/.bin/tsc -p tsconfig.web.json --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/store/index.ts src/renderer/src/store/connectionStyle.test.ts
git commit -m "feat(arch): make connection style edits undoable (CONNECTION_PROP_KEYS)"
```

---

### Task 3: Pure edge-style helpers

**Files:**
- Create: `src/renderer/src/components/ArchitectureCanvas/edgeStyle.ts`
- Test: `src/renderer/src/components/ArchitectureCanvas/edgeStyle.test.ts` (new)

**Interfaces:**
- Consumes: `LineStyle`, `EdgeMarker` (Task 1); `MarkerType`, `EdgeMarker as RFMarker` from `@xyflow/react`.
- Produces: `dashArray(style: LineStyle | null): string | undefined`; `edgeMarker(marker: EdgeMarker | null | undefined, color: string): RFMarker | undefined`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/components/ArchitectureCanvas/edgeStyle.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { MarkerType } from '@xyflow/react'
import { dashArray, edgeMarker } from './edgeStyle'

describe('dashArray', () => {
  it('solid / null → undefined (no dashes)', () => {
    expect(dashArray('solid')).toBeUndefined()
    expect(dashArray(null)).toBeUndefined()
  })
  it('dashed → "6 4", dotted → "2 2"', () => {
    expect(dashArray('dashed')).toBe('6 4')
    expect(dashArray('dotted')).toBe('2 2')
  })
})

describe('edgeMarker', () => {
  it('none / null / undefined → undefined (no marker)', () => {
    expect(edgeMarker('none', '#000')).toBeUndefined()
    expect(edgeMarker(null, '#000')).toBeUndefined()
    expect(edgeMarker(undefined, '#000')).toBeUndefined()
  })
  it('arrow → open arrowhead with color', () => {
    expect(edgeMarker('arrow', '#94a3b8')).toEqual({ type: MarkerType.Arrow, color: '#94a3b8' })
  })
  it('arrowclosed → filled arrowhead with color', () => {
    expect(edgeMarker('arrowclosed', '#42682d')).toEqual({ type: MarkerType.ArrowClosed, color: '#42682d' })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/edgeStyle.test.ts`
Expected: FAIL — cannot find `./edgeStyle`.

- [ ] **Step 3: Implement**

Create `src/renderer/src/components/ArchitectureCanvas/edgeStyle.ts`:

```typescript
import { MarkerType, type EdgeMarker as RFMarker } from '@xyflow/react'
import type { LineStyle, EdgeMarker } from '../../../../types'

// null/'solid' → undefined (a plain solid stroke). dashed/dotted → an SVG strokeDasharray.
export function dashArray(style: LineStyle | null): string | undefined {
  return style === 'dashed' ? '6 4' : style === 'dotted' ? '2 2' : undefined
}

// null/undefined/'none' → undefined (no arrowhead). Otherwise an RF marker object colored to match the stroke.
export function edgeMarker(marker: EdgeMarker | null | undefined, color: string): RFMarker | undefined {
  if (marker == null || marker === 'none') return undefined
  return { type: marker === 'arrow' ? MarkerType.Arrow : MarkerType.ArrowClosed, color }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/edgeStyle.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ArchitectureCanvas/edgeStyle.ts src/renderer/src/components/ArchitectureCanvas/edgeStyle.test.ts
git commit -m "feat(arch): pure edge-style helpers (dashArray, edgeMarker) + tests"
```

---

### Task 4: Edge rendering — apply dash + markers

**Files:**
- Modify: `src/renderer/src/components/ArchitectureCanvas/index.tsx`
- Modify: `src/renderer/src/components/ArchitectureCanvas/EdgeLabel.tsx`

**Interfaces:**
- Consumes: `dashArray`, `edgeMarker` (Task 3); connection fields `lineStyle`/`markerStart`/`markerEnd` (Task 1).
- Produces: edges carry `markerStart`/`markerEnd` (RF marker objects) + `data.lineStyle`; `EdgeLabel` forwards markers to `BaseEdge` and applies `strokeDasharray`.

- [ ] **Step 1: Import the helpers in `index.tsx`**

In `src/renderer/src/components/ArchitectureCanvas/index.tsx`, add near the other local imports:

```typescript
import { dashArray, edgeMarker } from './edgeStyle'
```

(`dashArray` is used inside `EdgeLabel`, but importing it here is harmless if unused — actually only import what `index.tsx` uses: `edgeMarker`. Import `dashArray` in `EdgeLabel.tsx` instead — see Step 3. So here import only `edgeMarker`.)

Correction — import in `index.tsx`:

```typescript
import { edgeMarker } from './edgeStyle'
```

- [ ] **Step 2: Set markers + lineStyle on each edge**

In `index.tsx`, in the `setEdges(connections.map((c) => { … }))` block, the edge object currently is:

```typescript
        return {
          id: String(c.id),
          source: String(c.sourceId),
          target: String(c.targetId),
          sourceHandle: c.sourceHandle ?? 'right',
          targetHandle: c.targetHandle ?? 'left',
          type: 'labeled' as const,
          data: { label: c.name ?? '', faded: vis === 'faded' },
          selected: c.id === selectedConnectionId,
          hidden: vis === 'hidden'
        }
```

Replace it with (compute stroke color to match `EdgeLabel`'s selected/slate colors, then derive markers; pass `lineStyle` through `data`):

```typescript
        const strokeColor = c.id === selectedConnectionId ? '#42682d' : '#94a3b8'
        return {
          id: String(c.id),
          source: String(c.sourceId),
          target: String(c.targetId),
          sourceHandle: c.sourceHandle ?? 'right',
          targetHandle: c.targetHandle ?? 'left',
          type: 'labeled' as const,
          markerStart: edgeMarker(c.markerStart, strokeColor),
          markerEnd: edgeMarker(c.markerEnd, strokeColor),
          data: { label: c.name ?? '', faded: vis === 'faded', lineStyle: c.lineStyle ?? null },
          selected: c.id === selectedConnectionId,
          hidden: vis === 'hidden'
        }
```

(No change to the `useEffect` dependency array is required for correctness — `connections` is already a dep, and marker/style come from each connection object.)

- [ ] **Step 3: Forward markers + dash in `EdgeLabel.tsx`**

Replace the entire body of `src/renderer/src/components/ArchitectureCanvas/EdgeLabel.tsx` with:

```tsx
import { memo } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { dashArray } from './edgeStyle'
import type { LineStyle } from '../../../../types'

export default memo(function EdgeLabel({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, data, selected, markerStart, markerEnd
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  const label = (data as any)?.label as string | undefined
  const faded = (data as any)?.faded === true
  const lineStyle = ((data as any)?.lineStyle ?? null) as LineStyle | null
  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerStart={markerStart}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? '#42682d' : '#94a3b8',
          strokeWidth: selected ? 2 : 1.5,
          opacity: faded ? 0.3 : 1,
          strokeDasharray: dashArray(lineStyle)
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'all', opacity: faded ? 0.4 : 1 }}
            className="px-1.5 py-0.5 bg-white border border-line rounded text-xs text-ink-muted shadow-sm nodrag nopan"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})
```

(`markerStart`/`markerEnd` are standard `EdgeProps` fields RF populates with the generated marker URL refs; `BaseEdge` accepts them directly.)

- [ ] **Step 4: Typecheck + canvas suite**

Run: `./node_modules/.bin/tsc -p tsconfig.web.json --noEmit && ./node_modules/.bin/tsc -p tsconfig.node.json --noEmit`
Expected: clean.
Run: `./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas`
Expected: no NEW failures. (Note: existing canvas test store mocks provide `connections` objects that may lack `lineStyle`/`markerStart`/`markerEnd`; that's fine — `edgeMarker(undefined, …)` returns undefined and `dashArray(null)` returns undefined, so missing fields degrade to a bare solid line. Only add the fields to a mock if a render actually throws, which it should not.)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ArchitectureCanvas/index.tsx src/renderer/src/components/ArchitectureCanvas/EdgeLabel.tsx
git commit -m "feat(arch): render connection line style + start/end arrow markers"
```

---

### Task 5: ConnectionPanel — line style + arrow selects

**Files:**
- Modify: `src/renderer/src/components/ConnectionPanel/index.tsx`
- Test: `src/renderer/src/components/ConnectionPanel/lineStyle.test.tsx` (new)

**Interfaces:**
- Consumes: store `updateConnection`; connection fields `lineStyle`/`markerStart`/`markerEnd` (Task 1).
- Produces: three `Select`s (LINE STYLE / ARROW START / ARROW END) in the drawer, saving on change.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/components/ConnectionPanel/lineStyle.test.tsx`:

```typescript
import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ConnectionPanel from './index'
import { useStore } from '../../store'

vi.mock('../../store')

const conn = {
  id: 1, projectId: 1, architectureId: 1, connId: 'ICN-0001', sourceId: 10, targetId: 20,
  sourceHandle: null, targetHandle: null, name: null, connectionTypeId: null,
  lineStyle: 'solid', markerStart: 'none', markerEnd: 'arrowclosed',
  description: null, deletedAt: null, createdAt: '', updatedAt: ''
}

beforeEach(() => {
  ;(window as any).api = { connectionLinks: { list: vi.fn().mockResolvedValue([]) } }
  ;(useStore as any).mockReturnValue({
    selectedConnectionId: 1, connections: [conn], connectionTypes: [], projectRequirements: [],
    updateConnection: vi.fn(), removeConnection: vi.fn(), addConnectionLink: vi.fn(), removeConnectionLink: vi.fn(),
    connectionCustomFields: [], loadConnectionCustomFields: vi.fn(),
    addConnectionCustomField: vi.fn(), updateConnectionCustomField: vi.fn(), removeConnectionCustomField: vi.fn(),
    layers: [], connectionLayers: [], toggleConnectionLayer: vi.fn()
  })
})

it('renders the three style selects with current values', () => {
  render(<ConnectionPanel />)
  expect((screen.getByLabelText('Line style') as HTMLSelectElement).value).toBe('solid')
  expect((screen.getByLabelText('Arrow start') as HTMLSelectElement).value).toBe('none')
  expect((screen.getByLabelText('Arrow end') as HTMLSelectElement).value).toBe('arrowclosed')
})

it('changing line style calls updateConnection with { lineStyle }', () => {
  const updateConnection = vi.fn()
  ;(useStore as any).mockReturnValue({
    selectedConnectionId: 1, connections: [conn], connectionTypes: [], projectRequirements: [],
    updateConnection, removeConnection: vi.fn(), addConnectionLink: vi.fn(), removeConnectionLink: vi.fn(),
    connectionCustomFields: [], loadConnectionCustomFields: vi.fn(),
    addConnectionCustomField: vi.fn(), updateConnectionCustomField: vi.fn(), removeConnectionCustomField: vi.fn(),
    layers: [], connectionLayers: [], toggleConnectionLayer: vi.fn()
  })
  render(<ConnectionPanel />)
  fireEvent.change(screen.getByLabelText('Line style'), { target: { value: 'dashed' } })
  expect(updateConnection).toHaveBeenCalledWith(1, { lineStyle: 'dashed' })
})

it('changing arrow end calls updateConnection with { markerEnd }', () => {
  const updateConnection = vi.fn()
  ;(useStore as any).mockReturnValue({
    selectedConnectionId: 1, connections: [conn], connectionTypes: [], projectRequirements: [],
    updateConnection, removeConnection: vi.fn(), addConnectionLink: vi.fn(), removeConnectionLink: vi.fn(),
    connectionCustomFields: [], loadConnectionCustomFields: vi.fn(),
    addConnectionCustomField: vi.fn(), updateConnectionCustomField: vi.fn(), removeConnectionCustomField: vi.fn(),
    layers: [], connectionLayers: [], toggleConnectionLayer: vi.fn()
  })
  render(<ConnectionPanel />)
  fireEvent.change(screen.getByLabelText('Arrow end'), { target: { value: 'arrow' } })
  expect(updateConnection).toHaveBeenCalledWith(1, { markerEnd: 'arrow' })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/ConnectionPanel/lineStyle.test.tsx`
Expected: FAIL — `getByLabelText('Line style')` not found.

- [ ] **Step 3: Add the three selects**

In `src/renderer/src/components/ConnectionPanel/index.tsx`, add the three `Field`s directly after the existing **Type** `Field` (the one wrapping the connection-type `Select`) and before the **Description** `Field`. `Select` and `Field` are already in scope in this file:

```tsx
        <Field label="Line style">
          <Select
            aria-label="Line style"
            value={conn.lineStyle ?? 'solid'}
            onChange={(e) => updateConnection(conn!.id, { lineStyle: e.target.value as LineStyle })}
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
          </Select>
        </Field>
        <Field label="Arrow start">
          <Select
            aria-label="Arrow start"
            value={conn.markerStart ?? 'none'}
            onChange={(e) => updateConnection(conn!.id, { markerStart: e.target.value as EdgeMarker })}
          >
            <option value="none">None</option>
            <option value="arrow">Open</option>
            <option value="arrowclosed">Filled</option>
          </Select>
        </Field>
        <Field label="Arrow end">
          <Select
            aria-label="Arrow end"
            value={conn.markerEnd ?? 'none'}
            onChange={(e) => updateConnection(conn!.id, { markerEnd: e.target.value as EdgeMarker })}
          >
            <option value="none">None</option>
            <option value="arrow">Open</option>
            <option value="arrowclosed">Filled</option>
          </Select>
        </Field>
```

Add the type import at the top of the file (the file already imports from `'../../store'` and `'../ui'`; add):

```typescript
import type { LineStyle, EdgeMarker } from '../../../../types'
```

- [ ] **Step 4: Run to verify it passes**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/ConnectionPanel/lineStyle.test.tsx`
Expected: PASS (all three cases).

- [ ] **Step 5: Typecheck + full ConnectionPanel suite**

Run: `./node_modules/.bin/tsc -p tsconfig.web.json --noEmit`
Expected: clean.
Run: `./node_modules/.bin/vitest run src/renderer/src/components/ConnectionPanel`
Expected: no NEW failures. (The other ConnectionPanel test files' store mocks already supply `updateConnection` and the layer fields; the new selects read `conn.lineStyle`/`markerStart`/`markerEnd`, which are `undefined` in those mocks → the `?? 'solid'`/`?? 'none'` fallbacks render fine. Only patch a mock if a render throws.)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/ConnectionPanel/index.tsx src/renderer/src/components/ConnectionPanel/lineStyle.test.tsx
git commit -m "feat(arch): line-style + arrow-marker selects in connection drawer"
```

---

### Task 6: Delete-key removes the selected connection

**Files:**
- Modify: `src/renderer/src/components/ArchitectureCanvas/index.tsx`
- Test: `src/renderer/src/components/ArchitectureCanvas/deleteKey.test.ts` (new)

**Interfaces:**
- Consumes: store `removeConnection`, `selectedConnectionId` (read via `useStore.getState()`).
- Produces: `Delete`/`Backspace` on a selected connection → `removeConnection(id)`; guarded while typing; connections only.

The existing keydown effect in `index.tsx` currently is:

```typescript
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.repeat) return
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

- [ ] **Step 1: Write the failing test**

The delete branch is best tested as a pure predicate so it needs no full-canvas render. Extract the decision into a small exported helper, then test it. Create `src/renderer/src/components/ArchitectureCanvas/deleteKey.ts`:

(First write the test, `src/renderer/src/components/ArchitectureCanvas/deleteKey.test.ts`:)

```typescript
import { describe, it, expect } from 'vitest'
import { shouldDeleteConnection } from './deleteKey'

const ev = (key: string, tag = 'DIV', contentEditable = false): KeyboardEvent =>
  ({ key, repeat: false, target: { tagName: tag, isContentEditable: contentEditable } } as unknown as KeyboardEvent)

describe('shouldDeleteConnection', () => {
  it('Delete/Backspace with a selected connection and not typing → true', () => {
    expect(shouldDeleteConnection(ev('Delete'), 5)).toBe(true)
    expect(shouldDeleteConnection(ev('Backspace'), 5)).toBe(true)
  })
  it('no selected connection → false', () => {
    expect(shouldDeleteConnection(ev('Delete'), null)).toBe(false)
  })
  it('other keys → false', () => {
    expect(shouldDeleteConnection(ev('a'), 5)).toBe(false)
  })
  it('while typing in INPUT/TEXTAREA/SELECT/contenteditable → false', () => {
    expect(shouldDeleteConnection(ev('Delete', 'INPUT'), 5)).toBe(false)
    expect(shouldDeleteConnection(ev('Delete', 'TEXTAREA'), 5)).toBe(false)
    expect(shouldDeleteConnection(ev('Delete', 'SELECT'), 5)).toBe(false)
    expect(shouldDeleteConnection(ev('Delete', 'DIV', true), 5)).toBe(false)
  })
  it('key autorepeat → false', () => {
    const e = { key: 'Delete', repeat: true, target: { tagName: 'DIV', isContentEditable: false } } as unknown as KeyboardEvent
    expect(shouldDeleteConnection(e, 5)).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/deleteKey.test.ts`
Expected: FAIL — cannot find `./deleteKey`.

- [ ] **Step 3: Implement the predicate**

Create `src/renderer/src/components/ArchitectureCanvas/deleteKey.ts`:

```typescript
// True when a Delete/Backspace keypress should remove the selected connection:
// a connection is selected, the user isn't typing in a form field, and it's not an autorepeat.
export function shouldDeleteConnection(e: KeyboardEvent, selectedConnectionId: number | null): boolean {
  if (e.repeat) return false
  if (e.key !== 'Delete' && e.key !== 'Backspace') return false
  if (selectedConnectionId == null) return false
  const t = e.target as HTMLElement | null
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return false
  return true
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/deleteKey.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Wire the predicate into the keydown effect**

In `src/renderer/src/components/ArchitectureCanvas/index.tsx`:

Add the import near the other local imports:

```typescript
import { shouldDeleteConnection } from './deleteKey'
```

`removeConnection`, `selectedConnectionId`, `undo`, and `redo` are already destructured from `useStore()` in this component (verified) — no destructure change needed.

Replace the keydown effect body with (delete branch first, reusing the store's live `selectedConnectionId`):

```typescript
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.repeat) return

      // Delete / Backspace → remove the selected connection (connections only; never a block)
      if (shouldDeleteConnection(e, useStore.getState().selectedConnectionId)) {
        e.preventDefault()
        void removeConnection(useStore.getState().selectedConnectionId as number)
        return
      }

      // Cmd/Ctrl+Z undo/redo
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      if (e.shiftKey) void redo()
      else void undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, removeConnection])
```

(Reading `selectedConnectionId` from `useStore.getState()` at key-time avoids adding it to the deps and re-binding the listener on every selection change. `useStore` is already imported in this file.)

- [ ] **Step 6: Typecheck + canvas suite**

Run: `./node_modules/.bin/tsc -p tsconfig.web.json --noEmit`
Expected: clean.
Run: `./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas`
Expected: no NEW failures.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/ArchitectureCanvas/deleteKey.ts src/renderer/src/components/ArchitectureCanvas/deleteKey.test.ts src/renderer/src/components/ArchitectureCanvas/index.tsx
git commit -m "feat(arch): Delete/Backspace removes the selected connection (undoable)"
```

---

### Task 7: Verification + live-verify

**Files:** none (verification only; fix-forward any failures found).

- [ ] **Step 1: Full gate**

Run: `./node_modules/.bin/tsc -p tsconfig.web.json --noEmit && ./node_modules/.bin/tsc -p tsconfig.node.json --noEmit` → clean.
Run: `./node_modules/.bin/vitest run src/renderer` → only pre-existing baseline failures (if any); every new test green.
Run: `./node_modules/.bin/electron-vite build` → clean.

- [ ] **Step 2: Live-verify (Playwright driver)**

Read the run-app skill; drive `.claude/skills/run-app/driver.mjs` via a FIFO with a persistent write-holder (`sleep 100000 > fifo &`). Nav/panel rows are `<div>` — click via `eval`; React `<select>` change needs a native-setter + dispatched `change` event (synthetic value-set alone won't fire React's onChange — set `.value` then `dispatchEvent(new Event('change', { bubbles: true }))`, or use the native value setter). On an architecture with ≥2 blocks:
  1. Draw a new connection (drag from one block's edge handle to another) → it renders with a single **filled arrow at the target**, no start marker, solid line.
  2. A pre-existing connection (one that predates this feature) stays a **plain solid line with no arrowhead**.
  3. Select the new connection; in the drawer set LINE STYLE = Dashed, ARROW START = Open, ARROW END = Filled → the canvas line becomes dashed with an open (V) arrow at the source and a filled (▶) arrow at the target.
  4. With the connection still selected, press `Delete` → it is removed from the canvas; press `Cmd+Z` → it returns with its dashed + both-arrows styling intact.
  5. Relaunch the app → the connection's line style and both markers persist (DB).

Report exactly what was observed; do not claim a check you did not run.

- [ ] **Step 3: Record the ledger + commit**

Append a new section to `.superpowers/sdd/progress.md` summarizing the tasks, verification, and live-verify results, then:

```bash
git add .superpowers/sdd/progress.md
git commit -m "docs: record Connection Line Editing plan complete"
```

---

## Self-Review Notes

- **Spec coverage:** easy delete → Task 6 (Delete/Backspace, connections-only, undoable via existing `removeConnection`). Line style solid/dashed/dotted → Task 1 column + Task 3 `dashArray` + Task 4 render + Task 5 select. Arrow markers None/Open/Filled both ends, new-connection filled-target default → Task 1 (`createConnection` stamps `arrowclosed` end / `none` start; columns) + Task 3 `edgeMarker` + Task 4 render (`markerStart`/`markerEnd`) + Task 5 selects. Legacy stays bare → Task 1 NULL columns + Task 3/4 null→undefined fallbacks (verified by `edgeMarker(null)`/`dashArray(null)` tests and the Task 4 note). Per-connection (not per-type) → columns live on `architecture_connections`. Undoable → Task 2 `CONNECTION_PROP_KEYS` (style edits) + existing `removeConnection` restore-undo (delete). Persistence → DB columns, verified in Task 7 relaunch.
- **Placeholder scan:** no TBD/TODO; every code step shows full code; test code is complete.
- **Type consistency:** `LineStyle`/`EdgeMarker`/`LINE_STYLES`/`EDGE_MARKERS` defined once (Task 1), consumed unchanged in Tasks 3/5 and via `ArchitectureConnection` fields in Tasks 2/4/5. `dashArray`/`edgeMarker` signatures identical across Task 3 (def) and Task 4 (use). `shouldDeleteConnection` identical across Task 6 def/use. `CONNECTION_PROP_KEYS` keys (`lineStyle`/`markerStart`/`markerEnd`) match the `UpdateConnectionInput` field names and the select `onChange` payload keys in Task 5.
- **Deferred (unchanged from spec):** per-type style defaults; Delete key for blocks; edge color/thickness/animation/waypoints; retroactive arrows on legacy connections.
- **Test ripples called out:** Task 4 + Task 5 note that existing canvas/panel store mocks lacking the new connection fields degrade gracefully (null→undefined fallbacks) and need patching only if a render throws.
