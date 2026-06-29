# Architecture Canvas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Architecture Canvas tab — a React Flow canvas where engineers model their system as typed, nested blocks connected by typed edges, traceable to requirements.

**Architecture:** Same 3-layer pattern as Requirements: React renderer → typed `window.api` preload bridge → main-process IPC handlers → SQLite. Architecture state extends the existing Zustand store. The canvas uses `@xyflow/react` (React Flow v12) for node/edge rendering. DB schema is extended via `ALTER TABLE` (not fresh migrations) so existing project files keep working.

**Tech Stack:** Electron 31, React 18, TypeScript 5 (strict), `@xyflow/react` v12, Tailwind CSS 3, Zustand 4, better-sqlite3, Vitest, React Testing Library

## Global Constraints

- All TypeScript files use strict mode
- No direct DB calls from renderer — only through `window.api`
- Block IDs and connection IDs generated in main process only, never in renderer
- Soft delete only — `deleted_at` timestamp, no hard deletes
- All handler tests run in Node environment; component tests run in jsdom
- React Flow mocked in component tests (see Task 22 for the mock pattern)
- Follow exact naming from this plan — types, functions, and IPC channel names must be consistent across all tasks

---

### Task 13: Architecture TypeScript Types

**Files:**
- Modify: `src/types/index.ts` — add 12 new interfaces; update `Project`
- Modify: `src/main/handlers/projects.ts` — update `rowToProject` to map new Project columns

**Interfaces:**
- Consumes: nothing new
- Produces: `ElementType`, `ConnectionType`, `ArchitectureElement`, `ArchitectureConnection`, `CreateElementTypeInput`, `CreateConnectionTypeInput`, `CreateElementInput`, `UpdateElementInput`, `CreateConnectionInput`, `UpdateConnectionInput` — imported by all later tasks

- [ ] **Step 1: Update `src/types/index.ts`**

Replace the entire file with:

```ts
export interface Project {
  id: number
  name: string
  elemIdPrefix: string
  elemIdPadding: number
  elemNextCounter: number
  connIdPrefix: string
  connIdPadding: number
  connNextCounter: number
  createdAt: string
  updatedAt: string
}

export interface Module {
  id: number
  projectId: number
  parentId: number | null
  name: string
  idPrefix: string
  idPadding: number
  nextCounter: number
  position: number
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Requirement {
  id: number
  moduleId: number
  reqId: string
  text: string
  acceptanceCriteria: string | null
  source: string | null
  rationale: string | null
  position: number
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateModuleInput {
  projectId: number
  parentId: number | null
  name: string
  idPrefix: string
  idPadding: number
}

export interface UpdateModuleInput {
  name: string
}

export interface CreateRequirementInput {
  moduleId: number
  text: string
  acceptanceCriteria?: string
  source?: string
  rationale?: string
}

export interface UpdateRequirementInput {
  text?: string
  acceptanceCriteria?: string
  source?: string
  rationale?: string
}

export interface ElementType {
  id: number
  projectId: number
  name: string
  color: string | null
  isBuiltIn: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ConnectionType {
  id: number
  projectId: number
  name: string
  color: string | null
  isBuiltIn: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ArchitectureElement {
  id: number
  projectId: number
  parentId: number | null
  blockId: string
  name: string
  elementTypeId: number | null
  description: string | null
  color: string | null
  posX: number
  posY: number
  width: number
  height: number
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ArchitectureConnection {
  id: number
  projectId: number
  connId: string
  sourceId: number
  targetId: number
  name: string | null
  connectionTypeId: number | null
  description: string | null
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateElementTypeInput {
  projectId: number
  name: string
  color?: string | null
}

export interface CreateConnectionTypeInput {
  projectId: number
  name: string
  color?: string | null
}

export interface CreateElementInput {
  projectId: number
  parentId?: number | null
  name?: string
  elementTypeId?: number | null
  posX?: number
  posY?: number
}

export interface UpdateElementInput {
  parentId?: number | null
  blockId?: string
  name?: string
  elementTypeId?: number | null
  description?: string | null
  color?: string | null
  posX?: number
  posY?: number
  width?: number
  height?: number
}

export interface CreateConnectionInput {
  projectId: number
  sourceId: number
  targetId: number
  name?: string | null
  connectionTypeId?: number | null
}

export interface UpdateConnectionInput {
  connId?: string
  name?: string | null
  connectionTypeId?: number | null
  description?: string | null
}
```

- [ ] **Step 2: Update `rowToProject` in `src/main/handlers/projects.ts`**

Find the `rowToProject` function (line ~8) and replace it:

```ts
function rowToProject(row: any): Project {
  return {
    id: row.id,
    name: row.name,
    elemIdPrefix: row.elem_id_prefix ?? 'SYS',
    elemIdPadding: row.elem_id_padding ?? 3,
    elemNextCounter: row.elem_next_counter ?? 1,
    connIdPrefix: row.conn_id_prefix ?? 'ICN',
    connIdPadding: row.conn_id_padding ?? 4,
    connNextCounter: row.conn_next_counter ?? 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles clean**

```bash
npx tsc --noEmit
```

Expected: No errors. (Store and api.d.ts tests may now show `Project` field errors — those are fixed in Tasks 19–20.)

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/main/handlers/projects.ts
git commit -m "feat: add architecture TypeScript types and expand Project interface"
```

---

### Task 14: Architecture DB Migrations

**Files:**
- Modify: `src/main/db/migrations.ts` — add 5 new tables + ALTER TABLE for projects columns
- Modify: `src/main/db/migrations.test.ts` — add tests for new tables and project columns

**Interfaces:**
- Consumes: `better-sqlite3`, existing `runMigrations`
- Produces: `runMigrations` extended to also create `element_types`, `connection_types`, `architecture_elements`, `architecture_connections`, `element_requirement_links`, `connection_requirement_links` tables and add 6 columns to `projects`

- [ ] **Step 1: Add failing tests to `src/main/db/migrations.test.ts`**

Append these two new tests inside the existing `describe('runMigrations', ...)` block (after the existing `it` blocks):

```ts
  it('creates architecture tables', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    db = new Database(join(tempDir, 'test.reqarch'))
    runMigrations(db)

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name)

    expect(tables).toContain('element_types')
    expect(tables).toContain('connection_types')
    expect(tables).toContain('architecture_elements')
    expect(tables).toContain('architecture_connections')
    expect(tables).toContain('element_requirement_links')
    expect(tables).toContain('connection_requirement_links')
  })

  it('adds architecture columns to projects table', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    db = new Database(join(tempDir, 'test.reqarch'))
    runMigrations(db)

    const cols = (db
      .prepare("SELECT name FROM pragma_table_info('projects')")
      .all() as any[]).map((r) => r.name)

    expect(cols).toContain('elem_id_prefix')
    expect(cols).toContain('elem_id_padding')
    expect(cols).toContain('elem_next_counter')
    expect(cols).toContain('conn_id_prefix')
    expect(cols).toContain('conn_id_padding')
    expect(cols).toContain('conn_next_counter')
  })
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run src/main/db/migrations.test.ts
```

Expected: FAIL — new tables and columns don't exist yet.

- [ ] **Step 3: Update `src/main/db/migrations.ts`**

Replace the entire file with:

```ts
import Database from 'better-sqlite3'

function addColumnIfMissing(db: Database.Database, table: string, column: string, definition: string): void {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  } catch { /* column already exists — safe to ignore */ }
}

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      created_at  TEXT    NOT NULL,
      updated_at  TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS modules (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id      INTEGER NOT NULL REFERENCES projects(id),
      parent_id       INTEGER REFERENCES modules(id),
      name            TEXT    NOT NULL,
      id_prefix       TEXT    NOT NULL,
      id_padding      INTEGER NOT NULL DEFAULT 4,
      next_counter    INTEGER NOT NULL DEFAULT 1,
      position        INTEGER NOT NULL DEFAULT 0,
      deleted_at      TEXT,
      created_at      TEXT    NOT NULL,
      updated_at      TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS requirements (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id           INTEGER NOT NULL REFERENCES modules(id),
      req_id              TEXT    NOT NULL,
      text                TEXT    NOT NULL,
      acceptance_criteria TEXT,
      source              TEXT,
      rationale           TEXT,
      position            INTEGER NOT NULL DEFAULT 0,
      deleted_at          TEXT,
      created_at          TEXT    NOT NULL,
      updated_at          TEXT    NOT NULL
    );

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

    CREATE TABLE IF NOT EXISTS element_requirement_links (
      element_id     INTEGER NOT NULL REFERENCES architecture_elements(id),
      requirement_id INTEGER NOT NULL REFERENCES requirements(id),
      PRIMARY KEY (element_id, requirement_id)
    );

    CREATE TABLE IF NOT EXISTS connection_requirement_links (
      connection_id  INTEGER NOT NULL REFERENCES architecture_connections(id),
      requirement_id INTEGER NOT NULL REFERENCES requirements(id),
      PRIMARY KEY (connection_id, requirement_id)
    );
  `)

  addColumnIfMissing(db, 'projects', 'elem_id_prefix',    "TEXT NOT NULL DEFAULT 'SYS'")
  addColumnIfMissing(db, 'projects', 'elem_id_padding',   'INTEGER NOT NULL DEFAULT 3')
  addColumnIfMissing(db, 'projects', 'elem_next_counter', 'INTEGER NOT NULL DEFAULT 1')
  addColumnIfMissing(db, 'projects', 'conn_id_prefix',    "TEXT NOT NULL DEFAULT 'ICN'")
  addColumnIfMissing(db, 'projects', 'conn_id_padding',   'INTEGER NOT NULL DEFAULT 4')
  addColumnIfMissing(db, 'projects', 'conn_next_counter', 'INTEGER NOT NULL DEFAULT 1')
}
```

- [ ] **Step 4: Run tests — verify all 4 pass**

```bash
npx vitest run src/main/db/migrations.test.ts
```

Expected: PASS — 4 tests passing (2 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/main/db/migrations.ts src/main/db/migrations.test.ts
git commit -m "feat: add architecture DB tables and project ID-counter columns"
```

---

### Task 15: Element Types & Connection Types Handlers

**Files:**
- Create: `src/main/handlers/elementTypes.ts`
- Create: `src/main/handlers/elementTypes.test.ts`
- Create: `src/main/handlers/connectionTypes.ts`
- Create: `src/main/handlers/connectionTypes.test.ts`

**Interfaces:**
- Consumes: `getDatabase` from `../db/connection`; `ElementType`, `ConnectionType`, `CreateElementTypeInput`, `CreateConnectionTypeInput` from `../../types`; `createProject` (tests only)
- Produces:
  - `seedElementTypes(db, projectId)` — inserts 5 built-in element types; called when a project is created
  - `seedConnectionTypes(db, projectId)` — inserts 6 built-in connection types
  - `listElementTypes(projectId): ElementType[]`
  - `createElementType(input): ElementType`
  - `deleteElementType(id): void`
  - `registerElementTypeHandlers(): void` — IPC: `elementTypes:list`, `elementTypes:create`, `elementTypes:delete`
  - `listConnectionTypes(projectId): ConnectionType[]`
  - `createConnectionType(input): ConnectionType`
  - `deleteConnectionType(id): void`
  - `registerConnectionTypeHandlers(): void` — IPC: `connectionTypes:list`, `connectionTypes:create`, `connectionTypes:delete`

- [ ] **Step 1: Write failing tests — `src/main/handlers/elementTypes.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase, closeDatabase, getDatabase } from '../db/connection'
import { createProject } from './projects'
import { seedElementTypes, listElementTypes, createElementType, deleteElementType } from './elementTypes'

describe('elementTypes handler', () => {
  let tempDir: string
  let projectId: number

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    openDatabase(join(tempDir, 'test.reqarch'))
    projectId = createProject('Test').id
  })

  afterEach(() => {
    closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('seedElementTypes inserts 5 built-in types', () => {
    seedElementTypes(getDatabase(), projectId)
    const types = listElementTypes(projectId)
    expect(types).toHaveLength(5)
    expect(types.map((t) => t.name)).toEqual(
      expect.arrayContaining(['System', 'Subsystem', 'Component', 'Function', 'External'])
    )
    expect(types.every((t) => t.isBuiltIn)).toBe(true)
  })

  it('createElementType adds a user type', () => {
    const t = createElementType({ projectId, name: 'Sensor', color: '#ff0000' })
    expect(t.name).toBe('Sensor')
    expect(t.color).toBe('#ff0000')
    expect(t.isBuiltIn).toBe(false)
  })

  it('listElementTypes excludes soft-deleted types', () => {
    seedElementTypes(getDatabase(), projectId)
    const all = listElementTypes(projectId)
    deleteElementType(all[0].id)
    expect(listElementTypes(projectId)).toHaveLength(4)
  })

  it('seedElementTypes is idempotent — calling twice does not duplicate', () => {
    const db = getDatabase()
    seedElementTypes(db, projectId)
    seedElementTypes(db, projectId)
    expect(listElementTypes(projectId)).toHaveLength(5)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run src/main/handlers/elementTypes.test.ts
```

Expected: FAIL — `Cannot find module './elementTypes'`

- [ ] **Step 3: Create `src/main/handlers/elementTypes.ts`**

```ts
import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { getDatabase } from '../db/connection'
import type { ElementType, CreateElementTypeInput } from '../../types'

const BUILT_IN_ELEMENT_TYPES = ['System', 'Subsystem', 'Component', 'Function', 'External']

function now(): string { return new Date().toISOString() }

function rowToElementType(row: any): ElementType {
  return {
    id: row.id, projectId: row.project_id, name: row.name,
    color: row.color ?? null, isBuiltIn: row.is_built_in === 1,
    deletedAt: row.deleted_at ?? null, createdAt: row.created_at, updatedAt: row.updated_at
  }
}

export function seedElementTypes(db: Database.Database, projectId: number): void {
  const ts = now()
  const existing = (db
    .prepare('SELECT name FROM element_types WHERE project_id = ? AND is_built_in = 1')
    .all(projectId) as any[]).map((r) => r.name)
  const insert = db.prepare(
    'INSERT INTO element_types (project_id, name, color, is_built_in, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, ?)'
  )
  for (const name of BUILT_IN_ELEMENT_TYPES) {
    if (!existing.includes(name)) insert.run(projectId, name, ts, ts)
  }
}

export function listElementTypes(projectId: number): ElementType[] {
  return (getDatabase()
    .prepare('SELECT * FROM element_types WHERE project_id = ? AND deleted_at IS NULL ORDER BY is_built_in DESC, id')
    .all(projectId) as any[]).map(rowToElementType)
}

export function createElementType(input: CreateElementTypeInput): ElementType {
  const db = getDatabase()
  const ts = now()
  const result = db.prepare(
    'INSERT INTO element_types (project_id, name, color, is_built_in, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)'
  ).run(input.projectId, input.name, input.color ?? null, ts, ts)
  return rowToElementType(db.prepare('SELECT * FROM element_types WHERE id = ?').get(result.lastInsertRowid))
}

export function deleteElementType(id: number): void {
  const ts = now()
  getDatabase().prepare('UPDATE element_types SET deleted_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id)
}

export function registerElementTypeHandlers(): void {
  ipcMain.handle('elementTypes:list', (_e, projectId: number) => listElementTypes(projectId))
  ipcMain.handle('elementTypes:create', (_e, input: CreateElementTypeInput) => createElementType(input))
  ipcMain.handle('elementTypes:delete', (_e, id: number) => deleteElementType(id))
}
```

- [ ] **Step 4: Run element type tests — verify they pass**

```bash
npx vitest run src/main/handlers/elementTypes.test.ts
```

Expected: PASS — 4 tests passing.

- [ ] **Step 5: Write failing tests — `src/main/handlers/connectionTypes.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase, closeDatabase, getDatabase } from '../db/connection'
import { createProject } from './projects'
import { seedConnectionTypes, listConnectionTypes, createConnectionType, deleteConnectionType } from './connectionTypes'

describe('connectionTypes handler', () => {
  let tempDir: string
  let projectId: number

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    openDatabase(join(tempDir, 'test.reqarch'))
    projectId = createProject('Test').id
  })

  afterEach(() => {
    closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('seedConnectionTypes inserts 6 built-in types', () => {
    seedConnectionTypes(getDatabase(), projectId)
    const types = listConnectionTypes(projectId)
    expect(types).toHaveLength(6)
    expect(types.map((t) => t.name)).toEqual(
      expect.arrayContaining(['Data', 'Power', 'Mechanical', 'Thermal', 'Control', 'Software'])
    )
  })

  it('createConnectionType adds a user type', () => {
    const t = createConnectionType({ projectId, name: 'Optical', color: '#00ff00' })
    expect(t.name).toBe('Optical')
    expect(t.isBuiltIn).toBe(false)
  })

  it('listConnectionTypes excludes soft-deleted types', () => {
    seedConnectionTypes(getDatabase(), projectId)
    const all = listConnectionTypes(projectId)
    deleteConnectionType(all[0].id)
    expect(listConnectionTypes(projectId)).toHaveLength(5)
  })

  it('seedConnectionTypes is idempotent', () => {
    const db = getDatabase()
    seedConnectionTypes(db, projectId)
    seedConnectionTypes(db, projectId)
    expect(listConnectionTypes(projectId)).toHaveLength(6)
  })
})
```

- [ ] **Step 6: Run tests — verify they fail**

```bash
npx vitest run src/main/handlers/connectionTypes.test.ts
```

Expected: FAIL — `Cannot find module './connectionTypes'`

- [ ] **Step 7: Create `src/main/handlers/connectionTypes.ts`**

```ts
import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { getDatabase } from '../db/connection'
import type { ConnectionType, CreateConnectionTypeInput } from '../../types'

const BUILT_IN_CONNECTION_TYPES = ['Data', 'Power', 'Mechanical', 'Thermal', 'Control', 'Software']

function now(): string { return new Date().toISOString() }

function rowToConnectionType(row: any): ConnectionType {
  return {
    id: row.id, projectId: row.project_id, name: row.name,
    color: row.color ?? null, isBuiltIn: row.is_built_in === 1,
    deletedAt: row.deleted_at ?? null, createdAt: row.created_at, updatedAt: row.updated_at
  }
}

export function seedConnectionTypes(db: Database.Database, projectId: number): void {
  const ts = now()
  const existing = (db
    .prepare('SELECT name FROM connection_types WHERE project_id = ? AND is_built_in = 1')
    .all(projectId) as any[]).map((r) => r.name)
  const insert = db.prepare(
    'INSERT INTO connection_types (project_id, name, color, is_built_in, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, ?)'
  )
  for (const name of BUILT_IN_CONNECTION_TYPES) {
    if (!existing.includes(name)) insert.run(projectId, name, ts, ts)
  }
}

export function listConnectionTypes(projectId: number): ConnectionType[] {
  return (getDatabase()
    .prepare('SELECT * FROM connection_types WHERE project_id = ? AND deleted_at IS NULL ORDER BY is_built_in DESC, id')
    .all(projectId) as any[]).map(rowToConnectionType)
}

export function createConnectionType(input: CreateConnectionTypeInput): ConnectionType {
  const db = getDatabase()
  const ts = now()
  const result = db.prepare(
    'INSERT INTO connection_types (project_id, name, color, is_built_in, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)'
  ).run(input.projectId, input.name, input.color ?? null, ts, ts)
  return rowToConnectionType(db.prepare('SELECT * FROM connection_types WHERE id = ?').get(result.lastInsertRowid))
}

export function deleteConnectionType(id: number): void {
  const ts = now()
  getDatabase().prepare('UPDATE connection_types SET deleted_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id)
}

export function registerConnectionTypeHandlers(): void {
  ipcMain.handle('connectionTypes:list', (_e, projectId: number) => listConnectionTypes(projectId))
  ipcMain.handle('connectionTypes:create', (_e, input: CreateConnectionTypeInput) => createConnectionType(input))
  ipcMain.handle('connectionTypes:delete', (_e, id: number) => deleteConnectionType(id))
}
```

- [ ] **Step 8: Run all handler tests — verify both pass**

```bash
npx vitest run src/main/handlers/elementTypes.test.ts src/main/handlers/connectionTypes.test.ts
```

Expected: PASS — 8 tests total passing.

- [ ] **Step 9: Also update `src/main/handlers/projects.ts` to seed types on project creation**

In `registerProjectHandlers`, inside the `project:create` handler, after `const project = createProject(name)`, add:

```ts
import { seedElementTypes } from './elementTypes'
import { seedConnectionTypes } from './connectionTypes'
```

Add these imports at the top of `projects.ts`, then in the `project:create` handler body after `const project = createProject(name)`:

```ts
const db = getDatabase()
seedElementTypes(db, project.id)
seedConnectionTypes(db, project.id)
```

- [ ] **Step 10: Commit**

```bash
git add src/main/handlers/elementTypes.ts src/main/handlers/elementTypes.test.ts \
        src/main/handlers/connectionTypes.ts src/main/handlers/connectionTypes.test.ts \
        src/main/handlers/projects.ts
git commit -m "feat: add element and connection type handlers with built-in seeding"
```

---

### Task 16: Elements Handler

**Files:**
- Create: `src/main/handlers/elements.ts`
- Create: `src/main/handlers/elements.test.ts`

**Interfaces:**
- Consumes: `getDatabase`; `ArchitectureElement`, `CreateElementInput`, `UpdateElementInput` from `../../types`; `createProject` (tests only)
- Produces:
  - `listElements(projectId: number): ArchitectureElement[]`
  - `createElement(input: CreateElementInput): ArchitectureElement`
  - `updateElement(id: number, input: UpdateElementInput): ArchitectureElement`
  - `deleteElement(id: number): void`
  - `registerElementHandlers(): void` — IPC: `elements:list`, `elements:create`, `elements:update`, `elements:delete`

Block IDs are auto-generated from the project's `elem_id_prefix` + `elem_next_counter` (padded to `elem_id_padding` digits), then the counter is incremented. This is atomic (runs in a transaction). The counter never reuses values.

- [ ] **Step 1: Write failing tests — `src/main/handlers/elements.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase, closeDatabase } from '../db/connection'
import { createProject } from './projects'
import { listElements, createElement, updateElement, deleteElement } from './elements'

describe('elements handler', () => {
  let tempDir: string
  let projectId: number

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    openDatabase(join(tempDir, 'test.reqarch'))
    projectId = createProject('Test').id
  })

  afterEach(() => {
    closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('createElement generates blockId from project prefix and counter', () => {
    const el = createElement({ projectId })
    expect(el.blockId).toBe('SYS-001')
    expect(el.projectId).toBe(projectId)
    expect(el.parentId).toBeNull()
    expect(el.deletedAt).toBeNull()
  })

  it('counter increments and never reuses IDs', () => {
    const a = createElement({ projectId })
    deleteElement(a.id)
    const b = createElement({ projectId })
    expect(a.blockId).toBe('SYS-001')
    expect(b.blockId).toBe('SYS-002')
  })

  it('listElements returns only active elements', () => {
    const a = createElement({ projectId })
    createElement({ projectId })
    deleteElement(a.id)
    expect(listElements(projectId)).toHaveLength(1)
  })

  it('updateElement changes fields', () => {
    const el = createElement({ projectId })
    const updated = updateElement(el.id, { name: 'Propulsion', posX: 200, posY: 300 })
    expect(updated.name).toBe('Propulsion')
    expect(updated.posX).toBe(200)
    expect(updated.posY).toBe(300)
    expect(updated.blockId).toBe(el.blockId)
  })

  it('updateElement can set parentId for nesting', () => {
    const parent = createElement({ projectId })
    const child = createElement({ projectId })
    const updated = updateElement(child.id, { parentId: parent.id })
    expect(updated.parentId).toBe(parent.id)
  })

  it('updateElement can clear parentId to un-nest', () => {
    const parent = createElement({ projectId })
    const child = createElement({ projectId })
    updateElement(child.id, { parentId: parent.id })
    const unnested = updateElement(child.id, { parentId: null })
    expect(unnested.parentId).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run src/main/handlers/elements.test.ts
```

Expected: FAIL — `Cannot find module './elements'`

- [ ] **Step 3: Create `src/main/handlers/elements.ts`**

```ts
import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import type { ArchitectureElement, CreateElementInput, UpdateElementInput } from '../../types'

function now(): string { return new Date().toISOString() }

function rowToElement(row: any): ArchitectureElement {
  return {
    id: row.id, projectId: row.project_id, parentId: row.parent_id ?? null,
    blockId: row.block_id, name: row.name, elementTypeId: row.element_type_id ?? null,
    description: row.description ?? null, color: row.color ?? null,
    posX: row.pos_x, posY: row.pos_y, width: row.width, height: row.height,
    deletedAt: row.deleted_at ?? null, createdAt: row.created_at, updatedAt: row.updated_at
  }
}

export function listElements(projectId: number): ArchitectureElement[] {
  return (getDatabase()
    .prepare('SELECT * FROM architecture_elements WHERE project_id = ? AND deleted_at IS NULL ORDER BY id')
    .all(projectId) as any[]).map(rowToElement)
}

export function createElement(input: CreateElementInput): ArchitectureElement {
  const db = getDatabase()
  const ts = now()

  const row = db.transaction(() => {
    const proj = db.prepare(
      'SELECT elem_id_prefix, elem_id_padding, elem_next_counter FROM projects WHERE id = ?'
    ).get(input.projectId) as any
    if (!proj) throw new Error(`Project ${input.projectId} not found`)

    const blockId = `${proj.elem_id_prefix}-${String(proj.elem_next_counter).padStart(proj.elem_id_padding, '0')}`
    db.prepare('UPDATE projects SET elem_next_counter = ?, updated_at = ? WHERE id = ?')
      .run(proj.elem_next_counter + 1, ts, input.projectId)

    const r = db.prepare(`
      INSERT INTO architecture_elements
        (project_id, parent_id, block_id, name, element_type_id, pos_x, pos_y, width, height, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 160, 80, ?, ?)
    `).run(
      input.projectId, input.parentId ?? null, blockId,
      input.name ?? '', input.elementTypeId ?? null,
      input.posX ?? 100, input.posY ?? 100, ts, ts
    )
    return db.prepare('SELECT * FROM architecture_elements WHERE id = ?').get(r.lastInsertRowid)
  })()

  return rowToElement(row)
}

export function updateElement(id: number, input: UpdateElementInput): ArchitectureElement {
  const db = getDatabase()
  const existing = db.prepare('SELECT * FROM architecture_elements WHERE id = ?').get(id) as any
  if (!existing) throw new Error(`Element ${id} not found`)

  db.prepare(`
    UPDATE architecture_elements SET
      parent_id = ?, block_id = ?, name = ?, element_type_id = ?,
      description = ?, color = ?, pos_x = ?, pos_y = ?, width = ?, height = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    'parentId' in input ? (input.parentId ?? null) : existing.parent_id,
    input.blockId ?? existing.block_id,
    input.name ?? existing.name,
    'elementTypeId' in input ? (input.elementTypeId ?? null) : existing.element_type_id,
    'description' in input ? (input.description ?? null) : existing.description,
    'color' in input ? (input.color ?? null) : existing.color,
    input.posX ?? existing.pos_x,
    input.posY ?? existing.pos_y,
    input.width ?? existing.width,
    input.height ?? existing.height,
    now(), id
  )
  return rowToElement(db.prepare('SELECT * FROM architecture_elements WHERE id = ?').get(id))
}

export function deleteElement(id: number): void {
  const ts = now()
  getDatabase().prepare('UPDATE architecture_elements SET deleted_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id)
}

export function registerElementHandlers(): void {
  ipcMain.handle('elements:list', (_e, projectId: number) => listElements(projectId))
  ipcMain.handle('elements:create', (_e, input: CreateElementInput) => createElement(input))
  ipcMain.handle('elements:update', (_e, id: number, input: UpdateElementInput) => updateElement(id, input))
  ipcMain.handle('elements:delete', (_e, id: number) => deleteElement(id))
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run src/main/handlers/elements.test.ts
```

Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/main/handlers/elements.ts src/main/handlers/elements.test.ts
git commit -m "feat: add architecture elements handler with atomic block ID generation"
```

---

### Task 17: Connections Handler

**Files:**
- Create: `src/main/handlers/connections.ts`
- Create: `src/main/handlers/connections.test.ts`

**Interfaces:**
- Consumes: `getDatabase`; `ArchitectureConnection`, `CreateConnectionInput`, `UpdateConnectionInput` from `../../types`; `createProject`, `createElement` (tests only)
- Produces:
  - `listConnections(projectId: number): ArchitectureConnection[]`
  - `createConnection(input: CreateConnectionInput): ArchitectureConnection`
  - `updateConnection(id: number, input: UpdateConnectionInput): ArchitectureConnection`
  - `deleteConnection(id: number): void`
  - `registerConnectionHandlers(): void` — IPC: `connections:list`, `connections:create`, `connections:update`, `connections:delete`

Connection IDs use `conn_id_prefix` + `conn_next_counter` (padded to `conn_id_padding`), same atomic transaction pattern as elements.

- [ ] **Step 1: Write failing tests — `src/main/handlers/connections.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase, closeDatabase } from '../db/connection'
import { createProject } from './projects'
import { createElement } from './elements'
import { listConnections, createConnection, updateConnection, deleteConnection } from './connections'

describe('connections handler', () => {
  let tempDir: string
  let projectId: number
  let sourceId: number
  let targetId: number

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    openDatabase(join(tempDir, 'test.reqarch'))
    projectId = createProject('Test').id
    sourceId = createElement({ projectId }).id
    targetId = createElement({ projectId }).id
  })

  afterEach(() => {
    closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('createConnection generates connId from project counter', () => {
    const conn = createConnection({ projectId, sourceId, targetId })
    expect(conn.connId).toBe('ICN-0001')
    expect(conn.sourceId).toBe(sourceId)
    expect(conn.targetId).toBe(targetId)
    expect(conn.deletedAt).toBeNull()
  })

  it('counter increments and never reuses IDs', () => {
    const a = createConnection({ projectId, sourceId, targetId })
    deleteConnection(a.id)
    const b = createConnection({ projectId, sourceId, targetId })
    expect(a.connId).toBe('ICN-0001')
    expect(b.connId).toBe('ICN-0002')
  })

  it('listConnections returns only active connections', () => {
    const a = createConnection({ projectId, sourceId, targetId })
    createConnection({ projectId, sourceId, targetId })
    deleteConnection(a.id)
    expect(listConnections(projectId)).toHaveLength(1)
  })

  it('updateConnection changes name and description', () => {
    const conn = createConnection({ projectId, sourceId, targetId })
    const updated = updateConnection(conn.id, { name: 'Power bus', description: 'Main 28V bus' })
    expect(updated.name).toBe('Power bus')
    expect(updated.description).toBe('Main 28V bus')
    expect(updated.connId).toBe(conn.connId)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run src/main/handlers/connections.test.ts
```

Expected: FAIL — `Cannot find module './connections'`

- [ ] **Step 3: Create `src/main/handlers/connections.ts`**

```ts
import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import type { ArchitectureConnection, CreateConnectionInput, UpdateConnectionInput } from '../../types'

function now(): string { return new Date().toISOString() }

function rowToConnection(row: any): ArchitectureConnection {
  return {
    id: row.id, projectId: row.project_id, connId: row.conn_id,
    sourceId: row.source_id, targetId: row.target_id,
    name: row.name ?? null, connectionTypeId: row.connection_type_id ?? null,
    description: row.description ?? null, deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at, updatedAt: row.updated_at
  }
}

export function listConnections(projectId: number): ArchitectureConnection[] {
  return (getDatabase()
    .prepare('SELECT * FROM architecture_connections WHERE project_id = ? AND deleted_at IS NULL ORDER BY id')
    .all(projectId) as any[]).map(rowToConnection)
}

export function createConnection(input: CreateConnectionInput): ArchitectureConnection {
  const db = getDatabase()
  const ts = now()

  const row = db.transaction(() => {
    const proj = db.prepare(
      'SELECT conn_id_prefix, conn_id_padding, conn_next_counter FROM projects WHERE id = ?'
    ).get(input.projectId) as any
    if (!proj) throw new Error(`Project ${input.projectId} not found`)

    const connId = `${proj.conn_id_prefix}-${String(proj.conn_next_counter).padStart(proj.conn_id_padding, '0')}`
    db.prepare('UPDATE projects SET conn_next_counter = ?, updated_at = ? WHERE id = ?')
      .run(proj.conn_next_counter + 1, ts, input.projectId)

    const r = db.prepare(`
      INSERT INTO architecture_connections
        (project_id, conn_id, source_id, target_id, name, connection_type_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.projectId, connId, input.sourceId, input.targetId,
      input.name ?? null, input.connectionTypeId ?? null, ts, ts
    )
    return db.prepare('SELECT * FROM architecture_connections WHERE id = ?').get(r.lastInsertRowid)
  })()

  return rowToConnection(row)
}

export function updateConnection(id: number, input: UpdateConnectionInput): ArchitectureConnection {
  const db = getDatabase()
  const existing = db.prepare('SELECT * FROM architecture_connections WHERE id = ?').get(id) as any
  if (!existing) throw new Error(`Connection ${id} not found`)

  db.prepare(`
    UPDATE architecture_connections SET
      conn_id = ?, name = ?, connection_type_id = ?, description = ?, updated_at = ?
    WHERE id = ?
  `).run(
    input.connId ?? existing.conn_id,
    'name' in input ? (input.name ?? null) : existing.name,
    'connectionTypeId' in input ? (input.connectionTypeId ?? null) : existing.connection_type_id,
    'description' in input ? (input.description ?? null) : existing.description,
    now(), id
  )
  return rowToConnection(db.prepare('SELECT * FROM architecture_connections WHERE id = ?').get(id))
}

export function deleteConnection(id: number): void {
  const ts = now()
  getDatabase().prepare('UPDATE architecture_connections SET deleted_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id)
}

export function registerConnectionHandlers(): void {
  ipcMain.handle('connections:list', (_e, projectId: number) => listConnections(projectId))
  ipcMain.handle('connections:create', (_e, input: CreateConnectionInput) => createConnection(input))
  ipcMain.handle('connections:update', (_e, id: number, input: UpdateConnectionInput) => updateConnection(id, input))
  ipcMain.handle('connections:delete', (_e, id: number) => deleteConnection(id))
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run src/main/handlers/connections.test.ts
```

Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/main/handlers/connections.ts src/main/handlers/connections.test.ts
git commit -m "feat: add architecture connections handler with atomic conn ID generation"
```

---

### Task 18: Requirement Links Handlers

**Files:**
- Create: `src/main/handlers/elementLinks.ts`
- Create: `src/main/handlers/elementLinks.test.ts`
- Create: `src/main/handlers/connectionLinks.ts`
- Create: `src/main/handlers/connectionLinks.test.ts`
- Modify: `src/main/handlers/requirements.ts` — add `listRequirementsByProject`
- Modify: `src/main/handlers/requirements.test.ts` — add test for `listRequirementsByProject`

**Interfaces:**
- Consumes: `getDatabase`; `Requirement` from `../../types`; `createProject`, `createModule`, `createRequirement`, `createElement`, `createConnection` (tests only)
- Produces:
  - `addElementLink(elementId, requirementId): void`
  - `removeElementLink(elementId, requirementId): void`
  - `listElementLinks(elementId): Requirement[]`
  - `registerElementLinkHandlers(): void` — IPC: `elementLinks:list`, `elementLinks:add`, `elementLinks:remove`
  - `addConnectionLink(connectionId, requirementId): void`
  - `removeConnectionLink(connectionId, requirementId): void`
  - `listConnectionLinks(connectionId): Requirement[]`
  - `registerConnectionLinkHandlers(): void` — IPC: `connectionLinks:list`, `connectionLinks:add`, `connectionLinks:remove`
  - `listRequirementsByProject(projectId): Requirement[]` — added to requirements handler; IPC: `requirements:listByProject`

- [ ] **Step 1: Add `listRequirementsByProject` test to `src/main/handlers/requirements.test.ts`**

Add this test inside the existing `describe` block:

```ts
  it('listRequirementsByProject returns all active requirements across modules', async () => {
    const { listRequirementsByProject } = await import('./requirements')
    const project2 = createProject('Other')
    const mod2 = createModule({ projectId: project2.id, parentId: null, name: 'HRS', idPrefix: 'HRS', idPadding: 4 })
    createRequirement({ moduleId, text: 'Req A' })
    createRequirement({ moduleId: mod2.id, text: 'Req B' })
    const all = listRequirementsByProject(project2.id)
    expect(all.map((r) => r.text)).toContain('Req B')
    expect(all.map((r) => r.text)).not.toContain('Req A')
  })
```

Note: `moduleId` is already defined in `beforeEach` of the existing test suite.

- [ ] **Step 2: Add `listRequirementsByProject` to `src/main/handlers/requirements.ts`**

Add this function and register it (append before `registerRequirementHandlers`):

```ts
export function listRequirementsByProject(projectId: number): Requirement[] {
  return (getDatabase()
    .prepare(`
      SELECT r.* FROM requirements r
      JOIN modules m ON r.module_id = m.id
      WHERE m.project_id = ? AND r.deleted_at IS NULL
      ORDER BY m.id, r.position, r.id
    `)
    .all(projectId) as any[]).map(rowToRequirement)
}
```

In `registerRequirementHandlers`, add:
```ts
ipcMain.handle('requirements:listByProject', (_e, projectId: number) => listRequirementsByProject(projectId))
```

- [ ] **Step 3: Run requirements tests — verify they still pass**

```bash
npx vitest run src/main/handlers/requirements.test.ts
```

Expected: PASS — all tests passing.

- [ ] **Step 4: Write failing tests — `src/main/handlers/elementLinks.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase, closeDatabase } from '../db/connection'
import { createProject } from './projects'
import { createModule } from './modules'
import { createRequirement } from './requirements'
import { createElement } from './elements'
import { addElementLink, removeElementLink, listElementLinks } from './elementLinks'

describe('elementLinks handler', () => {
  let tempDir: string
  let elementId: number
  let requirementId: number

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    openDatabase(join(tempDir, 'test.reqarch'))
    const project = createProject('Test')
    const mod = createModule({ projectId: project.id, parentId: null, name: 'SRS', idPrefix: 'SRS', idPadding: 4 })
    requirementId = createRequirement({ moduleId: mod.id, text: 'Req A' }).id
    elementId = createElement({ projectId: project.id }).id
  })

  afterEach(() => {
    closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('addElementLink links a requirement to an element', () => {
    addElementLink(elementId, requirementId)
    const linked = listElementLinks(elementId)
    expect(linked).toHaveLength(1)
    expect(linked[0].id).toBe(requirementId)
  })

  it('removeElementLink unlinks a requirement', () => {
    addElementLink(elementId, requirementId)
    removeElementLink(elementId, requirementId)
    expect(listElementLinks(elementId)).toHaveLength(0)
  })

  it('addElementLink is idempotent — adding twice does not duplicate', () => {
    addElementLink(elementId, requirementId)
    addElementLink(elementId, requirementId)
    expect(listElementLinks(elementId)).toHaveLength(1)
  })
})
```

- [ ] **Step 5: Run tests — verify they fail**

```bash
npx vitest run src/main/handlers/elementLinks.test.ts
```

Expected: FAIL — `Cannot find module './elementLinks'`

- [ ] **Step 6: Create `src/main/handlers/elementLinks.ts`**

```ts
import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import type { Requirement } from '../../types'

function rowToRequirement(row: any): Requirement {
  return {
    id: row.id, moduleId: row.module_id, reqId: row.req_id, text: row.text,
    acceptanceCriteria: row.acceptance_criteria ?? null,
    source: row.source ?? null, rationale: row.rationale ?? null,
    position: row.position, deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at, updatedAt: row.updated_at
  }
}

export function listElementLinks(elementId: number): Requirement[] {
  return (getDatabase().prepare(`
    SELECT r.* FROM requirements r
    JOIN element_requirement_links l ON r.id = l.requirement_id
    WHERE l.element_id = ? AND r.deleted_at IS NULL
    ORDER BY r.id
  `).all(elementId) as any[]).map(rowToRequirement)
}

export function addElementLink(elementId: number, requirementId: number): void {
  getDatabase()
    .prepare('INSERT OR IGNORE INTO element_requirement_links (element_id, requirement_id) VALUES (?, ?)')
    .run(elementId, requirementId)
}

export function removeElementLink(elementId: number, requirementId: number): void {
  getDatabase()
    .prepare('DELETE FROM element_requirement_links WHERE element_id = ? AND requirement_id = ?')
    .run(elementId, requirementId)
}

export function registerElementLinkHandlers(): void {
  ipcMain.handle('elementLinks:list', (_e, elementId: number) => listElementLinks(elementId))
  ipcMain.handle('elementLinks:add', (_e, elementId: number, requirementId: number) => addElementLink(elementId, requirementId))
  ipcMain.handle('elementLinks:remove', (_e, elementId: number, requirementId: number) => removeElementLink(elementId, requirementId))
}
```

- [ ] **Step 7: Run element link tests — verify they pass**

```bash
npx vitest run src/main/handlers/elementLinks.test.ts
```

Expected: PASS — 3 tests passing.

- [ ] **Step 8: Write failing tests — `src/main/handlers/connectionLinks.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase, closeDatabase } from '../db/connection'
import { createProject } from './projects'
import { createModule } from './modules'
import { createRequirement } from './requirements'
import { createElement } from './elements'
import { createConnection } from './connections'
import { addConnectionLink, removeConnectionLink, listConnectionLinks } from './connectionLinks'

describe('connectionLinks handler', () => {
  let tempDir: string
  let connectionId: number
  let requirementId: number

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    openDatabase(join(tempDir, 'test.reqarch'))
    const project = createProject('Test')
    const mod = createModule({ projectId: project.id, parentId: null, name: 'SRS', idPrefix: 'SRS', idPadding: 4 })
    requirementId = createRequirement({ moduleId: mod.id, text: 'Req A' }).id
    const src = createElement({ projectId: project.id })
    const tgt = createElement({ projectId: project.id })
    connectionId = createConnection({ projectId: project.id, sourceId: src.id, targetId: tgt.id }).id
  })

  afterEach(() => {
    closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('addConnectionLink links a requirement to a connection', () => {
    addConnectionLink(connectionId, requirementId)
    expect(listConnectionLinks(connectionId)).toHaveLength(1)
  })

  it('removeConnectionLink unlinks a requirement', () => {
    addConnectionLink(connectionId, requirementId)
    removeConnectionLink(connectionId, requirementId)
    expect(listConnectionLinks(connectionId)).toHaveLength(0)
  })

  it('addConnectionLink is idempotent', () => {
    addConnectionLink(connectionId, requirementId)
    addConnectionLink(connectionId, requirementId)
    expect(listConnectionLinks(connectionId)).toHaveLength(1)
  })
})
```

- [ ] **Step 9: Run tests — verify they fail**

```bash
npx vitest run src/main/handlers/connectionLinks.test.ts
```

Expected: FAIL — `Cannot find module './connectionLinks'`

- [ ] **Step 10: Create `src/main/handlers/connectionLinks.ts`**

```ts
import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import type { Requirement } from '../../types'

function rowToRequirement(row: any): Requirement {
  return {
    id: row.id, moduleId: row.module_id, reqId: row.req_id, text: row.text,
    acceptanceCriteria: row.acceptance_criteria ?? null,
    source: row.source ?? null, rationale: row.rationale ?? null,
    position: row.position, deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at, updatedAt: row.updated_at
  }
}

export function listConnectionLinks(connectionId: number): Requirement[] {
  return (getDatabase().prepare(`
    SELECT r.* FROM requirements r
    JOIN connection_requirement_links l ON r.id = l.requirement_id
    WHERE l.connection_id = ? AND r.deleted_at IS NULL
    ORDER BY r.id
  `).all(connectionId) as any[]).map(rowToRequirement)
}

export function addConnectionLink(connectionId: number, requirementId: number): void {
  getDatabase()
    .prepare('INSERT OR IGNORE INTO connection_requirement_links (connection_id, requirement_id) VALUES (?, ?)')
    .run(connectionId, requirementId)
}

export function removeConnectionLink(connectionId: number, requirementId: number): void {
  getDatabase()
    .prepare('DELETE FROM connection_requirement_links WHERE connection_id = ? AND requirement_id = ?')
    .run(connectionId, requirementId)
}

export function registerConnectionLinkHandlers(): void {
  ipcMain.handle('connectionLinks:list', (_e, connectionId: number) => listConnectionLinks(connectionId))
  ipcMain.handle('connectionLinks:add', (_e, connectionId: number, requirementId: number) => addConnectionLink(connectionId, requirementId))
  ipcMain.handle('connectionLinks:remove', (_e, connectionId: number, requirementId: number) => removeConnectionLink(connectionId, requirementId))
}
```

- [ ] **Step 11: Run all link tests and full test suite**

```bash
npx vitest run src/main/handlers/connectionLinks.test.ts
npx vitest run
```

Expected: PASS — all tests passing across all files.

- [ ] **Step 12: Commit**

```bash
git add src/main/handlers/elementLinks.ts src/main/handlers/elementLinks.test.ts \
        src/main/handlers/connectionLinks.ts src/main/handlers/connectionLinks.test.ts \
        src/main/handlers/requirements.ts src/main/handlers/requirements.test.ts
git commit -m "feat: add requirement link handlers for elements and connections"
```

---

### Task 19: Preload Bridge + Main Entry + API Types

**Files:**
- Modify: `src/preload/index.ts` — add architecture IPC channels
- Modify: `src/types/api.d.ts` — add `Window.api` architecture types
- Modify: `src/main/index.ts` — register all new handlers

**Interfaces:**
- Consumes: all handlers from Tasks 15–18; all types from `../../types`
- Produces: `window.api.elementTypes`, `window.api.connectionTypes`, `window.api.elements`, `window.api.connections`, `window.api.elementLinks`, `window.api.connectionLinks`, `window.api.requirements.listByProject`

- [ ] **Step 1: Replace `src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type {
  Project, Module, Requirement,
  CreateModuleInput, UpdateModuleInput,
  CreateRequirementInput, UpdateRequirementInput,
  ElementType, ConnectionType,
  ArchitectureElement, ArchitectureConnection,
  CreateElementTypeInput, CreateConnectionTypeInput,
  CreateElementInput, UpdateElementInput,
  CreateConnectionInput, UpdateConnectionInput
} from '../types'

contextBridge.exposeInMainWorld('api', {
  project: {
    create: (name: string): Promise<Project | null> => ipcRenderer.invoke('project:create', name),
    open: (): Promise<Project | null> => ipcRenderer.invoke('project:open'),
    getCurrent: (): Promise<Project | null> => ipcRenderer.invoke('project:getCurrent')
  },
  modules: {
    list: (projectId: number): Promise<Module[]> => ipcRenderer.invoke('modules:list', projectId),
    create: (input: CreateModuleInput): Promise<Module> => ipcRenderer.invoke('modules:create', input),
    update: (id: number, input: UpdateModuleInput): Promise<Module> => ipcRenderer.invoke('modules:update', id, input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('modules:delete', id),
    restore: (id: number): Promise<void> => ipcRenderer.invoke('modules:restore', id)
  },
  requirements: {
    list: (moduleId: number): Promise<Requirement[]> => ipcRenderer.invoke('requirements:list', moduleId),
    listByProject: (projectId: number): Promise<Requirement[]> => ipcRenderer.invoke('requirements:listByProject', projectId),
    create: (input: CreateRequirementInput): Promise<Requirement> => ipcRenderer.invoke('requirements:create', input),
    update: (id: number, input: UpdateRequirementInput): Promise<Requirement> => ipcRenderer.invoke('requirements:update', id, input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('requirements:delete', id),
    restore: (id: number): Promise<void> => ipcRenderer.invoke('requirements:restore', id)
  },
  elementTypes: {
    list: (projectId: number): Promise<ElementType[]> => ipcRenderer.invoke('elementTypes:list', projectId),
    create: (input: CreateElementTypeInput): Promise<ElementType> => ipcRenderer.invoke('elementTypes:create', input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('elementTypes:delete', id)
  },
  connectionTypes: {
    list: (projectId: number): Promise<ConnectionType[]> => ipcRenderer.invoke('connectionTypes:list', projectId),
    create: (input: CreateConnectionTypeInput): Promise<ConnectionType> => ipcRenderer.invoke('connectionTypes:create', input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('connectionTypes:delete', id)
  },
  elements: {
    list: (projectId: number): Promise<ArchitectureElement[]> => ipcRenderer.invoke('elements:list', projectId),
    create: (input: CreateElementInput): Promise<ArchitectureElement> => ipcRenderer.invoke('elements:create', input),
    update: (id: number, input: UpdateElementInput): Promise<ArchitectureElement> => ipcRenderer.invoke('elements:update', id, input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('elements:delete', id)
  },
  connections: {
    list: (projectId: number): Promise<ArchitectureConnection[]> => ipcRenderer.invoke('connections:list', projectId),
    create: (input: CreateConnectionInput): Promise<ArchitectureConnection> => ipcRenderer.invoke('connections:create', input),
    update: (id: number, input: UpdateConnectionInput): Promise<ArchitectureConnection> => ipcRenderer.invoke('connections:update', id, input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('connections:delete', id)
  },
  elementLinks: {
    list: (elementId: number): Promise<Requirement[]> => ipcRenderer.invoke('elementLinks:list', elementId),
    add: (elementId: number, requirementId: number): Promise<void> => ipcRenderer.invoke('elementLinks:add', elementId, requirementId),
    remove: (elementId: number, requirementId: number): Promise<void> => ipcRenderer.invoke('elementLinks:remove', elementId, requirementId)
  },
  connectionLinks: {
    list: (connectionId: number): Promise<Requirement[]> => ipcRenderer.invoke('connectionLinks:list', connectionId),
    add: (connectionId: number, requirementId: number): Promise<void> => ipcRenderer.invoke('connectionLinks:add', connectionId, requirementId),
    remove: (connectionId: number, requirementId: number): Promise<void> => ipcRenderer.invoke('connectionLinks:remove', connectionId, requirementId)
  }
})
```

- [ ] **Step 2: Replace `src/types/api.d.ts`**

```ts
import type {
  Project, Module, Requirement,
  CreateModuleInput, UpdateModuleInput,
  CreateRequirementInput, UpdateRequirementInput,
  ElementType, ConnectionType,
  ArchitectureElement, ArchitectureConnection,
  CreateElementTypeInput, CreateConnectionTypeInput,
  CreateElementInput, UpdateElementInput,
  CreateConnectionInput, UpdateConnectionInput
} from './index'

declare global {
  interface Window {
    api: {
      project: {
        create(name: string): Promise<Project | null>
        open(): Promise<Project | null>
        getCurrent(): Promise<Project | null>
      }
      modules: {
        list(projectId: number): Promise<Module[]>
        create(input: CreateModuleInput): Promise<Module>
        update(id: number, input: UpdateModuleInput): Promise<Module>
        delete(id: number): Promise<void>
        restore(id: number): Promise<void>
      }
      requirements: {
        list(moduleId: number): Promise<Requirement[]>
        listByProject(projectId: number): Promise<Requirement[]>
        create(input: CreateRequirementInput): Promise<Requirement>
        update(id: number, input: UpdateRequirementInput): Promise<Requirement>
        delete(id: number): Promise<void>
        restore(id: number): Promise<void>
      }
      elementTypes: {
        list(projectId: number): Promise<ElementType[]>
        create(input: CreateElementTypeInput): Promise<ElementType>
        delete(id: number): Promise<void>
      }
      connectionTypes: {
        list(projectId: number): Promise<ConnectionType[]>
        create(input: CreateConnectionTypeInput): Promise<ConnectionType>
        delete(id: number): Promise<void>
      }
      elements: {
        list(projectId: number): Promise<ArchitectureElement[]>
        create(input: CreateElementInput): Promise<ArchitectureElement>
        update(id: number, input: UpdateElementInput): Promise<ArchitectureElement>
        delete(id: number): Promise<void>
      }
      connections: {
        list(projectId: number): Promise<ArchitectureConnection[]>
        create(input: CreateConnectionInput): Promise<ArchitectureConnection>
        update(id: number, input: UpdateConnectionInput): Promise<ArchitectureConnection>
        delete(id: number): Promise<void>
      }
      elementLinks: {
        list(elementId: number): Promise<Requirement[]>
        add(elementId: number, requirementId: number): Promise<void>
        remove(elementId: number, requirementId: number): Promise<void>
      }
      connectionLinks: {
        list(connectionId: number): Promise<Requirement[]>
        add(connectionId: number, requirementId: number): Promise<void>
        remove(connectionId: number, requirementId: number): Promise<void>
      }
    }
  }
}
```

- [ ] **Step 3: Replace `src/main/index.ts`**

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerProjectHandlers } from './handlers/projects'
import { registerModuleHandlers } from './handlers/modules'
import { registerRequirementHandlers } from './handlers/requirements'
import { registerElementTypeHandlers } from './handlers/elementTypes'
import { registerConnectionTypeHandlers } from './handlers/connectionTypes'
import { registerElementHandlers } from './handlers/elements'
import { registerConnectionHandlers } from './handlers/connections'
import { registerElementLinkHandlers } from './handlers/elementLinks'
import { registerConnectionLinkHandlers } from './handlers/connectionLinks'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerProjectHandlers()
  registerModuleHandlers()
  registerRequirementHandlers()
  registerElementTypeHandlers()
  registerConnectionTypeHandlers()
  registerElementHandlers()
  registerConnectionHandlers()
  registerElementLinkHandlers()
  registerConnectionLinkHandlers()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 4: Verify TypeScript compiles clean**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/preload/index.ts src/types/api.d.ts src/main/index.ts
git commit -m "feat: extend preload bridge and main entry with architecture IPC channels"
```

---

### Task 20: Architecture Store Extensions

**Files:**
- Modify: `src/renderer/src/store/index.ts` — add `activeTab`, architecture state, and actions
- Modify: `src/renderer/src/store/index.test.ts` — add architecture store tests

**Interfaces:**
- Consumes: `window.api` (mocked in tests); new types from `../../../../types`
- Produces: `useStore()` extended with:
  - State: `activeTab: 'requirements' | 'architecture'`, `elements: ArchitectureElement[]`, `connections: ArchitectureConnection[]`, `elementTypes: ElementType[]`, `connectionTypes: ConnectionType[]`, `selectedElementId: number | null`, `selectedConnectionId: number | null`, `projectRequirements: Requirement[]`
  - Actions: `setActiveTab`, `loadArchitecture`, `selectElement`, `selectConnection`, `addElement`, `updateElement`, `removeElement`, `addConnection`, `updateConnection`, `removeConnection`, `addElementLink`, `removeElementLink`, `addConnectionLink`, `removeConnectionLink`

- [ ] **Step 1: Add architecture tests to `src/renderer/src/store/index.test.ts`**

Append these tests after the existing `describe('store', ...)` block (as a new `describe`):

```ts
const mockElement: ArchitectureElement = {
  id: 1, projectId: 1, parentId: null, blockId: 'SYS-001', name: '',
  elementTypeId: null, description: null, color: null,
  posX: 100, posY: 100, width: 160, height: 80,
  deletedAt: null, createdAt: '', updatedAt: ''
}
const mockConn: ArchitectureConnection = {
  id: 1, projectId: 1, connId: 'ICN-0001', sourceId: 1, targetId: 2,
  name: null, connectionTypeId: null, description: null,
  deletedAt: null, createdAt: '', updatedAt: ''
}
```

Add this import at the top of the test file:
```ts
import type { ArchitectureElement, ArchitectureConnection } from '../../../../types'
```

Update the `vi.stubGlobal('window', { api: { ... } })` call to add to the mock api object:

```ts
    elementTypes: { list: vi.fn().mockResolvedValue([]) },
    connectionTypes: { list: vi.fn().mockResolvedValue([]) },
    elements: {
      list: vi.fn().mockResolvedValue([mockElement]),
      create: vi.fn().mockResolvedValue(mockElement),
      update: vi.fn().mockResolvedValue({ ...mockElement, name: 'Updated' }),
      delete: vi.fn().mockResolvedValue(undefined)
    },
    connections: {
      list: vi.fn().mockResolvedValue([mockConn]),
      delete: vi.fn().mockResolvedValue(undefined)
    },
    requirements: {
      ...existingRequirementsMock,
      listByProject: vi.fn().mockResolvedValue([mockReq])
    },
    elementLinks: {
      list: vi.fn().mockResolvedValue([]),
      add: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined)
    },
    connectionLinks: {
      list: vi.fn().mockResolvedValue([]),
      add: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined)
    }
```

Then add a new describe block after the existing one:

```ts
describe('architecture store', () => {
  beforeEach(() => {
    useStore.setState({
      project: mockProject, activeTab: 'requirements',
      elements: [], connections: [], elementTypes: [], connectionTypes: [],
      selectedElementId: null, selectedConnectionId: null, projectRequirements: []
    })
  })

  it('setActiveTab switches the active tab', () => {
    useStore.getState().setActiveTab('architecture')
    expect(useStore.getState().activeTab).toBe('architecture')
  })

  it('loadArchitecture loads elements, connections, and types', async () => {
    await useStore.getState().loadArchitecture()
    expect(useStore.getState().elements).toHaveLength(1)
    expect(useStore.getState().connections).toHaveLength(1)
  })

  it('addElement appends to elements list', async () => {
    await useStore.getState().addElement({ projectId: 1 })
    expect(useStore.getState().elements).toHaveLength(1)
    expect(useStore.getState().selectedElementId).toBe(1)
  })

  it('removeElement removes from list and clears selection', async () => {
    useStore.setState({ elements: [mockElement], selectedElementId: 1 })
    await useStore.getState().removeElement(1)
    expect(useStore.getState().elements).toHaveLength(0)
    expect(useStore.getState().selectedElementId).toBeNull()
  })

  it('selectElement sets selectedElementId and clears connection selection', () => {
    useStore.setState({ selectedConnectionId: 1 })
    useStore.getState().selectElement(42)
    expect(useStore.getState().selectedElementId).toBe(42)
    expect(useStore.getState().selectedConnectionId).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — verify new tests fail**

```bash
npx vitest run src/renderer/src/store/index.test.ts
```

Expected: FAIL — store doesn't have architecture state yet.

- [ ] **Step 3: Replace `src/renderer/src/store/index.ts`**

```ts
import { create } from 'zustand'
import type {
  Project, Module, Requirement,
  CreateModuleInput, UpdateModuleInput,
  CreateRequirementInput, UpdateRequirementInput,
  ElementType, ConnectionType,
  ArchitectureElement, ArchitectureConnection,
  CreateElementInput, UpdateElementInput,
  CreateConnectionInput, UpdateConnectionInput
} from '../../../../types'

interface Store {
  // shared
  project: Project | null
  activeTab: 'requirements' | 'architecture'

  // requirements tab
  modules: Module[]
  selectedModuleId: number | null
  requirements: Requirement[]
  selectedRequirementId: number | null

  // architecture tab
  elements: ArchitectureElement[]
  connections: ArchitectureConnection[]
  elementTypes: ElementType[]
  connectionTypes: ConnectionType[]
  selectedElementId: number | null
  selectedConnectionId: number | null
  projectRequirements: Requirement[]

  // actions — shared
  loadProject: () => Promise<void>
  setActiveTab: (tab: 'requirements' | 'architecture') => void

  // actions — requirements
  selectModule: (id: number | null) => Promise<void>
  selectRequirement: (id: number | null) => void
  addModule: (input: CreateModuleInput) => Promise<void>
  updateModule: (id: number, input: UpdateModuleInput) => Promise<void>
  removeModule: (id: number) => Promise<void>
  addRequirement: (input: CreateRequirementInput) => Promise<void>
  updateRequirement: (id: number, input: UpdateRequirementInput) => Promise<void>
  removeRequirement: (id: number) => Promise<void>

  // actions — architecture
  loadArchitecture: () => Promise<void>
  selectElement: (id: number | null) => void
  selectConnection: (id: number | null) => void
  addElement: (input: CreateElementInput) => Promise<void>
  updateElement: (id: number, input: UpdateElementInput) => Promise<void>
  removeElement: (id: number) => Promise<void>
  addConnection: (input: CreateConnectionInput) => Promise<void>
  updateConnection: (id: number, input: UpdateConnectionInput) => Promise<void>
  removeConnection: (id: number) => Promise<void>
  addElementLink: (elementId: number, requirementId: number) => Promise<void>
  removeElementLink: (elementId: number, requirementId: number) => Promise<void>
  addConnectionLink: (connectionId: number, requirementId: number) => Promise<void>
  removeConnectionLink: (connectionId: number, requirementId: number) => Promise<void>
}

export const useStore = create<Store>((set, get) => ({
  project: null, activeTab: 'requirements',
  modules: [], selectedModuleId: null, requirements: [], selectedRequirementId: null,
  elements: [], connections: [], elementTypes: [], connectionTypes: [],
  selectedElementId: null, selectedConnectionId: null, projectRequirements: [],

  loadProject: async () => {
    const project = await window.api.project.getCurrent()
    if (!project) return
    const modules = await window.api.modules.list(project.id)
    set({ project, modules })
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  selectModule: async (id) => {
    set({ selectedModuleId: id, requirements: [], selectedRequirementId: null })
    if (id === null) return
    const requirements = await window.api.requirements.list(id)
    set({ requirements })
  },

  selectRequirement: (id) => set({ selectedRequirementId: id }),

  addModule: async (input) => {
    const mod = await window.api.modules.create(input)
    set((s) => ({ modules: [...s.modules, mod] }))
  },

  updateModule: async (id, input) => {
    const updated = await window.api.modules.update(id, input)
    set((s) => ({ modules: s.modules.map((m) => (m.id === id ? updated : m)) }))
  },

  removeModule: async (id) => {
    await window.api.modules.delete(id)
    set((s) => ({
      modules: s.modules.filter((m) => m.id !== id),
      selectedModuleId: s.selectedModuleId === id ? null : s.selectedModuleId
    }))
  },

  addRequirement: async (input) => {
    const req = await window.api.requirements.create(input)
    set((s) => ({ requirements: [...s.requirements, req], selectedRequirementId: req.id }))
  },

  updateRequirement: async (id, input) => {
    const updated = await window.api.requirements.update(id, input)
    set((s) => ({ requirements: s.requirements.map((r) => (r.id === id ? updated : r)) }))
  },

  removeRequirement: async (id) => {
    await window.api.requirements.delete(id)
    set((s) => ({
      requirements: s.requirements.filter((r) => r.id !== id),
      selectedRequirementId: s.selectedRequirementId === id ? null : s.selectedRequirementId
    }))
  },

  loadArchitecture: async () => {
    const { project } = get()
    if (!project) return
    const [elements, connections, elementTypes, connectionTypes, projectRequirements] = await Promise.all([
      window.api.elements.list(project.id),
      window.api.connections.list(project.id),
      window.api.elementTypes.list(project.id),
      window.api.connectionTypes.list(project.id),
      window.api.requirements.listByProject(project.id)
    ])
    set({ elements, connections, elementTypes, connectionTypes, projectRequirements })
  },

  selectElement: (id) => set({ selectedElementId: id, selectedConnectionId: null }),

  selectConnection: (id) => set({ selectedConnectionId: id, selectedElementId: null }),

  addElement: async (input) => {
    const el = await window.api.elements.create(input)
    set((s) => ({ elements: [...s.elements, el], selectedElementId: el.id, selectedConnectionId: null }))
  },

  updateElement: async (id, input) => {
    const updated = await window.api.elements.update(id, input)
    set((s) => ({ elements: s.elements.map((e) => (e.id === id ? updated : e)) }))
  },

  removeElement: async (id) => {
    await window.api.elements.delete(id)
    set((s) => ({
      elements: s.elements.filter((e) => e.id !== id),
      selectedElementId: s.selectedElementId === id ? null : s.selectedElementId
    }))
  },

  addConnection: async (input) => {
    const conn = await window.api.connections.create(input)
    set((s) => ({ connections: [...s.connections, conn], selectedConnectionId: conn.id, selectedElementId: null }))
  },

  updateConnection: async (id, input) => {
    const updated = await window.api.connections.update(id, input)
    set((s) => ({ connections: s.connections.map((c) => (c.id === id ? updated : c)) }))
  },

  removeConnection: async (id) => {
    await window.api.connections.delete(id)
    set((s) => ({
      connections: s.connections.filter((c) => c.id !== id),
      selectedConnectionId: s.selectedConnectionId === id ? null : s.selectedConnectionId
    }))
  },

  addElementLink: async (elementId, requirementId) => {
    await window.api.elementLinks.add(elementId, requirementId)
  },

  removeElementLink: async (elementId, requirementId) => {
    await window.api.elementLinks.remove(elementId, requirementId)
  },

  addConnectionLink: async (connectionId, requirementId) => {
    await window.api.connectionLinks.add(connectionId, requirementId)
  },

  removeConnectionLink: async (connectionId, requirementId) => {
    await window.api.connectionLinks.remove(connectionId, requirementId)
  }
}))
```

- [ ] **Step 4: Run store tests — verify all pass**

```bash
npx vitest run src/renderer/src/store/index.test.ts
```

Expected: PASS — all tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/store/index.ts src/renderer/src/store/index.test.ts
git commit -m "feat: extend Zustand store with architecture tab state and actions"
```

---

### Task 21: Tab Bar in App.tsx

**Files:**
- Modify: `src/renderer/src/App.tsx` — add tab bar below header; switch panel area by `activeTab`
- Modify: `src/renderer/src/App.test.tsx` — add tab switching tests

**Interfaces:**
- Consumes: `useStore` — `activeTab`, `setActiveTab`, `loadArchitecture`
- Produces: `<App />` renders tab bar with Requirements / Architecture tabs; the panel area below is swapped when tab changes (Architecture panel is a `<div data-testid="panel-architecture" />` placeholder until Task 25)

- [ ] **Step 1: Add failing tests to `src/renderer/src/App.test.tsx`**

Append these inside the existing `describe('App', ...)` block:

```tsx
  it('renders tab bar with Requirements and Architecture tabs', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /requirements/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /architecture/i })).toBeInTheDocument()
  })

  it('shows requirements panels when Requirements tab is active', () => {
    render(<App />)
    expect(screen.getByTestId('panel-modules')).toBeInTheDocument()
  })
```

Update the mock at the top of `App.test.tsx` to include `activeTab` and `setActiveTab`:

```tsx
vi.mock('./store', () => ({
  useStore: () => ({
    project: null, modules: [], selectedModuleId: null,
    requirements: [], selectedRequirementId: null,
    activeTab: 'requirements' as const,
    setActiveTab: vi.fn(),
    loadProject: vi.fn(),
    loadArchitecture: vi.fn()
  })
}))
```

- [ ] **Step 2: Run tests — verify new tests fail**

```bash
npx vitest run src/renderer/src/App.test.tsx
```

Expected: FAIL — no tab bar rendered yet.

- [ ] **Step 3: Replace `src/renderer/src/App.tsx`**

```tsx
import { useEffect } from 'react'
import { useStore } from './store'
import ModuleTree from './components/ModuleTree'
import RequirementsList from './components/RequirementsList'
import RequirementDetail from './components/RequirementDetail'

export default function App(): JSX.Element {
  const { project, activeTab, setActiveTab, loadProject, loadArchitecture } = useStore()

  useEffect(() => { loadProject() }, [])

  useEffect(() => {
    if (activeTab === 'architecture' && project) loadArchitecture()
  }, [activeTab, project?.id])

  async function handleNewProject(): Promise<void> {
    const name = window.prompt('Project name:')
    if (!name?.trim()) return
    const p = await window.api.project.create(name.trim())
    if (p) loadProject()
  }

  async function handleOpen(): Promise<void> {
    const p = await window.api.project.open()
    if (p) loadProject()
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900">
      <header className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shrink-0">
        <span className="font-semibold text-sm tracking-wide text-gray-800">ReqArch Suite</span>
        {project && <span className="text-sm text-gray-400">{project.name}</span>}
        <div className="flex gap-2">
          <button onClick={handleOpen}
            className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-100">
            Open
          </button>
          <button onClick={handleNewProject}
            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">
            New Project
          </button>
        </div>
      </header>

      <div className="flex border-b border-gray-200 bg-white shrink-0 px-4">
        {(['requirements', 'architecture'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize transition-colors
              ${activeTab === tab
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {tab === 'requirements' ? 'Requirements' : 'Architecture'}
          </button>
        ))}
      </div>

      {activeTab === 'requirements' ? (
        <div className="flex flex-1 overflow-hidden">
          <aside data-testid="panel-modules"
            className="w-56 shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
            <ModuleTree />
          </aside>
          <main data-testid="panel-list"
            className="flex-1 overflow-y-auto border-r border-gray-200 bg-white">
            <RequirementsList />
          </main>
          <aside data-testid="panel-detail"
            className="w-80 shrink-0 overflow-y-auto bg-white border-l border-gray-100">
            <RequirementDetail />
          </aside>
        </div>
      ) : (
        <div data-testid="panel-architecture" className="flex flex-1 overflow-hidden">
          {/* ArchitectureCanvas wired in Task 25 */}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run all tests — verify they pass**

```bash
npx vitest run src/renderer/src/App.test.tsx
```

Expected: PASS — all tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/App.test.tsx
git commit -m "feat: add tab bar with Requirements and Architecture switching"
```

---

### Task 22: ArchitectureCanvas Component

**Files:**
- Install: `@xyflow/react`
- Create: `src/renderer/src/components/ArchitectureCanvas/BlockNode.tsx`
- Create: `src/renderer/src/components/ArchitectureCanvas/EdgeLabel.tsx`
- Create: `src/renderer/src/components/ArchitectureCanvas/index.tsx`
- Create: `src/renderer/src/components/ArchitectureCanvas/index.test.tsx`

**Interfaces:**
- Consumes: `useStore` — `project`, `elements`, `connections`, `selectedElementId`, `selectedConnectionId`, `addElement`, `updateElement`, `removeElement`, `addConnection`, `removeConnection`, `selectElement`, `selectConnection`
- Produces: `<ArchitectureCanvas />` — full-width React Flow canvas with toolbar; `BlockNode` custom node; `EdgeLabel` custom edge

React Flow is mocked in tests with `vi.mock('@xyflow/react', ...)` — see Step 1 below for the mock. The canvas itself is an integration of React Flow nodes/edges derived from the store's `elements` and `connections`.

**Coordinate system:** Store holds DB positions (`posX`, `posY`) in absolute canvas coordinates. React Flow nodes use `{ x, y }` position. Child nodes in React Flow use positions relative to their parent when `parentId` is set — this is handled in the node-building helper.

- [ ] **Step 1: Install React Flow**

```bash
npm install @xyflow/react
```

Expected: `@xyflow/react` appears in `package.json` dependencies.

- [ ] **Step 2: Write failing tests — `src/renderer/src/components/ArchitectureCanvas/index.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ArchitectureCanvas from './index'

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: any) => <div data-testid="react-flow">{children}</div>,
  ReactFlowProvider: ({ children }: any) => <>{children}</>,
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  useNodesState: () => [[], vi.fn(), vi.fn()],
  useEdgesState: () => [[], vi.fn(), vi.fn()],
  addEdge: vi.fn((edge, edges) => [...edges, edge]),
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  Handle: () => null,
  BaseEdge: () => null,
  EdgeLabelRenderer: ({ children }: any) => <>{children}</>,
  getBezierPath: () => ['', 0, 0]
}))

const mockAddElement = vi.fn().mockResolvedValue(undefined)
const mockSelectElement = vi.fn()
const mockSelectConnection = vi.fn()

vi.mock('../../store', () => ({
  useStore: () => ({
    project: { id: 1, name: 'Test', elemIdPrefix: 'SYS', elemIdPadding: 3, elemNextCounter: 1, connIdPrefix: 'ICN', connIdPadding: 4, connNextCounter: 1, createdAt: '', updatedAt: '' },
    elements: [],
    connections: [],
    elementTypes: [],
    selectedElementId: null,
    selectedConnectionId: null,
    addElement: mockAddElement,
    updateElement: vi.fn(),
    removeElement: vi.fn(),
    addConnection: vi.fn(),
    removeConnection: vi.fn(),
    selectElement: mockSelectElement,
    selectConnection: mockSelectConnection
  })
}))

describe('ArchitectureCanvas', () => {
  it('renders the canvas', () => {
    render(<ArchitectureCanvas />)
    expect(screen.getByTestId('react-flow')).toBeInTheDocument()
  })

  it('renders the + Block toolbar button', () => {
    render(<ArchitectureCanvas />)
    expect(screen.getByRole('button', { name: /\+ block/i })).toBeInTheDocument()
  })

  it('calls addElement when + Block is clicked', async () => {
    render(<ArchitectureCanvas />)
    await userEvent.click(screen.getByRole('button', { name: /\+ block/i }))
    expect(mockAddElement).toHaveBeenCalledWith({ projectId: 1, posX: expect.any(Number), posY: expect.any(Number) })
  })

  it('renders connection mode toggle button', () => {
    render(<ArchitectureCanvas />)
    expect(screen.getByRole('button', { name: /connect/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
npx vitest run src/renderer/src/components/ArchitectureCanvas/index.test.tsx
```

Expected: FAIL — `Cannot find module './index'`

- [ ] **Step 4: Create `src/renderer/src/components/ArchitectureCanvas/BlockNode.tsx`**

```tsx
import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

export type BlockNodeData = {
  label: string
  blockId: string
  color: string | null
  selected: boolean
}

export default memo(function BlockNode({ data }: NodeProps) {
  const d = data as BlockNodeData
  const bg = d.color ?? '#ffffff'
  return (
    <div
      style={{ background: bg, minWidth: 120 }}
      className={`px-3 py-2 rounded border text-sm select-none
        ${d.selected ? 'border-blue-500 ring-2 ring-blue-300' : 'border-gray-300'}`}
    >
      <div className="text-xs text-gray-400 font-mono mb-0.5">{d.blockId}</div>
      <div className="font-medium text-gray-800 truncate">{d.label || <span className="text-gray-300 italic">Unnamed</span>}</div>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-blue-400" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-blue-400" />
    </div>
  )
})
```

- [ ] **Step 5: Create `src/renderer/src/components/ArchitectureCanvas/EdgeLabel.tsx`**

```tsx
import { memo } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'

export default memo(function EdgeLabel({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, data, selected
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  const label = (data as any)?.label as string | undefined
  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{ stroke: selected ? '#3b82f6' : '#9ca3af', strokeWidth: selected ? 2 : 1.5 }} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'all' }}
            className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-xs text-gray-600 shadow-sm nodrag nopan"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})
```

- [ ] **Step 6: Create `src/renderer/src/components/ArchitectureCanvas/index.tsx`**

Note: All exports from `@xyflow/react` v12 are named exports — there is no default export. The CSS import path is `@xyflow/react/dist/style.css`. Connection mode works by showing handles on nodes; the user drags from a source handle to a target handle to create an edge (no `connectOnClick` prop exists in v12). Nesting via drag (spec §3) is stored in the DB via `parentId` — the drag-to-parent-detection UI is deferred to a future iteration; blocks can still be nested by updating `parentId` via the panel.

```tsx
import { useCallback, useState } from 'react'
import {
  ReactFlow, Background, Controls, ReactFlowProvider,
  useNodesState, useEdgesState, addEdge,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useStore } from '../../store'
import BlockNode, { type BlockNodeData } from './BlockNode'
import EdgeLabel from './EdgeLabel'

const nodeTypes = { block: BlockNode }
const edgeTypes = { labeled: EdgeLabel }

function elementToNode(el: import('../../../../../types').ArchitectureElement, selectedId: number | null): Node {
  return {
    id: String(el.id),
    type: 'block',
    position: { x: el.posX, y: el.posY },
    ...(el.parentId ? { parentId: String(el.parentId), extent: 'parent' as const } : {}),
    data: { label: el.name, blockId: el.blockId, color: el.color, selected: el.id === selectedId } satisfies BlockNodeData,
    style: { width: el.width, height: el.height }
  }
}

export default function ArchitectureCanvas(): JSX.Element {
  const {
    project, elements, connections, selectedElementId, selectedConnectionId,
    addElement, updateElement, removeElement, addConnection, removeConnection,
    selectElement, selectConnection
  } = useStore()

  const [nodes, setNodes, onNodesChange] = useNodesState(
    elements.map((el) => elementToNode(el, selectedElementId))
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    connections.map((c) => ({
      id: String(c.id),
      source: String(c.sourceId),
      target: String(c.targetId),
      type: 'labeled',
      data: { label: c.name ?? '' },
      selected: c.id === selectedConnectionId
    } satisfies Edge))
  )

  const [connectMode, setConnectMode] = useState(false)

  const onConnect = useCallback((params: Connection) => {
    if (!project) return
    addConnection({
      projectId: project.id,
      sourceId: Number(params.source),
      targetId: Number(params.target)
    })
    setEdges((eds) => addEdge(params, eds))
  }, [project, addConnection])

  function handleAddBlock(): void {
    if (!project) return
    addElement({ projectId: project.id, posX: 100 + Math.random() * 200, posY: 100 + Math.random() * 200 })
  }

  function onNodeClick(_: React.MouseEvent, node: Node): void {
    selectElement(Number(node.id))
  }

  function onEdgeClick(_: React.MouseEvent, edge: Edge): void {
    selectConnection(Number(edge.id))
  }

  function onPaneClick(): void {
    selectElement(null)
    selectConnection(null)
  }

  function onNodeDragStop(_: React.MouseEvent, node: Node): void {
    updateElement(Number(node.id), { posX: node.position.x, posY: node.position.y })
  }

  function onNodesDelete(deleted: Node[]): void {
    deleted.forEach((n) => removeElement(Number(n.id)))
  }

  function onEdgesDelete(deleted: Edge[]): void {
    deleted.forEach((e) => removeConnection(Number(e.id)))
  }

  return (
    <ReactFlowProvider>
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-200 shrink-0">
          <button
            onClick={handleAddBlock}
            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            + Block
          </button>
          <button
            onClick={() => setConnectMode((v) => !v)}
            className={`px-3 py-1.5 text-sm rounded border transition-colors
              ${connectMode ? 'bg-blue-50 border-blue-400 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            {connectMode ? 'Connecting…' : '+ Connect'}
          </button>
          {connectMode && (
            <span className="text-xs text-gray-400">Drag from a block handle to another block</span>
          )}
        </div>
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onNodeDragStop={onNodeDragStop}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            deleteKeyCode="Delete"
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
      </div>
    </ReactFlowProvider>
  )
}
```

- [ ] **Step 7: Run tests — verify they pass**

```bash
npx vitest run src/renderer/src/components/ArchitectureCanvas/index.test.tsx
```

Expected: PASS — 4 tests passing.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/ArchitectureCanvas/ package.json package-lock.json
git commit -m "feat: add ArchitectureCanvas with React Flow, BlockNode, and EdgeLabel"
```

---

### Task 23: ElementPanel Component

**Files:**
- Create: `src/renderer/src/components/ElementPanel/index.tsx`
- Create: `src/renderer/src/components/ElementPanel/index.test.tsx`

**Interfaces:**
- Consumes: `useStore` — `selectedElementId`, `elements`, `elementTypes`, `projectRequirements`, `updateElement`, `removeElement`, `addElementLink`, `removeElementLink`; `window.api.elementLinks.list`
- Produces: `<ElementPanel />` — 320px right panel for selected block; fields save on blur; requirement link picker

- [ ] **Step 1: Write failing tests — `src/renderer/src/components/ElementPanel/index.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ElementPanel from './index'

const mockUpdateElement = vi.fn().mockResolvedValue(undefined)
const mockRemoveElement = vi.fn().mockResolvedValue(undefined)
const mockAddElementLink = vi.fn().mockResolvedValue(undefined)
const mockRemoveElementLink = vi.fn().mockResolvedValue(undefined)

vi.stubGlobal('window', {
  api: {
    elementLinks: { list: vi.fn().mockResolvedValue([]) }
  }
})

vi.mock('../../store', () => ({
  useStore: () => ({
    selectedElementId: 1,
    elements: [{
      id: 1, projectId: 1, parentId: null, blockId: 'SYS-001', name: 'Propulsion',
      elementTypeId: null, description: 'Main engine', color: null,
      posX: 100, posY: 100, width: 160, height: 80,
      deletedAt: null, createdAt: '', updatedAt: ''
    }],
    elementTypes: [
      { id: 1, projectId: 1, name: 'System', color: null, isBuiltIn: true, deletedAt: null, createdAt: '', updatedAt: '' }
    ],
    projectRequirements: [
      { id: 1, moduleId: 1, reqId: 'SRS-0001', text: 'The system shall thrust', acceptanceCriteria: null, source: null, rationale: null, position: 0, deletedAt: null, createdAt: '', updatedAt: '' }
    ],
    updateElement: mockUpdateElement,
    removeElement: mockRemoveElement,
    addElementLink: mockAddElementLink,
    removeElementLink: mockRemoveElementLink
  })
}))

describe('ElementPanel', () => {
  beforeEach(() => {
    mockUpdateElement.mockClear()
    mockRemoveElement.mockClear()
  })

  it('renders block ID read-only', () => {
    render(<ElementPanel />)
    expect(screen.getByText('SYS-001')).toBeInTheDocument()
  })

  it('renders name field with current value', () => {
    render(<ElementPanel />)
    expect(screen.getByDisplayValue('Propulsion')).toBeInTheDocument()
  })

  it('calls updateElement on name field blur', async () => {
    render(<ElementPanel />)
    const field = screen.getByDisplayValue('Propulsion')
    await userEvent.clear(field)
    await userEvent.type(field, 'Engine')
    fireEvent.blur(field)
    await waitFor(() => expect(mockUpdateElement).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'Engine' })))
  })

  it('renders description field', () => {
    render(<ElementPanel />)
    expect(screen.getByDisplayValue('Main engine')).toBeInTheDocument()
  })

  it('renders type dropdown', () => {
    render(<ElementPanel />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run src/renderer/src/components/ElementPanel/index.test.tsx
```

Expected: FAIL — `Cannot find module './index'`

- [ ] **Step 3: Create `src/renderer/src/components/ElementPanel/index.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { useStore } from '../../store'

export default function ElementPanel(): JSX.Element {
  const {
    selectedElementId, elements, elementTypes, projectRequirements,
    updateElement, removeElement, addElementLink, removeElementLink
  } = useStore()
  const el = elements.find((e) => e.id === selectedElementId) ?? null

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('')
  const [elementTypeId, setElementTypeId] = useState<number | null>(null)
  const [linkedReqIds, setLinkedReqIds] = useState<number[]>([])
  const [reqSearch, setReqSearch] = useState('')

  useEffect(() => {
    if (!el) return
    setName(el.name)
    setDescription(el.description ?? '')
    setColor(el.color ?? '')
    setElementTypeId(el.elementTypeId)
    window.api.elementLinks.list(el.id).then((reqs) => setLinkedReqIds(reqs.map((r) => r.id)))
  }, [el?.id])

  if (!el) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        Select a block to view properties.
      </div>
    )
  }

  function save(): void {
    updateElement(el!.id, {
      name,
      description: description || null,
      color: color || null,
      elementTypeId
    })
  }

  async function toggleLink(reqId: number): Promise<void> {
    if (linkedReqIds.includes(reqId)) {
      await removeElementLink(el!.id, reqId)
      setLinkedReqIds((ids) => ids.filter((id) => id !== reqId))
    } else {
      await addElementLink(el!.id, reqId)
      setLinkedReqIds((ids) => [...ids, reqId])
    }
  }

  const filteredReqs = projectRequirements.filter((r) =>
    reqSearch === '' ||
    r.reqId.toLowerCase().includes(reqSearch.toLowerCase()) ||
    r.text.toLowerCase().includes(reqSearch.toLowerCase())
  )

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between shrink-0">
        <span className="text-xs font-mono text-gray-400">{el.blockId}</span>
        <button onClick={() => removeElement(el.id)}
          className="text-xs text-red-400 hover:text-red-600">Delete</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={save}
            className="w-full px-3 py-2 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </Field>
        <Field label="Type">
          <select
            value={elementTypeId ?? ''}
            onChange={(e) => { setElementTypeId(e.target.value ? Number(e.target.value) : null); save() }}
            className="w-full px-3 py-2 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">— None —</option>
            {elementTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} onBlur={save} rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </Field>
        <Field label="Color">
          <input type="color" value={color || '#ffffff'} onChange={(e) => setColor(e.target.value)} onBlur={save}
            className="h-9 w-full rounded border border-gray-200 cursor-pointer" />
        </Field>
        <Field label="Requirements">
          <input
            placeholder="Filter by ID or text…"
            value={reqSearch}
            onChange={(e) => setReqSearch(e.target.value)}
            className="w-full px-3 py-1.5 mb-2 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {filteredReqs.map((r) => {
              const linked = linkedReqIds.includes(r.id)
              return (
                <div key={r.id} onClick={() => toggleLink(r.id)}
                  className={`flex items-start gap-2 px-2 py-1.5 rounded cursor-pointer text-xs
                    ${linked ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}`}>
                  <span className="font-mono shrink-0">{r.reqId}</span>
                  <span className="line-clamp-1 text-gray-500">{r.text}</span>
                  {linked && <span className="ml-auto shrink-0">✓</span>}
                </div>
              )
            })}
            {filteredReqs.length === 0 && (
              <div className="text-gray-400 text-xs px-2">No requirements match.</div>
            )}
          </div>
        </Field>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</label>
      {children}
    </div>
  )
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run src/renderer/src/components/ElementPanel/index.test.tsx
```

Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ElementPanel/
git commit -m "feat: add ElementPanel with fields, type dropdown, and requirement link picker"
```

---

### Task 24: ConnectionPanel Component

**Files:**
- Create: `src/renderer/src/components/ConnectionPanel/index.tsx`
- Create: `src/renderer/src/components/ConnectionPanel/index.test.tsx`

**Interfaces:**
- Consumes: `useStore` — `selectedConnectionId`, `connections`, `connectionTypes`, `projectRequirements`, `updateConnection`, `removeConnection`, `addConnectionLink`, `removeConnectionLink`; `window.api.connectionLinks.list`
- Produces: `<ConnectionPanel />` — properties panel for selected connection; fields save on blur; requirement link picker

- [ ] **Step 1: Write failing tests — `src/renderer/src/components/ConnectionPanel/index.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConnectionPanel from './index'

const mockUpdateConnection = vi.fn().mockResolvedValue(undefined)
const mockRemoveConnection = vi.fn().mockResolvedValue(undefined)

vi.stubGlobal('window', {
  api: {
    connectionLinks: { list: vi.fn().mockResolvedValue([]) }
  }
})

vi.mock('../../store', () => ({
  useStore: () => ({
    selectedConnectionId: 1,
    connections: [{
      id: 1, projectId: 1, connId: 'ICN-0001', sourceId: 1, targetId: 2,
      name: 'Power bus', connectionTypeId: null, description: '28V DC',
      deletedAt: null, createdAt: '', updatedAt: ''
    }],
    connectionTypes: [
      { id: 1, projectId: 1, name: 'Power', color: null, isBuiltIn: true, deletedAt: null, createdAt: '', updatedAt: '' }
    ],
    projectRequirements: [],
    updateConnection: mockUpdateConnection,
    removeConnection: mockRemoveConnection,
    addConnectionLink: vi.fn(),
    removeConnectionLink: vi.fn()
  })
}))

describe('ConnectionPanel', () => {
  beforeEach(() => mockUpdateConnection.mockClear())

  it('renders connection ID read-only', () => {
    render(<ConnectionPanel />)
    expect(screen.getByText('ICN-0001')).toBeInTheDocument()
  })

  it('renders name field with current value', () => {
    render(<ConnectionPanel />)
    expect(screen.getByDisplayValue('Power bus')).toBeInTheDocument()
  })

  it('calls updateConnection on name blur', async () => {
    render(<ConnectionPanel />)
    const field = screen.getByDisplayValue('Power bus')
    await userEvent.clear(field)
    await userEvent.type(field, 'Control bus')
    fireEvent.blur(field)
    await waitFor(() => expect(mockUpdateConnection).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'Control bus' })))
  })

  it('renders description field', () => {
    render(<ConnectionPanel />)
    expect(screen.getByDisplayValue('28V DC')).toBeInTheDocument()
  })

  it('renders type dropdown', () => {
    render(<ConnectionPanel />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run src/renderer/src/components/ConnectionPanel/index.test.tsx
```

Expected: FAIL — `Cannot find module './index'`

- [ ] **Step 3: Create `src/renderer/src/components/ConnectionPanel/index.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { useStore } from '../../store'

export default function ConnectionPanel(): JSX.Element {
  const {
    selectedConnectionId, connections, connectionTypes, projectRequirements,
    updateConnection, removeConnection, addConnectionLink, removeConnectionLink
  } = useStore()
  const conn = connections.find((c) => c.id === selectedConnectionId) ?? null

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [connectionTypeId, setConnectionTypeId] = useState<number | null>(null)
  const [linkedReqIds, setLinkedReqIds] = useState<number[]>([])
  const [reqSearch, setReqSearch] = useState('')

  useEffect(() => {
    if (!conn) return
    setName(conn.name ?? '')
    setDescription(conn.description ?? '')
    setConnectionTypeId(conn.connectionTypeId)
    window.api.connectionLinks.list(conn.id).then((reqs) => setLinkedReqIds(reqs.map((r) => r.id)))
  }, [conn?.id])

  if (!conn) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        Select a connection to view properties.
      </div>
    )
  }

  function save(): void {
    updateConnection(conn!.id, {
      name: name || null,
      description: description || null,
      connectionTypeId
    })
  }

  async function toggleLink(reqId: number): Promise<void> {
    if (linkedReqIds.includes(reqId)) {
      await removeConnectionLink(conn!.id, reqId)
      setLinkedReqIds((ids) => ids.filter((id) => id !== reqId))
    } else {
      await addConnectionLink(conn!.id, reqId)
      setLinkedReqIds((ids) => [...ids, reqId])
    }
  }

  const filteredReqs = projectRequirements.filter((r) =>
    reqSearch === '' ||
    r.reqId.toLowerCase().includes(reqSearch.toLowerCase()) ||
    r.text.toLowerCase().includes(reqSearch.toLowerCase())
  )

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between shrink-0">
        <span className="text-xs font-mono text-gray-400">{conn.connId}</span>
        <button onClick={() => removeConnection(conn.id)}
          className="text-xs text-red-400 hover:text-red-600">Delete</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={save}
            className="w-full px-3 py-2 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </Field>
        <Field label="Type">
          <select
            value={connectionTypeId ?? ''}
            onChange={(e) => { setConnectionTypeId(e.target.value ? Number(e.target.value) : null); save() }}
            className="w-full px-3 py-2 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">— None —</option>
            {connectionTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} onBlur={save} rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </Field>
        <Field label="Requirements">
          <input
            placeholder="Filter by ID or text…"
            value={reqSearch}
            onChange={(e) => setReqSearch(e.target.value)}
            className="w-full px-3 py-1.5 mb-2 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {filteredReqs.map((r) => {
              const linked = linkedReqIds.includes(r.id)
              return (
                <div key={r.id} onClick={() => toggleLink(r.id)}
                  className={`flex items-start gap-2 px-2 py-1.5 rounded cursor-pointer text-xs
                    ${linked ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}`}>
                  <span className="font-mono shrink-0">{r.reqId}</span>
                  <span className="line-clamp-1 text-gray-500">{r.text}</span>
                  {linked && <span className="ml-auto shrink-0">✓</span>}
                </div>
              )
            })}
            {filteredReqs.length === 0 && (
              <div className="text-gray-400 text-xs px-2">No requirements match.</div>
            )}
          </div>
        </Field>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</label>
      {children}
    </div>
  )
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run src/renderer/src/components/ConnectionPanel/index.test.tsx
```

Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ConnectionPanel/
git commit -m "feat: add ConnectionPanel with fields, type dropdown, and requirement link picker"
```

---

### Task 25: Wire Architecture Tab into App.tsx

**Files:**
- Modify: `src/renderer/src/App.tsx` — replace architecture placeholder with canvas + panels
- Modify: `src/renderer/src/App.test.tsx` — add architecture tab rendering test

**Interfaces:**
- Consumes: `ArchitectureCanvas` from `./components/ArchitectureCanvas`; `ElementPanel` from `./components/ElementPanel`; `ConnectionPanel` from `./components/ConnectionPanel`; `useStore` — `selectedElementId`, `selectedConnectionId`
- Produces: Full Architecture tab layout — canvas fills remaining width, 320px properties panel slides in on the right when an element or connection is selected

- [ ] **Step 1: Add failing test to `src/renderer/src/App.test.tsx`**

Add a new `describe` block (the existing mock needs `activeTab` set to `'architecture'` for this test, so use a separate describe with its own mock):

```tsx
describe('App — architecture tab', () => {
  it('renders architecture panel when tab is architecture', () => {
    vi.mock('./store', () => ({
      useStore: () => ({
        project: null, modules: [], selectedModuleId: null,
        requirements: [], selectedRequirementId: null,
        activeTab: 'architecture' as const,
        setActiveTab: vi.fn(),
        loadProject: vi.fn(),
        loadArchitecture: vi.fn(),
        elements: [], connections: [],
        selectedElementId: null, selectedConnectionId: null
      })
    }))
    render(<App />)
    expect(screen.getByTestId('panel-architecture')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test — verify it fails (or passes already from Task 21)**

```bash
npx vitest run src/renderer/src/App.test.tsx
```

Expected: PASS if the `panel-architecture` testid is already present from Task 21. No new failures.

- [ ] **Step 3: Update `src/renderer/src/App.tsx`**

Add imports at the top:

```tsx
import ArchitectureCanvas from './components/ArchitectureCanvas'
import ElementPanel from './components/ElementPanel'
import ConnectionPanel from './components/ConnectionPanel'
```

Also destructure these from `useStore`:

```tsx
const { project, activeTab, setActiveTab, loadProject, loadArchitecture, selectedElementId, selectedConnectionId } = useStore()
```

Replace the architecture branch:

```tsx
      ) : (
        <div data-testid="panel-architecture" className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <ArchitectureCanvas />
          </div>
          {(selectedElementId !== null || selectedConnectionId !== null) && (
            <aside className="w-80 shrink-0 border-l border-gray-200 bg-white overflow-y-auto">
              {selectedElementId !== null ? <ElementPanel /> : <ConnectionPanel />}
            </aside>
          )}
        </div>
      )}
```

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: PASS — all tests passing across all files.

- [ ] **Step 5: Run the app and verify the golden path**

```bash
npm run dev
```

Golden path:
1. Open or create a project
2. Click the **Architecture** tab — blank canvas appears
3. Click **+ Block** — a new block appears on the canvas (e.g. `SYS-001`)
4. Click the block — right properties panel opens with name, type, description, color fields
5. Type a name (e.g. `Engine`) — click away — name updates on the block
6. Add a second block — click **+ Connect** to enter connection mode
7. Drag from one block's right handle to another's left handle — an edge appears
8. Click the edge — properties panel switches to connection view
9. Switch to **Requirements** tab and back — canvas state preserved
10. Close and reopen the app — blocks, connections, and names persist

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/App.test.tsx
git commit -m "feat: wire architecture canvas, element panel, and connection panel into app"
```
