# Component Library Palette & Typed Nodes — Design

**Date:** 2026-07-08
**Backlog:** item 16 (`docs/superpowers/specs/2026-07-02-ui-overhaul-design.md`) — "Node port-count indicators and typed component library, including the Component Library left palette panel from spec §4"

## Goal

Make element types visible and usable on the Architecture canvas. The data model
already exists (`element_types` seeded per project, `architecture_elements.element_type_id`,
Type selector in ElementPanel); this slice is UI on top of it. Three parts:

- **A. Component Library palette** — a left panel listing the project's element types; click a type to drop a node of that type.
- **B. Type name in node header** — nodes currently show a generic "Object"; show the element's type name.
- **C. Port-count badge** — show how many connections attach to each node.

One slice, one plan, all in the Architecture view. No backend, no DB, no new IPC —
`elementTypes` and `connections` are already loaded into the store.

## Non-Goals

- Drag-and-drop positioning from the palette (click-to-add is the chosen interaction).
- Per-side (per-handle) connection counts (single total only).
- Renaming or re-seeding the built-in element types (`System / Subsystem / Component / Function / External` stay).
- Per-type icons / Material Symbols (a color dot is used instead, per the app's ratified no-Material-Symbols convention).

## Layout

The Architecture view (`ArchitectureCanvas/index.tsx`) becomes a horizontal flex row:

```
[ ComponentLibrary  ~200px ] [ canvas  flex-1 (toolbar + ReactFlow) ]
```

The existing top toolbar (`+ Object` + hint) and the canvas stay as they are, now
inside the right column. The left panel is a white surface with a right border
(`border-line`), matching the app's panel styling.

## Part A — Component Library palette

New component `ArchitectureCanvas/ComponentLibrary.tsx`.

- Header: `COMPONENT LIBRARY`, label-caps (`text-[10px] font-bold uppercase tracking-[0.05em] text-ink-faint`, matching existing section labels).
- One row per `elementTypes` from the store (already loaded; always includes the 5 seeded built-ins):
  - a color dot (`type.color ?? navy`), the type `name`, left-aligned
  - hover tint (`hover:bg-workspace`), `cursor-pointer`, `text-ink`
  - `aria-label={`Add ${type.name}`}`, rendered as a `<button>` for a11y
- Click → `addElement({ projectId: project.id, elementTypeId: type.id, posX: 100 + Math.random()*200, posY: 100 + Math.random()*200 })` — same offset idiom as today's `handleAddBlock`, plus the type id.
- The toolbar `+ Object` button stays for creating an untyped block.
- Renders nothing meaningful when there is no project — but the panel only mounts inside the project-loaded canvas branch, so no extra guard needed beyond what `index.tsx` already does.

`CreateElementInput` already accepts `elementTypeId?: number | null` (verified in `src/types/index.ts`), so no type change is required.

## Part B — Type name in node header

- `BlockNodeData` (`BlockNode.tsx`) gains `typeName: string | null`.
- `buildNodes` gains an `elementTypes: ElementType[]` parameter; builds an id→name map and sets `typeName = map.get(el.elementTypeId) ?? null`.
- `BlockNode` header rendering:
  - **Unnamed node:** show `typeName` (uppercase) in the label-caps slot where "Object" is currently hard-coded; fall back to "Object" when `typeName` is null.
  - **Named node:** the existing `name + blockId` line is unchanged; the type name is shown as a leading label-caps tag so the type is still visible. (Kept compact — a small uppercase `text-white/70` span before the name.)

## Part C — Port-count badge

- `BlockNodeData` gains `connectionCount: number`.
- `buildNodes` gains a `connections: ArchitectureConnection[]` parameter; for each element, `connectionCount = connections.filter(c => c.sourceId === el.id || c.targetId === el.id).length`.
- `BlockNode` renders a small badge in the header's right cluster (next to `Nested` / `Contains N`), only when `connectionCount > 0`. Form: a bordered pill like the `Nested` tag, e.g. `⇆ 3` (the `⇆` glyph is already used elsewhere in the app).

## Wiring

`buildNodes` new signature:

```ts
buildNodes(
  elements: ArchitectureElement[],
  elementTypes: ElementType[],
  connections: ArchitectureConnection[],
  selectedId: number | null,
  onResizeEnd: (id, x, y, width, height) => void
): Node[]
```

- One call site in `index.tsx` (inside the `setNodes(buildNodes(...))` effect). Add `elementTypes` and `connections` to the effect's dependency array (both are already destructured from the store; `connections` is already a dep of the edges effect).
- `nodes.test.ts` call sites updated for the new params.

## Testing

- **`nodes.test.ts`** — extend existing `buildNodes` tests: (a) `typeName` resolves from `elementTypes` and is null for an element with no/unknown `elementTypeId`; (b) `connectionCount` counts both source and target incidence, 0 when none.
- **`ComponentLibrary` test** (new, mock-capture) — renders a row per element type; clicking a row calls `addElement` with the right `elementTypeId` and `projectId`.
- **`BlockNode`** — extend existing mock-capture tests: header shows `typeName` for an unnamed node; badge appears only when `connectionCount > 0`.

Test baseline before this slice: 48 failed (47 sqlite-ABI + 1 pre-existing ArchitectureCanvas) / 180 passed. New tests add to the passed count; failure composition must stay unchanged.

## Verification

Live in the running app (Playwright driver): palette lists the 5 seeded types; clicking a type drops a node whose header shows that type name; connecting two nodes bumps the port-count badge; `+ Object` still makes an untyped block; relaunch persists type + connections.
