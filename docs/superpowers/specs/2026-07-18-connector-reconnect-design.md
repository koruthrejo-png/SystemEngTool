# Connector endpoint reconnect

## Problem

An architecture object exposes four connection handles (left, right, top,
bottom). Once a connector is drawn, its endpoints are fixed to whichever
handles they were created on. To tidy up a diagram — e.g. move a line that
enters an object on the left so it enters on the right instead — the user
currently has to delete the connector and redraw it. They want to grab an
existing endpoint and drop it on a different handle.

## Goal

Grab either end of a connector and drop it on any handle of any object:

- Same object, different side (the primary case — re-route for tidier lines).
- A different object (re-point the connection) — comes for free.
- Drop on empty canvas → endpoint snaps back (no change).

## Approach

Use React Flow's built-in edge reconnection (`onReconnect`). No new
dependency, no new UI. Handles already render and `ConnectionMode.Loose`
already allows any handle to act as an endpoint.

The connection's side and endpoint object are stored as
`sourceHandle`/`targetHandle` (side) and `sourceId`/`targetId` (element).
These are already persisted on create but are **not** currently updatable —
`updateConnection` ignores them. The work is to make those four fields
updatable and route a reconnect through the existing `updateConnection`
action, which already provides undo/redo.

## Changes

1. **`types.ts`** — add `sourceHandle?`, `targetHandle?`, `sourceId?`,
   `targetId?` to `UpdateConnectionInput`.

2. **`src/main/handlers/connections.ts`** — extend the `updateConnection`
   UPDATE statement to write `source_handle`, `target_handle`, `source_id`,
   `target_id`, each guarded by `'key' in input` (matching the existing
   field pattern), falling back to the existing row value otherwise.

3. **`src/renderer/src/store/index.ts`** — add the four keys to
   `CONNECTION_PROP_KEYS`. This is what makes the change flow through the
   existing undo/redo logic in `updateConnection` for free.

4. **`src/renderer/src/components/ArchitectureCanvas/index.tsx`** — add an
   `onReconnect(oldEdge, newConnection)` handler wired to `<ReactFlow>`. It
   resolves the store connection from the edge, then calls
   `updateConnection(conn.id, { sourceId, targetId, sourceHandle, targetHandle })`
   where node ids map to element ids and the handle ids are the sides.
   Edges are re-derived from the store (existing `useEffect`), so no manual
   edge-state mutation. Dropping on nothing does not call `onReconnect`, so
   the edge is left unchanged (native behavior).

## Testing

One handler-level check in `src/main/handlers/connections.test.ts`:
`updateConnection` persists a changed `sourceHandle` and `targetId`
(currently they would be silently dropped).

## Out of scope

- No changes to handle count, position, or appearance.
- No auto-routing / auto-tidy — the user places endpoints manually.
