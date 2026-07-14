# Connection Line Editing — Design

**Backlog item 22.** Give each architecture connection an editable line appearance and a fast way to delete it:

1. **Easy delete** — press `Delete`/`Backspace` with a connection selected to remove it (undoable). The drawer Delete button stays.
2. **Line style** — Solid / Dashed / Dotted per connection.
3. **Arrow markers** — an arrowhead at each end (start + end), independently settable to None / Open / Filled. A **newly drawn connection defaults to a single filled arrow at the target** (`marker_end = arrowclosed`, `marker_start = none`).

Decisions locked with the user:
- Styling lives **per connection** (its own columns), not per connection-type. Two connections of the same type may look different.
- Delete key affects **connections only** — never a selected block (block deletion stays on its drawer button).
- **Legacy connections stay arrow-less.** Only newly created connections carry the target-arrow default; pre-existing rows (NULL columns) render as a plain solid line with no markers.

## Tech Stack

Electron + React + TS + Zustand + Tailwind (semantic tokens) + better-sqlite3 + @xyflow/react. Pure renderer + additive backend — mirrors the conventions of the shipped Layers feature.

## Global Constraints

- Never `npm run`. Use `./node_modules/.bin/*` (`tsc`, `vitest`, `electron-vite`). `node` is on PATH; if a binary needs it: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"`.
- Both typechecks: `./node_modules/.bin/tsc -p tsconfig.web.json --noEmit && ./node_modules/.bin/tsc -p tsconfig.node.json --noEmit`
- `src/main/**` vitest fails on the known better-sqlite3 ABI mismatch — ACCEPTED baseline. The gate is the renderer/pure-helper vitest, which runs.
- Additive backend only: three new nullable columns via `addColumnIfMissing`, no backfill, no changes to existing columns.
- Token classes for the drawer controls match the existing `ConnectionPanel` `Field` + `Select` idiom.

## Data Model

Three new `TEXT` columns on `architecture_connections`, added with `addColumnIfMissing` (nullable, no backfill):

| column | allowed values | new-connection default | legacy (NULL) renders as |
|---|---|---|---|
| `line_style` | `solid` \| `dashed` \| `dotted` | `solid` | `solid` |
| `marker_end` | `none` \| `arrow` \| `arrowclosed` | `arrowclosed` | `none` |
| `marker_start` | `none` \| `arrow` \| `arrowclosed` | `none` | `none` |

- `arrow` = open (V) arrowhead, `arrowclosed` = filled (▶) arrowhead — maps to React Flow `MarkerType.Arrow` / `MarkerType.ArrowClosed`.
- **New rows:** `createConnection` writes the defaults (`solid`, `none` start, `arrowclosed` end) into the INSERT, so a freshly drawn connection shows one filled arrow at the target.
- **Legacy rows:** columns stay NULL. The render-time fallback maps NULL → the "nothing added" state (`line_style ?? 'solid'`, `marker_start ?? 'none'`, `marker_end ?? 'none'`), so existing connections keep looking exactly as they do today — a plain solid line, no arrow.
- No `CHECK` constraint (TS-enforced via unions, matching the codebase's existing enum convention).

## Types (`src/types/index.ts`)

```typescript
export const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const
export type LineStyle = (typeof LINE_STYLES)[number]

export const EDGE_MARKERS = ['none', 'arrow', 'arrowclosed'] as const
export type EdgeMarker = (typeof EDGE_MARKERS)[number]
```

- `ArchitectureConnection` gains `lineStyle: LineStyle | null`, `markerStart: EdgeMarker | null`, `markerEnd: EdgeMarker | null` (nullable — legacy rows are NULL).
- `UpdateConnectionInput` gains `lineStyle?`, `markerStart?`, `markerEnd?` (all `EdgeMarker`/`LineStyle`, optional).
- `CreateConnectionInput` — no change needed; defaults are applied server-side in `createConnection`, not passed from the renderer.

## Backend (`src/main/handlers/connections.ts`)

- `rowToConnection`: map the three columns (`lineStyle: row.line_style ?? null`, etc.).
- `createConnection`: extend the INSERT column list + values with `line_style, marker_start, marker_end` = `'solid', 'none', 'arrowclosed'` (literal defaults — the target-arrow default lives here, so legacy rows that never ran through this INSERT stay NULL/bare).
- `updateConnection`: extend the fixed UPDATE with `line_style = ?, marker_start = ?, marker_end = ?`, each using the existing partial-update idiom: `'lineStyle' in input ? input.lineStyle : existing.line_style` (and the same for the two markers). No behavior change for callers that don't pass them.
- Preload (`src/preload/index.ts`) + `src/types/api.d.ts`: no signature change — `connections.update(id, input)` already forwards an arbitrary `UpdateConnectionInput`; only the type widening in `src/types/index.ts` is needed.

## Store (`src/renderer/src/store/index.ts`)

- Add `'lineStyle'`, `'markerStart'`, `'markerEnd'` to `CONNECTION_PROP_KEYS` (currently `['name', 'connectionTypeId', 'description', 'connId']`). This makes every style edit flow through the existing undo/redo capture in `updateConnection` — **no new store action, style edits are undoable for free**.
- `removeConnection` already pushes a restore-undo, so the Delete-key path (which calls `removeConnection`) is undoable for free as well.

## Pure Rendering Helpers (`src/renderer/src/components/ArchitectureCanvas/edgeStyle.ts`) — NEW

A tiny, self-contained, unit-tested module:

```typescript
import { MarkerType, type EdgeMarker as RFMarker } from '@xyflow/react'
import type { LineStyle, EdgeMarker } from '../../../../types'

// null/legacy → undefined (solid). dashed/dotted → an SVG strokeDasharray.
export function dashArray(style: LineStyle | null): string | undefined {
  return style === 'dashed' ? '6 4' : style === 'dotted' ? '2 2' : undefined
}

// null/'none' → undefined (no marker). Otherwise an RF marker object, colored to match the stroke.
export function edgeMarker(marker: EdgeMarker | null, color: string): RFMarker | undefined {
  if (marker == null || marker === 'none') return undefined
  return { type: marker === 'arrow' ? MarkerType.Arrow : MarkerType.ArrowClosed, color }
}
```

`@xyflow/react` (v12.11.1) re-exports both `MarkerType` (the enum) and `EdgeMarker` (the `{ type, color, … }` object type) from `@xyflow/system`, so the return type annotation resolves cleanly. The helper's contract is the null/`none` → undefined fallback and the open/filled mapping — which is what the tests pin.

## Edge Rendering

**Edge build (`ArchitectureCanvas/index.tsx`, the `setEdges` map):** for each connection, resolve the stroke color the edge already uses (selected → green `#42682d`, else slate `#94a3b8`) and add to the edge object:

```typescript
markerStart: edgeMarker(c.markerStart, strokeColor),
markerEnd: edgeMarker(c.markerEnd, strokeColor),
data: { label: c.name ?? '', faded: vis === 'faded', lineStyle: c.lineStyle },
```

RF auto-generates marker `<defs>` from the `markerStart`/`markerEnd` objects and passes URL refs down to the edge component. Layer `faded`/`hidden` handling is unchanged.

**`EdgeLabel.tsx`:** read `lineStyle` from `data`, and forward `markerStart`/`markerEnd` (present on `EdgeProps`) to `BaseEdge`:

```tsx
const lineStyle = (data as any)?.lineStyle as LineStyle | null | undefined
<BaseEdge
  id={id}
  path={edgePath}
  markerStart={markerStart}
  markerEnd={markerEnd}
  style={{
    stroke: selected ? '#42682d' : '#94a3b8',
    strokeWidth: selected ? 2 : 1.5,
    opacity: faded ? 0.3 : 1,
    strokeDasharray: dashArray(lineStyle ?? null)
  }}
/>
```

Marker color following the stroke means selected edges get a green arrow, matching the green line — consistent with the current selected-edge styling.

## ConnectionPanel UI (`src/renderer/src/components/ConnectionPanel/index.tsx`)

Three `Select`s in `Field` wrappers, placed after the **Type** field (before Description), each saving on change via `updateConnection` — the exact idiom the Type select already uses (`updateConnection(conn!.id, { … })`, reading the current row for the unchanged fields is unnecessary since the partial-update backend handles it; pass only the changed field):

- `LINE STYLE` → options Solid / Dashed / Dotted, value `conn.lineStyle ?? 'solid'`, `onChange` → `updateConnection(conn.id, { lineStyle })`.
- `ARROW START` → options None / Open / Filled (values `none`/`arrow`/`arrowclosed`), value `conn.markerStart ?? 'none'`, `onChange` → `updateConnection(conn.id, { markerStart })`.
- `ARROW END` → options None / Open / Filled, value `conn.markerEnd ?? 'none'`, `onChange` → `updateConnection(conn.id, { markerEnd })`.

The drawer already re-derives `conn` from the store `connections` array, so the selects reflect persisted values on selection and after undo/redo.

## Delete-Key Handler (`ArchitectureCanvas/index.tsx`)

Extend the existing `keydown` effect (which currently handles only Cmd/Ctrl+Z undo/redo). Restructure so the Delete branch runs first (it has no modifier), reusing the same typing-guard, and add `SELECT` to the guarded tags:

```typescript
function onKey(e: KeyboardEvent): void {
  if (e.repeat) return
  const t = e.target as HTMLElement | null
  const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)

  // Delete / Backspace → remove the selected connection (connections only)
  if (!typing && (e.key === 'Delete' || e.key === 'Backspace')) {
    const id = useStore.getState().selectedConnectionId
    if (id != null) { e.preventDefault(); void removeConnection(id) }
    return
  }

  // Cmd/Ctrl+Z undo/redo (unchanged)
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
  if (typing) return
  e.preventDefault()
  if (e.shiftKey) void redo(); else void undo()
}
```

- Reads `selectedConnectionId` from the store at key-time (avoids stale-closure/dep churn); `removeConnection` is added to the effect deps.
- **Connections only:** a selected block (`selectedElementId`) is never deleted here — matches the locked scope.
- Undo restores via the existing `removeConnection` restore-undo.

## Testing

- **`edgeStyle.test.ts`** (pure, runs): `dashArray` — `null`/`'solid'`→undefined, `'dashed'`→`'6 4'`, `'dotted'`→`'2 2'`; `edgeMarker` — `null`/`'none'`→undefined, `'arrow'`→ArrowType open + color, `'arrowclosed'`→filled + color.
- **`ConnectionPanel` test:** the three selects render with the current/fallback values; changing each fires `updateConnection` with only that field (`{ lineStyle }` / `{ markerStart }` / `{ markerEnd }`). Extend the existing ConnectionPanel test's store mock (already has the Layers fields) with nothing new required beyond `updateConnection` (already mocked).
- **Delete-key test:** simulate `keydown` `Delete` and `Backspace` with `selectedConnectionId` set → `removeConnection` called with that id; simulate with the event target being an INPUT → not called (typing guard); simulate with `selectedConnectionId == null` → not called. (Test the handler logic in isolation, or via a focused canvas render — whichever is cleaner given the existing ArchitectureCanvas test setup.)
- **Backend create-default / update-passthrough:** covered by typecheck + live-verify (main-process vitest is the accepted sqlite ABI baseline).
- **Live-verify (Playwright driver):** on an architecture with ≥2 blocks:
  1. Draw a new connection → renders with a single **filled arrow at the target**, no start marker, solid line.
  2. A pre-existing (legacy) connection stays a **plain solid line, no arrow**.
  3. In the drawer, set LINE STYLE = Dashed, ARROW START = Open, ARROW END = Filled → the line renders dashed with an open arrow at the source and a filled arrow at the target.
  4. Select a connection, press `Delete` → removed; `Cmd+Z` → restored with its style intact.
  5. Relaunch → line style + both markers persist (DB).

## Out of Scope (deferred)

- Per-connection-type style defaults / inheritance (chosen against — per-connection only).
- Delete key for blocks (explicit drawer button only).
- Edge color editing, edge thickness control, animated edges, waypoints/bends, labels-on-both-ends.
- Retroactively arrow-ing legacy connections (explicitly declined — legacy stays bare).

## Likely Task Decomposition (for the plan)

1. Backend — migration (3 columns) + types (`LINE_STYLES`/`EDGE_MARKERS` + interface fields) + `rowToConnection`/`createConnection` defaults/`updateConnection` passthrough + `CONNECTION_PROP_KEYS`.
2. Pure `edgeStyle.ts` helpers + tests.
3. Edge rendering — `index.tsx` edge build + `EdgeLabel.tsx` (dash + markers).
4. ConnectionPanel — three style selects.
5. Delete-key handler.
6. Verification + live-verify.
