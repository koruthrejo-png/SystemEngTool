# Requirements Management Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working 3-panel requirements management module — module tree, requirements list, and detail panel — backed by a local SQLite file, in a fresh Electron + React + TypeScript project.

**Architecture:** Layered Electron app. React renderer sends typed messages through a preload bridge (`window.api`) to main-process handlers that query SQLite via `better-sqlite3`. The renderer never touches the database directly. State lives in a Zustand store.

**Tech Stack:** Electron 28+, React 18, TypeScript 5 (strict), Vite via `electron-vite`, Tailwind CSS 3, Zustand 4, `better-sqlite3`, Vitest, React Testing Library

## Global Constraints
- All TypeScript files use strict mode
- No direct DB calls from the renderer process — only through `window.api`
- `req_id` is generated only in the main process, never in the renderer
- Soft delete only — `deleted_at` timestamp, no hard deletes in normal use
- Project files use the `.reqarch` extension
- Main/handler tests run in Node environment; renderer/component tests run in jsdom

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `electron.vite.config.ts`
- Create: `tailwind.config.js`
- Create: `postcss.config.js`
- Create: `vitest.config.ts`
- Create: `src/renderer/test-setup.ts`
- Create: `src/renderer/index.html`

**Interfaces:**
- Produces: A running Electron dev server with React renderer and Tailwind CSS available

- [ ] **Step 1: Scaffold with electron-vite in the project directory**

```bash
cd /Users/rejopckoruth/Documents
# This creates/overwrites ReqArch2 with the scaffold.
# If ReqArch2 already has files you want to keep, move them first.
npm create @quick-start/electron@latest ReqArch2 -- --template react-ts
cd ReqArch2
npm install
```

- [ ] **Step 2: Install additional dependencies**

```bash
npm install better-sqlite3 zustand
npm install --save-dev @types/better-sqlite3 \
  tailwindcss postcss autoprefixer \
  vitest @vitest/coverage-v8 \
  @testing-library/react @testing-library/user-event @testing-library/jest-dom \
  jsdom
```

- [ ] **Step 3: Create `tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  theme: { extend: {} },
  plugins: []
}
```

- [ ] **Step 4: Create `postcss.config.js`**

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} }
}
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environmentMatchGlobs: [
      ['src/renderer/**', 'jsdom'],
      ['src/main/**', 'node'],
      ['src/preload/**', 'node']
    ],
    setupFiles: ['src/renderer/test-setup.ts']
  }
})
```

- [ ] **Step 6: Create `src/renderer/test-setup.ts`**

```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 7: Add Tailwind directives**

Add to `src/renderer/src/assets/main.css` (replace its contents):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 8: Verify dev server starts**

```bash
npm run dev
```

Expected: Electron window opens showing the default Vite+React screen.

- [ ] **Step 9: Commit**

```bash
git add .
git commit -m "feat: scaffold electron-vite react-ts project with tailwind and vitest"
```

---

### Task 2: Shared TypeScript Types

**Files:**
- Create: `src/types/index.ts`

**Interfaces:**
- Produces: `Project`, `Module`, `Requirement`, `CreateModuleInput`, `UpdateModuleInput`, `CreateRequirementInput`, `UpdateRequirementInput` — imported by all layers

- [ ] **Step 1: Create `src/types/index.ts`**

```ts
export interface Project {
  id: number
  name: string
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No output (clean compile).

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add shared TypeScript types for all layers"
```

---

### Task 3: Database Connection & Migrations

**Files:**
- Create: `src/main/db/connection.ts`
- Create: `src/main/db/migrations.ts`
- Create: `src/main/db/migrations.test.ts`

**Interfaces:**
- Consumes: `better-sqlite3`
- Produces:
  - `openDatabase(filePath: string): Database.Database`
  - `getDatabase(): Database.Database`
  - `closeDatabase(): void`
  - `runMigrations(db: Database.Database): void`

- [ ] **Step 1: Write the failing test — `src/main/db/migrations.test.ts`**

```ts
import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { runMigrations } from './migrations'

describe('runMigrations', () => {
  let tempDir: string
  let db: Database.Database

  afterEach(() => {
    db?.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('creates projects, modules, and requirements tables', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    db = new Database(join(tempDir, 'test.reqarch'))
    runMigrations(db)

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name)

    expect(tables).toContain('projects')
    expect(tables).toContain('modules')
    expect(tables).toContain('requirements')
  })

  it('is idempotent — running twice does not throw', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    db = new Database(join(tempDir, 'test.reqarch'))
    expect(() => { runMigrations(db); runMigrations(db) }).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx vitest run src/main/db/migrations.test.ts
```

Expected: FAIL — `Cannot find module './migrations'`

- [ ] **Step 3: Create `src/main/db/migrations.ts`**

```ts
import Database from 'better-sqlite3'

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
  `)
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npx vitest run src/main/db/migrations.test.ts
```

Expected: PASS — 2 tests passing

- [ ] **Step 5: Create `src/main/db/connection.ts`**

```ts
import Database from 'better-sqlite3'
import { runMigrations } from './migrations'

let _db: Database.Database | null = null

export function openDatabase(filePath: string): Database.Database {
  if (_db) _db.close()
  _db = new Database(filePath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  runMigrations(_db)
  return _db
}

export function getDatabase(): Database.Database {
  if (!_db) throw new Error('No database is open')
  return _db
}

export function closeDatabase(): void {
  _db?.close()
  _db = null
}
```

- [ ] **Step 6: Commit**

```bash
git add src/main/db/
git commit -m "feat: add SQLite connection and schema migrations"
```

---

### Task 4: Project Handler

**Files:**
- Create: `src/main/settings.ts`
- Create: `src/main/handlers/projects.ts`
- Create: `src/main/handlers/projects.test.ts`

**Interfaces:**
- Consumes: `openDatabase`, `getDatabase`, `closeDatabase` from `../db/connection`; `Project` from `../../types`
- Produces:
  - `createProject(name: string): Project`
  - `getFirstProject(): Project | null`
  - `registerProjectHandlers(): void`
  - IPC channels: `project:create`, `project:open`, `project:getCurrent`

- [ ] **Step 1: Create `src/main/settings.ts`**

```ts
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

let settingsPath = ''

export function initSettings(userDataPath: string): void {
  settingsPath = join(userDataPath, 'settings.json')
}

function read(): Record<string, unknown> {
  if (!settingsPath || !existsSync(settingsPath)) return {}
  try { return JSON.parse(readFileSync(settingsPath, 'utf-8')) } catch { return {} }
}

function write(data: Record<string, unknown>): void {
  writeFileSync(settingsPath, JSON.stringify(data, null, 2), 'utf-8')
}

export function getLastProjectPath(): string | null {
  return (read().lastProjectPath as string) ?? null
}

export function setLastProjectPath(filePath: string): void {
  write({ ...read(), lastProjectPath: filePath })
}
```

- [ ] **Step 2: Write failing tests — `src/main/handlers/projects.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase, closeDatabase } from '../db/connection'
import { createProject, getFirstProject } from './projects'

describe('project handlers', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    openDatabase(join(tempDir, 'test.reqarch'))
  })

  afterEach(() => {
    closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('createProject inserts a row and returns a Project', () => {
    const project = createProject('My Project')
    expect(project.id).toBeGreaterThan(0)
    expect(project.name).toBe('My Project')
    expect(project.createdAt).toBeTruthy()
  })

  it('getFirstProject returns the project after creation', () => {
    createProject('Test')
    const fetched = getFirstProject()
    expect(fetched?.name).toBe('Test')
  })
})
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
npx vitest run src/main/handlers/projects.test.ts
```

Expected: FAIL — `Cannot find module './projects'`

- [ ] **Step 4: Create `src/main/handlers/projects.ts`**

```ts
import { ipcMain, app, dialog } from 'electron'
import { openDatabase, getDatabase } from '../db/connection'
import { initSettings, getLastProjectPath, setLastProjectPath } from '../settings'
import type { Project } from '../../types'

function now(): string { return new Date().toISOString() }

function rowToProject(row: any): Project {
  return { id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at }
}

export function createProject(name: string): Project {
  const db = getDatabase()
  const ts = now()
  const result = db
    .prepare('INSERT INTO projects (name, created_at, updated_at) VALUES (?, ?, ?)')
    .run(name, ts, ts)
  return { id: result.lastInsertRowid as number, name, createdAt: ts, updatedAt: ts }
}

export function getFirstProject(): Project | null {
  const row = getDatabase().prepare('SELECT * FROM projects ORDER BY id LIMIT 1').get() as any
  return row ? rowToProject(row) : null
}

export function registerProjectHandlers(): void {
  initSettings(app.getPath('userData'))

  ipcMain.handle('project:create', async (_e, name: string) => {
    const { filePath } = await dialog.showSaveDialog({
      defaultPath: `${name}.reqarch`,
      filters: [{ name: 'ReqArch Project', extensions: ['reqarch'] }]
    })
    if (!filePath) return null
    openDatabase(filePath)
    const project = createProject(name)
    setLastProjectPath(filePath)
    return project
  })

  ipcMain.handle('project:open', async () => {
    const { filePaths } = await dialog.showOpenDialog({
      filters: [{ name: 'ReqArch Project', extensions: ['reqarch'] }],
      properties: ['openFile']
    })
    if (!filePaths[0]) return null
    openDatabase(filePaths[0])
    setLastProjectPath(filePaths[0])
    return getFirstProject()
  })

  ipcMain.handle('project:getCurrent', async () => {
    const lastPath = getLastProjectPath()
    if (!lastPath) return null
    try { openDatabase(lastPath); return getFirstProject() } catch { return null }
  })
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
npx vitest run src/main/handlers/projects.test.ts
```

Expected: PASS — 2 tests passing

- [ ] **Step 6: Commit**

```bash
git add src/main/settings.ts src/main/handlers/projects.ts src/main/handlers/projects.test.ts
git commit -m "feat: add project handler with create/open/getCurrent IPC"
```

---

### Task 5: Modules Handler

**Files:**
- Create: `src/main/handlers/modules.ts`
- Create: `src/main/handlers/modules.test.ts`

**Interfaces:**
- Consumes: `getDatabase` from `../db/connection`; `Module`, `CreateModuleInput`, `UpdateModuleInput` from `../../types`; `createProject` from `./projects` (tests only)
- Produces:
  - `listModules(projectId: number): Module[]`
  - `createModule(input: CreateModuleInput): Module`
  - `updateModule(id: number, input: UpdateModuleInput): Module`
  - `deleteModule(id: number): void`
  - `restoreModule(id: number): void`
  - `registerModuleHandlers(): void`
  - IPC channels: `modules:list`, `modules:create`, `modules:update`, `modules:delete`, `modules:restore`

- [ ] **Step 1: Write failing tests — `src/main/handlers/modules.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase, closeDatabase } from '../db/connection'
import { createProject } from './projects'
import { listModules, createModule, updateModule, deleteModule, restoreModule } from './modules'

describe('modules handler', () => {
  let tempDir: string
  let projectId: number

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    openDatabase(join(tempDir, 'test.reqarch'))
    projectId = createProject('Test Project').id
  })

  afterEach(() => {
    closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('createModule returns a module with correct fields', () => {
    const mod = createModule({ projectId, parentId: null, name: 'SRS', idPrefix: 'SRS', idPadding: 4 })
    expect(mod.id).toBeGreaterThan(0)
    expect(mod.name).toBe('SRS')
    expect(mod.idPrefix).toBe('SRS')
    expect(mod.idPadding).toBe(4)
    expect(mod.nextCounter).toBe(1)
    expect(mod.deletedAt).toBeNull()
  })

  it('listModules returns only active modules', () => {
    createModule({ projectId, parentId: null, name: 'SRS', idPrefix: 'SRS', idPadding: 4 })
    const m2 = createModule({ projectId, parentId: null, name: 'HRS', idPrefix: 'HRS', idPadding: 4 })
    deleteModule(m2.id)
    const modules = listModules(projectId)
    expect(modules).toHaveLength(1)
    expect(modules[0].name).toBe('SRS')
  })

  it('updateModule changes the name', () => {
    const mod = createModule({ projectId, parentId: null, name: 'SRS', idPrefix: 'SRS', idPadding: 4 })
    const updated = updateModule(mod.id, { name: 'System Requirements' })
    expect(updated.name).toBe('System Requirements')
  })

  it('restoreModule makes a deleted module active again', () => {
    const mod = createModule({ projectId, parentId: null, name: 'SRS', idPrefix: 'SRS', idPadding: 4 })
    deleteModule(mod.id)
    expect(listModules(projectId)).toHaveLength(0)
    restoreModule(mod.id)
    expect(listModules(projectId)).toHaveLength(1)
  })

  it('supports nested modules via parentId', () => {
    const parent = createModule({ projectId, parentId: null, name: 'System', idPrefix: 'SYS', idPadding: 4 })
    const child = createModule({ projectId, parentId: parent.id, name: 'SRS', idPrefix: 'SRS', idPadding: 4 })
    expect(child.parentId).toBe(parent.id)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run src/main/handlers/modules.test.ts
```

Expected: FAIL — `Cannot find module './modules'`

- [ ] **Step 3: Create `src/main/handlers/modules.ts`**

```ts
import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import type { Module, CreateModuleInput, UpdateModuleInput } from '../../types'

function now(): string { return new Date().toISOString() }

function rowToModule(row: any): Module {
  return {
    id: row.id, projectId: row.project_id, parentId: row.parent_id ?? null,
    name: row.name, idPrefix: row.id_prefix, idPadding: row.id_padding,
    nextCounter: row.next_counter, position: row.position,
    deletedAt: row.deleted_at ?? null, createdAt: row.created_at, updatedAt: row.updated_at
  }
}

export function listModules(projectId: number): Module[] {
  return (getDatabase()
    .prepare('SELECT * FROM modules WHERE project_id = ? AND deleted_at IS NULL ORDER BY position, id')
    .all(projectId) as any[]).map(rowToModule)
}

export function createModule(input: CreateModuleInput): Module {
  const db = getDatabase()
  const ts = now()
  const result = db.prepare(`
    INSERT INTO modules (project_id, parent_id, name, id_prefix, id_padding, next_counter, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)
  `).run(input.projectId, input.parentId ?? null, input.name, input.idPrefix, input.idPadding, ts, ts)
  return rowToModule(db.prepare('SELECT * FROM modules WHERE id = ?').get(result.lastInsertRowid))
}

export function updateModule(id: number, input: UpdateModuleInput): Module {
  const db = getDatabase()
  db.prepare('UPDATE modules SET name = ?, updated_at = ? WHERE id = ?').run(input.name, now(), id)
  return rowToModule(db.prepare('SELECT * FROM modules WHERE id = ?').get(id))
}

export function deleteModule(id: number): void {
  const ts = now()
  getDatabase().prepare('UPDATE modules SET deleted_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id)
}

export function restoreModule(id: number): void {
  getDatabase().prepare('UPDATE modules SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(now(), id)
}

export function registerModuleHandlers(): void {
  ipcMain.handle('modules:list', (_e, projectId: number) => listModules(projectId))
  ipcMain.handle('modules:create', (_e, input: CreateModuleInput) => createModule(input))
  ipcMain.handle('modules:update', (_e, id: number, input: UpdateModuleInput) => updateModule(id, input))
  ipcMain.handle('modules:delete', (_e, id: number) => deleteModule(id))
  ipcMain.handle('modules:restore', (_e, id: number) => restoreModule(id))
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run src/main/handlers/modules.test.ts
```

Expected: PASS — 5 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/main/handlers/modules.ts src/main/handlers/modules.test.ts
git commit -m "feat: add modules handler with CRUD and soft delete"
```

---

### Task 6: Requirements Handler

**Files:**
- Create: `src/main/handlers/requirements.ts`
- Create: `src/main/handlers/requirements.test.ts`

**Interfaces:**
- Consumes: `getDatabase`; `Requirement`, `CreateRequirementInput`, `UpdateRequirementInput` from `../../types`; `createProject`, `createModule` (tests only)
- Produces:
  - `listRequirements(moduleId: number): Requirement[]`
  - `createRequirement(input: CreateRequirementInput): Requirement`
  - `updateRequirement(id: number, input: UpdateRequirementInput): Requirement`
  - `deleteRequirement(id: number): void`
  - `restoreRequirement(id: number): void`
  - `registerRequirementHandlers(): void`
  - IPC channels: `requirements:list`, `requirements:create`, `requirements:update`, `requirements:delete`, `requirements:restore`

- [ ] **Step 1: Write failing tests — `src/main/handlers/requirements.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase, closeDatabase } from '../db/connection'
import { createProject } from './projects'
import { createModule } from './modules'
import { listRequirements, createRequirement, updateRequirement, deleteRequirement, restoreRequirement } from './requirements'

describe('requirements handler', () => {
  let tempDir: string
  let moduleId: number

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    openDatabase(join(tempDir, 'test.reqarch'))
    const project = createProject('Test')
    moduleId = createModule({ projectId: project.id, parentId: null, name: 'SRS', idPrefix: 'SRS', idPadding: 4 }).id
  })

  afterEach(() => {
    closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('createRequirement generates req_id from module counter', () => {
    const req = createRequirement({ moduleId, text: 'The system shall do X' })
    expect(req.reqId).toBe('SRS-0001')
    expect(req.text).toBe('The system shall do X')
  })

  it('increments the counter for each new requirement', () => {
    expect(createRequirement({ moduleId, text: 'First' }).reqId).toBe('SRS-0001')
    expect(createRequirement({ moduleId, text: 'Second' }).reqId).toBe('SRS-0002')
  })

  it('counter does not reuse IDs after soft delete', () => {
    const r1 = createRequirement({ moduleId, text: 'First' })
    deleteRequirement(r1.id)
    expect(createRequirement({ moduleId, text: 'Second' }).reqId).toBe('SRS-0002')
  })

  it('listRequirements returns only active requirements', () => {
    const r1 = createRequirement({ moduleId, text: 'Keep me' })
    const r2 = createRequirement({ moduleId, text: 'Delete me' })
    deleteRequirement(r2.id)
    const list = listRequirements(moduleId)
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(r1.id)
  })

  it('updateRequirement changes text and optional fields', () => {
    const req = createRequirement({ moduleId, text: 'Original' })
    const updated = updateRequirement(req.id, { text: 'Updated', source: 'Spec v2' })
    expect(updated.text).toBe('Updated')
    expect(updated.source).toBe('Spec v2')
    expect(updated.reqId).toBe(req.reqId)
  })

  it('restoreRequirement makes a deleted requirement visible again', () => {
    const req = createRequirement({ moduleId, text: 'Test' })
    deleteRequirement(req.id)
    expect(listRequirements(moduleId)).toHaveLength(0)
    restoreRequirement(req.id)
    expect(listRequirements(moduleId)).toHaveLength(1)
  })

  it('stores all optional fields', () => {
    const req = createRequirement({
      moduleId, text: 'The system shall...',
      acceptanceCriteria: 'Tested by inspection',
      source: 'Customer spec',
      rationale: 'Safety requirement'
    })
    expect(req.acceptanceCriteria).toBe('Tested by inspection')
    expect(req.source).toBe('Customer spec')
    expect(req.rationale).toBe('Safety requirement')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run src/main/handlers/requirements.test.ts
```

Expected: FAIL — `Cannot find module './requirements'`

- [ ] **Step 3: Create `src/main/handlers/requirements.ts`**

```ts
import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import type { Requirement, CreateRequirementInput, UpdateRequirementInput } from '../../types'

function now(): string { return new Date().toISOString() }

function rowToRequirement(row: any): Requirement {
  return {
    id: row.id, moduleId: row.module_id, reqId: row.req_id, text: row.text,
    acceptanceCriteria: row.acceptance_criteria ?? null,
    source: row.source ?? null, rationale: row.rationale ?? null,
    position: row.position, deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at, updatedAt: row.updated_at
  }
}

export function listRequirements(moduleId: number): Requirement[] {
  return (getDatabase()
    .prepare('SELECT * FROM requirements WHERE module_id = ? AND deleted_at IS NULL ORDER BY position, id')
    .all(moduleId) as any[]).map(rowToRequirement)
}

export function createRequirement(input: CreateRequirementInput): Requirement {
  const db = getDatabase()
  const ts = now()

  const row = db.transaction(() => {
    const mod = db.prepare('SELECT id_prefix, id_padding, next_counter FROM modules WHERE id = ?').get(input.moduleId) as any
    if (!mod) throw new Error(`Module ${input.moduleId} not found`)
    const reqId = `${mod.id_prefix}-${String(mod.next_counter).padStart(mod.id_padding, '0')}`
    db.prepare('UPDATE modules SET next_counter = ?, updated_at = ? WHERE id = ?')
      .run(mod.next_counter + 1, ts, input.moduleId)
    const r = db.prepare(`
      INSERT INTO requirements (module_id, req_id, text, acceptance_criteria, source, rationale, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(input.moduleId, reqId, input.text, input.acceptanceCriteria ?? null, input.source ?? null, input.rationale ?? null, ts, ts)
    return db.prepare('SELECT * FROM requirements WHERE id = ?').get(r.lastInsertRowid)
  })()

  return rowToRequirement(row)
}

export function updateRequirement(id: number, input: UpdateRequirementInput): Requirement {
  const db = getDatabase()
  const existing = db.prepare('SELECT * FROM requirements WHERE id = ?').get(id) as any
  if (!existing) throw new Error(`Requirement ${id} not found`)
  db.prepare(`
    UPDATE requirements SET text = ?, acceptance_criteria = ?, source = ?, rationale = ?, updated_at = ? WHERE id = ?
  `).run(
    input.text ?? existing.text,
    input.acceptanceCriteria !== undefined ? (input.acceptanceCriteria || null) : existing.acceptance_criteria,
    input.source !== undefined ? (input.source || null) : existing.source,
    input.rationale !== undefined ? (input.rationale || null) : existing.rationale,
    now(), id
  )
  return rowToRequirement(db.prepare('SELECT * FROM requirements WHERE id = ?').get(id))
}

export function deleteRequirement(id: number): void {
  const ts = now()
  getDatabase().prepare('UPDATE requirements SET deleted_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id)
}

export function restoreRequirement(id: number): void {
  getDatabase().prepare('UPDATE requirements SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(now(), id)
}

export function registerRequirementHandlers(): void {
  ipcMain.handle('requirements:list', (_e, moduleId: number) => listRequirements(moduleId))
  ipcMain.handle('requirements:create', (_e, input: CreateRequirementInput) => createRequirement(input))
  ipcMain.handle('requirements:update', (_e, id: number, input: UpdateRequirementInput) => updateRequirement(id, input))
  ipcMain.handle('requirements:delete', (_e, id: number) => deleteRequirement(id))
  ipcMain.handle('requirements:restore', (_e, id: number) => restoreRequirement(id))
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run src/main/handlers/requirements.test.ts
```

Expected: PASS — 7 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/main/handlers/requirements.ts src/main/handlers/requirements.test.ts
git commit -m "feat: add requirements handler with atomic ID generation and soft delete"
```

---

### Task 7: Main Process Entry & Preload Bridge

**Files:**
- Create/Replace: `src/main/index.ts`
- Create/Replace: `src/preload/index.ts`
- Create: `src/types/api.d.ts`

**Interfaces:**
- Consumes: `registerProjectHandlers`, `registerModuleHandlers`, `registerRequirementHandlers`; all types from `../../types`
- Produces: Running Electron window; `window.api` typed and available in renderer

- [ ] **Step 1: Create/replace `src/main/index.ts`**

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerProjectHandlers } from './handlers/projects'
import { registerModuleHandlers } from './handlers/modules'
import { registerRequirementHandlers } from './handlers/requirements'

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
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 2: Create/replace `src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type {
  Project, Module, Requirement,
  CreateModuleInput, UpdateModuleInput,
  CreateRequirementInput, UpdateRequirementInput
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
    create: (input: CreateRequirementInput): Promise<Requirement> => ipcRenderer.invoke('requirements:create', input),
    update: (id: number, input: UpdateRequirementInput): Promise<Requirement> => ipcRenderer.invoke('requirements:update', id, input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('requirements:delete', id),
    restore: (id: number): Promise<void> => ipcRenderer.invoke('requirements:restore', id)
  }
})
```

- [ ] **Step 3: Create `src/types/api.d.ts`**

```ts
import type {
  Project, Module, Requirement,
  CreateModuleInput, UpdateModuleInput,
  CreateRequirementInput, UpdateRequirementInput
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
        create(input: CreateRequirementInput): Promise<Requirement>
        update(id: number, input: UpdateRequirementInput): Promise<Requirement>
        delete(id: number): Promise<void>
        restore(id: number): Promise<void>
      }
    }
  }
}
```

- [ ] **Step 4: Verify TypeScript is clean**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 5: Verify app starts with no console errors**

```bash
npm run dev
```

Expected: Electron window opens. Open DevTools (Cmd+Option+I) — no errors in console.

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/types/api.d.ts
git commit -m "feat: add main entry, preload bridge, and window.api type declaration"
```

---

### Task 8: Zustand Store

**Files:**
- Create: `src/renderer/src/store/index.ts`
- Create: `src/renderer/src/store/index.test.ts`

**Interfaces:**
- Consumes: `window.api` (mocked in tests); all types from `../../../../types`
- Produces: `useStore()` Zustand hook with state: `project`, `modules`, `selectedModuleId`, `requirements`, `selectedRequirementId`; actions: `loadProject`, `selectModule`, `selectRequirement`, `addModule`, `updateModule`, `removeModule`, `addRequirement`, `updateRequirement`, `removeRequirement`

- [ ] **Step 1: Write failing tests — `src/renderer/src/store/index.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStore } from './index'

const mockProject = { id: 1, name: 'Test', createdAt: '', updatedAt: '' }
const mockModule = { id: 1, projectId: 1, parentId: null, name: 'SRS', idPrefix: 'SRS', idPadding: 4, nextCounter: 1, position: 0, deletedAt: null, createdAt: '', updatedAt: '' }
const mockReq = { id: 1, moduleId: 1, reqId: 'SRS-0001', text: 'Req text', acceptanceCriteria: null, source: null, rationale: null, position: 0, deletedAt: null, createdAt: '', updatedAt: '' }

vi.stubGlobal('window', {
  api: {
    project: { getCurrent: vi.fn().mockResolvedValue(mockProject) },
    modules: {
      list: vi.fn().mockResolvedValue([mockModule]),
      create: vi.fn().mockResolvedValue(mockModule),
      update: vi.fn().mockResolvedValue({ ...mockModule, name: 'Renamed' }),
      delete: vi.fn().mockResolvedValue(undefined)
    },
    requirements: {
      list: vi.fn().mockResolvedValue([mockReq]),
      create: vi.fn().mockResolvedValue(mockReq),
      update: vi.fn().mockResolvedValue({ ...mockReq, text: 'Updated' }),
      delete: vi.fn().mockResolvedValue(undefined)
    }
  }
})

describe('store', () => {
  beforeEach(() => {
    useStore.setState({ project: null, modules: [], selectedModuleId: null, requirements: [], selectedRequirementId: null })
  })

  it('loadProject sets project and modules', async () => {
    await useStore.getState().loadProject()
    expect(useStore.getState().project?.name).toBe('Test')
    expect(useStore.getState().modules).toHaveLength(1)
  })

  it('selectModule sets id and loads requirements', async () => {
    useStore.setState({ project: mockProject, modules: [mockModule] })
    await useStore.getState().selectModule(1)
    expect(useStore.getState().selectedModuleId).toBe(1)
    expect(useStore.getState().requirements).toHaveLength(1)
  })

  it('addModule appends to modules list', async () => {
    useStore.setState({ project: mockProject, modules: [] })
    await useStore.getState().addModule({ projectId: 1, parentId: null, name: 'SRS', idPrefix: 'SRS', idPadding: 4 })
    expect(useStore.getState().modules).toHaveLength(1)
  })

  it('removeModule removes from list and clears selection if selected', async () => {
    useStore.setState({ project: mockProject, modules: [mockModule], selectedModuleId: 1 })
    await useStore.getState().removeModule(1)
    expect(useStore.getState().modules).toHaveLength(0)
    expect(useStore.getState().selectedModuleId).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run src/renderer/src/store/index.test.ts
```

Expected: FAIL — `Cannot find module './index'`

- [ ] **Step 3: Create `src/renderer/src/store/index.ts`**

```ts
import { create } from 'zustand'
import type { Project, Module, Requirement, CreateModuleInput, UpdateModuleInput, CreateRequirementInput, UpdateRequirementInput } from '../../../../types'

interface Store {
  project: Project | null
  modules: Module[]
  selectedModuleId: number | null
  requirements: Requirement[]
  selectedRequirementId: number | null
  loadProject: () => Promise<void>
  selectModule: (id: number | null) => Promise<void>
  selectRequirement: (id: number | null) => void
  addModule: (input: CreateModuleInput) => Promise<void>
  updateModule: (id: number, input: UpdateModuleInput) => Promise<void>
  removeModule: (id: number) => Promise<void>
  addRequirement: (input: CreateRequirementInput) => Promise<void>
  updateRequirement: (id: number, input: UpdateRequirementInput) => Promise<void>
  removeRequirement: (id: number) => Promise<void>
}

export const useStore = create<Store>((set, get) => ({
  project: null, modules: [], selectedModuleId: null, requirements: [], selectedRequirementId: null,

  loadProject: async () => {
    const project = await window.api.project.getCurrent()
    if (!project) return
    const modules = await window.api.modules.list(project.id)
    set({ project, modules })
  },

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
  }
}))
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run src/renderer/src/store/index.test.ts
```

Expected: PASS — 4 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/store/
git commit -m "feat: add zustand store with project, module, and requirement state"
```

---

### Task 9: App Shell

**Files:**
- Create/Replace: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/App.test.tsx`

**Interfaces:**
- Consumes: `useStore` from `./store`; `window.api.project.create`, `window.api.project.open`
- Produces: `<App />` — 3-panel layout with header; `data-testid` attributes for testing

- [ ] **Step 1: Write failing test — `src/renderer/src/App.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

vi.mock('./store', () => ({
  useStore: () => ({
    project: null, modules: [], selectedModuleId: null,
    requirements: [], selectedRequirementId: null,
    loadProject: vi.fn()
  })
}))

describe('App', () => {
  it('renders 3-panel layout with header', () => {
    render(<App />)
    expect(screen.getByText('ReqArch Suite')).toBeInTheDocument()
    expect(screen.getByTestId('panel-modules')).toBeInTheDocument()
    expect(screen.getByTestId('panel-list')).toBeInTheDocument()
    expect(screen.getByTestId('panel-detail')).toBeInTheDocument()
  })

  it('shows New Project and Open buttons', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx vitest run src/renderer/src/App.test.tsx
```

Expected: FAIL — component not found or panels missing

- [ ] **Step 3: Create `src/renderer/src/App.tsx`**

```tsx
import { useEffect } from 'react'
import { useStore } from './store'

export default function App(): JSX.Element {
  const { project, loadProject } = useStore()

  useEffect(() => { loadProject() }, [])

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
      <div className="flex flex-1 overflow-hidden">
        <aside data-testid="panel-modules"
          className="w-56 shrink-0 border-r border-gray-200 bg-white overflow-y-auto" />
        <main data-testid="panel-list"
          className="flex-1 overflow-y-auto border-r border-gray-200 bg-white" />
        <aside data-testid="panel-detail"
          className="w-80 shrink-0 overflow-y-auto bg-white" />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Replace `src/renderer/src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './assets/main.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode><App /></React.StrictMode>
)
```

- [ ] **Step 5: Run test — verify it passes**

```bash
npx vitest run src/renderer/src/App.test.tsx
```

Expected: PASS — 2 tests passing

- [ ] **Step 6: Verify layout in app**

```bash
npm run dev
```

Expected: 3-column layout visible, header with "ReqArch Suite", Open and New Project buttons.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/App.test.tsx src/renderer/src/main.tsx
git commit -m "feat: add 3-panel app shell with header and project open/create"
```

---

### Task 10: ModuleTree Component

**Files:**
- Create: `src/renderer/src/components/ModuleTree/index.tsx`
- Create: `src/renderer/src/components/ModuleTree/ModuleNode.tsx`
- Create: `src/renderer/src/components/ModuleTree/NewModuleForm.tsx`
- Create: `src/renderer/src/components/ModuleTree/index.test.tsx`
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `useStore` — `project`, `modules`, `selectedModuleId`, `selectModule`, `addModule`, `updateModule`, `removeModule`
- Produces: `<ModuleTree />` — left panel content

- [ ] **Step 1: Write failing tests — `src/renderer/src/components/ModuleTree/index.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ModuleTree from './index'

const mockSelectModule = vi.fn()
const mockAddModule = vi.fn().mockResolvedValue(undefined)

vi.mock('../../store', () => ({
  useStore: () => ({
    project: { id: 1, name: 'Test', createdAt: '', updatedAt: '' },
    modules: [
      { id: 1, projectId: 1, parentId: null, name: 'SRS', idPrefix: 'SRS', idPadding: 4, nextCounter: 1, position: 0, deletedAt: null, createdAt: '', updatedAt: '' },
      { id: 2, projectId: 1, parentId: 1, name: 'Subsystem', idPrefix: 'SUB', idPadding: 4, nextCounter: 1, position: 0, deletedAt: null, createdAt: '', updatedAt: '' }
    ],
    selectedModuleId: null,
    selectModule: mockSelectModule,
    addModule: mockAddModule,
    updateModule: vi.fn(),
    removeModule: vi.fn()
  })
}))

describe('ModuleTree', () => {
  it('renders all module names', () => {
    render(<ModuleTree />)
    expect(screen.getByText('SRS')).toBeInTheDocument()
    expect(screen.getByText('Subsystem')).toBeInTheDocument()
  })

  it('calls selectModule when a module name is clicked', async () => {
    render(<ModuleTree />)
    await userEvent.click(screen.getByText('SRS'))
    expect(mockSelectModule).toHaveBeenCalledWith(1)
  })

  it('shows New Module form when + Module is clicked', async () => {
    render(<ModuleTree />)
    await userEvent.click(screen.getByText('+ Module'))
    expect(screen.getByPlaceholderText(/module name/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run src/renderer/src/components/ModuleTree/index.test.tsx
```

Expected: FAIL — `Cannot find module './index'`

- [ ] **Step 3: Create `src/renderer/src/components/ModuleTree/NewModuleForm.tsx`**

```tsx
import { useState } from 'react'
import type { CreateModuleInput } from '../../../../../types'

interface Props {
  projectId: number
  parentId: number | null
  onSubmit: (input: CreateModuleInput) => Promise<void>
  onCancel: () => void
}

export default function NewModuleForm({ projectId, parentId, onSubmit, onCancel }: Props): JSX.Element {
  const [name, setName] = useState('')
  const [prefix, setPrefix] = useState('')
  const [padding, setPadding] = useState(4)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!name.trim() || !prefix.trim()) return
    await onSubmit({ projectId, parentId, name: name.trim(), idPrefix: prefix.trim().toUpperCase(), idPadding: padding })
  }

  return (
    <form onSubmit={handleSubmit} className="p-2 space-y-1 bg-gray-50 border-t border-gray-100">
      <input autoFocus placeholder="Module name" value={name} onChange={(e) => setName(e.target.value)}
        className="w-full text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400" />
      <div className="flex gap-1">
        <input placeholder="ID prefix (e.g. SRS)" value={prefix} onChange={(e) => setPrefix(e.target.value)}
          className="flex-1 text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400" />
        <input type="number" min={1} max={8} value={padding} onChange={(e) => setPadding(Number(e.target.value))}
          title="ID digit count" className="w-14 text-sm px-2 py-1 border border-gray-300 rounded" />
      </div>
      <div className="flex gap-1">
        <button type="submit" className="flex-1 text-sm py-1 bg-blue-600 text-white rounded hover:bg-blue-700">Add</button>
        <button type="button" onClick={onCancel} className="flex-1 text-sm py-1 border border-gray-300 rounded hover:bg-gray-100">Cancel</button>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Create `src/renderer/src/components/ModuleTree/ModuleNode.tsx`**

```tsx
import { useState } from 'react'
import type { Module } from '../../../../../types'

interface Props {
  module: Module
  allModules: Module[]
  depth: number
  selectedModuleId: number | null
  onSelect: (id: number) => void
  onDelete: (id: number) => void
  onRename: (id: number, name: string) => void
}

export default function ModuleNode({ module, allModules, depth, selectedModuleId, onSelect, onDelete, onRename }: Props): JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(module.name)
  const children = allModules.filter((m) => m.parentId === module.id)
  const isSelected = selectedModuleId === module.id

  function handleContextMenu(e: React.MouseEvent): void {
    e.preventDefault()
    const choice = window.confirm(`Rename "${module.name}"?\nOK = Rename   Cancel = Delete`)
    if (choice) { setRenameValue(module.name); setRenaming(true) }
    else if (window.confirm(`Delete "${module.name}"?`)) onDelete(module.id)
  }

  return (
    <div>
      <div
        style={{ paddingLeft: `${(depth + 1) * 12}px` }}
        className={`flex items-center gap-1 pr-2 py-1 cursor-pointer text-sm rounded mx-1 my-0.5 select-none
          ${isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-100 text-gray-700'}`}
        onClick={() => onSelect(module.id)}
        onContextMenu={handleContextMenu}
      >
        <button className="w-4 shrink-0 text-gray-400 hover:text-gray-600"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}>
          {children.length > 0 ? (expanded ? '▼' : '▶') : ''}
        </button>
        {renaming ? (
          <form onSubmit={(e) => { e.preventDefault(); if (renameValue.trim()) onRename(module.id, renameValue.trim()); setRenaming(false) }}
            onClick={(e) => e.stopPropagation()}>
            <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => setRenaming(false)}
              className="text-sm border border-blue-400 rounded px-1 py-0 w-32 focus:outline-none" />
          </form>
        ) : (
          <span className="truncate">{module.name}</span>
        )}
      </div>
      {expanded && children.map((child) => (
        <ModuleNode key={child.id} module={child} allModules={allModules} depth={depth + 1}
          selectedModuleId={selectedModuleId} onSelect={onSelect} onDelete={onDelete} onRename={onRename} />
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Create `src/renderer/src/components/ModuleTree/index.tsx`**

```tsx
import { useState } from 'react'
import { useStore } from '../../store'
import ModuleNode from './ModuleNode'
import NewModuleForm from './NewModuleForm'

export default function ModuleTree(): JSX.Element {
  const { project, modules, selectedModuleId, selectModule, addModule, updateModule, removeModule } = useStore()
  const [showForm, setShowForm] = useState(false)
  const topLevel = modules.filter((m) => m.parentId === null)

  if (!project) {
    return <div className="p-4 text-sm text-gray-400">Open or create a project to begin.</div>
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100">
        Modules
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {topLevel.map((mod) => (
          <ModuleNode key={mod.id} module={mod} allModules={modules} depth={0}
            selectedModuleId={selectedModuleId} onSelect={selectModule}
            onDelete={removeModule}
            onRename={(id, name) => updateModule(id, { name })} />
        ))}
      </div>
      {showForm ? (
        <NewModuleForm projectId={project.id} parentId={null}
          onSubmit={async (input) => { await addModule(input); setShowForm(false) }}
          onCancel={() => setShowForm(false)} />
      ) : (
        <button onClick={() => setShowForm(true)}
          className="m-2 text-sm text-blue-600 hover:underline text-left">
          + Module
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Wire ModuleTree into `src/renderer/src/App.tsx`**

Add import at the top:
```tsx
import ModuleTree from './components/ModuleTree'
```

Replace `<aside data-testid="panel-modules" ... />` (the self-closing tag) with:
```tsx
<aside data-testid="panel-modules"
  className="w-56 shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
  <ModuleTree />
</aside>
```

- [ ] **Step 7: Run tests — verify they pass**

```bash
npx vitest run src/renderer/src/components/ModuleTree/index.test.tsx
```

Expected: PASS — 3 tests passing

- [ ] **Step 8: Verify in app — create a project, add a module, see it in the tree**

```bash
npm run dev
```

Expected: Left panel shows "Modules" header, "+ Module" button opens a form, created module appears in tree.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/components/ModuleTree/ src/renderer/src/App.tsx
git commit -m "feat: add module tree with create, rename, delete, and nesting"
```

---

### Task 11: RequirementsList Component

**Files:**
- Create: `src/renderer/src/components/RequirementsList/index.tsx`
- Create: `src/renderer/src/components/RequirementsList/index.test.tsx`
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `useStore` — `selectedModuleId`, `modules`, `requirements`, `selectedRequirementId`, `selectRequirement`, `addRequirement`
- Produces: `<RequirementsList />` — center panel content

- [ ] **Step 1: Write failing tests — `src/renderer/src/components/RequirementsList/index.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RequirementsList from './index'

const mockSelectRequirement = vi.fn()
const mockAddRequirement = vi.fn().mockResolvedValue(undefined)

vi.mock('../../store', () => ({
  useStore: () => ({
    selectedModuleId: 1,
    modules: [{ id: 1, projectId: 1, parentId: null, name: 'SRS', idPrefix: 'SRS', idPadding: 4, nextCounter: 2, position: 0, deletedAt: null, createdAt: '', updatedAt: '' }],
    requirements: [{ id: 1, moduleId: 1, reqId: 'SRS-0001', text: 'The system shall respond within 2s', acceptanceCriteria: null, source: null, rationale: null, position: 0, deletedAt: null, createdAt: '', updatedAt: '' }],
    selectedRequirementId: null,
    selectRequirement: mockSelectRequirement,
    addRequirement: mockAddRequirement
  })
}))

describe('RequirementsList', () => {
  it('renders requirement ID and text', () => {
    render(<RequirementsList />)
    expect(screen.getByText('SRS-0001')).toBeInTheDocument()
    expect(screen.getByText(/The system shall respond/)).toBeInTheDocument()
  })

  it('calls selectRequirement when a row is clicked', async () => {
    render(<RequirementsList />)
    await userEvent.click(screen.getByText('SRS-0001'))
    expect(mockSelectRequirement).toHaveBeenCalledWith(1)
  })

  it('shows + Requirement button', () => {
    render(<RequirementsList />)
    expect(screen.getByText('+ Requirement')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run src/renderer/src/components/RequirementsList/index.test.tsx
```

Expected: FAIL — `Cannot find module './index'`

- [ ] **Step 3: Create `src/renderer/src/components/RequirementsList/index.tsx`**

```tsx
import { useStore } from '../../store'

export default function RequirementsList(): JSX.Element {
  const { selectedModuleId, modules, requirements, selectedRequirementId, selectRequirement, addRequirement } = useStore()

  if (!selectedModuleId) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        Select a module to view its requirements.
      </div>
    )
  }

  const module = modules.find((m) => m.id === selectedModuleId)

  async function handleAdd(): Promise<void> {
    await addRequirement({ moduleId: selectedModuleId!, text: '' })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between shrink-0">
        <span className="text-sm font-semibold text-gray-700">{module?.name ?? 'Requirements'}</span>
        <span className="text-xs text-gray-400">{requirements.length} item{requirements.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {requirements.length === 0 && (
          <div className="p-4 text-sm text-gray-400">No requirements yet.</div>
        )}
        {requirements.map((req) => (
          <div key={req.id} onClick={() => selectRequirement(req.id)}
            className={`flex items-start gap-3 px-4 py-3 cursor-pointer border-b border-gray-50 hover:bg-gray-50
              ${selectedRequirementId === req.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}>
            <span className="text-xs font-mono text-gray-400 shrink-0 mt-0.5 w-20">{req.reqId}</span>
            <span className="text-sm text-gray-800 line-clamp-2">
              {req.text || <span className="text-gray-300 italic">No text yet</span>}
            </span>
          </div>
        ))}
      </div>
      <div className="p-2 border-t border-gray-100 shrink-0">
        <button onClick={handleAdd} className="text-sm text-blue-600 hover:underline">
          + Requirement
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire RequirementsList into `src/renderer/src/App.tsx`**

Add import:
```tsx
import RequirementsList from './components/RequirementsList'
```

Replace `<main data-testid="panel-list" ... />` with:
```tsx
<main data-testid="panel-list"
  className="flex-1 overflow-y-auto border-r border-gray-200 bg-white">
  <RequirementsList />
</main>
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
npx vitest run src/renderer/src/components/RequirementsList/index.test.tsx
```

Expected: PASS — 3 tests passing

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/RequirementsList/ src/renderer/src/App.tsx
git commit -m "feat: add requirements list with selection and add button"
```

---

### Task 12: RequirementDetail Component

**Files:**
- Create: `src/renderer/src/components/RequirementDetail/index.tsx`
- Create: `src/renderer/src/components/RequirementDetail/index.test.tsx`
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `useStore` — `selectedRequirementId`, `requirements`, `updateRequirement`
- Produces: `<RequirementDetail />` — right panel with 4-field form; auto-saves on blur

- [ ] **Step 1: Write failing tests — `src/renderer/src/components/RequirementDetail/index.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RequirementDetail from './index'

const mockUpdateRequirement = vi.fn().mockResolvedValue(undefined)

vi.mock('../../store', () => ({
  useStore: () => ({
    selectedRequirementId: 1,
    requirements: [{
      id: 1, moduleId: 1, reqId: 'SRS-0001',
      text: 'The system shall respond within 2s',
      acceptanceCriteria: 'Measured under load',
      source: 'Customer spec', rationale: 'Performance SLA',
      position: 0, deletedAt: null, createdAt: '', updatedAt: ''
    }],
    updateRequirement: mockUpdateRequirement
  })
}))

describe('RequirementDetail', () => {
  beforeEach(() => mockUpdateRequirement.mockClear())

  it('renders all 4 fields with current values', () => {
    render(<RequirementDetail />)
    expect(screen.getByDisplayValue('The system shall respond within 2s')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Measured under load')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Customer spec')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Performance SLA')).toBeInTheDocument()
  })

  it('shows req_id read-only', () => {
    render(<RequirementDetail />)
    expect(screen.getByText('SRS-0001')).toBeInTheDocument()
  })

  it('calls updateRequirement on blur with changed value', async () => {
    render(<RequirementDetail />)
    const field = screen.getByDisplayValue('The system shall respond within 2s')
    await userEvent.clear(field)
    await userEvent.type(field, 'New requirement text')
    fireEvent.blur(field)
    await waitFor(() => {
      expect(mockUpdateRequirement).toHaveBeenCalledWith(1, expect.objectContaining({ text: 'New requirement text' }))
    })
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run src/renderer/src/components/RequirementDetail/index.test.tsx
```

Expected: FAIL — `Cannot find module './index'`

- [ ] **Step 3: Create `src/renderer/src/components/RequirementDetail/index.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { useStore } from '../../store'

export default function RequirementDetail(): JSX.Element {
  const { selectedRequirementId, requirements, updateRequirement } = useStore()
  const req = requirements.find((r) => r.id === selectedRequirementId) ?? null

  const [text, setText] = useState('')
  const [ac, setAc] = useState('')
  const [source, setSource] = useState('')
  const [rationale, setRationale] = useState('')

  useEffect(() => {
    if (!req) return
    setText(req.text)
    setAc(req.acceptanceCriteria ?? '')
    setSource(req.source ?? '')
    setRationale(req.rationale ?? '')
  }, [req?.id])

  if (!req) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        Select a requirement to view details.
      </div>
    )
  }

  function save(): void {
    updateRequirement(req!.id, {
      text,
      acceptanceCriteria: ac || undefined,
      source: source || undefined,
      rationale: rationale || undefined
    })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-gray-100 shrink-0">
        <span className="text-xs font-mono text-gray-400">{req.reqId}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <Field label="Requirement">
          <textarea value={text} onChange={(e) => setText(e.target.value)} onBlur={save} rows={4}
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </Field>
        <Field label="Acceptance Criteria">
          <textarea value={ac} onChange={(e) => setAc(e.target.value)} onBlur={save} rows={3}
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </Field>
        <Field label="Source">
          <input value={source} onChange={(e) => setSource(e.target.value)} onBlur={save}
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </Field>
        <Field label="Rationale">
          <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} onBlur={save} rows={3}
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-blue-400" />
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

- [ ] **Step 4: Wire RequirementDetail into `src/renderer/src/App.tsx`**

Add import:
```tsx
import RequirementDetail from './components/RequirementDetail'
```

Replace `<aside data-testid="panel-detail" ... />` with:
```tsx
<aside data-testid="panel-detail"
  className="w-80 shrink-0 overflow-y-auto bg-white border-l border-gray-100">
  <RequirementDetail />
</aside>
```

- [ ] **Step 5: Run all tests — verify everything passes**

```bash
npx vitest run
```

Expected: All tests passing across all files

- [ ] **Step 6: Full end-to-end verify in app**

```bash
npm run dev
```

Golden path to verify:
1. Click "New Project", name it "My System"
2. Save the `.reqarch` file somewhere on disk
3. Click "+ Module", enter name "SRS", prefix "SRS", padding 4, click Add
4. Click the "SRS" module in the tree — center panel shows empty requirements list
5. Click "+ Requirement" — a new row appears in the list and the right panel opens
6. Type requirement text in the right panel, click another field — text auto-saves
7. Fill in Acceptance Criteria, Source, Rationale — all save on blur
8. Close and reopen the app — the project reopens automatically with all data intact

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/RequirementDetail/ src/renderer/src/App.tsx
git commit -m "feat: add requirement detail panel with 4 fields and auto-save on blur"
```
