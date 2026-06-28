# Requirements Management Module — Design Spec

**Project:** ReqArch Suite v1 (full rebuild)
**Date:** 2026-06-27
**Status:** Approved

---

## 1. Scope

This spec covers the first working slice of ReqArch Suite: the requirements management module. It does not include requirement types, custom fields, V&V, architecture diagrams, or interfaces — those come later.

**What is built:**
- New/open project flow (`.reqarch` SQLite file)
- Nestable module tree
- Requirements list per module
- Requirement detail panel (4 universal fields)
- Per-module auto-generated IDs
- Soft delete (recycle bin foundation)

**Target user:** Small team of 2–10 systems engineers.
**UI style:** Clean and modern (generous spacing, clear hierarchy).

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Desktop runtime | Electron |
| UI | React + TypeScript |
| Build tool | Vite (via electron-vite) |
| Styling | Tailwind CSS |
| State management | Zustand |
| Diagramming (future) | React Flow |
| Database | SQLite via better-sqlite3 |
| Packaging | Electron Forge |

---

## 3. Architecture

Three-layer separation. The UI never touches the database directly.

```
Renderer (React)
    ↕  window.api  (typed IPC bridge)
Preload Script
    ↕  ipcRenderer / ipcMain
Main Process Handlers
    ↕
SQLite (better-sqlite3)
```

**Folder structure:**

```
src/
├── main/
│   ├── index.ts                  # App entry, window creation, file dialogs
│   ├── db/
│   │   ├── connection.ts         # Opens/creates the .reqarch SQLite file
│   │   └── migrations.ts        # Creates tables; runs schema upgrades
│   └── handlers/
│       ├── projects.ts           # project.create, project.open, project.getCurrent
│       ├── modules.ts            # modules.list/create/update/delete/restore
│       └── requirements.ts      # requirements.list/create/update/delete/restore
├── preload/
│   └── index.ts                  # Exposes window.api to the renderer
└── renderer/
    ├── main.tsx
    ├── App.tsx
    ├── store/
    │   └── index.ts              # Zustand store
    ├── components/
    │   ├── ModuleTree/
    │   ├── RequirementsList/
    │   └── RequirementDetail/
    └── types/
        └── index.ts              # Shared TypeScript types across all layers
```

---

## 4. Data Model

Single SQLite file per project (`.reqarch` extension).

```sql
CREATE TABLE projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

CREATE TABLE modules (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id),
  parent_id       INTEGER REFERENCES modules(id),  -- null = top-level
  name            TEXT    NOT NULL,
  id_prefix       TEXT    NOT NULL,   -- e.g. "SRS"
  id_padding      INTEGER NOT NULL DEFAULT 4,  -- digits: 4 → "SRS-0001"
  next_counter    INTEGER NOT NULL DEFAULT 1,  -- increments on each new requirement
  position        INTEGER NOT NULL DEFAULT 0,  -- ordering among siblings
  deleted_at      TEXT,               -- null = active; timestamp = soft-deleted
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL
);

CREATE TABLE requirements (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id           INTEGER NOT NULL REFERENCES modules(id),
  req_id              TEXT    NOT NULL,  -- e.g. "SRS-0001" — immutable after creation
  text                TEXT    NOT NULL,
  acceptance_criteria TEXT,
  source              TEXT,
  rationale           TEXT,
  position            INTEGER NOT NULL DEFAULT 0,  -- ordering within module
  deleted_at          TEXT,
  created_at          TEXT    NOT NULL,
  updated_at          TEXT    NOT NULL
);
```

**ID generation:** When a requirement is created, the main process handler reads `next_counter` from the module, formats the ID (`prefix + "-" + counter.toString().padStart(padding, "0")`), increments the counter, and writes both in a single SQLite transaction. The UI never computes IDs.

**Soft delete:** `deleted_at` is set to an ISO timestamp on delete. All normal queries filter `WHERE deleted_at IS NULL`. Restore sets it back to null. IDs are never reused.

---

## 5. IPC API

Exposed on `window.api` by the preload script. All methods return Promises.

```typescript
window.api = {

  project: {
    create(name: string): Promise<Project>
    open(filePath: string): Promise<Project>
    getCurrent(): Promise<Project | null>        // restores last opened on launch
  },

  modules: {
    list(projectId: number): Promise<Module[]>
    create(input: {
      projectId: number
      parentId: number | null
      name: string
      idPrefix: string
      idPadding: number
    }): Promise<Module>
    update(id: number, input: { name: string }): Promise<Module>
    delete(id: number): Promise<void>
    restore(id: number): Promise<void>
  },

  requirements: {
    list(moduleId: number): Promise<Requirement[]>
    create(input: {
      moduleId: number
      text: string
      acceptanceCriteria?: string
      source?: string
      rationale?: string
    }): Promise<Requirement>
    update(id: number, input: {
      text?: string
      acceptanceCriteria?: string
      source?: string
      rationale?: string
    }): Promise<Requirement>
    delete(id: number): Promise<void>
    restore(id: number): Promise<void>
  }

}
```

---

## 6. UI Layout

Three-panel full-height layout.

```
┌─────────────────────────────────────────────────────────────────┐
│  ReqArch Suite                              [Open] [New Project] │
├──────────────┬──────────────────────────┬───────────────────────┤
│ MODULES      │ SRS — System Req. Spec   │ SRS-0003              │
│              │                          │                        │
│ ▼ System     │  ID        Text          │ Requirement            │
│   ├ SRS      │  SRS-0001  The system... │ ┌────────────────────┐│
│   └ HW       │  SRS-0002  All user...   │ │The system shall... ││
│ ▶ Software   │► SRS-0003  The softw...  │ └────────────────────┘│
│              │  SRS-0004  Response t... │                        │
│  [+ Module]  │                          │ Acceptance Criteria    │
│              │  [+ Requirement]         │ ┌────────────────────┐│
│              │                          │ │Verified by test... ││
│              │                          │ └────────────────────┘│
│              │                          │                        │
│              │                          │ Source                 │
│              │                          │ ┌────────────────────┐│
│              │                          │ │Customer spec v2.1  ││
│              │                          │ └────────────────────┘│
│              │                          │                        │
│              │                          │ Rationale              │
│              │                          │ ┌────────────────────┐│
│              │                          │ │Required for safety ││
│              │                          │ └────────────────────┘│
│              │                          │                        │
│              │                          │ [Save]  ID: SRS-0003  │
└──────────────┴──────────────────────────┴───────────────────────┘
```

**Left panel — Module Tree:**
- Collapsible chevrons for nested modules
- Right-click context menu: rename, delete
- `[+ Module]` opens an inline form: name, ID prefix, padding digits

**Centre panel — Requirements List:**
- Flat list for the selected module
- Columns: ID, requirement text (truncated), created date
- Click a row to open it in the right panel
- `[+ Requirement]` creates a blank requirement and opens it immediately

**Right panel — Detail:**
- Fields: Requirement text (textarea), Acceptance Criteria (textarea), Source (text), Rationale (textarea)
- Auto-saves on blur (when you leave a field)
- Manual `[Save]` button as a safety net
- `req_id` shown read-only at the bottom — never editable

---

## 7. State (Zustand)

```typescript
{
  project: Project | null
  modules: Module[]                // full flat list; tree derived in component
  selectedModuleId: number | null
  requirements: Requirement[]      // loaded for selectedModuleId only (lazy)
  selectedRequirementId: number | null
}
```

Requirements load only when a module is selected. Modules load once when the project opens.

---

## 8. What is explicitly out of scope

- Requirement types and custom fields
- CSV import/export
- Recycle bin UI (soft delete is implemented in the DB layer; the UI for browsing deleted items comes later)
- Architecture diagrams
- Interface management
- V&V
- Collaboration / multi-user
- Cloud sync
