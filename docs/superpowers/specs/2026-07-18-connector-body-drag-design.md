# Reconnect a connector by dragging its body

## Problem

Reconnecting a connector (shipped 2026-07-18) only starts from the small
endpoint anchor at the object. When several connectors meet at one point,
hitting the right anchor is fiddly. The user wants: once a connector is
highlighted (single click), press anywhere on the line and drag to move it —
the endpoint nearer the grab point follows the cursor to a new handle.

## Interaction

1. Single click highlights the connector (already shipped).
2. On a highlighted connector, pointer-down anywhere on the line and drag
   past a small threshold → the endpoint nearer the grab point detaches and
   follows the cursor (live preview); the other end stays anchored.
3. Release on a handle → that end re-anchors (reuses the existing
   `updateConnection` persistence + free undo).
4. Release on empty space → no change; the edge re-renders from the store
   unchanged (snap back).

React Flow has no native mid-edge reconnect, so this is a thin custom drag
layer on the existing custom edge component. The native endpoint anchors keep
working; this is additive.

## Approach (renderer only)

**`edgeDrag.ts`** — a pure `nearerEnd(px, py, sx, sy, tx, ty): 'source' |
'target'` (squared-distance compare). Extracted so the one piece of real
logic is unit-testable without the DOM.

**`EdgeLabel.tsx`** — the custom edge gains:
- An invisible fat `<path>` (~24px, transparent) over the edge, with
  `pointerEvents` **only when `selected`** and the `nopan` class so the canvas
  doesn't pan. When not selected it is inert, so first-click selection and
  double-click-to-open still reach React Flow.
- A movement threshold (~4px in screen space) before a drag begins, so a
  plain click or double-click on an already-selected edge is **not**
  swallowed — only a real drag starts the reconnect.
- While dragging, the dragged end's coordinates are replaced by the pointer
  position (via `useReactFlow().screenToFlowPosition`) and the bezier path is
  redrawn, giving a live preview.
- On release, `document.elementsFromPoint` finds a `.react-flow__handle`; its
  node id (element) and handle id (side) are read and passed to a callback.

**`ArchitectureCanvas/index.tsx`** — a stable `onBodyReconnect(edgeId, end,
nodeId, side)` callback placed in each edge's `data`. It calls
`updateConnection(connId, { sourceId|targetId, sourceHandle|targetHandle })`
depending on which end moved. No backend/type changes — persistence exists.

## Testing

`edgeDrag.test.ts` — `nearerEnd` picks the closer endpoint (a few cases incl.
the midpoint tie → `source`). The pointer/DOM wiring is verified in the
running app.

## Out of scope

- No change to the native endpoint-anchor reconnect.
- No mid-edge waypoints / bend points — only the endpoints move.
