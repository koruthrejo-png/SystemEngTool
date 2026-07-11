# Multiple Architectures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a project hold multiple independent architecture diagrams, each with its own blocks/connectors, navigable by a sub-tab strip inside the Architecture tab.

**Architecture:** A new `architectures` table; `architecture_elements` and `architecture_connections` gain a nullable `architecture_id`. An idempotent migration creates a "Default" architecture per existing project and backfills. The element/connection `list` gains an OPTIONAL `architectureId` filter so the canvas loads one diagram while the project-wide Interface Register keeps loading all connections. The store tracks `activeArchitectureId` (persisted per project in localStorage); a sub-tab strip switches diagrams.

**Tech Stack:** Electron + React + TS + Zustand + better-sqlite3. 3-layer: renderer → preload `window.api` → main handlers → SQLite.

## Global Constraints

- Renderer never touches the DB — all data flows renderer → `window.api` → main handler → SQLite.
- `src/main/**` vitest fails on the known better-sqlite3 ABI mismatch — ACCEPTED baseline. Gate main-process changes on typecheck + running-app checks (Playwright driver `.claude/skills/run-app/driver.mjs`). Renderer/pure-helper vitest DOES run.
- Never use `npm run`. Use `./node_modules/.bin/*` (`tsc`, `vitest`, `electron-vite`). `node` is on PATH.
- Typecheck (both): `./node_modules/.bin/tsc -p tsconfig.node.json --noEmit && ./node_modules/.bin/tsc -p tsconfig.web.json --noEmit`
- Renderer test: `./node_modules/.bin/vitest run <path>`
- New tables use `CREATE TABLE IF NOT EXISTS` in `runMigrations`; new columns use `addColumnIfMissing`.
- Every project always has ≥1 architecture; the last one cannot be deleted.
- Fully independent diagrams: a block/connector belongs to exactly one architecture. Palette (`element_types`/`connection_types`) stays project-wide/shared — do NOT scope it per architecture.
- Existing single-architecture data migrates into a **"Default"** architecture.
- Commit after each task with a `feat(arch):` / `test(arch):` message.

---

### Task 1: DB schema, migration, `Architecture` type, architectures handler

**Files:**
- Modify: `src/main/db/migrations.ts` (new table, new columns, backfill)
- Modify: `src/types/index.ts` (`Architecture`, `CreateArchitectureInput`)
- Create: `src/main/handlers/architectures.ts`
- Modify: `src/main/index.ts` (import + register handler)

**Interfaces:**
- Produces (type): `Architecture { id: number; projectId: number; name: string; position: number; deletedAt: string | null; createdAt: string; updatedAt: string }`
- Produces (exported fn): `getOrCreateDefaultArchitecture(db, projectId): number` — returns the id of the project's first architecture, creating a "Default" one if the project has none. Used by the migration and the list handler.
- Produces (IPC): `architectures:list(projectId)` → `Architecture[]` (ensures ≥1 exists); `architectures:create(projectId, name)` → `Architecture`; `architectures:rename(id, name)` → `Architecture`; `architectures:delete(id)` → `void` (soft-deletes the architecture + its elements/connections; throws if it is the project's last).

- [ ] **Step 1: Add the table + columns + backfill to migrations**

In `src/main/db/migrations.ts`, add the table inside the `db.exec(\`...\`)` template (next to the other `CREATE TABLE IF NOT EXISTS` blocks):

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

After the `db.exec` block, alongside the other `addColumnIfMissing` calls, add:

```typescript
  addColumnIfMissing(db, 'architecture_elements', 'architecture_id', 'INTEGER REFERENCES architectures(id)')
  addColumnIfMissing(db, 'architecture_connections', 'architecture_id', 'INTEGER REFERENCES architectures(id)')
```

Then add the idempotent backfill at the end of `runMigrations` (after the acceptance-criteria conversion block). It gives every project that has orphaned architecture rows a "Default" architecture and assigns them:

```typescript
  // One-time: assign pre-existing elements/connections to a per-project "Default" architecture.
  // Idempotent — only rows with NULL architecture_id are touched.
  const projectsNeedingDefault = db
    .prepare(`
      SELECT DISTINCT project_id FROM (
        SELECT project_id FROM architecture_elements WHERE architecture_id IS NULL AND deleted_at IS NULL
        UNION
        SELECT project_id FROM architecture_connections WHERE architecture_id IS NULL AND deleted_at IS NULL
      )
    `)
    .all() as { project_id: number }[]
  if (projectsNeedingDefault.length > 0) {
    const mts = new Date().toISOString()
    db.transaction(() => {
      for (const { project_id } of projectsNeedingDefault) {
        let arch = db.prepare('SELECT id FROM architectures WHERE project_id = ? AND deleted_at IS NULL ORDER BY position, id LIMIT 1').get(project_id) as { id: number } | undefined
        if (!arch) {
          const r = db.prepare('INSERT INTO architectures (project_id, name, position, created_at, updated_at) VALUES (?, ?, 0, ?, ?)').run(project_id, 'Default', mts, mts)
          arch = { id: Number(r.lastInsertRowid) }
        }
        db.prepare('UPDATE architecture_elements SET architecture_id = ? WHERE project_id = ? AND architecture_id IS NULL').run(arch.id, project_id)
        db.prepare('UPDATE architecture_connections SET architecture_id = ? WHERE project_id = ? AND architecture_id IS NULL').run(arch.id, project_id)
      }
    })()
  }
```

- [ ] **Step 2: Add the types**

In `src/types/index.ts`, add:

```typescript
export interface Architecture {
  id: number
  projectId: number
  name: string
  position: number
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}
export interface CreateArchitectureInput {
  projectId: number
  name: string
}
```

- [ ] **Step 3: Create the handler**

Create `src/main/handlers/architectures.ts`:

```typescript
import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { getDatabase } from '../db/connection'
import type { Architecture } from '../../types'

function now(): string { return new Date().toISOString() }

function rowToArchitecture(row: any): Architecture {
  return {
    id: row.id, projectId: row.project_id, name: row.name, position: row.position,
    deletedAt: row.deleted_at ?? null, createdAt: row.created_at, updatedAt: row.updated_at
  }
}

// Returns the project's first architecture id, creating a "Default" one if none exist.
export function getOrCreateDefaultArchitecture(db: Database.Database, projectId: number): number {
  const existing = db.prepare('SELECT id FROM architectures WHERE project_id = ? AND deleted_at IS NULL ORDER BY position, id LIMIT 1').get(projectId) as { id: number } | undefined
  if (existing) return existing.id
  const ts = now()
  const r = db.prepare('INSERT INTO architectures (project_id, name, position, created_at, updated_at) VALUES (?, ?, 0, ?, ?)').run(projectId, 'Default', ts, ts)
  return Number(r.lastInsertRowid)
}

export function listArchitectures(projectId: number): Architecture[] {
  const db = getDatabase()
  getOrCreateDefaultArchitecture(db, projectId) // guarantee ≥1
  return (db.prepare('SELECT * FROM architectures WHERE project_id = ? AND deleted_at IS NULL ORDER BY position, id').all(projectId) as any[]).map(rowToArchitecture)
}

export function createArchitecture(projectId: number, name: string): Architecture {
  const db = getDatabase()
  const ts = now()
  const row = db.prepare('SELECT COALESCE(MAX(position), -1) as mp FROM architectures WHERE project_id = ? AND deleted_at IS NULL').get(projectId) as any
  const r = db.prepare('INSERT INTO architectures (project_id, name, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(projectId, name, (row.mp as number) + 1, ts, ts)
  return rowToArchitecture(db.prepare('SELECT * FROM architectures WHERE id = ?').get(r.lastInsertRowid))
}

export function renameArchitecture(id: number, name: string): Architecture {
  const db = getDatabase()
  db.prepare('UPDATE architectures SET name = ?, updated_at = ? WHERE id = ?').run(name, now(), id)
  return rowToArchitecture(db.prepare('SELECT * FROM architectures WHERE id = ?').get(id))
}

export function deleteArchitecture(id: number): void {
  const db = getDatabase()
  const ts = now()
  const arch = db.prepare('SELECT project_id FROM architectures WHERE id = ?').get(id) as { project_id: number } | undefined
  if (!arch) throw new Error(`Architecture ${id} not found`)
  const count = db.prepare('SELECT COUNT(*) as c FROM architectures WHERE project_id = ? AND deleted_at IS NULL').get(arch.project_id) as { c: number }
  if (count.c <= 1) throw new Error('Cannot delete the last architecture in a project')
  db.transaction(() => {
    db.prepare('UPDATE architecture_elements SET deleted_at = ?, updated_at = ? WHERE architecture_id = ? AND deleted_at IS NULL').run(ts, ts, id)
    db.prepare('UPDATE architecture_connections SET deleted_at = ?, updated_at = ? WHERE architecture_id = ? AND deleted_at IS NULL').run(ts, ts, id)
    db.prepare('UPDATE architectures SET deleted_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id)
  })()
}

export function registerArchitectureHandlers(): void {
  ipcMain.handle('architectures:list', (_e, projectId: number) => listArchitectures(projectId))
  ipcMain.handle('architectures:create', (_e, projectId: number, name: string) => createArchitecture(projectId, name))
  ipcMain.handle('architectures:rename', (_e, id: number, name: string) => renameArchitecture(id, name))
  ipcMain.handle('architectures:delete', (_e, id: number) => deleteArchitecture(id))
}
```

- [ ] **Step 4: Register the handler**

In `src/main/index.ts`, add the import next to the other handler imports:

```typescript
import { registerArchitectureHandlers } from './handlers/architectures'
```

and add the call in the registration block (next to `registerElementHandlers()`):

```typescript
  registerArchitectureHandlers()
```

- [ ] **Step 5: Typecheck**

Run: `./node_modules/.bin/tsc -p tsconfig.node.json --noEmit`
Expected: clean. (Main-process vitest skipped per Global Constraints; runtime verified live in Task 6.)

- [ ] **Step 6: Commit**

```bash
git add src/main/db/migrations.ts src/types/index.ts src/main/handlers/architectures.ts src/main/index.ts
git commit -m "feat(arch): architectures table, migration backfill, CRUD handler"
```

---

### Task 2: Element/connection handlers — optional `architectureId` filter + create stamp + type field

**Files:**
- Modify: `src/main/handlers/elements.ts`
- Modify: `src/main/handlers/connections.ts`
- Modify: `src/types/index.ts` (`ArchitectureElement`, `ArchitectureConnection`, `CreateElementInput`, `CreateConnectionInput`)

**Interfaces:**
- Consumes: `Architecture` type (Task 1).
- Produces: `listElements(projectId, architectureId?)` and `listConnections(projectId, architectureId?)` — when `architectureId` is a number, filter `AND architecture_id = ?`; when omitted/null, return all project rows (register uses this). `createElement`/`createConnection` inputs gain `architectureId?: number | null` and stamp it. `ArchitectureElement`/`ArchitectureConnection` gain `architectureId: number | null`.

- [ ] **Step 1: Add `architectureId` to the shared types**

In `src/types/index.ts`:
- In `ArchitectureElement`, add `architectureId: number | null` (e.g. after `parentId`).
- In `ArchitectureConnection`, add `architectureId: number | null` (e.g. after `projectId`).
- In `CreateElementInput`, add `architectureId?: number | null`.
- In `CreateConnectionInput`, add `architectureId?: number | null`.

- [ ] **Step 2: Update the elements handler**

In `src/main/handlers/elements.ts`:

Add the field to `rowToElement`'s returned object:
```typescript
    id: row.id, projectId: row.project_id, architectureId: row.architecture_id ?? null, parentId: row.parent_id ?? null,
```

Replace `listElements` to accept an optional filter:
```typescript
export function listElements(projectId: number, architectureId?: number | null): ArchitectureElement[] {
  const db = getDatabase()
  if (architectureId != null) {
    return (db.prepare('SELECT * FROM architecture_elements WHERE project_id = ? AND architecture_id = ? AND deleted_at IS NULL ORDER BY id').all(projectId, architectureId) as any[]).map(rowToElement)
  }
  return (db.prepare('SELECT * FROM architecture_elements WHERE project_id = ? AND deleted_at IS NULL ORDER BY id').all(projectId) as any[]).map(rowToElement)
}
```

In `createElement`, add `architecture_id` to the INSERT column list and value:
```typescript
    const r = db.prepare(`
      INSERT INTO architecture_elements
        (project_id, architecture_id, parent_id, block_id, name, element_type_id, pos_x, pos_y, width, height, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 160, 80, ?, ?)
    `).run(
      input.projectId, input.architectureId ?? null, input.parentId ?? null, blockId,
      input.name ?? '', input.elementTypeId ?? null,
      input.posX ?? 100, input.posY ?? 100, ts, ts
    )
```

Update the IPC handler to pass the filter through:
```typescript
  ipcMain.handle('elements:list', (_e, projectId: number, architectureId?: number | null) => listElements(projectId, architectureId))
```

- [ ] **Step 3: Update the connections handler**

In `src/main/handlers/connections.ts`:

Add the field to `rowToConnection`:
```typescript
    id: row.id, projectId: row.project_id, architectureId: row.architecture_id ?? null, connId: row.conn_id,
```

Replace `listConnections`:
```typescript
export function listConnections(projectId: number, architectureId?: number | null): ArchitectureConnection[] {
  const db = getDatabase()
  if (architectureId != null) {
    return (db.prepare('SELECT * FROM architecture_connections WHERE project_id = ? AND architecture_id = ? AND deleted_at IS NULL ORDER BY id').all(projectId, architectureId) as any[]).map(rowToConnection)
  }
  return (db.prepare('SELECT * FROM architecture_connections WHERE project_id = ? AND deleted_at IS NULL ORDER BY id').all(projectId) as any[]).map(rowToConnection)
}
```

In `createConnection`, add `architecture_id` to the INSERT:
```typescript
    const r = db.prepare(`
      INSERT INTO architecture_connections
        (project_id, architecture_id, conn_id, source_id, target_id, source_handle, target_handle, name, connection_type_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.projectId, input.architectureId ?? null, connId, input.sourceId, input.targetId,
      input.sourceHandle ?? null, input.targetHandle ?? null,
      input.name ?? null, input.connectionTypeId ?? null, ts, ts
    )
```

Update the IPC handler:
```typescript
  ipcMain.handle('connections:list', (_e, projectId: number, architectureId?: number | null) => listConnections(projectId, architectureId))
```

- [ ] **Step 4: Typecheck**

Run: `./node_modules/.bin/tsc -p tsconfig.node.json --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/main/handlers/elements.ts src/main/handlers/connections.ts src/types/index.ts
git commit -m "feat(arch): architecture_id on elements/connections, optional list filter"
```

---

### Task 3: Preload bridge + api.d.ts

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/types/api.d.ts`

**Interfaces:**
- Consumes: the Task 1/2 channels + types.
- Produces: `window.api.architectures.{ list, create, rename, delete }`; `window.api.elements.list(projectId, architectureId?)` and `window.api.connections.list(projectId, architectureId?)` signatures gain the optional param.

- [ ] **Step 1: Add the architectures bridge**

In `src/preload/index.ts`, ensure `Architecture` is imported from `../types`, and add a bridge object (next to `elements`):

```typescript
  architectures: {
    list: (projectId: number): Promise<Architecture[]> => ipcRenderer.invoke('architectures:list', projectId),
    create: (projectId: number, name: string): Promise<Architecture> => ipcRenderer.invoke('architectures:create', projectId, name),
    rename: (id: number, name: string): Promise<Architecture> => ipcRenderer.invoke('architectures:rename', id, name),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('architectures:delete', id)
  },
```

Update the `elements.list` and `connections.list` bridge methods to forward the optional param:

```typescript
    list: (projectId: number, architectureId?: number | null): Promise<ArchitectureElement[]> => ipcRenderer.invoke('elements:list', projectId, architectureId),
```
```typescript
    list: (projectId: number, architectureId?: number | null): Promise<ArchitectureConnection[]> => ipcRenderer.invoke('connections:list', projectId, architectureId),
```

- [ ] **Step 2: Update api.d.ts**

In `src/types/api.d.ts`, import `Architecture`, add the `architectures` block to the `api` interface:

```typescript
      architectures: {
        list: (projectId: number) => Promise<Architecture[]>
        create: (projectId: number, name: string) => Promise<Architecture>
        rename: (id: number, name: string) => Promise<Architecture>
        delete: (id: number) => Promise<void>
      }
```

and update the `elements.list` / `connections.list` signatures:

```typescript
        list: (projectId: number, architectureId?: number | null) => Promise<ArchitectureElement[]>
```
```typescript
        list: (projectId: number, architectureId?: number | null) => Promise<ArchitectureConnection[]>
```

- [ ] **Step 3: Typecheck**

Run: `./node_modules/.bin/tsc -p tsconfig.node.json --noEmit && ./node_modules/.bin/tsc -p tsconfig.web.json --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/types/api.d.ts
git commit -m "feat(arch): expose architectures over preload; list gains architectureId param"
```

---

### Task 4: Store — architectures state, active architecture, per-architecture load

**Files:**
- Modify: `src/renderer/src/store/index.ts`
- Test: `src/renderer/src/store/architectures.test.ts` (new)

**Interfaces:**
- Consumes: `window.api.architectures.*`; `window.api.elements.list(projectId, architectureId)`; `window.api.connections.list(projectId, architectureId)`.
- Produces (store):
  - state `architectures: Architecture[]`, `activeArchitectureId: number | null`
  - `loadArchitectures: () => Promise<void>` — loads list, sets `activeArchitectureId` from localStorage `reqarch.activeArchitecture.<projectId>` (if still present in the list) else the first, then calls `loadArchitecture`
  - `setActiveArchitecture: (id: number) => Promise<void>` — persists + reloads canvas
  - `addArchitecture: (name: string) => Promise<void>` — creates, switches active to it
  - `renameArchitecture: (id: number, name: string) => Promise<void>`
  - `removeArchitecture: (id: number) => Promise<void>` — deletes, switches active to a surviving sibling
  - `loadArchitecture` now filters by `activeArchitectureId`
  - `addElement`/`addConnection` stamp `activeArchitectureId`; `removeElement` re-fetch passes it

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/store/architectures.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useStore } from './index'

const arch = (id: number, name: string, position = 0) => ({ id, projectId: 1, name, position, deletedAt: null, createdAt: '', updatedAt: '' })

beforeEach(() => {
  localStorage.clear()
  ;(window as any).api = {
    architectures: {
      list: vi.fn().mockResolvedValue([arch(10, 'Default', 0), arch(11, 'Comms', 1)]),
      create: vi.fn().mockResolvedValue(arch(12, 'New', 2)),
      rename: vi.fn(), delete: vi.fn().mockResolvedValue(undefined)
    },
    elements: { list: vi.fn().mockResolvedValue([]) },
    connections: { list: vi.fn().mockResolvedValue([]) },
    elementTypes: { list: vi.fn().mockResolvedValue([]) },
    connectionTypes: { list: vi.fn().mockResolvedValue([]) },
    requirements: { listByProject: vi.fn().mockResolvedValue([]) }
  }
  useStore.setState({ project: { id: 1, name: 'P' } as any, architectures: [], activeArchitectureId: null })
})

describe('loadArchitectures', () => {
  it('loads list and defaults active to the first architecture', async () => {
    await useStore.getState().loadArchitectures()
    const s = useStore.getState()
    expect(s.architectures.map((a) => a.id)).toEqual([10, 11])
    expect(s.activeArchitectureId).toBe(10)
    expect((window as any).api.elements.list).toHaveBeenCalledWith(1, 10)
  })

  it('restores the persisted active architecture when still present', async () => {
    localStorage.setItem('reqarch.activeArchitecture.1', '11')
    await useStore.getState().loadArchitectures()
    expect(useStore.getState().activeArchitectureId).toBe(11)
    expect((window as any).api.elements.list).toHaveBeenCalledWith(1, 11)
  })
})

describe('setActiveArchitecture', () => {
  it('persists the choice and reloads the canvas for that architecture', async () => {
    await useStore.getState().loadArchitectures()
    await useStore.getState().setActiveArchitecture(11)
    expect(useStore.getState().activeArchitectureId).toBe(11)
    expect(localStorage.getItem('reqarch.activeArchitecture.1')).toBe('11')
    expect((window as any).api.connections.list).toHaveBeenLastCalledWith(1, 11)
  })
})

describe('removeArchitecture', () => {
  it('switches active to a surviving sibling after delete', async () => {
    await useStore.getState().loadArchitectures() // active = 10
    ;(window as any).api.architectures.list.mockResolvedValue([arch(11, 'Comms', 1)])
    await useStore.getState().removeArchitecture(10)
    expect((window as any).api.architectures.delete).toHaveBeenCalledWith(10)
    expect(useStore.getState().activeArchitectureId).toBe(11)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run src/renderer/src/store/architectures.test.ts`
Expected: FAIL — `loadArchitectures`/`setActiveArchitecture`/`removeArchitecture` not functions.

- [ ] **Step 3: Implement the store changes**

In `src/renderer/src/store/index.ts`:

Add `Architecture` to the type import from `'../../../types'` (match the existing types import path used in the file).

Add to the state interface (near `activeArchitectureId` neighbours like `elements`):
```typescript
  architectures: Architecture[]
  activeArchitectureId: number | null
  loadArchitectures: () => Promise<void>
  setActiveArchitecture: (id: number) => Promise<void>
  addArchitecture: (name: string) => Promise<void>
  renameArchitecture: (id: number, name: string) => Promise<void>
  removeArchitecture: (id: number) => Promise<void>
```

Add initial values in the default object (near `elements: []`):
```typescript
  architectures: [], activeArchitectureId: null,
```

Change `loadArchitecture` to filter by the active architecture (elements/connections calls gain the id):
```typescript
  loadArchitecture: async () => {
    const { project, activeArchitectureId } = get()
    if (!project) return
    const [elements, connections, elementTypes, connectionTypes, projectRequirements] = await Promise.all([
      window.api.elements.list(project.id, activeArchitectureId),
      window.api.connections.list(project.id, activeArchitectureId),
      window.api.elementTypes.list(project.id),
      window.api.connectionTypes.list(project.id),
      window.api.requirements.listByProject(project.id)
    ])
    set({ elements, connections, elementTypes, connectionTypes, projectRequirements })
  },
```

Add the new actions (place near `loadArchitecture`):
```typescript
  loadArchitectures: async () => {
    const { project } = get()
    if (!project) return
    const architectures = await window.api.architectures.list(project.id)
    const persisted = Number(localStorage.getItem(`reqarch.activeArchitecture.${project.id}`))
    const active = architectures.some((a) => a.id === persisted) ? persisted : (architectures[0]?.id ?? null)
    set({ architectures, activeArchitectureId: active })
    await get().loadArchitecture()
  },

  setActiveArchitecture: async (id) => {
    const { project } = get()
    if (project) localStorage.setItem(`reqarch.activeArchitecture.${project.id}`, String(id))
    set({ activeArchitectureId: id, selectedElementId: null, selectedConnectionId: null })
    await get().loadArchitecture()
  },

  addArchitecture: async (name) => {
    const { project } = get()
    if (!project) return
    const created = await window.api.architectures.create(project.id, name)
    set((s) => ({ architectures: [...s.architectures, created] }))
    await get().setActiveArchitecture(created.id)
  },

  renameArchitecture: async (id, name) => {
    const updated = await window.api.architectures.rename(id, name)
    set((s) => ({ architectures: s.architectures.map((a) => (a.id === id ? updated : a)) }))
  },

  removeArchitecture: async (id) => {
    const { project, activeArchitectureId } = get()
    if (!project) return
    await window.api.architectures.delete(id)
    const architectures = await window.api.architectures.list(project.id)
    set({ architectures })
    if (activeArchitectureId === id) {
      await get().setActiveArchitecture(architectures[0].id)
    }
  },
```

In `addElement`, stamp the active architecture. Change the first line:
```typescript
  addElement: async (input) => {
    const el = await window.api.elements.create({ ...input, architectureId: get().activeArchitectureId })
```

In `addConnection`, likewise:
```typescript
  addConnection: async (input) => {
    const conn = await window.api.connections.create({ ...input, architectureId: get().activeArchitectureId })
```
(Keep the rest of each action unchanged.)

In `removeElement`, the post-delete re-fetch must stay within the active architecture — change the two list calls:
```typescript
    const [elements, connections] = await Promise.all([
      window.api.elements.list(project.id, get().activeArchitectureId),
      window.api.connections.list(project.id, get().activeArchitectureId)
    ])
```

- [ ] **Step 4: Run to verify it passes**

Run: `./node_modules/.bin/vitest run src/renderer/src/store/architectures.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Run the full store suite + typecheck (regressions)**

Run: `./node_modules/.bin/vitest run src/renderer/src/store`
Expected: no new failures.
Run: `./node_modules/.bin/tsc -p tsconfig.web.json --noEmit`
Expected: clean. (If a pre-existing store test constructs elements/connections without `architectureId` and tsc complains, add `architectureId: null` to those fixtures.)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/store/index.ts src/renderer/src/store/architectures.test.ts
git commit -m "feat(arch): store architectures state, active-architecture load/switch/CRUD"
```

---

### Task 5: Architecture sub-tab strip + App wiring

**Files:**
- Create: `src/renderer/src/components/ArchitectureCanvas/ArchitectureTabs.tsx`
- Test: `src/renderer/src/components/ArchitectureCanvas/ArchitectureTabs.test.tsx`
- Modify: `src/renderer/src/App.tsx` (load architectures on tab entry; render the strip above the canvas)

**Interfaces:**
- Consumes: store `architectures`, `activeArchitectureId`, `setActiveArchitecture`, `addArchitecture`, `renameArchitecture`, `removeArchitecture`, `loadArchitectures`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/components/ArchitectureCanvas/ArchitectureTabs.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ArchitectureTabs from './ArchitectureTabs'
import { useStore } from '../../store'

vi.mock('../../store')

const arch = (id: number, name: string) => ({ id, projectId: 1, name, position: id, deletedAt: null, createdAt: '', updatedAt: '' })

beforeEach(() => {
  ;(useStore as any).mockReturnValue({
    architectures: [arch(10, 'Default'), arch(11, 'Comms')],
    activeArchitectureId: 10,
    setActiveArchitecture: vi.fn(),
    addArchitecture: vi.fn(),
    renameArchitecture: vi.fn(),
    removeArchitecture: vi.fn()
  })
})

it('renders a tab per architecture and switches on click', () => {
  const setActive = vi.fn()
  ;(useStore as any).mockReturnValue({
    architectures: [arch(10, 'Default'), arch(11, 'Comms')], activeArchitectureId: 10,
    setActiveArchitecture: setActive, addArchitecture: vi.fn(), renameArchitecture: vi.fn(), removeArchitecture: vi.fn()
  })
  render(<ArchitectureTabs />)
  expect(screen.getByText('Default')).toBeInTheDocument()
  fireEvent.click(screen.getByText('Comms'))
  expect(setActive).toHaveBeenCalledWith(11)
})

it('creates a new architecture via the + affordance', () => {
  const addArchitecture = vi.fn()
  ;(useStore as any).mockReturnValue({
    architectures: [arch(10, 'Default')], activeArchitectureId: 10,
    setActiveArchitecture: vi.fn(), addArchitecture, renameArchitecture: vi.fn(), removeArchitecture: vi.fn()
  })
  render(<ArchitectureTabs />)
  fireEvent.click(screen.getByLabelText('New architecture'))
  const input = screen.getByPlaceholderText('Architecture name')
  fireEvent.change(input, { target: { value: 'Power' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(addArchitecture).toHaveBeenCalledWith('Power')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/ArchitectureTabs.test.tsx`
Expected: FAIL — cannot find `./ArchitectureTabs`.

- [ ] **Step 3: Implement the component**

Create `src/renderer/src/components/ArchitectureCanvas/ArchitectureTabs.tsx`. Requirements:
- A horizontal strip. For each architecture (in order): a tab button showing its name; the active one styled with the app's active treatment (reuse token classes — active `bg-white border border-line text-ink`, inactive `text-ink-muted hover:bg-workspace`), mono not required.
- Click a non-active tab → `setActiveArchitecture(id)`.
- Double-click a tab → inline rename: swap to a compact native `<input>` seeded with the name; Enter or blur commits via `renameArchitecture(id, value)` (ignore empty → keep old); Escape cancels.
- A `+` button (`aria-label="New architecture"`) at the end → reveals a compact native `<input placeholder="Architecture name">`; Enter commits via `addArchitecture(value)` when non-empty then hides; Escape hides.
- Each tab (except when only one architecture exists) shows a small `×` on hover → `removeArchitecture(id)` after a `window.confirm('Delete this architecture and all its blocks?')`. Hide the `×` entirely when `architectures.length <= 1`.

```tsx
import { useState } from 'react'
import { useStore } from '../../store'

export default function ArchitectureTabs(): JSX.Element {
  const { architectures, activeArchitectureId, setActiveArchitecture, addArchitecture, renameArchitecture, removeArchitecture } = useStore()
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [adding, setAdding] = useState(false)
  const [addValue, setAddValue] = useState('')

  function commitRename(id: number): void {
    const v = renameValue.trim()
    if (v) renameArchitecture(id, v)
    setRenamingId(null)
  }
  function commitAdd(): void {
    const v = addValue.trim()
    if (v) addArchitecture(v)
    setAdding(false); setAddValue('')
  }

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-line bg-workspace shrink-0 overflow-x-auto">
      {architectures.map((a) => {
        const active = a.id === activeArchitectureId
        if (renamingId === a.id) {
          return (
            <input
              key={a.id}
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => commitRename(a.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(a.id); if (e.key === 'Escape') setRenamingId(null) }}
              className="px-2 py-1 text-sm rounded border border-action bg-white text-ink w-32"
            />
          )
        }
        return (
          <div
            key={a.id}
            onClick={() => !active && setActiveArchitecture(a.id)}
            onDoubleClick={() => { setRenamingId(a.id); setRenameValue(a.name) }}
            className={`group flex items-center gap-1 px-3 py-1 text-sm rounded cursor-pointer whitespace-nowrap
              ${active ? 'bg-white border border-line text-ink' : 'text-ink-muted hover:bg-white/60'}`}
          >
            <span>{a.name}</span>
            {architectures.length > 1 && (
              <button
                aria-label={`Delete ${a.name}`}
                onClick={(e) => { e.stopPropagation(); if (window.confirm('Delete this architecture and all its blocks?')) removeArchitecture(a.id) }}
                className="opacity-0 group-hover:opacity-100 text-ink-faint hover:text-error leading-none"
              >×</button>
            )}
          </div>
        )
      })}
      {adding ? (
        <input
          autoFocus
          placeholder="Architecture name"
          value={addValue}
          onChange={(e) => setAddValue(e.target.value)}
          onBlur={commitAdd}
          onKeyDown={(e) => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') { setAdding(false); setAddValue('') } }}
          className="px-2 py-1 text-sm rounded border border-action bg-white text-ink w-40"
        />
      ) : (
        <button aria-label="New architecture" onClick={() => setAdding(true)} className="px-2 py-1 text-sm text-ink-muted hover:text-ink hover:bg-white/60 rounded">+</button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/ArchitectureTabs.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire into App.tsx**

In `src/renderer/src/App.tsx`:

Import the component:
```typescript
import ArchitectureTabs from './components/ArchitectureCanvas/ArchitectureTabs'
```

Add `loadArchitectures` to the `useStore()` destructure at the top of the component.

Change the architecture load effect to load the architecture LIST (which itself sets active + loads the canvas). Replace:
```typescript
    if (activeTab === 'architecture' && project) loadArchitecture()
```
with:
```typescript
    if (activeTab === 'architecture' && project) loadArchitectures()
```

In the architecture panel branch (the `data-testid="panel-architecture"` block), render the strip above the canvas. Change the inner canvas wrapper so the strip sits on top:
```tsx
        <div data-testid="panel-architecture" className="flex flex-1 overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            <ArchitectureTabs />
            <div className="flex-1 overflow-hidden">
              <ArchitectureCanvas />
            </div>
          </div>
          {(selectedElementId !== null || selectedConnectionId !== null) && (
            <Panel className="w-96 shrink-0 border-l overflow-y-auto">
              {selectedElementId !== null ? <ElementPanel /> : <ConnectionPanel />}
            </Panel>
          )}
        </div>
```

- [ ] **Step 6: Typecheck + full renderer suite**

Run: `./node_modules/.bin/tsc -p tsconfig.web.json --noEmit && ./node_modules/.bin/tsc -p tsconfig.node.json --noEmit`
Expected: clean.
Run: `./node_modules/.bin/vitest run src/renderer`
Expected: no new failures. (If `App.test.tsx` breaks because its store mock lacks `loadArchitectures`/`architectures`/`activeArchitectureId`, add them — `loadArchitectures: vi.fn()`, `architectures: []`, `activeArchitectureId: null`.)

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/ArchitectureCanvas/ArchitectureTabs.tsx src/renderer/src/components/ArchitectureCanvas/ArchitectureTabs.test.tsx src/renderer/src/App.tsx
git commit -m "feat(arch): architecture sub-tab strip with create/rename/delete + App wiring"
```

---

### Task 6: Interface Register — Architecture column + live verification

**Files:**
- Modify: `src/renderer/src/store/index.ts` (`loadInterfaces` also loads architectures)
- Modify: `src/renderer/src/components/InterfaceRegister/rows.ts` (row gains `architectureName`)
- Modify: `src/renderer/src/components/InterfaceRegister/rows.test.ts` (assert the mapping)
- Modify: `src/renderer/src/components/InterfaceRegister/index.tsx` (Architecture toggleable column)

**Interfaces:**
- Consumes: `ArchitectureConnection.architectureId` (Task 2), `Architecture` list, store `architectures`.
- Produces: `InterfaceRow` gains `architectureName: string`; register shows a toggleable **Architecture** column.

- [ ] **Step 1: Write the failing test (extend rows.test.ts)**

Add to `src/renderer/src/components/InterfaceRegister/rows.test.ts`:

```typescript
import type { Architecture } from '../../../../types'

it('maps architectureName from the architectures list', () => {
  const elements = [] as any[]
  const architectures: Architecture[] = [{ id: 7, projectId: 1, name: 'Comms', position: 0, deletedAt: null, createdAt: '', updatedAt: '' }]
  const connections = [{ id: 1, projectId: 1, architectureId: 7, connId: 'ICN-0001', sourceId: 0, targetId: 0, sourceHandle: null, targetHandle: null, name: null, connectionTypeId: null, description: null, deletedAt: null, createdAt: '', updatedAt: '' }] as any[]
  const rows = buildInterfaceRows(connections, elements, [], [], architectures)
  expect(rows[0].architectureName).toBe('Comms')
})
```

Also update the existing `buildInterfaceRows` calls in this file to pass a 5th arg `[]` (empty architectures) so they keep compiling.

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/InterfaceRegister/rows.test.ts`
Expected: FAIL — `buildInterfaceRows` takes 4 args / `architectureName` missing.

- [ ] **Step 3: Update the helper**

In `src/renderer/src/components/InterfaceRegister/rows.ts`:
- Import `Architecture` in the existing types import.
- Add `architectureName: string` to the `InterfaceRow` interface.
- Add a 5th parameter `architectures: Architecture[]` to `buildInterfaceRows`; build `const archById = new Map(architectures.map((a) => [a.id, a]))`; set `architectureName: (c.architectureId != null ? archById.get(c.architectureId)?.name : '') ?? ''` on each row.

- [ ] **Step 4: Run to verify it passes**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/InterfaceRegister/rows.test.ts`
Expected: PASS.

- [ ] **Step 5: Load architectures in `loadInterfaces` and render the column**

In `src/renderer/src/store/index.ts`, extend `loadInterfaces` to also load architectures into state (it already sets several fields):
```typescript
  loadInterfaces: async () => {
    const { project } = get()
    if (!project) return
    const [elements, connections, elementTypes, connectionTypes, projectConnectionCustomFields, architectures] = await Promise.all([
      window.api.elements.list(project.id),
      window.api.connections.list(project.id),
      window.api.elementTypes.list(project.id),
      window.api.connectionTypes.list(project.id),
      window.api.connectionCustomFields.listByProject(project.id),
      window.api.architectures.list(project.id)
    ])
    set({ elements, connections, elementTypes, connectionTypes, projectConnectionCustomFields, architectures })
  },
```

In `src/renderer/src/components/InterfaceRegister/index.tsx`:
- Read `architectures` from the store destructure.
- Pass it as the 5th arg: `buildInterfaceRows(connections, elements, connectionTypes, projectConnectionCustomFields, architectures)`.
- Add `'architecture'` to the optional/built-in columns: update `BUILTIN_OPTIONAL_COLUMNS` handling. In `rows.ts`, change `BUILTIN_OPTIONAL_COLUMNS` to `['name', 'type', 'description', 'architecture'] as const` and add `BUILTIN_LABELS.architecture = 'Architecture'` in `index.tsx`; in the component's `cellValue`, add `if (col === 'architecture') return row.architectureName`.

- [ ] **Step 6: Typecheck + full renderer suite**

Run: `./node_modules/.bin/tsc -p tsconfig.web.json --noEmit && ./node_modules/.bin/tsc -p tsconfig.node.json --noEmit`
Expected: clean.
Run: `./node_modules/.bin/vitest run src/renderer`
Expected: no new failures. (If a prior InterfaceRegister test mock lacks `architectures`, add `architectures: []`. The default column-visibility now includes `architecture: true` — update any test asserting the exact visibility object.)

- [ ] **Step 7: Live-verify in the running app**

Build + drive (`./node_modules/.bin/electron-vite build`, then the driver). Confirm end-to-end:
1. Architecture tab shows a sub-tab strip; existing SmokeTest blocks appear under a "Default" architecture.
2. `+` → name "Comms" → new empty canvas; add a block (gets an ID); switch back to Default → its blocks are unchanged; switch to Comms → only the new block.
3. Double-click a tab → rename; delete a tab (confirm dialog; the last one has no ×).
4. Relaunch → last-active architecture restored.
5. Interfaces tab → Architecture column available in the Columns toggle, showing each interface's owning architecture (existing ICN-000N show "Default").

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/store/index.ts src/renderer/src/components/InterfaceRegister
git commit -m "feat(arch): Interface Register Architecture column; load architectures for register"
```

---

## Self-Review Notes

- **Spec coverage:** architectures table + columns → Task 1; migration/Default backfill → Task 1; shared palette (untouched) → inherent; independent-diagram list/create → Tasks 2/3; store active-architecture + load → Task 4; sub-tab nav (create/rename/delete, last-active persistence, last-one guard) → Tasks 4/5; Interface Register Architecture column → Task 6. Reorder IPC intentionally omitted (spec §7 deferred).
- **ABI reality:** backend tasks (1–3) verified by typecheck + Task 6 live app, not vitest.
- **Non-breaking list change:** `elements/connections.list(projectId, architectureId?)` — register passes no id (all project connections), canvas passes the active id. Verified all in-store callers updated (loadArchitecture, removeElement, loadInterfaces stays unfiltered).
- **Type-consistency:** `architectureId` added to `ArchitectureElement`/`ArchitectureConnection` and both create inputs; `buildInterfaceRows` arity bumped to 5 with all call sites (component + tests) updated in Task 6.
