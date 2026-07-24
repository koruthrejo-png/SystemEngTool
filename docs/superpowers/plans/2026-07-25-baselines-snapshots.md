# Baselines / Snapshots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user freeze a labelled, immutable snapshot of the whole project (requirements + architecture), list past baselines, and diff the current project against one — what was added / removed / changed since the freeze.

**Architecture:** One `baselines` table with a single JSON `snapshot` column (option b — travels inside the `.reqarch`, no second DB handle). Freeze serializes the project via stable text keys (reqId / blockId / connId) resolving authors integer→uuid. Diff is a pure function over two parsed snapshots, computed in main. UI is a Dashboard **Baselines** card + a diff modal.

**Tech Stack:** Electron + better-sqlite3 (dual-copy ABI alias for tests), TypeScript, Zustand store, React Dashboard, vitest.

## Global Constraints

- **Snapshot travels in the document.** Store the serialized project as JSON inside the `baselines` table; authors referenced by `users.uuid` inside the blob (resolved at freeze), so a baseline survives handover/ingest into a file whose integer PKs differ.
- **Renderer never asserts the author.** `baselines.created_by` stamped in main via `currentUserRowId(db)`.
- **Immutable freeze.** No `updated_at`; a baseline is never edited. Later live edits must NOT mutate a stored snapshot (the key correctness test).
- **Stable keys only for diffing.** Key requirements by `reqId`, elements by `blockId`, connections by `connId` — never integer PKs (they diverge as the live file evolves).
- **Scope v1 (user decisions 2026-07-25):** requirements **+ architecture** (elements, connections, element-links, connection-links). Requirement diff compares **all scalar row fields**: text, status, priority, reqType, entryType, verificationStatus, source, rationale, acceptanceCriteria. Custom fields deferred (still a child table). Hard delete (no soft-delete/restore). No restore-to-baseline, no export (both deferred, additive later).
- Main-process handler/migration tests run green via `npx vitest run` (dual-copy better-sqlite3 alias). TDD is real red→green.

---

## File Structure

| File | Change |
|---|---|
| `src/main/db/migrations.ts` | `baselines` table in the CREATE block |
| `src/main/db/migrations.test.ts` | assert table exists |
| `src/types/index.ts` | Baseline + snapshot + diff interfaces |
| `src/main/handlers/baselines.ts` **(new)** | `diffByKey`/`diffPairs`/`diffSnapshots` (pure), `serializeProject`, `createBaseline`, `listBaselines`, `diffBaseline`, `deleteBaseline`, `rowToBaseline`, `registerBaselineHandlers` |
| `src/main/handlers/baselines.test.ts` **(new)** | pure diff tests + handler tests |
| `src/main/index.ts` | `registerBaselineHandlers()` |
| `src/preload/index.ts` | `baselines` bridge (4 invokes) |
| `src/types/api.d.ts` | `baselines` block |
| `src/renderer/src/store/index.ts` | baselines slice |
| `src/renderer/src/components/Dashboard/index.tsx` | Baselines card + diff modal |
| `src/renderer/src/components/Dashboard/baselines.test.tsx` **(new)** | card + diff render |

---

## Task 1: Schema — `baselines` table

**Files:**
- Modify: `src/main/db/migrations.ts` (CREATE block, before the closing `` `) ``, after `requirement_history`/`idx_req_history_req`)
- Test: `src/main/db/migrations.test.ts`

**Interfaces:**
- Produces: table `baselines(id, project_id, label, description, snapshot, created_by, created_at)`.

- [ ] **Step 1: Write the failing test**

Add to `src/main/db/migrations.test.ts` (local-`db` pattern, like the existing tests):

```typescript
it('creates the baselines table with the expected columns', () => {
  tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
  db = new Database(join(tempDir, 'test.reqarch'))
  runMigrations(db)

  const cols = (db
    .prepare("SELECT name FROM pragma_table_info('baselines')")
    .all() as any[]).map((r) => r.name)

  expect(cols).toEqual(
    expect.arrayContaining(['id', 'project_id', 'label', 'description', 'snapshot', 'created_by', 'created_at'])
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/db/migrations.test.ts`
Expected: FAIL — `pragma_table_info('baselines')` returns `[]`.

- [ ] **Step 3: Add the table**

In `src/main/db/migrations.ts`, immediately after the `CREATE INDEX ... idx_req_history_req ...;` line and before the closing `` `) ``:

```sql
    CREATE TABLE IF NOT EXISTS baselines (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  INTEGER NOT NULL REFERENCES projects(id),
      label       TEXT    NOT NULL,
      description TEXT,
      snapshot    TEXT    NOT NULL,
      created_by  INTEGER REFERENCES users(id),
      created_at  TEXT    NOT NULL
    );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/db/migrations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/migrations.ts src/main/db/migrations.test.ts
git commit -m "feat(baselines): add baselines table

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Types + pure diff functions

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/main/handlers/baselines.ts` (pure functions only in this task)
- Test: `src/main/handlers/baselines.test.ts`

**Interfaces:**
- Produces (types): `Baseline`, `CreateBaselineInput`, `BaselineReqSnapshot`, `BaselineElementSnapshot`, `BaselineConnectionSnapshot`, `BaselineLinkSnapshot`, `BaselineSnapshot`, `BaselineFieldChange`, `BaselineEntityModified`, `BaselineEntityDiff<T>`, `BaselinePairDiff`, `BaselineDiff`.
- Produces (fns): `diffByKey`, `diffPairs`, `diffSnapshots`.

- [ ] **Step 1: Add the types**

Append to `src/types/index.ts`:

```typescript
export interface Baseline {
  id: number
  projectId: number
  label: string
  description: string | null
  createdBy: number | null
  createdAt: string
}
export interface CreateBaselineInput {
  projectId: number
  label: string
  description?: string
}
export interface BaselineReqSnapshot {
  reqId: string
  moduleName: string
  text: string
  status: string
  priority: string
  reqType: string
  entryType: string
  verificationStatus: string
  source: string | null
  rationale: string | null
  acceptanceCriteria: string | null
  createdByUuid: string | null
  updatedByUuid: string | null
}
export interface BaselineElementSnapshot {
  blockId: string
  name: string
  typeName: string | null
  description: string | null
}
export interface BaselineConnectionSnapshot {
  connId: string
  name: string | null
  typeName: string | null
  sourceBlockId: string
  targetBlockId: string
  description: string | null
}
export interface BaselineLinkSnapshot {
  left: string // blockId (element links) or connId (connection links)
  reqId: string
}
export interface BaselineSnapshot {
  version: number
  takenAt: string
  requirements: BaselineReqSnapshot[]
  elements: BaselineElementSnapshot[]
  connections: BaselineConnectionSnapshot[]
  elementLinks: BaselineLinkSnapshot[]
  connectionLinks: BaselineLinkSnapshot[]
}
export interface BaselineFieldChange {
  field: string
  before: string | null
  after: string | null
}
export interface BaselineEntityModified {
  key: string
  changes: BaselineFieldChange[]
}
export interface BaselineEntityDiff<T> {
  added: T[]
  removed: T[]
  modified: BaselineEntityModified[]
}
export interface BaselinePairDiff {
  added: BaselineLinkSnapshot[]
  removed: BaselineLinkSnapshot[]
}
export interface BaselineDiff {
  requirements: BaselineEntityDiff<BaselineReqSnapshot>
  elements: BaselineEntityDiff<BaselineElementSnapshot>
  connections: BaselineEntityDiff<BaselineConnectionSnapshot>
  elementLinks: BaselinePairDiff
  connectionLinks: BaselinePairDiff
}
```

- [ ] **Step 2: Write the failing pure-diff tests**

Create `src/main/handlers/baselines.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { diffByKey, diffPairs, diffSnapshots } from './baselines'
import type { BaselineReqSnapshot, BaselineSnapshot, BaselineLinkSnapshot } from '../../types'

const req = (reqId: string, over: Partial<BaselineReqSnapshot> = {}): BaselineReqSnapshot => ({
  reqId, moduleName: 'SRS', text: 'T', status: 'Draft', priority: 'Medium', reqType: 'Functional',
  entryType: 'Requirement', verificationStatus: 'Unverified', source: null, rationale: null,
  acceptanceCriteria: null, createdByUuid: null, updatedByUuid: null, ...over
})

const REQ_FIELDS = ['text', 'status', 'priority', 'reqType', 'entryType', 'verificationStatus', 'source', 'rationale', 'acceptanceCriteria'] as const

describe('diffByKey', () => {
  it('detects added and removed by key', () => {
    const d = diffByKey([req('A'), req('B')], [req('A'), req('C')], (r) => r.reqId, REQ_FIELDS as any)
    expect(d.added.map((r) => r.reqId)).toEqual(['B'])
    expect(d.removed.map((r) => r.reqId)).toEqual(['C'])
    expect(d.modified).toEqual([])
  })

  it('reports per-field modifications for matched keys', () => {
    const d = diffByKey(
      [req('A', { status: 'Approved', priority: 'High' })],
      [req('A', { status: 'Draft', priority: 'High' })],
      (r) => r.reqId, REQ_FIELDS as any
    )
    expect(d.modified).toEqual([
      { key: 'A', changes: [{ field: 'status', before: 'Draft', after: 'Approved' }] }
    ])
  })

  it('identical inputs yield an empty diff', () => {
    const d = diffByKey([req('A')], [req('A')], (r) => r.reqId, REQ_FIELDS as any)
    expect(d).toEqual({ added: [], removed: [], modified: [] })
  })

  it('keys by reqId, not array position', () => {
    const d = diffByKey([req('A'), req('B')], [req('B'), req('A')], (r) => r.reqId, REQ_FIELDS as any)
    expect(d.added).toEqual([]); expect(d.removed).toEqual([]); expect(d.modified).toEqual([])
  })
})

describe('diffPairs', () => {
  it('detects added and removed link pairs', () => {
    const cur: BaselineLinkSnapshot[] = [{ left: 'SYS-001', reqId: 'A' }, { left: 'SYS-002', reqId: 'B' }]
    const base: BaselineLinkSnapshot[] = [{ left: 'SYS-001', reqId: 'A' }, { left: 'SYS-003', reqId: 'C' }]
    const d = diffPairs(cur, base)
    expect(d.added).toEqual([{ left: 'SYS-002', reqId: 'B' }])
    expect(d.removed).toEqual([{ left: 'SYS-003', reqId: 'C' }])
  })
})

describe('diffSnapshots', () => {
  const empty = (): BaselineSnapshot => ({
    version: 2, takenAt: '', requirements: [], elements: [], connections: [], elementLinks: [], connectionLinks: []
  })
  it('composes entity + pair diffs across all sections', () => {
    const base = empty(); base.requirements = [req('A')]
    const cur = empty(); cur.requirements = [req('A', { status: 'Approved' })]
    cur.elements = [{ blockId: 'SYS-001', name: 'CPU', typeName: 'Component', description: null }]
    cur.elementLinks = [{ left: 'SYS-001', reqId: 'A' }]
    const d = diffSnapshots(cur, base)
    expect(d.requirements.modified).toHaveLength(1)
    expect(d.elements.added.map((e) => e.blockId)).toEqual(['SYS-001'])
    expect(d.elementLinks.added).toHaveLength(1)
    expect(d.connections.added).toEqual([])
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/main/handlers/baselines.test.ts`
Expected: FAIL — `./baselines` module / exports do not exist.

- [ ] **Step 4: Implement the pure functions**

Create `src/main/handlers/baselines.ts` (pure section only — DB functions added in Task 3):

```typescript
import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import { currentUserRowId } from '../identity'
import { listRequirementsByProject } from './requirements'
import type {
  Baseline, CreateBaselineInput, BaselineSnapshot, BaselineReqSnapshot,
  BaselineElementSnapshot, BaselineConnectionSnapshot, BaselineLinkSnapshot,
  BaselineDiff, BaselineEntityDiff, BaselineEntityModified, BaselineFieldChange, BaselinePairDiff
} from '../../types'

function now(): string { return new Date().toISOString() }

const REQ_DIFF_FIELDS: (keyof BaselineReqSnapshot)[] = [
  'text', 'status', 'priority', 'reqType', 'entryType', 'verificationStatus', 'source', 'rationale', 'acceptanceCriteria'
]
const ELEM_DIFF_FIELDS: (keyof BaselineElementSnapshot)[] = ['name', 'typeName', 'description']
const CONN_DIFF_FIELDS: (keyof BaselineConnectionSnapshot)[] = ['name', 'typeName', 'sourceBlockId', 'targetBlockId', 'description']

export function diffByKey<T>(current: T[], baseline: T[], keyOf: (t: T) => string, fields: (keyof T)[]): BaselineEntityDiff<T> {
  const curMap = new Map(current.map((t) => [keyOf(t), t]))
  const baseMap = new Map(baseline.map((t) => [keyOf(t), t]))
  const added = current.filter((t) => !baseMap.has(keyOf(t)))
  const removed = baseline.filter((t) => !curMap.has(keyOf(t)))
  const modified: BaselineEntityModified[] = []
  for (const [key, cur] of curMap) {
    const base = baseMap.get(key)
    if (!base) continue
    const changes: BaselineFieldChange[] = []
    for (const f of fields) {
      const before = (base[f] ?? null) as string | null
      const after = (cur[f] ?? null) as string | null
      if (before !== after) changes.push({ field: String(f), before, after })
    }
    if (changes.length) modified.push({ key, changes })
  }
  return { added, removed, modified }
}

export function diffPairs(current: BaselineLinkSnapshot[], baseline: BaselineLinkSnapshot[]): BaselinePairDiff {
  const k = (p: BaselineLinkSnapshot): string => `${p.left} ${p.reqId}`
  const curSet = new Set(current.map(k))
  const baseSet = new Set(baseline.map(k))
  return {
    added: current.filter((p) => !baseSet.has(k(p))),
    removed: baseline.filter((p) => !curSet.has(k(p)))
  }
}

export function diffSnapshots(current: BaselineSnapshot, baseline: BaselineSnapshot): BaselineDiff {
  return {
    requirements: diffByKey(current.requirements, baseline.requirements, (r) => r.reqId, REQ_DIFF_FIELDS),
    elements: diffByKey(current.elements, baseline.elements, (e) => e.blockId, ELEM_DIFF_FIELDS),
    connections: diffByKey(current.connections, baseline.connections, (c) => c.connId, CONN_DIFF_FIELDS),
    elementLinks: diffPairs(current.elementLinks, baseline.elementLinks),
    connectionLinks: diffPairs(current.connectionLinks, baseline.connectionLinks)
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/main/handlers/baselines.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/main/handlers/baselines.ts src/main/handlers/baselines.test.ts
git commit -m "feat(baselines): types + pure snapshot diff functions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: serialize + freeze + list + diff + delete + IPC

**Files:**
- Modify: `src/main/handlers/baselines.ts` (add DB functions + registration)
- Modify: `src/main/index.ts` (register)
- Test: `src/main/handlers/baselines.test.ts`

**Interfaces:**
- Consumes: `listRequirementsByProject`, `currentUserRowId`, `getDatabase`, the pure `diffSnapshots`.
- Produces: `serializeProject(projectId): BaselineSnapshot`, `createBaseline(input): Baseline`, `listBaselines(projectId): Baseline[]`, `diffBaseline(baselineId): BaselineDiff`, `deleteBaseline(id): void`, `registerBaselineHandlers()`. IPC: `baselines:create` / `:list` / `:diff` / `:delete`.

- [ ] **Step 1: Write the failing handler tests**

Append to `src/main/handlers/baselines.test.ts` (temp-DB pattern from `requirements.test.ts`; add the imports at the top of the file):

```typescript
import { beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase, closeDatabase, getDatabase } from '../db/connection'
import { initIdentity, setMe, currentUserRowId } from '../identity'
import { createProject } from './projects'
import { createModule } from './modules'
import { createRequirement, updateRequirement, deleteRequirement } from './requirements'
import { serializeProject, createBaseline, listBaselines, diffBaseline, deleteBaseline } from './baselines'

describe('baselines handler', () => {
  let tempDir: string
  let identityDir: string
  let projectId: number
  let moduleId: number

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    identityDir = mkdtempSync(join(tmpdir(), 'reqarch-identity-'))
    initIdentity(identityDir)
    setMe({ displayName: 'Grace' })
    openDatabase(join(tempDir, 'test.reqarch'))
    const p = createProject('Test'); projectId = p.id
    moduleId = createModule({ projectId, parentId: null, kind: 'module', name: 'SRS', idPrefix: 'SRS', idPadding: 4 }).id
  })
  afterEach(() => {
    closeDatabase(); initIdentity('')
    rmSync(tempDir, { recursive: true, force: true })
    rmSync(identityDir, { recursive: true, force: true })
  })

  it('serializeProject resolves author integer ids to uuids', () => {
    createRequirement({ moduleId, text: 'X' })
    const snap = serializeProject(projectId)
    expect(snap.requirements).toHaveLength(1)
    const uuid = (getDatabase().prepare('SELECT uuid FROM users WHERE id = ?').get(currentUserRowId(getDatabase())) as any).uuid
    expect(snap.requirements[0].createdByUuid).toBe(uuid)
    expect(typeof snap.requirements[0].createdByUuid).toBe('string')
  })

  it('createBaseline stores the row and returns metadata without the blob', () => {
    createRequirement({ moduleId, text: 'X' })
    const b = createBaseline({ projectId, label: 'Rev A', description: 'PDR' })
    expect(b.label).toBe('Rev A')
    expect(b.createdBy).toBe(currentUserRowId(getDatabase()))
    expect((b as any).snapshot).toBeUndefined()
  })

  it('baselines:list omits the snapshot blob', () => {
    createBaseline({ projectId, label: 'Rev A' })
    const rows = listBaselines(projectId)
    expect(rows).toHaveLength(1)
    expect((rows[0] as any).snapshot).toBeUndefined()
  })

  it('a frozen snapshot is a stable copy — later edits do not mutate it, and diff reflects them', () => {
    const keep = createRequirement({ moduleId, text: 'keep' })
    const edit = createRequirement({ moduleId, text: 'edit', status: 'Draft' } as any)
    const gone = createRequirement({ moduleId, text: 'gone' })
    const b = createBaseline({ projectId, label: 'Rev A' })

    // mutate the live project AFTER the freeze
    createRequirement({ moduleId, text: 'brand new' })
    updateRequirement(edit.id, { status: 'Approved' })
    deleteRequirement(gone.id)

    // the stored snapshot still shows the pre-edit world
    const stored = JSON.parse((getDatabase().prepare('SELECT snapshot FROM baselines WHERE id = ?').get(b.id) as any).snapshot)
    const editSnap = stored.requirements.find((r: any) => r.reqId === edit.reqId)
    expect(editSnap.status).toBe('Draft')
    expect(stored.requirements.some((r: any) => r.reqId === gone.reqId)).toBe(true)

    // diff reflects exactly the three live edits
    const d = diffBaseline(b.id)
    expect(d.requirements.added.map((r) => r.text)).toEqual(['brand new'])
    expect(d.requirements.removed.map((r) => r.reqId)).toEqual([gone.reqId])
    expect(d.requirements.modified).toEqual([
      { key: edit.reqId, changes: [{ field: 'status', before: 'Draft', after: 'Approved' }] }
    ])
    // untouched requirement appears nowhere
    expect(d.requirements.added.some((r) => r.reqId === keep.reqId)).toBe(false)
  })

  it('deleteBaseline hard-deletes', () => {
    const b = createBaseline({ projectId, label: 'Rev A' })
    deleteBaseline(b.id)
    expect(listBaselines(projectId)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/handlers/baselines.test.ts`
Expected: FAIL — `serializeProject`/`createBaseline`/etc. not exported.

- [ ] **Step 3: Implement the DB functions + registration**

Append to `src/main/handlers/baselines.ts`:

```typescript
function rowToBaseline(row: any): Baseline {
  return {
    id: row.id, projectId: row.project_id, label: row.label,
    description: row.description ?? null, createdBy: row.created_by ?? null, createdAt: row.created_at
  }
}

export function serializeProject(projectId: number): BaselineSnapshot {
  const db = getDatabase()
  const uuidOf = new Map(
    (db.prepare('SELECT id, uuid FROM users').all() as { id: number; uuid: string }[]).map((u) => [u.id, u.uuid])
  )
  const modName = new Map(
    (db.prepare('SELECT id, name FROM modules').all() as { id: number; name: string }[]).map((m) => [m.id, m.name])
  )
  const requirements: BaselineReqSnapshot[] = listRequirementsByProject(projectId).map((r) => ({
    reqId: r.reqId, moduleName: modName.get(r.moduleId) ?? '', text: r.text,
    status: r.status, priority: r.priority, reqType: r.reqType, entryType: r.entryType,
    verificationStatus: r.verificationStatus, source: r.source, rationale: r.rationale,
    acceptanceCriteria: r.acceptanceCriteria,
    createdByUuid: r.createdBy != null ? uuidOf.get(r.createdBy) ?? null : null,
    updatedByUuid: r.updatedBy != null ? uuidOf.get(r.updatedBy) ?? null : null
  }))
  const elements = db.prepare(`
    SELECT e.block_id AS blockId, e.name AS name, et.name AS typeName, e.description AS description
    FROM architecture_elements e LEFT JOIN element_types et ON e.element_type_id = et.id
    WHERE e.project_id = ? AND e.deleted_at IS NULL ORDER BY e.block_id
  `).all(projectId) as BaselineElementSnapshot[]
  const connections = db.prepare(`
    SELECT c.conn_id AS connId, c.name AS name, ct.name AS typeName,
           se.block_id AS sourceBlockId, te.block_id AS targetBlockId, c.description AS description
    FROM architecture_connections c
    LEFT JOIN connection_types ct ON c.connection_type_id = ct.id
    JOIN architecture_elements se ON c.source_id = se.id
    JOIN architecture_elements te ON c.target_id = te.id
    WHERE c.project_id = ? AND c.deleted_at IS NULL ORDER BY c.conn_id
  `).all(projectId) as BaselineConnectionSnapshot[]
  const elementLinks = db.prepare(`
    SELECT e.block_id AS left, r.req_id AS reqId
    FROM element_requirement_links l
    JOIN architecture_elements e ON l.element_id = e.id
    JOIN requirements r ON l.requirement_id = r.id
    WHERE e.project_id = ? AND e.deleted_at IS NULL AND r.deleted_at IS NULL
    ORDER BY e.block_id, r.req_id
  `).all(projectId) as BaselineLinkSnapshot[]
  const connectionLinks = db.prepare(`
    SELECT c.conn_id AS left, r.req_id AS reqId
    FROM connection_requirement_links l
    JOIN architecture_connections c ON l.connection_id = c.id
    JOIN requirements r ON l.requirement_id = r.id
    WHERE c.project_id = ? AND c.deleted_at IS NULL AND r.deleted_at IS NULL
    ORDER BY c.conn_id, r.req_id
  `).all(projectId) as BaselineLinkSnapshot[]
  return { version: 2, takenAt: now(), requirements, elements, connections, elementLinks, connectionLinks }
}

export function createBaseline(input: CreateBaselineInput): Baseline {
  const db = getDatabase()
  const snapshot = serializeProject(input.projectId)
  const info = db.prepare(`
    INSERT INTO baselines (project_id, label, description, snapshot, created_by, created_at)
    VALUES (?,?,?,?,?,?)
  `).run(input.projectId, input.label, input.description ?? null, JSON.stringify(snapshot), currentUserRowId(db), now())
  return rowToBaseline(
    db.prepare('SELECT id, project_id, label, description, created_by, created_at FROM baselines WHERE id = ?').get(info.lastInsertRowid)
  )
}

export function listBaselines(projectId: number): Baseline[] {
  return (db_ => db_.prepare(`
    SELECT id, project_id, label, description, created_by, created_at
    FROM baselines WHERE project_id = ? ORDER BY created_at DESC, id DESC
  `).all(projectId) as any[])(getDatabase()).map(rowToBaseline)
}

export function diffBaseline(baselineId: number): BaselineDiff {
  const db = getDatabase()
  const row = db.prepare('SELECT project_id, snapshot FROM baselines WHERE id = ?').get(baselineId) as any
  if (!row) throw new Error(`Baseline ${baselineId} not found`)
  const baseline = JSON.parse(row.snapshot) as BaselineSnapshot
  return diffSnapshots(serializeProject(row.project_id), baseline)
}

export function deleteBaseline(id: number): void {
  getDatabase().prepare('DELETE FROM baselines WHERE id = ?').run(id)
}

export function registerBaselineHandlers(): void {
  ipcMain.handle('baselines:create', (_e, input: CreateBaselineInput) => createBaseline(input))
  ipcMain.handle('baselines:list', (_e, projectId: number) => listBaselines(projectId))
  ipcMain.handle('baselines:diff', (_e, baselineId: number) => diffBaseline(baselineId))
  ipcMain.handle('baselines:delete', (_e, id: number) => deleteBaseline(id))
}
```

In `src/main/index.ts`, import `registerBaselineHandlers` and call it alongside the others (after `registerRequirementHandlers()` or at the end of the registration block):

```typescript
  registerBaselineHandlers()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/handlers/baselines.test.ts`
Expected: PASS (pure + handler tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/main/handlers/baselines.ts src/main/handlers/baselines.test.ts src/main/index.ts
git commit -m "feat(baselines): serialize/freeze/list/diff/delete + IPC

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: preload + api type + store slice

**Files:**
- Modify: `src/preload/index.ts`, `src/types/api.d.ts`, `src/renderer/src/store/index.ts`

**Interfaces:**
- Produces: `window.api.baselines.{create,list,diff,delete}`; store state `baselines: Baseline[]`, `baselineDiff: BaselineDiff | null` + actions `loadBaselines`, `createBaseline`, `removeBaseline`, `loadBaselineDiff`, `clearBaselineDiff`.

- [ ] **Step 1: Preload bridge**

In `src/preload/index.ts`, add a `baselines` block (near `requirementHistory`), and add `Baseline, CreateBaselineInput, BaselineDiff` to the type import from `'../types'`:

```typescript
  baselines: {
    create: (input: CreateBaselineInput): Promise<Baseline> => ipcRenderer.invoke('baselines:create', input),
    list: (projectId: number): Promise<Baseline[]> => ipcRenderer.invoke('baselines:list', projectId),
    diff: (baselineId: number): Promise<BaselineDiff> => ipcRenderer.invoke('baselines:diff', baselineId),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('baselines:delete', id)
  },
```

- [ ] **Step 2: api.d.ts declaration**

In `src/types/api.d.ts`, add to the `window.api` interface and add the three types to its import list:

```typescript
      baselines: {
        create(input: CreateBaselineInput): Promise<Baseline>
        list(projectId: number): Promise<Baseline[]>
        diff(baselineId: number): Promise<BaselineDiff>
        delete(id: number): Promise<void>
      }
```

- [ ] **Step 3: Store slice**

In `src/renderer/src/store/index.ts`:

1. Add `Baseline, BaselineDiff` to the types import.
2. State interface: `baselines: Baseline[]` and `baselineDiff: BaselineDiff | null`.
3. Action interface:

```typescript
  loadBaselines: () => Promise<void>
  createBaseline: (label: string, description?: string) => Promise<void>
  removeBaseline: (id: number) => Promise<void>
  loadBaselineDiff: (id: number) => Promise<void>
  clearBaselineDiff: () => void
```

4. Initial state: `baselines: [], baselineDiff: null,`.
5. Implement (near the requirement actions):

```typescript
  loadBaselines: async () => {
    const { project } = get(); if (!project) return
    set({ baselines: await window.api.baselines.list(project.id) })
  },
  createBaseline: (label, description) => run(async () => {
    const { project } = get(); if (!project) return
    await window.api.baselines.create({ projectId: project.id, label, description })
    set({ baselines: await window.api.baselines.list(project.id) })
  }),
  removeBaseline: (id) => run(async () => {
    const { project } = get(); if (!project) return
    await window.api.baselines.delete(id)
    set({ baselines: await window.api.baselines.list(project.id) })
  }),
  loadBaselineDiff: (id) => run(async () => {
    set({ baselineDiff: await window.api.baselines.diff(id) })
  }),
  clearBaselineDiff: () => set({ baselineDiff: null }),
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/preload/index.ts src/types/api.d.ts src/renderer/src/store/index.ts
git commit -m "feat(baselines): preload bridge + store slice

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Dashboard Baselines card + diff modal

**Files:**
- Modify: `src/renderer/src/components/Dashboard/index.tsx`
- Test: `src/renderer/src/components/Dashboard/baselines.test.tsx`

**Interfaces:**
- Consumes: store `baselines`, `loadBaselines`, `createBaseline`, `removeBaseline`, `baselineDiff`, `loadBaselineDiff`, `clearBaselineDiff`, `users`; `userName` from `attribution.ts`.

- [ ] **Step 1: Write the failing renderer test**

Create `src/renderer/src/components/Dashboard/baselines.test.tsx`. Mock the store like the existing `Dashboard/index.test.tsx` does (open it and copy its store-mock scaffolding, including whatever `stats`/`project`/`users` the Dashboard reads, so the component renders). Two cases:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BaselinesCard, BaselineDiffModal } from './index'

const store = {
  baselines: [
    { id: 1, projectId: 1, label: 'Rev A', description: 'PDR', createdBy: 7, createdAt: '2026-07-25T10:00:00.000Z' }
  ],
  users: [{ id: 7, displayName: 'Grace' }],
  loadBaselines: vi.fn(), createBaseline: vi.fn().mockResolvedValue(undefined),
  removeBaseline: vi.fn(), loadBaselineDiff: vi.fn(), clearBaselineDiff: vi.fn(),
  baselineDiff: null as any
}
vi.mock('../../store', () => ({ useStore: () => store }))

describe('BaselinesCard', () => {
  it('lists baselines with label and author', () => {
    render(<BaselinesCard />)
    expect(screen.getByText('Rev A')).toBeInTheDocument()
    expect(screen.getByText(/Grace/)).toBeInTheDocument()
  })

  it('diff button triggers loadBaselineDiff', () => {
    render(<BaselinesCard />)
    fireEvent.click(screen.getByRole('button', { name: /diff/i }))
    expect(store.loadBaselineDiff).toHaveBeenCalledWith(1)
  })
})

describe('BaselineDiffModal', () => {
  it('renders section counts from a diff', () => {
    store.baselineDiff = {
      requirements: { added: [{ reqId: 'B' }], removed: [], modified: [{ key: 'A', changes: [{ field: 'status', before: 'Draft', after: 'Approved' }] }] },
      elements: { added: [], removed: [], modified: [] },
      connections: { added: [], removed: [], modified: [] },
      elementLinks: { added: [], removed: [] },
      connectionLinks: { added: [], removed: [] }
    }
    render(<BaselineDiffModal />)
    expect(screen.getByText(/Requirements/)).toBeInTheDocument()
    expect(screen.getByText(/1 added/)).toBeInTheDocument()
    expect(screen.getByText(/1 changed/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/components/Dashboard/baselines.test.tsx`
Expected: FAIL — `BaselinesCard` / `BaselineDiffModal` not exported.

- [ ] **Step 3: Implement the card + modal**

In `src/renderer/src/components/Dashboard/index.tsx`:

1. Add imports: `useState`, `useEffect` from `'react'` (extend the existing react import); `Button, Input` added to the `'../ui'` import (keep `SectionLabel, Chip`); `userName` from `'../../attribution'`; and the diff types from `'../../../types'`.
2. Render `<BaselinesCard />` inside the Dashboard grid (add it to the last `grid ... gap-4` row, e.g. after `<GapsCard .../>`), and render `<BaselineDiffModal />` once at the end of the Dashboard's outer `<div>` (a sibling of the content, so it overlays).
3. Add the components (export both — the test imports them by name):

```typescript
export function BaselinesCard(): JSX.Element {
  const { baselines, loadBaselines, createBaseline, removeBaseline, loadBaselineDiff, users } = useStore()
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => { loadBaselines() }, [])

  const submit = async (): Promise<void> => {
    if (!label.trim()) return
    await createBaseline(label.trim(), description.trim() || undefined)
    setLabel(''); setDescription(''); setAdding(false)
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Baselines</SectionLabel>
        <Button variant="ghost" className="!px-2" onClick={() => setAdding((a) => !a)}>+ New baseline</Button>
      </div>

      {adding && (
        <div className="space-y-2 mb-3">
          <Input placeholder="Label (e.g. Rev A, PDR)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="flex gap-2">
            <Button onClick={submit}>Freeze</Button>
            <Button variant="ghost" onClick={() => { setAdding(false); setLabel(''); setDescription('') }}>Cancel</Button>
          </div>
        </div>
      )}

      {baselines.length === 0 ? (
        <p className="text-sm text-ink-faint">No baselines yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {baselines.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <span className="font-medium text-ink">{b.label}</span>
                <span className="text-ink-faint"> · {new Date(b.createdAt).toLocaleDateString()} · {userName(users, b.createdBy)}</span>
                {b.description && <span className="text-ink-faint"> · {b.description}</span>}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" className="!px-2" onClick={() => loadBaselineDiff(b.id)}>Diff</Button>
                <Button variant="ghost" className="!px-2 !text-error" onClick={() => removeBaseline(b.id)}>Delete</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function EntityDiffBlock({ title, diff }: { title: string; diff: BaselineEntityDiff<{ reqId?: string; blockId?: string; connId?: string }> }): JSX.Element {
  const keyOf = (t: any): string => t.reqId ?? t.blockId ?? t.connId ?? ''
  return (
    <div className="mb-3">
      <div className="text-sm font-medium text-ink">
        {title}: <span className="text-status-approved">{diff.added.length} added</span>,{' '}
        <span className="text-error">{diff.removed.length} removed</span>,{' '}
        <span className="text-status-draft">{diff.modified.length} changed</span>
      </div>
      {(diff.added.length > 0 || diff.removed.length > 0 || diff.modified.length > 0) && (
        <ul className="mt-1 text-xs text-ink-faint space-y-0.5">
          {diff.added.map((t, i) => <li key={`a${i}`}>+ {keyOf(t)}</li>)}
          {diff.removed.map((t, i) => <li key={`r${i}`}>− {keyOf(t)}</li>)}
          {diff.modified.map((m, i) => (
            <li key={`m${i}`}>~ {m.key}: {m.changes.map((c) => `${c.field} ${c.before ?? '—'}→${c.after ?? '—'}`).join(', ')}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PairDiffBlock({ title, diff }: { title: string; diff: BaselinePairDiff }): JSX.Element {
  return (
    <div className="mb-3">
      <div className="text-sm font-medium text-ink">
        {title}: <span className="text-status-approved">{diff.added.length} added</span>,{' '}
        <span className="text-error">{diff.removed.length} removed</span>
      </div>
      {(diff.added.length > 0 || diff.removed.length > 0) && (
        <ul className="mt-1 text-xs text-ink-faint space-y-0.5">
          {diff.added.map((p, i) => <li key={`a${i}`}>+ {p.left} ↔ {p.reqId}</li>)}
          {diff.removed.map((p, i) => <li key={`r${i}`}>− {p.left} ↔ {p.reqId}</li>)}
        </ul>
      )}
    </div>
  )
}

export function BaselineDiffModal(): JSX.Element | null {
  const { baselineDiff, clearBaselineDiff } = useStore()
  if (!baselineDiff) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/40" onClick={clearBaselineDiff}>
      <div className="max-h-[80vh] w-[640px] overflow-y-auto rounded-lg bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <SectionLabel>Changes since baseline</SectionLabel>
          <button aria-label="Close diff" onClick={clearBaselineDiff} className="text-ink-faint hover:text-ink text-base leading-none">×</button>
        </div>
        <EntityDiffBlock title="Requirements" diff={baselineDiff.requirements as any} />
        <EntityDiffBlock title="Elements" diff={baselineDiff.elements as any} />
        <EntityDiffBlock title="Connections" diff={baselineDiff.connections as any} />
        <PairDiffBlock title="Element links" diff={baselineDiff.elementLinks} />
        <PairDiffBlock title="Connection links" diff={baselineDiff.connectionLinks} />
      </div>
    </div>
  )
}
```

Note: if a token like `text-status-approved` / `text-status-draft` is not in `tailwind.config.js`, substitute an existing status/semantic colour token (check the config) — the point is added=positive colour, removed=error, changed=neutral/amber.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/components/Dashboard/baselines.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + Dashboard suite**

Run: `npm run typecheck && npx vitest run src/renderer/src/components/Dashboard/`
Expected: typecheck clean; Dashboard tests green (patch the existing `Dashboard/index.test.tsx` store mock with `baselines: [], baselineDiff: null, loadBaselines: vi.fn()` etc. if it breaks — the card calls `loadBaselines` on mount).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/Dashboard/
git commit -m "feat(baselines): Dashboard baselines card + diff modal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Build gate + live-verify + docs

- [ ] **Step 1: Full gate**

Run: `npm run typecheck && npx electron-vite build && npx vitest run`
Expected: typecheck clean; 3-target build clean; suite green except the known pre-existing `App.test.tsx` "open" button failure.

- [ ] **Step 2: Live-verify** — one-shot `playwright _electron` script (pattern from item 34's verify), driving `window.api` on a real project:
  - `baselines.create({ projectId, label:'Rev A' })` → appears in `baselines.list` (metadata, no `snapshot`).
  - edit a requirement (status), add one, delete one; `baselines.diff(id)` → the added/removed/modified reflect exactly those, snapshot unchanged.
  - if the project has architecture, confirm elements/connections/links sections populate.
  - screenshot the Dashboard with the Baselines card.

- [ ] **Step 3: Docs** — append a handoff.md session section, a `.superpowers/sdd/progress.md` ledger section, mark backlog item 35 DONE in `docs/superpowers/specs/2026-07-02-ui-overhaul-design.md` §6. Note carried deferrals: custom-field diff, restore-to-baseline, export, baseline-to-baseline diff, soft-delete.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs(baselines): backlog item 35 complete — freeze/list/diff project baselines

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** schema (T1) ✓; store decision option-b JSON blob (T3) ✓; identity uuid-in-blob (T3 `serializeProject` + test) ✓; freeze reusing `listRequirementsByProject` (T3) ✓; pure `diffSnapshots` (T2) ✓; 4 IPC channels, `list` omits blob (T3 + test) ✓; hard delete (T3 + test) ✓; Dashboard card + diff modal (T5) ✓; freeze-is-stable-copy key test (T3) ✓. **Deviations from spec, user-approved 2026-07-25:** snapshot version is **2** and includes **architecture** (elements/connections/element-links/connection-links) — spec drew v1 as requirements-only; requirement diff compares **all 9 scalar fields** incl. acceptanceCriteria/entryType/verificationStatus (spec listed 6). Both are additive to the spec's shape, `version` field accommodates.

**Placeholders:** none — full code in every code step. The tailwind-token note and the "copy the Dashboard test mock" note point at exact existing sources, not invention.

**Type consistency:** `BaselineSnapshot`/`BaselineDiff`/`BaselineEntityDiff<T>`/`BaselinePairDiff`/`BaselineLinkSnapshot` identical across T2 (definition), T3 (serialize/diff), T4 (store), T5 (UI). `serializeProject`/`createBaseline`/`listBaselines`/`diffBaseline`/`deleteBaseline` names consistent T3→T4. Link snapshot uses `{ left, reqId }` everywhere. Diff field-key accessor in the UI (`reqId ?? blockId ?? connId`) matches the three entity key fields.
```
