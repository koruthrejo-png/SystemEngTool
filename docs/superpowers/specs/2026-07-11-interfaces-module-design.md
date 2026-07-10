# Interfaces Module — Design

Date: 2026-07-11
Status: Approved (brainstorm), pending implementation plan

## Goal

Add the **Interfaces** pillar (third in the build order: requirements → architecture
→ interfaces → V&V). An *interface* is the definition of a connection between two
architecture elements. This module gives systems engineers a project-wide
**Interface Register** to view, edit, and create interfaces, with user-defined
custom fields and per-user column visibility.

## Core Model Decision

**Interface = an architecture connection.** No new primary entity. Every row in
`architecture_connections` is an interface. The register is a table + editor over
those existing rows; the architecture canvas and the register stay in sync because
they read the same data.

Rationale: the connection already carries a unique per-project ID (`conn_id`,
e.g. `ICN-0001`) and links two elements each with their own ID (`elem_id`,
e.g. `SYS-001`). Nothing new is needed to identify an interface or its endpoints.
Rejected alternatives (recorded for future reference): a separate Interface
Register entity linked to N connections; ports/pins on elements. Both add
machinery not needed now; custom fields cover the extra attributes.

## Reused Existing Facts (verified in code)

- `architecture_connections(id, project_id, conn_id, source_id, target_id,
  source_handle, target_handle, name, connection_type_id, description,
  deleted_at, created_at, updated_at)` — schema in `src/main/db/migrations.ts`.
- `createConnection` auto-generates `conn_id = ${conn_id_prefix}-${counter}`
  (default `ICN`, padding 4) from the project counter — `src/main/handlers/connections.ts`.
- Elements auto-generate `elem_id` (default `SYS`, padding 3) — `src/main/handlers/elements.ts`.
- Requirement custom fields pattern to mirror: table `requirement_custom_fields`,
  handler `src/main/handlers/requirementCustomFields.ts` (list/create/update/delete
  IPC, key/value/position, blur-save UI).
- Tab state: `activeTab: 'requirements' | 'architecture' | 'traceability' |
  'dashboard'` in `src/renderer/src/store/index.ts` — add `'interfaces'`.
- Detail editor pattern: `src/renderer/src/components/ConnectionPanel`.

## 1. Data Model

**No change to `architecture_connections`.** One new child table, mirroring
`requirement_custom_fields` exactly:

```sql
CREATE TABLE IF NOT EXISTS connection_custom_fields (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id INTEGER NOT NULL REFERENCES architecture_connections(id),
  key           TEXT    NOT NULL DEFAULT '',
  value         TEXT    NOT NULL DEFAULT '',
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);
```

Added via `addColumnIfMissing`-style idempotent `CREATE TABLE IF NOT EXISTS` in
the migration runner, same as the other child tables.

## 2. IPC / Backend

New handler `src/main/handlers/connectionCustomFields.ts` — a near-verbatim copy
of `requirementCustomFields.ts` with `connection_id` in place of `requirement_id`:

- `connectionCustomFields:list(connectionId)` → fields ordered by `position, id`
- `connectionCustomFields:create(connectionId)` → append empty field at next position
- `connectionCustomFields:update(id, { key?, value? })` → blur-save
- `connectionCustomFields:delete(id)`

The register needs source/target element IDs per connection. Add one query
(handler `connections.ts` or a small `interfaces.ts`):

- `interfaces:listRegister(projectId)` → for every non-deleted connection in the
  project, return `{ ...connection, sourceElemId, targetElemId, sourceName,
  targetName }` via a join to `architecture_elements` on `source_id`/`target_id`.

No new create/delete IPC for interfaces themselves — reuse existing
`createConnection` / connection delete.

Preload bridge (`src/preload/index.ts`) and `src/types/api.d.ts` get the new
channels. New types in `src/types/index.ts`: `ConnectionCustomField`,
`InterfaceRegisterRow` (connection + the four joined fields).

## 3. Store

Extend `src/renderer/src/store/index.ts`:

- `activeTab` union gains `'interfaces'`.
- `interfaceRows: InterfaceRegisterRow[]` + `loadInterfaces(projectId)`.
- `connectionCustomFields` per selected interface (mirror `customFields` state for
  requirements) + `loadConnectionCustomFields` / add / update / remove actions.
- Creating an interface from the register calls the existing connection-create
  action, then re-syncs `interfaceRows`.

## 4. Interfaces View (new top-nav tab)

New component `src/renderer/src/components/InterfaceRegister/`. A project-wide
table, one row per interface (connection), styled with the same tokens/primitives
as the Requirements table (zebra rows, mono IDs, sticky header, `overflow-auto`).

**Columns:**

- **Mandatory — always shown, cannot hide:**
  - Interface ID (`conn_id`, mono)
  - From (source `elem_id`, mono)
  - To (target `elem_id`, mono)
- **Optional built-in — toggleable:** Name, Type/Class (`connection_type` name),
  Description
- **Custom fields — toggleable:** each distinct custom-field `key` in the project
  becomes its own column; a row's cell shows that field's value or em-dash.

**Toolbar:** interface count, `Columns` button, `+ New Interface`.

## 5. Column Visibility

`Columns` button opens a checklist of all optional built-in + custom-field
columns. Toggling shows/hides that column. State persisted to localStorage under
a versioned key (e.g. `reqarch.interfaceRegister.columns.v1`), mirroring the
requirements table's persisted column widths. The three mandatory columns are not
listed in the checklist and always render.

Column set is derived from the union of built-in optionals plus every custom-field
key present across the project's interfaces, so a newly added custom field
automatically appears as a toggleable (default-on) column.

## 6. Editing

Clicking a row opens a detail drawer reusing the `ConnectionPanel` pattern:

- Read-only: Interface ID, From object ID, To object ID
- Editable: Name, Type/Class, Description (existing connection fields, blur-save
  via the existing connection-update action)
- Custom Fields section: list of key/value rows, `+ Add Field` (auto-focus new
  key, mirroring the requirement custom-fields UX), blur-save, `×` remove

Edits made here are the same rows the canvas `ConnectionPanel` edits — consistent
across views.

## 7. Creating

`+ New Interface` in the register toolbar opens a small form with two element
dropdowns (source, target — populated from the project's `architecture_elements`).
Submit calls the existing `createConnection` IPC, which assigns the next
`ICN-000N` ID. The new row appears in the register (and as an edge on the canvas).
Connections drawn on the canvas appear in the register automatically — no separate
sync step.

## 8. Out of Scope (YAGNI — deferred, recorded)

- N² / interface matrix view — custom fields + register cover the current need;
  the traceability-matrix component is available to reuse if this is planned later.
- Ports/pins on elements (formal SysML-style port modeling).
- Structured data-items child list per interface (signal name/type/unit/rate).
- Fixed class/protocol/direction schema — deliberately custom fields instead, per
  the user's decision, so the register stays flexible without schema churn.
- Interface-to-requirement traceability surfacing in this view — the
  `connection_requirement_links` table already exists and is edited elsewhere;
  a register column for it can be added later if wanted.

## 9. Testing

Follows the project baseline (renderer files pass; `src/main/**` vitest files fail
on the known better-sqlite3 ABI mismatch — accepted, gate main-process changes on
typecheck + running-app checks via the Playwright driver).

- Pure helpers (column-set derivation from rows, localStorage column-visibility
  read/write) get unit tests.
- Register table + drawer components get render/interaction tests mirroring the
  Requirements table and RequirementDetail test style.
- Live-verify end-to-end in the running app: register lists existing connections
  with correct interface/object IDs, column toggle persists across relaunch,
  custom field add/edit/remove round-trips, `+ New Interface` creates a connection
  visible on the canvas, canvas-drawn connection appears in the register.

## Key Files (new + touched)

| File | Change |
|---|---|
| `src/main/db/migrations.ts` | new `connection_custom_fields` table |
| `src/main/handlers/connectionCustomFields.ts` | new — mirror requirementCustomFields |
| `src/main/handlers/interfaces.ts` (or connections.ts) | `interfaces:listRegister` join query |
| `src/main/index.ts` | register new handlers |
| `src/preload/index.ts`, `src/types/api.d.ts` | new channels |
| `src/types/index.ts` | `ConnectionCustomField`, `InterfaceRegisterRow` |
| `src/renderer/src/store/index.ts` | `'interfaces'` tab, interface + custom-field state |
| `src/renderer/src/components/InterfaceRegister/` | new register table + column toggle + create form |
| `src/renderer/src/components/ConnectionPanel` | reuse / extend for the register drawer + custom fields |
| App shell (`App.tsx`) | Interfaces tab in the nav |
