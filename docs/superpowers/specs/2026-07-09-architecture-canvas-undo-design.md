# Architecture Canvas Undo/Redo — Design

**Date:** 2026-07-09
**Status:** Approved, ready for implementation plan

## Goal

Add multi-level undo/redo to the architecture canvas. Cover create, delete, and
property edits of blocks and connections. Redo included. History is session-only
(in-memory), cleared on project load.

## Out of scope

- Move / resize / nest undo (drag geometry). Deliberately excluded; can be added
  later by pushing a command from `onNodeDragStop` / resize with captured old geometry.
- Durability across app restart. History lives in the store only.
- Undo for the requirements tab.

## Constraints that shape the design

- Every store mutation persists to the DB via `window.api` IPC, then updates the
  store. So undo **must** write the DB too — a pure in-memory undo would desync on
  the next `loadArchitecture()` reload.
- Deletes are **soft**: `deleteElement` / `deleteConnection` set `deleted_at`, rows
  are never removed. IDs are therefore stable, which is what makes command-based
  undo clean (no re-create with a new ID).
- `deleteElement` cascades inside one DB transaction: soft-deletes connections
  touching the element, and reparents its children (`parent_id` reassigned, position
  offset by the parent's position).

## Model: inverse-command stack

Two arrays in the zustand store:

```ts
type UndoCommand = { undo: () => Promise<void>; redo: () => Promise<void> }
undoStack: UndoCommand[]
redoStack: UndoCommand[]
```

- Commands call raw `window.api` IPC only (no store setters).
- Public `undo()` / `redo()` store actions pop the relevant stack, run the command,
  push it onto the opposite stack, then call `loadArchitecture()` to resync the store
  from the DB (source of truth).
  - `loadArchitecture()` is a full re-fetch. Cheap at diagram scale, and it keeps the
    undo layer decoupled from every store setter. Marked with a `ponytail:` comment.
- `pushUndo(cmd)`: `set(s => ({ undoStack: [...s.undoStack, cmd], redoStack: [] }))`.
  Any new user action clears the redo stack.
- `clearHistory()`: reset both stacks. Called from `loadProject`.

LIFO invariant guarantees cross-command safety: e.g. undoing an element-create
(delete) can only cascade to connections that were created later, and by LIFO those
were already undone (soft-deleted) before we reach the create command. Cascading a
delete over an already-deleted connection is harmless.

## New IPC primitive: restore

Add to both handlers:

- `elements.restore(id)` / `connections.restore(id)` → `UPDATE … SET deleted_at =
  NULL, updated_at = ? WHERE id = ?`.

Wire through `elements.ts`, `connections.ts` (handler + `ipcMain.handle`),
`preload/index.ts`, `preload/index.d.ts`, `types/api.d.ts`.

## Per-operation commands

Built inside the existing store actions.

### addElement / addConnection (create)

After the create returns an entity with an ID:

- `undo`: `elements.delete(id)` (soft). At creation time the entity has no
  connections/children, so the cascade is empty.
- `redo`: `elements.restore(id)` — same ID, no re-create.

### removeElement (delete)

Capture from the current store **before** deleting:

- `children = elements.filter(e => e.parentId === id)` → snapshot
  `{ id, parentId, posX, posY }` each (pre-delete values).
- `affectedConns = connections.filter(c => c.sourceId === id || c.targetId === id)`
  → their IDs.

Then:

- `undo`: `elements.restore(id)`; `connections.restore(c.id)` for each affected conn;
  `elements.update(child.id, { parentId, posX, posY })` for each captured child.
- `redo`: `elements.delete(id)` (re-runs the cascade deterministically).

### removeConnection (delete)

- `undo`: `connections.restore(id)`.
- `redo`: `connections.delete(id)`.

### updateElement / updateConnection (property edit)

Property keys: element `{ name, color, elementTypeId, description, blockId }`;
connection `{ name, connectionTypeId, description, connId }`.

- Push a command **only** when the patch contains ≥1 property key. Drag/resize
  patches (`posX/posY/width/height/parentId`) never contain a property key, so moves
  stay out of history with no extra flag.
- Capture, before applying, the current values of exactly the keys present in the
  patch (`prev`).
- `undo`: `update(id, prev)`. `redo`: `update(id, patch)`.

## UI

`ArchitectureCanvas/index.tsx`:

- Two buttons in the header toolbar: undo (↶) and redo (↷). Disabled when the
  respective stack is empty (`undoStack.length === 0` / `redoStack.length === 0`,
  read from the store).
- Keyboard listener in a `CanvasInner` `useEffect` on `window`:
  `Cmd/Ctrl+Z` → `undo()`, `Cmd/Ctrl+Shift+Z` → `redo()`. Scoped naturally because
  the canvas only mounts on the architecture tab. Ignore when focus is in an input /
  textarea / contenteditable so it doesn't hijack text-field undo.

## Testing

- **Handler tests** (`elements.test.ts`, `connections.test.ts`): restore round-trip —
  `delete` then `restore(id)` returns that single row to the list; restore is a
  no-op-safe `deleted_at = NULL`. Restore is per-ID only; reversing a delete cascade
  (connections + children) is the store command's job, covered in store tests.
- **Store tests** (`store/index.test.ts`): for each of create / delete / edit —
  do → undo returns to prior state → redo re-applies; a new action clears the redo
  stack; delete-cascade undo restores children `parentId`/position and touched
  connections; `clearHistory` on `loadProject`.

## Files touched

| File | Change |
|---|---|
| `src/main/handlers/elements.ts` | `restoreElement` + handler |
| `src/main/handlers/connections.ts` | `restoreConnection` + handler |
| `src/preload/index.ts` | `elements.restore`, `connections.restore` |
| `src/preload/index.d.ts`, `src/types/api.d.ts` | bridge types |
| `src/renderer/src/store/index.ts` | stacks, `pushUndo`, `undo`/`redo`/`clearHistory`, wrapped actions |
| `src/renderer/src/components/ArchitectureCanvas/index.tsx` | toolbar buttons + keyboard |
