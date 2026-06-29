# Architecture Canvas — Design Spec

> Status: approved · Date: 2026-06-29

---

## Overview

The Architecture Canvas is the second major module of ReqArch Suite. It lets engineers model their system as a diagram of typed, nested blocks connected by typed edges, all traceable back to requirements in the repository. It lives in a dedicated tab alongside Requirements.

---

## 1. Navigation

The app header gains a tab bar below the title/button row with two tabs: **Requirements** and **Architecture**. Switching tabs swaps the entire panel area; the header (project name, Open, New Project) remains visible in both tabs.

The Zustand store gains `activeTab: 'requirements' | 'architecture'`. No routing library is needed.

---

## 2. Canvas Layout

The Architecture tab is a full-width React Flow canvas with no left panel. A toolbar sits above the canvas with two controls:

- **+ Block** — creates a new block at the canvas center, selects it, focuses its name field in the properties panel
- **+ Connection** (toggle) — enters connection mode; click source block then target block to create an edge

A collapsible **properties panel** (320px wide) slides in from the right when a block or connection is selected and collapses when the canvas background is clicked.

---

## 3. Canvas Interactions

| Action | How |
|---|---|
| Add block | Click "+ Block" toolbar button |
| Connect blocks | Toggle connection mode, click source, click target |
| Select | Click any block or connection |
| Move block | Drag freely; child blocks move with parent |
| Nest block | Drag a block onto another — it becomes a child (React Flow group) |
| Delete | Delete/Backspace on selected element, or delete button in properties panel (soft delete) |
| Deselect | Click canvas background |

---

## 4. Blocks (Architecture Elements)

### Data model

| Field | Type | Notes |
|---|---|---|
| `id` | integer | DB primary key |
| `projectId` | integer | FK → projects |
| `parentId` | integer \| null | FK → self; null = top-level |
| `blockId` | string | user-visible ID, auto-generated from project prefix+counter, user-editable |
| `name` | string | displayed on canvas node |
| `elementTypeId` | integer \| null | FK → element_types |
| `description` | string \| null | |
| `color` | string \| null | hex; null = type default or app default |
| `posX` | number | canvas X position |
| `posY` | number | canvas Y position |
| `width` | number | default 160 |
| `height` | number | default 80 |
| `deletedAt` | string \| null | soft delete |
| `createdAt` | string | ISO timestamp |
| `updatedAt` | string | ISO timestamp |

### Block ID scheme

The project record stores `elemIdPrefix` (string, e.g. `"SYS"`), `elemIdPadding` (integer, default 3), and `elemNextCounter` (integer, starts at 1). On creation, `blockId` is auto-generated as `{prefix}-{counter padded}` (e.g. `SYS-001`). The user can override `blockId` manually at any time. The counter never reuses values even after soft delete.

### Nesting

Parent-child nesting is stored via `parentId`. On the canvas, React Flow groups are used — child nodes are positioned relative to their parent. Dragging a block onto another makes it a child; dragging it out clears `parentId`.

### Requirement links

Stored in `element_requirement_links (elementId, requirementId)`. A block can link to any number of requirements in the project.

---

## 5. Connections

### Data model

| Field | Type | Notes |
|---|---|---|
| `id` | integer | DB primary key |
| `projectId` | integer | FK → projects |
| `connId` | string | user-visible ID, auto-generated, user-editable |
| `sourceId` | integer | FK → architecture_elements |
| `targetId` | integer | FK → architecture_elements |
| `name` | string \| null | displayed as edge label on canvas |
| `connectionTypeId` | integer \| null | FK → connection_types |
| `description` | string \| null | |
| `deletedAt` | string \| null | soft delete |
| `createdAt` | string | |
| `updatedAt` | string | |

### Connection ID scheme

The project record stores `connIdPrefix` (default `"ICN"`), `connIdPadding` (default 4), and `connNextCounter` (starts at 1). Auto-generates e.g. `ICN-0001`. User-editable. Separate counter from block IDs.

### Requirement links

Stored in `connection_requirement_links (connectionId, requirementId)`.

---

## 6. Types System

Both block types and connection types share the same pattern: built-in defaults seeded at DB creation, plus user-created custom types in the same table.

### Built-in element types
System, Subsystem, Component, Function, External

### Built-in connection types
Data, Power, Mechanical, Thermal, Control, Software

### Type schema (both tables)

| Field | Type | Notes |
|---|---|---|
| `id` | integer | |
| `projectId` | integer | |
| `name` | string | |
| `color` | string \| null | optional canvas tint |
| `isBuiltIn` | integer | 1 = built-in, 0 = user-created |
| `deletedAt` | string \| null | |

Types are managed via a "Manage Types" button in the properties panel footer — a simple inline list for v1.

---

## 7. Properties Panel

Slides in from the right on selection, collapses on canvas background click. 320px wide.

### Block panel
1. **ID** — editable `blockId` (shows auto-generated value)
2. **Name** — text input
3. **Type** — dropdown (built-in + custom)
4. **Description** — textarea
5. **Color** — swatches + custom hex picker
6. **Requirements** — searchable picker; filter by req ID or text; click to link, × to unlink

### Connection panel
1. **ID** — editable `connId`
2. **Name** — text input
3. **Type** — dropdown (built-in + custom)
4. **Description** — textarea
5. **Requirements** — same searchable link picker

All fields save on blur, same pattern as RequirementDetail.

---

## 8. Database Schema

### Migration additions

```sql
-- Element types
CREATE TABLE IF NOT EXISTS element_types (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id),
  name        TEXT    NOT NULL,
  color       TEXT,
  is_built_in INTEGER NOT NULL DEFAULT 0,
  deleted_at  TEXT,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

-- Connection types
CREATE TABLE IF NOT EXISTS connection_types (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id),
  name        TEXT    NOT NULL,
  color       TEXT,
  is_built_in INTEGER NOT NULL DEFAULT 0,
  deleted_at  TEXT,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

-- Architecture elements (blocks)
CREATE TABLE IF NOT EXISTS architecture_elements (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id),
  parent_id       INTEGER REFERENCES architecture_elements(id),
  block_id        TEXT    NOT NULL,
  name            TEXT    NOT NULL DEFAULT '',
  element_type_id INTEGER REFERENCES element_types(id),
  description     TEXT,
  color           TEXT,
  pos_x           REAL    NOT NULL DEFAULT 100,
  pos_y           REAL    NOT NULL DEFAULT 100,
  width           REAL    NOT NULL DEFAULT 160,
  height          REAL    NOT NULL DEFAULT 80,
  deleted_at      TEXT,
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL
);

-- Architecture connections (edges)
CREATE TABLE IF NOT EXISTS architecture_connections (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id         INTEGER NOT NULL REFERENCES projects(id),
  conn_id            TEXT    NOT NULL,
  source_id          INTEGER NOT NULL REFERENCES architecture_elements(id),
  target_id          INTEGER NOT NULL REFERENCES architecture_elements(id),
  name               TEXT,
  connection_type_id INTEGER REFERENCES connection_types(id),
  description        TEXT,
  deleted_at         TEXT,
  created_at         TEXT    NOT NULL,
  updated_at         TEXT    NOT NULL
);

-- Element ↔ requirement links
CREATE TABLE IF NOT EXISTS element_requirement_links (
  element_id     INTEGER NOT NULL REFERENCES architecture_elements(id),
  requirement_id INTEGER NOT NULL REFERENCES requirements(id),
  PRIMARY KEY (element_id, requirement_id)
);

-- Connection ↔ requirement links
CREATE TABLE IF NOT EXISTS connection_requirement_links (
  connection_id  INTEGER NOT NULL REFERENCES architecture_connections(id),
  requirement_id INTEGER NOT NULL REFERENCES requirements(id),
  PRIMARY KEY (connection_id, requirement_id)
);
```

### Projects table additions
Six new columns added via `ALTER TABLE` (existing databases need migration, not a fresh CREATE):
- `elem_id_prefix TEXT NOT NULL DEFAULT 'SYS'`
- `elem_id_padding INTEGER NOT NULL DEFAULT 3`
- `elem_next_counter INTEGER NOT NULL DEFAULT 1`
- `conn_id_prefix TEXT NOT NULL DEFAULT 'ICN'`
- `conn_id_padding INTEGER NOT NULL DEFAULT 4`
- `conn_next_counter INTEGER NOT NULL DEFAULT 1`

---

## 9. IPC Channels

```
elementTypes:list(projectId)         → ElementType[]
elementTypes:create(input)           → ElementType
elementTypes:delete(id)              → void

connectionTypes:list(projectId)      → ConnectionType[]
connectionTypes:create(input)        → ConnectionType
connectionTypes:delete(id)           → void

elements:list(projectId)             → Element[]
elements:create(input)               → Element
elements:update(id, input)           → Element
elements:delete(id)                  → void

connections:list(projectId)          → Connection[]
connections:create(input)            → Connection
connections:update(id, input)        → Connection
connections:delete(id)               → void

elementLinks:list(elementId)         → Requirement[]
elementLinks:add(elementId, requirementId)    → void
elementLinks:remove(elementId, requirementId) → void

connectionLinks:list(connectionId)            → Requirement[]
connectionLinks:add(connectionId, requirementId)    → void
connectionLinks:remove(connectionId, requirementId) → void
```

---

## 10. Shared Types

New types added to `src/types/index.ts`:

```ts
ElementType, ConnectionType,
ArchitectureElement, ArchitectureConnection,
CreateElementInput, UpdateElementInput,
CreateConnectionInput, UpdateConnectionInput
```

---

## 11. Zustand Store Additions

```ts
activeTab: 'requirements' | 'architecture'
elements: ArchitectureElement[]
connections: ArchitectureConnection[]
elementTypes: ElementType[]
connectionTypes: ConnectionType[]
selectedElementId: number | null
selectedConnectionId: number | null

// actions
setActiveTab(tab)
loadArchitecture()
selectElement(id | null)
selectConnection(id | null)
addElement(input) / updateElement(id, input) / removeElement(id)
addConnection(input) / updateConnection(id, input) / removeConnection(id)
addElementLink(elementId, requirementId) / removeElementLink(...)
addConnectionLink(connectionId, requirementId) / removeConnectionLink(...)
```

---

## 12. Components

| Component | Location | Purpose |
|---|---|---|
| `ArchitectureCanvas` | `components/ArchitectureCanvas/index.tsx` | React Flow canvas, toolbar, connection mode |
| `ArchitectureCanvas/BlockNode` | | Custom React Flow node for blocks |
| `ArchitectureCanvas/EdgeLabel` | | Custom React Flow edge with label |
| `ElementPanel` | `components/ElementPanel/index.tsx` | Properties panel for selected block |
| `ConnectionPanel` | `components/ConnectionPanel/index.tsx` | Properties panel for selected connection |

`App.tsx` renders either the requirements 3-panel layout or `<ArchitectureCanvas />` + panel based on `activeTab`.

---

## 13. Testing Strategy

- **Handler tests** (Node/SQLite): ID generation, nesting round-trip, soft delete, requirement link add/remove, counter never reuses IDs
- **Component tests** (jsdom): React Flow mocked; tests cover panel field rendering, blur-save, requirement link picker interactions, tab switching
- All tests follow the same TDD pattern established in Requirements management
