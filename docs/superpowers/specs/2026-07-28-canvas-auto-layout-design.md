# Design: Canvas Auto-Layout (backlog item 40)

**Date:** 2026-07-28
**Status:** Draft — awaiting review
**Backlog:** item 40 (medium)

## Purpose

One button to tidy the architecture diagram — auto-arrange blocks and connectors into a clean layered layout instead of hand-dragging. Recurring pain in node editors; high value for imported/messy graphs.

## Key decision: add `@dagrejs/dagre`

Graph layout is a solved problem with a known trap (hand-rolled layout looks fine on 3 nodes, falls apart on 30). `@dagrejs/dagre` is the small, battle-tested, standard pairing with React Flow. First new runtime dependency in a while — justified: the alternative (a BFS-rank + row-pack heuristic) produces visibly worse results on any real graph and is more code to maintain. Dagre is pure-JS, no native binding, no ABI concern.

## Architecture

A **pure layout module**, Electron-free and React-Flow-free at its core:

**File:** `src/renderer/src/components/ArchitectureCanvas/autoLayout.ts`

```ts
export interface LayoutNode { id: string; width: number; height: number; parentId: string | null }
export interface LayoutEdge { source: string; target: string }
export interface LayoutResult { positions: Record<string, { x: number; y: number }> }  // parent-relative

export function computeLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  opts?: { direction?: 'TB' | 'LR'; nodesep?: number; ranksep?: number }
): LayoutResult
```

`computeLayout` builds a dagre graph, runs `dagre.layout()`, and returns positions. It's the whole unit-test surface — takes plain data, imports only dagre + types. `direction` defaults to `'TB'` (top-down, matching the app's header-strip node style).

## Nesting

The canvas supports drag-to-nest (parent/child blocks; child positions stored **parent-relative**). Dagre supports **compound graphs** (`setParent`), which is how v1 respects nesting: each nested block is laid out inside its parent's cluster, and `computeLayout` returns **parent-relative** positions so they drop straight into the existing `posX`/`posY` persistence (no coordinate translation surprises). Dagre sizes the parent to fit its children.

## Wiring + persistence

- A **"Tidy" button** in the architecture top bar (beside `+ Object` / the Style/Type popovers). Icon + label, matching the existing top-bar button style.
- On click: gather the current architecture's nodes (id, measured width/height from the live React Flow nodes, parentId) + edges → `computeLayout` → apply the new positions to the canvas and **persist** them via a single batched write (`updateElement` per node with new `posX`/`posY`, or a batch loop like the bulk-actions pattern). Applies to the **current architecture only** (the active `architecture_id`).
- After apply, `fitView` so the tidied graph is framed.

## Not undoable (v1)

Geometry changes are **already excluded from the undo/redo command stack** by prior design (the stack tracks create/delete/property-edit, not position). Auto-layout is a bulk position change, so it inherits that exclusion — it is **not** undoable in v1. Mitigation: the button is a deliberate action, and positions are re-derivable by pressing Tidy again. Making layout a single undoable batch is a noted deferral (would be the first geometry entry in the stack).

## Data flow

Live RF nodes (measured sizes) + store connections → `LayoutNode[]`/`LayoutEdge[]` → `computeLayout` (pure, dagre) → parent-relative positions → apply to canvas + batch-persist `posX/posY` → `fitView`.

## Testing

Pure `autoLayout.test.ts`:
- A simple chain A→B→C lays out on increasing ranks (B below/right of A, C after B), no overlaps.
- A branch (A→B, A→C) puts B and C on the same rank, separated.
- Nested: child inside parent → child position is parent-relative and within the parent's box; parent sized to contain children.
- Empty graph / single node → no throw, sensible position.
- Deterministic: same input → same positions.

(The persistence + fitView wiring is thin renderer glue, covered by a light interaction check, not the pure suite.)

## Deferrals

- Undoable auto-layout (single batch entry in the command stack).
- Layout direction toggle (TB/LR) in the UI — v1 is TB only.
- Per-selection layout ("tidy just these nodes").
- Edge-routing / orthogonal connectors (dagre gives node positions; edges stay the app's current style).
