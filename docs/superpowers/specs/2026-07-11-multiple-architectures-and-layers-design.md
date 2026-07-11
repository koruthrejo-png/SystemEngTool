# Architecture Tab: Multiple Architectures + Layers — Design

Date: 2026-07-11
Status: Sub-project 1 (Multiple Architectures) approved for planning; Sub-project 2 (Layers) requirements captured, to be planned after #1.

## Context

Today the Architecture tab holds a **single implicit architecture per project**:
`architecture_elements` and `architecture_connections` are scoped only by
`project_id` (verified in `src/main/db/migrations.ts`) — there is no diagram/view
entity. `element_types` / `connection_types` are the project-wide palette.

Two requested improvements, treated as two sequential sub-projects because the
second depends on the first:

1. **Multiple Architectures** — create more than one architecture per project and
   navigate them via sub-tabs. Each is a fully independent diagram (its own blocks
   and connectors). Build first — it introduces the `architecture_id` that layers
   scope to.
2. **Layers** — per-architecture visibility layers for custom views of one
   diagram. Build second.

---

# Sub-project 1: Multiple Architectures

## Goal

Let a project hold multiple independent architecture diagrams, each with its own
blocks and connectors, navigable by a sub-tab strip inside the Architecture tab.

## 1. Data Model

New table:

```sql
CREATE TABLE IF NOT EXISTS architectures (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  name       TEXT    NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);
```

`architecture_elements` and `architecture_connections` each gain a nullable
`architecture_id INTEGER REFERENCES architectures(id)` column (via
`addColumnIfMissing`). A block/connector belongs to exactly one architecture.

Palette stays shared: `element_types` / `connection_types` remain project-scoped,
unchanged — every architecture draws from the same type palette.

## 2. Migration (existing data)

Idempotent backfill in `runMigrations`, after the column is added:

- For each project that has any element/connection with `architecture_id IS NULL`
  (or that has no architecture row yet), create one architecture named
  **"Default"** (`position = 0`).
- `UPDATE architecture_elements SET architecture_id = <default> WHERE project_id = ?
  AND architecture_id IS NULL`; same for `architecture_connections`.
- Re-running is a no-op because there are no null `architecture_id` rows left.

Result: existing single-architecture projects (incl. the SmokeTest dev project)
open with all their blocks under a "Default" architecture.

## 3. IPC / Backend

New handler `src/main/handlers/architectures.ts`, mirroring the existing simple
CRUD handler style:

- `architectures:list(projectId)` → non-deleted, ordered by `position, id`
- `architectures:create(projectId, name)` → append at next position; returns row
- `architectures:rename(id, name)`
- `architectures:delete(id)` → soft-delete the architecture; also soft-delete its
  elements and connections in the same transaction (so they stop loading). Guard:
  refuse to delete the last remaining architecture in a project (a project always
  has at least one).
- `architectures:reorder(projectId, orderedIds)` (optional; only if drag-reorder
  of sub-tabs is in scope — see §6, deferred)

`elements.list` / `connections.list` gain an `architectureId` filter parameter (or
new `listByArchitecture` variants) so the canvas loads one diagram at a time.
`createElement` / `createConnection` inputs gain `architectureId`.

Preload bridge (`src/preload/index.ts`) + `src/types/api.d.ts` get the new
channels. New type `Architecture` in `src/types/index.ts`;
`CreateElementInput` / `CreateConnectionInput` gain `architectureId`.

## 4. Store

`src/renderer/src/store/index.ts`:

- New state: `architectures: Architecture[]`, `activeArchitectureId: number | null`.
- `loadArchitectures(projectId)` — loads the list, sets `activeArchitectureId` to
  the last-active (localStorage, keyed by project) or the first architecture.
- `loadArchitecture` (existing) filters elements/connections by
  `activeArchitectureId` instead of whole project.
- `setActiveArchitecture(id)` — persists to localStorage
  (`reqarch.activeArchitecture.<projectId>`) and reloads the canvas data.
- `addArchitecture(name)`, `renameArchitecture(id, name)`,
  `removeArchitecture(id)` — after remove, switch active to a surviving sibling.
- `addElement` / `addConnection` stamp `activeArchitectureId`.

## 5. Navigation UI — sub-tab strip

New component `src/renderer/src/components/ArchitectureCanvas/ArchitectureTabs.tsx`
(or a small sibling), rendered as a thin strip at the top of the Architecture tab
above the canvas:

- One pill/tab per architecture (`architectures` ordered by position), the
  `activeArchitectureId` highlighted with the app's active-tab treatment.
- Click a tab → `setActiveArchitecture`.
- `+` button at the end → inline name input → `addArchitecture`.
- Double-click a tab → inline rename (native compact input, matching the module
  rename pattern).
- A small `⋯`/right-click affordance → Delete (confirmation; disabled/hidden when
  only one architecture remains).

The existing canvas, palette (`ComponentLibrary`), and zoom controls render below,
unchanged except that they now operate on the active architecture's data.

## 6. Interfaces Register knock-on

Connections now belong to an architecture. The Interface Register (project-wide,
lists all connections) gains an **Architecture** column (the owning architecture's
name) as a toggleable column, and the register's row-derivation joins the
architecture name. This keeps the register a single project-wide view while making
each interface's diagram clear. Small addition, folded into this sub-project so the
register isn't left ambiguous once multiple architectures exist.

## 7. Out of Scope (Sub-project 1)

- Layers (all of Sub-project 2 below).
- Drag-reorder of architecture sub-tabs (`reorder` IPC) — deferred; creation order
  is enough initially.
- Moving/copying blocks between architectures — not needed (fully independent
  diagrams).
- Per-architecture palettes — palette stays shared.

## 8. Testing

- Migration: idempotent backfill — pure-ish SQL logic; verify via typecheck +
  running app (main-process vitest is the known-broken ABI baseline). Live-check:
  existing project opens with a "Default" architecture containing all prior blocks;
  re-open is stable.
- Store: `loadArchitectures` default/last-active selection, active-switch reload,
  remove-then-switch-to-sibling — unit-tested (renderer vitest runs).
- Sub-tab component: render tabs, active highlight, create/rename/delete flows —
  component tests mirroring existing patterns.
- Live-verify: create a 2nd architecture, add distinct blocks, switch tabs (each
  shows only its own blocks), rename, delete (with confirmation + last-one guard),
  relaunch restores last-active; Interface Register shows the Architecture column.

---

# Sub-project 2: Layers (requirements captured; plan after #1)

Per-architecture visibility layers for custom views of a single diagram. To be
brainstormed into its own plan after Multiple Architectures ships. Decisions already
made:

- **Layer = visibility layer.** Objects are assigned to layers; toggling a layer
  changes how its members display. Not a saved-filter and not stacked sub-diagrams.
- **Scope:** layers belong to a single architecture (each diagram has its own layer
  set), consistent with fully-independent diagrams.
- **Assignment:** many-to-many. A block/connector can belong to multiple layers.
  An object with **no** layer is always visible (base content, unaffected by
  toggles).
- **Layer state is 3-state**, cycled per layer in a layers panel:
  **Visible → Faded → Hidden.**
- **Object display resolution:** an object shows **normally** if any of its layers
  is Visible; else **faded** if any of its layers is Faded; else **hidden** (all its
  layers Hidden). No-layer objects are always Visible.
- **Connectors** get their own layer assignment (like blocks) **and** auto-constrain
  to their endpoints: a connector is never more visible than its stricter endpoint
  (endpoint Hidden → connector Hidden; endpoint Faded → connector at most Faded).
- Likely data model: `layers` table (per architecture: name, state, position) +
  `element_layers` / `connection_layers` link tables; a layers panel with 3-state
  dots; canvas applies effective display (opacity for Faded, omit for Hidden).
- Open questions for the layers brainstorm: default state of a new layer; whether
  layer visibility is persisted per-user/localStorage or in the DB; how faded
  objects behave for selection/editing; layer color-coding.
