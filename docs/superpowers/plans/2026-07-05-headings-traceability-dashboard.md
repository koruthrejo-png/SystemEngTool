# Headings, Traceability Matrix & Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add document-style headings/subheadings to the requirements table, a Traceability tab (interactive requirements×objects matrix with coverage summary), and a Dashboard tab (KPI cards, status/priority/type breakdowns, unallocated list, recently-updated feed).

**Architecture:** Follows the app's strict 3-layer pattern: renderer → typed `window.api` preload bridge → main-process IPC handlers → SQLite. Headings are a new `req_headings` table (2 levels via nullable `parent_id`) plus a nullable `heading_id` column on `requirements`; numbering/outline order is computed in a pure renderer helper. Traceability and Dashboard are new top-level tabs reading existing `element_requirement_links` rows via one new project-scoped IPC query; dashboard stats are computed in a pure helper. No new dependencies, no chart library (CSS bars).

**Tech Stack:** Electron 31, React 18, TypeScript, Zustand, better-sqlite3, Tailwind (semantic tokens: navy/action/workspace/line/ink/error), Vitest + @testing-library/react.

## Global Constraints

- Renderer NEVER touches the DB directly — all data flows through `window.api` (preload) → `ipcMain.handle` (main).
- Every new `window.api` method appears in BOTH `src/preload/index.ts` and the global type file `src/types/api.d.ts`.
- Tailwind semantic tokens only (`text-ink`, `bg-workspace`, `border-line`, `bg-action`, `text-error`, etc.) — no raw hex/color classes in renderer JSX.
- Headings have exactly 2 levels: top-level headings (`parentId: null`) and subheadings (`parentId` = a top-level heading id). Auto-numbered `1, 2, …` and `1.1, 1.2, …` by position order.
- Soft deletes (`deleted_at`) everywhere, matching existing tables.
- Tests: `./node_modules/.bin/vitest run <paths>` — NEVER `npm run` (npm shim broken). Full typecheck: `./node_modules/.bin/tsc --noEmit -p tsconfig.web.json` and `./node_modules/.bin/tsc --noEmit -p tsconfig.node.json`.
- Do NOT write vitest tests under `src/main/**` — better-sqlite3 ABI mismatch makes all main-process tests fail with `ERR_DLOPEN_FAILED` in this environment (47 pre-existing failures; also 1 pre-existing ArchitectureCanvas "connection mode toggle" failure). Main-process code is verified by typecheck + live app checks. All renderer tests must pass.
- Commits go straight to `main`. Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- PATH prefix required in every shell: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"`.

---

### Task 1: Headings backend — schema, types, handlers, preload bridge

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/main/db/migrations.ts`
- Create: `src/main/handlers/headings.ts`
- Modify: `src/main/handlers/requirements.ts`
- Modify: `src/main/index.ts` (register handlers)
- Modify: `src/preload/index.ts`
- Modify: `src/types/api.d.ts`

**Interfaces:**
- Consumes: existing `getDatabase()` from `src/main/db/connection`, existing `addColumnIfMissing` in migrations.
- Produces (later tasks rely on these EXACT names):
  - Types: `ReqHeading { id: number; moduleId: number; parentId: number | null; title: string; position: number; deletedAt: string | null; createdAt: string; updatedAt: string }`, `CreateHeadingInput { moduleId: number; parentId?: number | null; title?: string }`, `UpdateHeadingInput { title?: string }`
  - `Requirement` gains `headingId: number | null`; `CreateRequirementInput` and `UpdateRequirementInput` gain `headingId?: number | null`
  - `window.api.headings.list(moduleId): Promise<ReqHeading[]>`, `.create(input: CreateHeadingInput): Promise<ReqHeading>`, `.update(id, input: UpdateHeadingInput): Promise<ReqHeading>`, `.move(id, direction: 'up' | 'down'): Promise<void>`, `.delete(id): Promise<void>`

- [ ] **Step 1: Add types**

In `src/types/index.ts`, after the `Requirement` interface add:

```ts
export interface ReqHeading {
  id: number
  moduleId: number
  parentId: number | null
  title: string
  position: number
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateHeadingInput {
  moduleId: number
  parentId?: number | null
  title?: string
}

export interface UpdateHeadingInput {
  title?: string
}
```

In the `Requirement` interface, add `headingId: number | null` directly after `reqType: RequirementType`.
In `CreateRequirementInput`, add `headingId?: number | null`.
In `UpdateRequirementInput`, add `headingId?: number | null`.

- [ ] **Step 2: Migration**

In `src/main/db/migrations.ts`, inside the big `db.exec(...)` template literal (after the `requirement_custom_fields` table), add:

```sql
    CREATE TABLE IF NOT EXISTS req_headings (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id  INTEGER NOT NULL REFERENCES modules(id),
      parent_id  INTEGER REFERENCES req_headings(id),
      title      TEXT    NOT NULL DEFAULT '',
      position   INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      created_at TEXT    NOT NULL,
      updated_at TEXT    NOT NULL
    );
```

After the existing `addColumnIfMissing` calls, add:

```ts
  addColumnIfMissing(db, 'requirements', 'heading_id', 'INTEGER REFERENCES req_headings(id)')
```

(The `db.exec` block runs on every open with `IF NOT EXISTS`, so existing `.reqarch` files pick the table up automatically.)

- [ ] **Step 3: Create `src/main/handlers/headings.ts`**

```ts
import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import type { ReqHeading, CreateHeadingInput, UpdateHeadingInput } from '../../types'

function now(): string { return new Date().toISOString() }

function rowToHeading(row: any): ReqHeading {
  return {
    id: row.id, moduleId: row.module_id, parentId: row.parent_id ?? null,
    title: row.title, position: row.position,
    deletedAt: row.deleted_at ?? null, createdAt: row.created_at, updatedAt: row.updated_at
  }
}

export function listHeadings(moduleId: number): ReqHeading[] {
  return (getDatabase()
    .prepare('SELECT * FROM req_headings WHERE module_id = ? AND deleted_at IS NULL ORDER BY position, id')
    .all(moduleId) as any[]).map(rowToHeading)
}

export function createHeading(input: CreateHeadingInput): ReqHeading {
  const db = getDatabase()
  const ts = now()
  const max = db.prepare(
    'SELECT COALESCE(MAX(position), -1) AS p FROM req_headings WHERE module_id = ? AND deleted_at IS NULL AND parent_id IS ?'
  ).get(input.moduleId, input.parentId ?? null) as any
  const r = db.prepare(`
    INSERT INTO req_headings (module_id, parent_id, title, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(input.moduleId, input.parentId ?? null, input.title ?? '', max.p + 1, ts, ts)
  return rowToHeading(db.prepare('SELECT * FROM req_headings WHERE id = ?').get(r.lastInsertRowid))
}

export function updateHeading(id: number, input: UpdateHeadingInput): ReqHeading {
  const db = getDatabase()
  const existing = db.prepare('SELECT * FROM req_headings WHERE id = ?').get(id) as any
  if (!existing) throw new Error(`Heading ${id} not found`)
  db.prepare('UPDATE req_headings SET title = ?, updated_at = ? WHERE id = ?')
    .run(input.title ?? existing.title, now(), id)
  return rowToHeading(db.prepare('SELECT * FROM req_headings WHERE id = ?').get(id))
}

// Swap position with the nearest sibling in the given direction (same parent level).
export function moveHeading(id: number, direction: 'up' | 'down'): void {
  const db = getDatabase()
  db.transaction(() => {
    const h = db.prepare('SELECT * FROM req_headings WHERE id = ?').get(id) as any
    if (!h) throw new Error(`Heading ${id} not found`)
    const neighbor = db.prepare(`
      SELECT * FROM req_headings
      WHERE module_id = ? AND deleted_at IS NULL AND parent_id IS ?
        AND position ${direction === 'up' ? '<' : '>'} ?
      ORDER BY position ${direction === 'up' ? 'DESC' : 'ASC'} LIMIT 1
    `).get(h.module_id, h.parent_id ?? null, h.position) as any
    if (!neighbor) return
    const ts = now()
    db.prepare('UPDATE req_headings SET position = ?, updated_at = ? WHERE id = ?').run(neighbor.position, ts, h.id)
    db.prepare('UPDATE req_headings SET position = ?, updated_at = ? WHERE id = ?').run(h.position, ts, neighbor.id)
  })()
}

// Soft delete; requirements and subheadings under it move up to the deleted heading's parent.
export function deleteHeading(id: number): void {
  const db = getDatabase()
  db.transaction(() => {
    const h = db.prepare('SELECT * FROM req_headings WHERE id = ?').get(id) as any
    if (!h) return
    const ts = now()
    db.prepare('UPDATE requirements SET heading_id = ?, updated_at = ? WHERE heading_id = ?')
      .run(h.parent_id ?? null, ts, id)
    db.prepare('UPDATE req_headings SET parent_id = ?, updated_at = ? WHERE parent_id = ? AND deleted_at IS NULL')
      .run(h.parent_id ?? null, ts, id)
    db.prepare('UPDATE req_headings SET deleted_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id)
  })()
}

export function registerHeadingHandlers(): void {
  ipcMain.handle('headings:list', (_e, moduleId: number) => listHeadings(moduleId))
  ipcMain.handle('headings:create', (_e, input: CreateHeadingInput) => createHeading(input))
  ipcMain.handle('headings:update', (_e, id: number, input: UpdateHeadingInput) => updateHeading(id, input))
  ipcMain.handle('headings:move', (_e, id: number, direction: 'up' | 'down') => moveHeading(id, direction))
  ipcMain.handle('headings:delete', (_e, id: number) => deleteHeading(id))
}
```

- [ ] **Step 4: Thread `headingId` through requirements handler**

In `src/main/handlers/requirements.ts`:

1. `rowToRequirement`: add `headingId: row.heading_id ?? null,` after `status: row.status, priority: row.priority, reqType: row.req_type,`.
2. `createRequirement` INSERT — change to:

```ts
    const r = db.prepare(`
      INSERT INTO requirements (module_id, req_id, text, acceptance_criteria, source, rationale, heading_id, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(input.moduleId, reqId, input.text, input.acceptanceCriteria ?? null, input.source ?? null, input.rationale ?? null, input.headingId ?? null, ts, ts)
```

3. `updateRequirement` — change the UPDATE statement to include `heading_id`:

```ts
  db.prepare(`
    UPDATE requirements SET text = ?, acceptance_criteria = ?, source = ?, rationale = ?, status = ?, priority = ?, req_type = ?, heading_id = ?, updated_at = ? WHERE id = ?
  `).run(
    // nullable text fields coerce '' → null; NOT NULL enum fields have no empty state, so plain ??
    input.text ?? existing.text,
    input.acceptanceCriteria !== undefined ? (input.acceptanceCriteria || null) : existing.acceptance_criteria,
    input.source !== undefined ? (input.source || null) : existing.source,
    input.rationale !== undefined ? (input.rationale || null) : existing.rationale,
    input.status ?? existing.status,
    input.priority ?? existing.priority,
    input.reqType ?? existing.req_type,
    input.headingId !== undefined ? input.headingId : existing.heading_id,
    now(), id
  )
```

- [ ] **Step 5: Register + preload bridge**

In `src/main/index.ts`: add `import { registerHeadingHandlers } from './handlers/headings'` next to the other handler imports, and call `registerHeadingHandlers()` where the others are called (search for `registerRequirementHandlers()` and add the call adjacent).

In `src/preload/index.ts`: add `ReqHeading, CreateHeadingInput, UpdateHeadingInput` to the type import, and after the `requirements` group add:

```ts
  headings: {
    list: (moduleId: number): Promise<ReqHeading[]> => ipcRenderer.invoke('headings:list', moduleId),
    create: (input: CreateHeadingInput): Promise<ReqHeading> => ipcRenderer.invoke('headings:create', input),
    update: (id: number, input: UpdateHeadingInput): Promise<ReqHeading> => ipcRenderer.invoke('headings:update', id, input),
    move: (id: number, direction: 'up' | 'down'): Promise<void> => ipcRenderer.invoke('headings:move', id, direction),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('headings:delete', id)
  },
```

In `src/types/api.d.ts`: add the same three types to the import from `'./index'`, and inside `Window['api']` after the `requirements` block add:

```ts
      headings: {
        list(moduleId: number): Promise<ReqHeading[]>
        create(input: CreateHeadingInput): Promise<ReqHeading>
        update(id: number, input: UpdateHeadingInput): Promise<ReqHeading>
        move(id: number, direction: 'up' | 'down'): Promise<void>
        delete(id: number): Promise<void>
      }
```

- [ ] **Step 6: Typecheck + renderer suite**

Run:
```bash
export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"
./node_modules/.bin/tsc --noEmit -p tsconfig.node.json
./node_modules/.bin/tsc --noEmit -p tsconfig.web.json
./node_modules/.bin/vitest run src/renderer
```
Expected: both typechecks clean. Renderer suite: only the 1 pre-existing ArchitectureCanvas "connection mode toggle" failure (do not chase it).

Note: renderer test files build `Requirement` literals; adding the required `headingId` field will surface TS errors in `src/renderer/**` test fixtures — add `headingId: null` to those fixture objects as part of this task.

- [ ] **Step 7: Commit**

```bash
git add -A src docs
git commit -m "feat(headings): req_headings schema, IPC handlers, preload bridge

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Outline helper — grouping, numbering, collapse

**Files:**
- Create: `src/renderer/src/components/RequirementsList/outline.ts`
- Test: `src/renderer/src/components/RequirementsList/outline.test.ts`

**Interfaces:**
- Consumes: `ReqHeading`, `Requirement` from `src/types` (Task 1). `Requirement.headingId: number | null`.
- Produces (Task 3 relies on these EXACT names):
  - `type OutlineRow = { kind: 'heading'; heading: ReqHeading; number: string; depth: 0 | 1 } | { kind: 'requirement'; requirement: Requirement }`
  - `buildOutline(headings: ReqHeading[], requirements: Requirement[]): OutlineRow[]`
  - `visibleRows(rows: OutlineRow[], collapsed: Set<number>): OutlineRow[]`

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/src/components/RequirementsList/outline.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildOutline, visibleRows, type OutlineRow } from './outline'
import type { ReqHeading, Requirement } from '../../../../types'

function heading(partial: Partial<ReqHeading> & { id: number }): ReqHeading {
  return {
    moduleId: 1, parentId: null, title: `H${partial.id}`, position: 0,
    deletedAt: null, createdAt: '', updatedAt: '', ...partial
  }
}

function req(partial: Partial<Requirement> & { id: number }): Requirement {
  return {
    moduleId: 1, reqId: `SRS-${partial.id}`, text: `R${partial.id}`,
    acceptanceCriteria: null, source: null, rationale: null,
    status: 'Draft', priority: 'Medium', reqType: 'Functional',
    headingId: null, position: 0, deletedAt: null, createdAt: '', updatedAt: '', ...partial
  }
}

const shape = (rows: OutlineRow[]): string[] =>
  rows.map((r) => (r.kind === 'heading' ? `${r.number} ${r.heading.title}` : r.requirement.reqId))

describe('buildOutline', () => {
  it('puts ungrouped requirements first, then numbered headings with their requirements', () => {
    const rows = buildOutline(
      [heading({ id: 10, position: 0 }), heading({ id: 20, position: 1 })],
      [req({ id: 1 }), req({ id: 2, headingId: 10 }), req({ id: 3, headingId: 20 })]
    )
    expect(shape(rows)).toEqual(['SRS-1', '1 H10', 'SRS-2', '2 H20', 'SRS-3'])
  })

  it('numbers subheadings 1.1, 1.2 under their parent, after the parent\'s own requirements', () => {
    const rows = buildOutline(
      [
        heading({ id: 10, position: 0 }),
        heading({ id: 11, parentId: 10, position: 0 }),
        heading({ id: 12, parentId: 10, position: 1 })
      ],
      [req({ id: 1, headingId: 10 }), req({ id: 2, headingId: 11 }), req({ id: 3, headingId: 12 })]
    )
    expect(shape(rows)).toEqual(['1 H10', 'SRS-1', '1.1 H11', 'SRS-2', '1.2 H12', 'SRS-3'])
  })

  it('orders headings by position then id, and renumbers accordingly', () => {
    const rows = buildOutline(
      [heading({ id: 10, position: 1 }), heading({ id: 20, position: 0 })],
      []
    )
    expect(shape(rows)).toEqual(['1 H20', '2 H10'])
  })

  it('treats a subheading with a missing parent as a top-level heading (orphan guard)', () => {
    const rows = buildOutline([heading({ id: 11, parentId: 99, position: 0 })], [])
    expect(shape(rows)).toEqual(['1 H11'])
  })
})

describe('visibleRows', () => {
  const outline = buildOutline(
    [
      heading({ id: 10, position: 0 }),
      heading({ id: 11, parentId: 10, position: 0 }),
      heading({ id: 20, position: 1 })
    ],
    [req({ id: 1, headingId: 10 }), req({ id: 2, headingId: 11 }), req({ id: 3, headingId: 20 })]
  )

  it('returns everything when nothing is collapsed', () => {
    expect(visibleRows(outline, new Set())).toEqual(outline)
  })

  it('collapsing a top heading hides its requirements and subheadings but not later top headings', () => {
    expect(shape(visibleRows(outline, new Set([10])))).toEqual(['1 H10', '2 H20', 'SRS-3'])
  })

  it('collapsing a subheading hides only its own requirements', () => {
    expect(shape(visibleRows(outline, new Set([11])))).toEqual(['1 H10', 'SRS-1', '1.1 H11', '2 H20', 'SRS-3'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/RequirementsList/outline.test.ts`
Expected: FAIL — cannot resolve `./outline`.

- [ ] **Step 3: Implement `src/renderer/src/components/RequirementsList/outline.ts`**

```ts
import type { ReqHeading, Requirement } from '../../../../types'

export type OutlineRow =
  | { kind: 'heading'; heading: ReqHeading; number: string; depth: 0 | 1 }
  | { kind: 'requirement'; requirement: Requirement }

// Display order: ungrouped requirements first, then each top-level heading
// (numbered 1..N by position), its requirements, then its subheadings
// (numbered N.1..) each with their requirements.
export function buildOutline(headings: ReqHeading[], requirements: Requirement[]): OutlineRow[] {
  const rows: OutlineRow[] = []
  const byPosition = (a: ReqHeading, b: ReqHeading): number => a.position - b.position || a.id - b.id
  const reqsUnder = (headingId: number | null): Requirement[] =>
    requirements.filter((r) => r.headingId === headingId)

  for (const r of reqsUnder(null)) rows.push({ kind: 'requirement', requirement: r })

  const ids = new Set(headings.map((h) => h.id))
  const tops = headings.filter((h) => h.parentId === null || !ids.has(h.parentId)).sort(byPosition)
  tops.forEach((top, i) => {
    rows.push({ kind: 'heading', heading: top, number: `${i + 1}`, depth: 0 })
    for (const r of reqsUnder(top.id)) rows.push({ kind: 'requirement', requirement: r })
    const subs = headings.filter((h) => h.parentId === top.id).sort(byPosition)
    subs.forEach((sub, j) => {
      rows.push({ kind: 'heading', heading: sub, number: `${i + 1}.${j + 1}`, depth: 1 })
      for (const r of reqsUnder(sub.id)) rows.push({ kind: 'requirement', requirement: r })
    })
  })
  return rows
}

// Collapse hides a heading's content (requirements + deeper headings), not the heading row itself.
export function visibleRows(rows: OutlineRow[], collapsed: Set<number>): OutlineRow[] {
  const out: OutlineRow[] = []
  let skipDeeperThan: number | null = null
  for (const row of rows) {
    if (row.kind === 'heading') {
      if (skipDeeperThan !== null && row.depth > skipDeeperThan) continue
      skipDeeperThan = null
      out.push(row)
      if (collapsed.has(row.heading.id)) skipDeeperThan = row.depth
    } else {
      if (skipDeeperThan !== null) continue
      out.push(row)
    }
  }
  return out
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/RequirementsList/outline.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/RequirementsList/outline.ts src/renderer/src/components/RequirementsList/outline.test.ts
git commit -m "feat(headings): pure outline helper — grouping, 2-level numbering, collapse

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Heading state in store + heading rows in RequirementsList

**Files:**
- Modify: `src/renderer/src/store/index.ts`
- Modify: `src/renderer/src/components/RequirementsList/index.tsx`
- Test: `src/renderer/src/components/RequirementsList/index.test.tsx` (extend)

**Interfaces:**
- Consumes: `window.api.headings.*` (Task 1), `buildOutline`/`visibleRows`/`OutlineRow` from `./outline` (Task 2).
- Produces (Task 4 relies on): store fields `headings: ReqHeading[]`, `collapsedHeadingIds: number[]`; store actions `addHeading(input: CreateHeadingInput): Promise<void>`, `renameHeading(id: number, title: string): Promise<void>`, `moveHeading(id: number, direction: 'up' | 'down'): Promise<void>`, `removeHeading(id: number): Promise<void>`, `toggleHeadingCollapsed(id: number): void`.

- [ ] **Step 1: Store — state + actions**

In `src/renderer/src/store/index.ts`:

1. Import types: add `ReqHeading, CreateHeadingInput` to the type import from `'../../../types'`.
2. In the `Store` interface, after `selectedRequirementId: number | null` add:

```ts
  headings: ReqHeading[]
  collapsedHeadingIds: number[]
```

and in the requirements-actions section add:

```ts
  addHeading: (input: CreateHeadingInput) => Promise<void>
  renameHeading: (id: number, title: string) => Promise<void>
  moveHeading: (id: number, direction: 'up' | 'down') => Promise<void>
  removeHeading: (id: number) => Promise<void>
  toggleHeadingCollapsed: (id: number) => void
```

3. Initial state: extend the initializer line with `headings: [], collapsedHeadingIds: [],`.
4. `selectModule` — replace its body so headings load with requirements and collapse state resets:

```ts
  selectModule: async (id) => {
    set({ selectedModuleId: id, requirements: [], headings: [], collapsedHeadingIds: [], selectedRequirementId: null, showDeleted: false, deletedRequirements: [], customFields: [], statusFilter: 'All', priorityFilter: 'All', typeFilter: 'All', checkedIds: [] })
    if (id === null) return
    const [requirements, headings] = await Promise.all([
      window.api.requirements.list(id),
      window.api.headings.list(id)
    ])
    set({ requirements, headings })
  },
```

5. Add the actions (place after `restoreRequirement`):

```ts
  addHeading: async (input) => {
    const heading = await window.api.headings.create(input)
    set((s) => ({ headings: [...s.headings, heading] }))
  },

  renameHeading: async (id, title) => {
    const updated = await window.api.headings.update(id, { title })
    set((s) => ({ headings: s.headings.map((h) => (h.id === id ? updated : h)) }))
  },

  moveHeading: async (id, direction) => {
    await window.api.headings.move(id, direction)
    const { selectedModuleId } = get()
    if (!selectedModuleId) return
    set({ headings: await window.api.headings.list(selectedModuleId) })
  },

  removeHeading: async (id) => {
    await window.api.headings.delete(id)
    const { selectedModuleId } = get()
    if (!selectedModuleId) return
    // requirements re-fetched too: their heading_id was reassigned in the DB
    const [headings, requirements] = await Promise.all([
      window.api.headings.list(selectedModuleId),
      window.api.requirements.list(selectedModuleId)
    ])
    set((s) => ({ headings, requirements, collapsedHeadingIds: s.collapsedHeadingIds.filter((c) => c !== id) }))
  },

  toggleHeadingCollapsed: (id) => set((s) => ({
    collapsedHeadingIds: s.collapsedHeadingIds.includes(id)
      ? s.collapsedHeadingIds.filter((c) => c !== id)
      : [...s.collapsedHeadingIds, id]
  })),
```

- [ ] **Step 2: RequirementsList — render outline with heading rows**

In `src/renderer/src/components/RequirementsList/index.tsx`:

1. Add imports:

```ts
import { buildOutline, visibleRows, type OutlineRow } from './outline'
```

2. Destructure the new store members in the component:

```ts
    headings, collapsedHeadingIds, toggleHeadingCollapsed,
    addHeading, renameHeading, moveHeading, removeHeading,
```

3. After the `displayed` computation, build the row list (deleted view stays flat):

```ts
  const rows: OutlineRow[] = showDeleted
    ? displayed.map((r) => ({ kind: 'requirement' as const, requirement: r }))
    : visibleRows(buildOutline(headings, displayed), new Set(collapsedHeadingIds))
```

4. Toolbar: next to the `+ New Requirement` button add (inside the same `{!showDeleted && ...}` guard — change the guard to wrap a fragment):

```tsx
          {!showDeleted && (
            <>
              <Button variant="secondary" onClick={() => addHeading({ moduleId: selectedModuleId! })}>+ Heading</Button>
              <Button onClick={handleAdd}>+ New Requirement</Button>
            </>
          )}
```

5. Replace the rows block. The current `displayed.length === 0` empty-state check becomes `rows.length === 0`. Replace `{displayed.map((req, i) => (...))}` with a map over `rows` — heading rows are full-width flex divs, requirement rows are the EXISTING grid row JSX unchanged except keyed/indexed differently:

```tsx
          {rows.map((row, i) =>
            row.kind === 'heading' ? (
              <div
                key={`h-${row.heading.id}`}
                data-testid={`heading-row-${row.heading.id}`}
                className={`flex items-center gap-2 px-4 py-2 border-b border-line bg-workspace group/h ${row.depth === 1 ? 'pl-10' : ''}`}
              >
                <button
                  aria-label={collapsedHeadingIds.includes(row.heading.id) ? 'Expand section' : 'Collapse section'}
                  onClick={() => toggleHeadingCollapsed(row.heading.id)}
                  className="w-4 text-ink-faint hover:text-ink"
                >
                  {collapsedHeadingIds.includes(row.heading.id) ? '▸' : '▾'}
                </button>
                <span className="text-xs font-mono text-ink-faint">{row.number}</span>
                <input
                  key={`${row.heading.id}:${row.heading.title}`}
                  aria-label="Heading title"
                  defaultValue={row.heading.title}
                  placeholder="Untitled section"
                  onBlur={(e) => { if (e.target.value !== row.heading.title) renameHeading(row.heading.id, e.target.value) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  className={`flex-1 min-w-0 bg-transparent outline-none font-semibold text-ink text-sm ${row.depth === 0 ? 'uppercase tracking-wide' : ''}`}
                />
                <span className="flex items-center gap-3 text-xs opacity-0 group-hover/h:opacity-100 transition-opacity shrink-0">
                  <button aria-label="Move section up" onClick={() => moveHeading(row.heading.id, 'up')} className="text-ink-faint hover:text-ink">↑</button>
                  <button aria-label="Move section down" onClick={() => moveHeading(row.heading.id, 'down')} className="text-ink-faint hover:text-ink">↓</button>
                  <button
                    aria-label="Add requirement to section"
                    onClick={() => addRequirement({ moduleId: selectedModuleId!, text: '', headingId: row.heading.id })}
                    className="text-action hover:text-action-hover font-medium whitespace-nowrap"
                  >
                    + Req
                  </button>
                  {row.depth === 0 && (
                    <button
                      aria-label="Add subheading"
                      onClick={() => addHeading({ moduleId: selectedModuleId!, parentId: row.heading.id })}
                      className="text-action hover:text-action-hover font-medium whitespace-nowrap"
                    >
                      + Sub
                    </button>
                  )}
                  <button aria-label="Delete section" onClick={() => removeHeading(row.heading.id)} className="text-ink-faint hover:text-error text-base leading-none">×</button>
                </span>
              </div>
            ) : (
              (() => {
                const req = row.requirement
                return (
                  /* EXISTING requirement-row JSX verbatim, with key={req.id} and
                     zebra striping `i % 2 === 1` now using the rows index i */
                  <div key={req.id} onClick={() => !showDeleted && selectRequirement(req.id)} style={gridStyle} className={[
                    'grid',
                    'gap-x-3 items-start px-4 py-3 border-b border-line/60 group border-l-2',
                    i % 2 === 1 ? 'bg-workspace/50' : 'bg-white',
                    showDeleted ? 'opacity-60 border-l-transparent' : 'cursor-pointer hover:bg-action-tint/20',
                    !showDeleted && selectedRequirementId === req.id
                      ? '!bg-action-tint/40 border-l-action'
                      : 'border-l-transparent'
                  ].join(' ')}>
                    {/* ...all existing cells unchanged (checkbox, reqId, text, AC, source, rationale, type, status, priority, actions)... */}
                  </div>
                )
              })()
            )
          )}
```

(The requirement-row cell contents are IDENTICAL to the current file — only the surrounding map changes. Keep the existing checkbox/restore/delete cells exactly as they are.)

6. Empty-state copy: when `rows.length === 0` show the existing messages unchanged.

- [ ] **Step 3: Extend component tests**

In `src/renderer/src/components/RequirementsList/index.test.tsx`:

1. In `beforeEach`'s `Object.assign(storeState, {...})` add:

```ts
    headings: [],
    collapsedHeadingIds: [],
    toggleHeadingCollapsed: vi.fn(),
    addHeading: vi.fn().mockResolvedValue(undefined),
    renameHeading: vi.fn().mockResolvedValue(undefined),
    moveHeading: vi.fn().mockResolvedValue(undefined),
    removeHeading: vi.fn().mockResolvedValue(undefined),
```

2. Add `headingId: null` to `req1`/`req2` fixtures (may already be done in Task 1's fixture sweep).
3. Add a heading fixture and new tests at the end of the describe block:

```ts
  const headingFixture = {
    id: 5, moduleId: 1, parentId: null, title: 'Power', position: 0,
    deletedAt: null, createdAt: '', updatedAt: ''
  }

  it('renders a numbered heading row with requirements grouped under it', () => {
    Object.assign(storeState, {
      headings: [headingFixture],
      requirements: [req1, { ...req2, headingId: 5 }]
    })
    render(<RequirementsList />)
    const headingRow = screen.getByTestId('heading-row-5')
    expect(within(headingRow).getByText('1')).toBeInTheDocument()
    expect(within(headingRow).getByDisplayValue('Power')).toBeInTheDocument()
    // grouped: ungrouped req1 first, then heading, then req2
    const scroll = screen.getByTestId('req-table-scroll')
    const order = scroll.textContent!
    expect(order.indexOf('SRS-0001')).toBeLessThan(order.indexOf('Power'))
    expect(order.indexOf('Power')).toBeLessThan(order.indexOf('SRS-0002'))
  })

  it('adds a top-level heading from the toolbar', async () => {
    render(<RequirementsList />)
    await userEvent.click(screen.getByText('+ Heading'))
    expect(storeState.addHeading).toHaveBeenCalledWith({ moduleId: 1 })
  })

  it('adds a requirement scoped to a heading via the row button', async () => {
    Object.assign(storeState, { headings: [headingFixture] })
    render(<RequirementsList />)
    await userEvent.click(screen.getByLabelText('Add requirement to section'))
    expect(storeState.addRequirement).toHaveBeenCalledWith({ moduleId: 1, text: '', headingId: 5 })
  })

  it('adds a subheading, renames on blur, moves and deletes a heading', async () => {
    Object.assign(storeState, { headings: [headingFixture] })
    render(<RequirementsList />)
    await userEvent.click(screen.getByLabelText('Add subheading'))
    expect(storeState.addHeading).toHaveBeenCalledWith({ moduleId: 1, parentId: 5 })

    const title = screen.getByLabelText('Heading title')
    fireEvent.change(title, { target: { value: 'Thermal' } })
    fireEvent.blur(title)
    expect(storeState.renameHeading).toHaveBeenCalledWith(5, 'Thermal')

    await userEvent.click(screen.getByLabelText('Move section down'))
    expect(storeState.moveHeading).toHaveBeenCalledWith(5, 'down')

    await userEvent.click(screen.getByLabelText('Delete section'))
    expect(storeState.removeHeading).toHaveBeenCalledWith(5)
  })

  it('collapse toggle calls the store and collapsed heading hides its requirements', () => {
    Object.assign(storeState, {
      headings: [headingFixture],
      requirements: [{ ...req2, headingId: 5 }],
      collapsedHeadingIds: [5]
    })
    render(<RequirementsList />)
    expect(screen.queryByText('SRS-0002')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Expand section'))
    expect(storeState.toggleHeadingCollapsed).toHaveBeenCalledWith(5)
  })
```

- [ ] **Step 4: Run tests**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/RequirementsList`
Expected: PASS (existing tests + 5 new). Then `./node_modules/.bin/tsc --noEmit -p tsconfig.web.json` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/store/index.ts src/renderer/src/components/RequirementsList
git commit -m "feat(headings): heading rows in requirements table — add/rename/move/collapse/delete

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Section select in requirement detail drawer

**Files:**
- Modify: `src/renderer/src/components/RequirementDetail/index.tsx`
- Test: `src/renderer/src/components/RequirementDetail/index.test.tsx` (extend)

**Interfaces:**
- Consumes: store `headings: ReqHeading[]` (Task 3), `updateRequirement(id, { headingId })` (Task 1 threads it), `buildOutline` from `../RequirementsList/outline` (Task 2) for numbered labels.

- [ ] **Step 1: Add the Section field**

In `src/renderer/src/components/RequirementDetail/index.tsx`:

1. Add `headings` to the store destructure.
2. Import: `import { buildOutline } from '../RequirementsList/outline'`.
3. After the closing `</div>` of the Type/Status/Priority `grid grid-cols-3` block, add:

```tsx
        <Field label="Section">
          <Select
            aria-label="Section"
            value={req.headingId ?? ''}
            onChange={(e) => updateRequirement(req.id, { headingId: e.target.value === '' ? null : Number(e.target.value) })}
          >
            <option value="">(none)</option>
            {buildOutline(headings, []).map((row) =>
              row.kind === 'heading' ? (
                <option key={row.heading.id} value={row.heading.id}>
                  {row.number} {row.heading.title || 'Untitled section'}
                </option>
              ) : null
            )}
          </Select>
        </Field>
```

- [ ] **Step 2: Extend tests**

In `src/renderer/src/components/RequirementDetail/index.test.tsx` (follow its existing mock pattern — read the file first; it mocks `useStore` the same way as RequirementsList's test):

1. Add `headings: []` and `headingId: null` on the requirement fixture(s) to `beforeEach` state as needed.
2. Add tests:

```ts
  it('shows the section select with numbered heading options and (none)', () => {
    Object.assign(storeState, {
      headings: [
        { id: 5, moduleId: 1, parentId: null, title: 'Power', position: 0, deletedAt: null, createdAt: '', updatedAt: '' },
        { id: 6, moduleId: 1, parentId: 5, title: 'Battery', position: 0, deletedAt: null, createdAt: '', updatedAt: '' }
      ]
    })
    render(<RequirementDetail />)
    const select = screen.getByLabelText('Section') as HTMLSelectElement
    const labels = Array.from(select.options).map((o) => o.textContent)
    expect(labels).toEqual(['(none)', '1 Power', '1.1 Battery'])
  })

  it('assigns and clears the requirement section', () => {
    Object.assign(storeState, {
      headings: [{ id: 5, moduleId: 1, parentId: null, title: 'Power', position: 0, deletedAt: null, createdAt: '', updatedAt: '' }]
    })
    render(<RequirementDetail />)
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: '5' } })
    expect(storeState.updateRequirement).toHaveBeenCalledWith(expect.any(Number), { headingId: 5 })
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: '' } })
    expect(storeState.updateRequirement).toHaveBeenCalledWith(expect.any(Number), { headingId: null })
  })
```

(Adjust fixture/mock names to match the file's existing conventions — e.g. if the mock store object is named differently, use that name.)

- [ ] **Step 3: Run tests**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/RequirementDetail`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/RequirementDetail
git commit -m "feat(headings): section select in requirement detail drawer

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Traceability tab — project link query, store, interactive matrix

**Files:**
- Modify: `src/types/index.ts` (add `ElementRequirementLink`)
- Modify: `src/main/handlers/elementLinks.ts` (project-scoped list)
- Modify: `src/preload/index.ts`, `src/types/api.d.ts`
- Modify: `src/renderer/src/store/index.ts`
- Create: `src/renderer/src/components/TraceabilityMatrix/index.tsx`
- Modify: `src/renderer/src/App.tsx` (4-tab nav + render branch)
- Test: `src/renderer/src/components/TraceabilityMatrix/index.test.tsx`

**Interfaces:**
- Consumes: existing `window.api.elementLinks.add/remove`, `requirements.listByProject`, `elements.list`; store fields `projectRequirements`, `elements`.
- Produces (Task 6 relies on): type `ElementRequirementLink { elementId: number; requirementId: number }`; `window.api.elementLinks.listByProject(projectId): Promise<ElementRequirementLink[]>`; store `traceLinks: ElementRequirementLink[]`, `loadTraceability(): Promise<void>`, `toggleTraceLink(elementId: number, requirementId: number): Promise<void>`; store `activeTab` union widened to `'requirements' | 'architecture' | 'traceability' | 'dashboard'`.

- [ ] **Step 1: Type + main handler**

In `src/types/index.ts` add:

```ts
export interface ElementRequirementLink {
  elementId: number
  requirementId: number
}
```

In `src/main/handlers/elementLinks.ts` add (and register inside its existing `register...` function):

```ts
export function listElementLinksByProject(projectId: number): ElementRequirementLink[] {
  return getDatabase().prepare(`
    SELECT l.element_id AS elementId, l.requirement_id AS requirementId
    FROM element_requirement_links l
    JOIN architecture_elements e ON e.id = l.element_id
    JOIN requirements r ON r.id = l.requirement_id
    WHERE e.project_id = ? AND e.deleted_at IS NULL AND r.deleted_at IS NULL
  `).all(projectId) as ElementRequirementLink[]
}
```

```ts
  ipcMain.handle('elementLinks:listByProject', (_e, projectId: number) => listElementLinksByProject(projectId))
```

(Import `ElementRequirementLink` from `'../../types'` in that file.)

Preload `src/preload/index.ts`, inside the `elementLinks` group:

```ts
    listByProject: (projectId: number): Promise<ElementRequirementLink[]> => ipcRenderer.invoke('elementLinks:listByProject', projectId),
```

Mirror in `src/types/api.d.ts` inside `elementLinks`:

```ts
        listByProject(projectId: number): Promise<ElementRequirementLink[]>
```

(Add `ElementRequirementLink` to both files' type imports.)

- [ ] **Step 2: Store — tab union + traceability state**

In `src/renderer/src/store/index.ts`:

1. Widen the tab type in BOTH places it appears (state field and `setActiveTab` signature):

```ts
  activeTab: 'requirements' | 'architecture' | 'traceability' | 'dashboard'
  ...
  setActiveTab: (tab: 'requirements' | 'architecture' | 'traceability' | 'dashboard') => void
```

2. Add to the `Store` interface (architecture section):

```ts
  traceLinks: ElementRequirementLink[]
  loadTraceability: () => Promise<void>
  toggleTraceLink: (elementId: number, requirementId: number) => Promise<void>
```

3. Initial state: `traceLinks: [],`. Import `ElementRequirementLink` type.
4. Actions (after `loadArchitecture`):

```ts
  loadTraceability: async () => {
    const { project } = get()
    if (!project) return
    const [projectRequirements, elements, traceLinks] = await Promise.all([
      window.api.requirements.listByProject(project.id),
      window.api.elements.list(project.id),
      window.api.elementLinks.listByProject(project.id)
    ])
    set({ projectRequirements, elements, traceLinks })
  },

  toggleTraceLink: async (elementId, requirementId) => {
    const { traceLinks, project } = get()
    const exists = traceLinks.some((l) => l.elementId === elementId && l.requirementId === requirementId)
    if (exists) await window.api.elementLinks.remove(elementId, requirementId)
    else await window.api.elementLinks.add(elementId, requirementId)
    if (!project) return
    set({ traceLinks: await window.api.elementLinks.listByProject(project.id) })
  },
```

- [ ] **Step 3: Write the failing component test**

Create `src/renderer/src/components/TraceabilityMatrix/index.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import TraceabilityMatrix from './index'

const storeState: any = {}

vi.mock('../../store', () => ({
  useStore: () => storeState
}))

const req = (id: number): any => ({
  id, moduleId: 1, reqId: `SRS-${id}`, text: `Req ${id}`,
  acceptanceCriteria: null, source: null, rationale: null,
  status: 'Draft', priority: 'Medium', reqType: 'Functional',
  headingId: null, position: 0, deletedAt: null, createdAt: '', updatedAt: ''
})

const el = (id: number, name = ''): any => ({
  id, projectId: 1, parentId: null, blockId: `SYS-00${id}`, name,
  elementTypeId: null, description: null, color: null,
  posX: 0, posY: 0, width: 160, height: 80,
  deletedAt: null, createdAt: '', updatedAt: ''
})

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(storeState, {
    project: { id: 1, name: 'P' },
    projectRequirements: [req(1), req(2)],
    elements: [el(1, 'Engine'), el(2)],
    traceLinks: [{ elementId: 1, requirementId: 1 }],
    loadTraceability: vi.fn().mockResolvedValue(undefined),
    toggleTraceLink: vi.fn().mockResolvedValue(undefined)
  })
})

describe('TraceabilityMatrix', () => {
  it('renders requirement rows, object columns, and the coverage summary', () => {
    render(<TraceabilityMatrix />)
    expect(screen.getByText('SRS-1')).toBeInTheDocument()
    expect(screen.getByText(/Engine/)).toBeInTheDocument()
    expect(screen.getByText('SYS-002')).toBeInTheDocument()
    const summary = screen.getByTestId('coverage-summary')
    // 1 of 2 requirements linked → 50%
    expect(within(summary).getByText('50%')).toBeInTheDocument()
    expect(within(summary).getByText('2')).toBeInTheDocument()
  })

  it('shows a linked cell and toggles links on cell click', () => {
    render(<TraceabilityMatrix />)
    const linkedCell = screen.getByLabelText('Unlink SRS-1 and SYS-001')
    fireEvent.click(linkedCell)
    expect(storeState.toggleTraceLink).toHaveBeenCalledWith(1, 1)
    const unlinkedCell = screen.getByLabelText('Link SRS-2 and SYS-002')
    fireEvent.click(unlinkedCell)
    expect(storeState.toggleTraceLink).toHaveBeenCalledWith(2, 2)
  })

  it('shows per-row and per-column totals', () => {
    render(<TraceabilityMatrix />)
    // row for SRS-2 has 0 links; totals row exists
    expect(screen.getByText('Requirements per object')).toBeInTheDocument()
  })

  it('loads traceability data on mount', () => {
    render(<TraceabilityMatrix />)
    expect(storeState.loadTraceability).toHaveBeenCalled()
  })

  it('renders empty state without a project', () => {
    storeState.project = null
    render(<TraceabilityMatrix />)
    expect(screen.getByText(/Open or create a project/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/TraceabilityMatrix`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 5: Implement `src/renderer/src/components/TraceabilityMatrix/index.tsx`**

```tsx
import { useEffect } from 'react'
import { useStore } from '../../store'

export default function TraceabilityMatrix(): JSX.Element {
  const { project, projectRequirements, elements, traceLinks, loadTraceability, toggleTraceLink } = useStore()

  useEffect(() => { if (project) loadTraceability() }, [project?.id])

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-ink-faint">
        Open or create a project to view traceability.
      </div>
    )
  }

  const linked = new Set(traceLinks.map((l) => `${l.elementId}:${l.requirementId}`))
  const reqLinkCount = (rid: number): number => traceLinks.filter((l) => l.requirementId === rid).length
  const elLinkCount = (eid: number): number => traceLinks.filter((l) => l.elementId === eid).length
  const linkedReqs = projectRequirements.filter((r) => reqLinkCount(r.id) > 0).length
  const coverage = projectRequirements.length === 0 ? 0 : Math.round((linkedReqs / projectRequirements.length) * 100)

  return (
    <div className="flex flex-col h-full">
      <div className="h-12 px-4 border-b border-line bg-white flex items-center justify-between shrink-0">
        <span className="text-lg font-semibold tracking-tight text-ink">Traceability Matrix</span>
        <div className="flex items-center gap-4 text-xs text-ink-muted" data-testid="coverage-summary">
          <span>Requirements <b className="text-ink">{projectRequirements.length}</b></span>
          <span>Linked <b className="text-ink">{linkedReqs}</b></span>
          <span>Unlinked <b className={projectRequirements.length - linkedReqs > 0 ? 'text-error' : 'text-ink'}>{projectRequirements.length - linkedReqs}</b></span>
          <span className="flex items-center gap-1.5">
            <span className="w-24 h-1.5 rounded bg-line overflow-hidden inline-block">
              <span className="block h-full bg-action" style={{ width: `${coverage}%` }} />
            </span>
            <b className="text-ink">{coverage}%</b>
          </span>
        </div>
      </div>
      {elements.length === 0 || projectRequirements.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-sm text-ink-faint">
          Needs at least one requirement and one object to build the matrix.
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 bg-workspace border-b border-r border-line" />
                {elements.map((el) => (
                  <th key={el.id} className="sticky top-0 z-10 bg-workspace border-b border-line px-1 pt-3 pb-2 align-bottom font-medium text-ink-muted">
                    <span className="[writing-mode:vertical-rl] rotate-180 whitespace-nowrap max-h-44 overflow-hidden inline-block">
                      {el.name ? `${el.name} · ${el.blockId}` : el.blockId}
                    </span>
                  </th>
                ))}
                <th className="sticky top-0 z-10 bg-workspace border-b border-line px-2 pb-2 align-bottom font-medium text-ink-faint">Objects</th>
              </tr>
            </thead>
            <tbody>
              {projectRequirements.map((req) => (
                <tr key={req.id}>
                  <td className="sticky left-0 z-10 bg-white border-b border-r border-line/60 px-3 py-1.5 whitespace-nowrap">
                    <span className="font-mono text-ink-faint mr-2">{req.reqId}</span>
                    <span className="text-ink inline-block max-w-[240px] truncate align-bottom">{req.text}</span>
                  </td>
                  {elements.map((el) => {
                    const on = linked.has(`${el.id}:${req.id}`)
                    return (
                      <td key={el.id} className="border-b border-line/60 text-center p-0">
                        <button
                          aria-label={`${on ? 'Unlink' : 'Link'} ${req.reqId} and ${el.blockId}`}
                          onClick={() => toggleTraceLink(el.id, req.id)}
                          className={`w-9 h-7 ${on ? 'text-action font-bold' : 'text-line hover:text-ink-faint'}`}
                        >
                          {on ? '●' : '·'}
                        </button>
                      </td>
                    )
                  })}
                  <td className={`border-b border-line/60 text-center px-2 font-medium ${reqLinkCount(req.id) === 0 ? 'text-error' : 'text-ink-muted'}`}>
                    {reqLinkCount(req.id)}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="sticky left-0 z-10 bg-workspace border-r border-line px-3 py-1.5 text-ink-faint font-medium whitespace-nowrap">Requirements per object</td>
                {elements.map((el) => (
                  <td key={el.id} className="text-center text-ink-muted bg-workspace font-medium">{elLinkCount(el.id)}</td>
                ))}
                <td className="bg-workspace" />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: App tab nav**

In `src/renderer/src/App.tsx`:

1. `import TraceabilityMatrix from './components/TraceabilityMatrix'`.
2. Replace the nav map source with all four tabs and a label lookup:

```tsx
          {([['requirements', 'Requirements'], ['architecture', 'Architecture'], ['traceability', 'Traceability'], ['dashboard', 'Dashboard']] as const).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 h-full text-sm font-medium border-b-[3px] transition-colors
                ${activeTab === tab
                  ? 'border-action-tint text-white'
                  : 'border-transparent text-white/60 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
```

3. Replace the body ternary with explicit branches (dashboard branch renders a placeholder `<div />` until Task 6 replaces it — acceptable interim ONLY if Task 6 lands in the same session; otherwise render `TraceabilityMatrix` for traceability and keep dashboard out of the nav array until Task 6. Prefer: add BOTH tab entries in Task 6; in THIS task add only `['traceability', 'Traceability']`):

```tsx
      {activeTab === 'requirements' ? (
        /* existing requirements layout unchanged */
      ) : activeTab === 'traceability' ? (
        <div data-testid="panel-traceability" className="flex-1 overflow-hidden">
          <TraceabilityMatrix />
        </div>
      ) : (
        /* existing architecture layout unchanged */
      )}
```

So in Task 5 the nav array is `[['requirements', 'Requirements'], ['architecture', 'Architecture'], ['traceability', 'Traceability']] as const`.

4. In `src/renderer/src/App.test.tsx`, extend the mocked store (it follows the same `storeState` pattern) with any new members referenced (`traceLinks`, etc. only if App references them — it does not; just verify the suite still passes). Add a test:

```tsx
  it('shows the traceability tab and renders the matrix when selected', () => {
    storeState.activeTab = 'traceability'
    render(<App />)
    expect(screen.getByTestId('panel-traceability')).toBeInTheDocument()
  })
```

(Mock `./components/TraceabilityMatrix` the way App.test.tsx mocks other child components — check the file's existing `vi.mock` calls and mirror them.)

- [ ] **Step 7: Run tests + typecheck**

```bash
./node_modules/.bin/vitest run src/renderer
./node_modules/.bin/tsc --noEmit -p tsconfig.web.json
./node_modules/.bin/tsc --noEmit -p tsconfig.node.json
```
Expected: renderer suite green except the 1 pre-existing ArchitectureCanvas failure; typechecks clean.

- [ ] **Step 8: Commit**

```bash
git add -A src
git commit -m "feat(traceability): interactive requirements-by-objects matrix tab with coverage summary

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Dashboard tab — stats helper + widgets

**Files:**
- Create: `src/renderer/src/components/Dashboard/stats.ts`
- Create: `src/renderer/src/components/Dashboard/index.tsx`
- Modify: `src/renderer/src/store/index.ts` (add `openRequirement`)
- Modify: `src/renderer/src/App.tsx` (add dashboard tab entry + branch)
- Test: `src/renderer/src/components/Dashboard/stats.test.ts`
- Test: `src/renderer/src/components/Dashboard/index.test.tsx`

**Interfaces:**
- Consumes: store `projectRequirements`, `elements`, `traceLinks`, `loadTraceability` (Task 5).
- Produces: `computeStats(requirements: Requirement[], elements: ArchitectureElement[], links: ElementRequirementLink[]): DashboardStats`; store `openRequirement(req: Requirement): Promise<void>`.

- [ ] **Step 1: Write failing stats tests**

Create `src/renderer/src/components/Dashboard/stats.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeStats } from './stats'
import type { Requirement } from '../../../../types'

function req(partial: Partial<Requirement> & { id: number }): Requirement {
  return {
    moduleId: 1, reqId: `SRS-${partial.id}`, text: `R${partial.id}`,
    acceptanceCriteria: null, source: null, rationale: null,
    status: 'Draft', priority: 'Medium', reqType: 'Functional',
    headingId: null, position: 0, deletedAt: null, createdAt: '', updatedAt: '2026-01-01', ...partial
  }
}

const el = { id: 1, projectId: 1, parentId: null, blockId: 'SYS-001', name: '', elementTypeId: null, description: null, color: null, posX: 0, posY: 0, width: 160, height: 80, deletedAt: null, createdAt: '', updatedAt: '' }

describe('computeStats', () => {
  it('counts totals, coverage and unallocated', () => {
    const s = computeStats(
      [req({ id: 1 }), req({ id: 2 }), req({ id: 3 })],
      [el],
      [{ elementId: 1, requirementId: 1 }, { elementId: 1, requirementId: 2 }]
    )
    expect(s.totalRequirements).toBe(3)
    expect(s.totalObjects).toBe(1)
    expect(s.coveragePct).toBe(67)
    expect(s.unallocated.map((r) => r.id)).toEqual([3])
  })

  it('handles the empty project without dividing by zero', () => {
    const s = computeStats([], [], [])
    expect(s.coveragePct).toBe(0)
    expect(s.totalRequirements).toBe(0)
  })

  it('tallies status, priority and type sorted by count descending', () => {
    const s = computeStats(
      [req({ id: 1, status: 'Approved' }), req({ id: 2, status: 'Approved' }), req({ id: 3, status: 'Draft', priority: 'High' })],
      [], []
    )
    expect(s.byStatus).toEqual([['Approved', 2], ['Draft', 1]])
    expect(s.byPriority).toEqual([['Medium', 2], ['High', 1]])
    expect(s.byType).toEqual([['Functional', 3]])
  })

  it('lists the 8 most recently updated requirements, newest first', () => {
    const reqs = Array.from({ length: 10 }, (_, i) => req({ id: i + 1, updatedAt: `2026-01-${String(i + 1).padStart(2, '0')}` }))
    const s = computeStats(reqs, [], [])
    expect(s.recent).toHaveLength(8)
    expect(s.recent[0].id).toBe(10)
    expect(s.recent[7].id).toBe(3)
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/Dashboard/stats.test.ts`
Expected: FAIL — cannot resolve `./stats`.

- [ ] **Step 3: Implement `src/renderer/src/components/Dashboard/stats.ts`**

```ts
import type { Requirement, ArchitectureElement, ElementRequirementLink } from '../../../../types'

export interface DashboardStats {
  totalRequirements: number
  totalObjects: number
  coveragePct: number
  unallocated: Requirement[]
  byStatus: [string, number][]
  byPriority: [string, number][]
  byType: [string, number][]
  recent: Requirement[]
}

function tally(reqs: Requirement[], key: (r: Requirement) => string): [string, number][] {
  const counts = new Map<string, number>()
  for (const r of reqs) counts.set(key(r), (counts.get(key(r)) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

export function computeStats(
  requirements: Requirement[],
  elements: ArchitectureElement[],
  links: ElementRequirementLink[]
): DashboardStats {
  const linkedIds = new Set(links.map((l) => l.requirementId))
  const unallocated = requirements.filter((r) => !linkedIds.has(r.id))
  return {
    totalRequirements: requirements.length,
    totalObjects: elements.length,
    coveragePct: requirements.length === 0
      ? 0
      : Math.round(((requirements.length - unallocated.length) / requirements.length) * 100),
    unallocated,
    byStatus: tally(requirements, (r) => r.status),
    byPriority: tally(requirements, (r) => r.priority),
    byType: tally(requirements, (r) => r.reqType),
    recent: [...requirements].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8)
  }
}
```

- [ ] **Step 4: Run stats tests — expect PASS**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/Dashboard/stats.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Store `openRequirement` + Dashboard component**

In `src/renderer/src/store/index.ts`, add to the `Store` interface (requirements section): `openRequirement: (req: Requirement) => Promise<void>` and implement (after `selectRequirement`):

```ts
  openRequirement: async (req) => {
    set({ activeTab: 'requirements' })
    await get().selectModule(req.moduleId)
    set({ selectedRequirementId: req.id })
  },
```

Create `src/renderer/src/components/Dashboard/index.tsx`:

```tsx
import { useEffect } from 'react'
import { useStore } from '../../store'
import { SectionLabel } from '../ui'
import { computeStats } from './stats'
import type { Requirement } from '../../../../types'

export default function Dashboard(): JSX.Element {
  const { project, projectRequirements, elements, traceLinks, loadTraceability, openRequirement } = useStore()

  useEffect(() => { if (project) loadTraceability() }, [project?.id])

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-ink-faint">
        Open or create a project to view the dashboard.
      </div>
    )
  }

  const stats = computeStats(projectRequirements, elements, traceLinks)

  return (
    <div className="h-full overflow-y-auto bg-workspace">
      <div className="p-6 flex flex-col gap-5 max-w-5xl">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{project.name} — Project Dashboard</h1>

        <div className="grid grid-cols-4 gap-4" data-testid="kpi-cards">
          <KpiCard label="Requirements" value={String(stats.totalRequirements)} />
          <KpiCard label="Objects" value={String(stats.totalObjects)} />
          <KpiCard label="Allocation coverage" value={`${stats.coveragePct}%`} />
          <KpiCard label="Unallocated" value={String(stats.unallocated.length)} alert={stats.unallocated.length > 0} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <BreakdownCard title="By Status" data={stats.byStatus} total={stats.totalRequirements} />
          <BreakdownCard title="By Priority" data={stats.byPriority} total={stats.totalRequirements} />
          <BreakdownCard title="By Type" data={stats.byType} total={stats.totalRequirements} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <ReqListCard
            title="Unallocated requirements"
            empty="Every requirement is allocated to an object."
            reqs={stats.unallocated}
            onOpen={openRequirement}
          />
          <ReqListCard
            title="Recently updated"
            empty="No requirements yet."
            reqs={stats.recent}
            onOpen={openRequirement}
          />
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, alert = false }: { label: string; value: string; alert?: boolean }): JSX.Element {
  return (
    <div className="bg-white border border-line rounded p-4">
      <SectionLabel className="block mb-1">{label}</SectionLabel>
      <div className={`text-2xl font-semibold tracking-tight ${alert ? 'text-error' : 'text-ink'}`}>{value}</div>
    </div>
  )
}

function BreakdownCard({ title, data, total }: { title: string; data: [string, number][]; total: number }): JSX.Element {
  return (
    <div className="bg-white border border-line rounded p-4">
      <SectionLabel className="block mb-3">{title}</SectionLabel>
      {data.length === 0 && <div className="text-xs text-ink-faint">No requirements.</div>}
      <div className="space-y-2">
        {data.map(([label, count]) => (
          <div key={label} className="text-xs">
            <div className="flex justify-between mb-0.5">
              <span className="text-ink">{label}</span>
              <span className="text-ink-muted">{count}</span>
            </div>
            <div className="h-1.5 rounded bg-workspace overflow-hidden">
              <div className="h-full bg-action" style={{ width: `${total === 0 ? 0 : Math.round((count / total) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReqListCard({
  title, empty, reqs, onOpen
}: {
  title: string
  empty: string
  reqs: Requirement[]
  onOpen: (req: Requirement) => Promise<void>
}): JSX.Element {
  return (
    <div className="bg-white border border-line rounded p-4">
      <SectionLabel className="block mb-2">{title}</SectionLabel>
      {reqs.length === 0 && <div className="text-xs text-ink-faint">{empty}</div>}
      <div className="divide-y divide-line/60">
        {reqs.map((r) => (
          <button
            key={r.id}
            onClick={() => onOpen(r)}
            className="w-full text-left py-1.5 flex gap-2 items-baseline hover:bg-action-tint/20 px-1 rounded"
          >
            <span className="text-xs font-mono text-ink-faint shrink-0">{r.reqId}</span>
            <span className="text-xs text-ink truncate">{r.text || <i className="text-ink-faint/50">—</i>}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: App tab + component test**

In `src/renderer/src/App.tsx`: `import Dashboard from './components/Dashboard'`, add `['dashboard', 'Dashboard']` to the nav array (after traceability), and add the branch:

```tsx
      ) : activeTab === 'dashboard' ? (
        <div data-testid="panel-dashboard" className="flex-1 overflow-hidden">
          <Dashboard />
        </div>
```

Create `src/renderer/src/components/Dashboard/index.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import Dashboard from './index'

const storeState: any = {}

vi.mock('../../store', () => ({
  useStore: () => storeState
}))

const req = (id: number, extra: object = {}): any => ({
  id, moduleId: 1, reqId: `SRS-${id}`, text: `Req ${id}`,
  acceptanceCriteria: null, source: null, rationale: null,
  status: 'Draft', priority: 'Medium', reqType: 'Functional',
  headingId: null, position: 0, deletedAt: null, createdAt: '', updatedAt: '2026-01-01', ...extra
})

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(storeState, {
    project: { id: 1, name: 'Demo' },
    projectRequirements: [req(1), req(2)],
    elements: [{ id: 1, projectId: 1, parentId: null, blockId: 'SYS-001', name: '', elementTypeId: null, description: null, color: null, posX: 0, posY: 0, width: 160, height: 80, deletedAt: null, createdAt: '', updatedAt: '' }],
    traceLinks: [{ elementId: 1, requirementId: 1 }],
    loadTraceability: vi.fn().mockResolvedValue(undefined),
    openRequirement: vi.fn().mockResolvedValue(undefined)
  })
})

describe('Dashboard', () => {
  it('renders KPI cards with totals, coverage and unallocated count', () => {
    render(<Dashboard />)
    const kpis = screen.getByTestId('kpi-cards')
    expect(within(kpis).getByText('Requirements')).toBeInTheDocument()
    expect(within(kpis).getByText('50%')).toBeInTheDocument()
    expect(within(kpis).getByText('Unallocated')).toBeInTheDocument()
  })

  it('renders status/priority/type breakdowns', () => {
    render(<Dashboard />)
    expect(screen.getByText('By Status')).toBeInTheDocument()
    expect(screen.getByText('By Priority')).toBeInTheDocument()
    expect(screen.getByText('By Type')).toBeInTheDocument()
  })

  it('lists unallocated requirements and opens one on click', () => {
    render(<Dashboard />)
    // SRS-2 is unallocated → appears in the unallocated card and the recent card
    fireEvent.click(screen.getAllByText('SRS-2')[0].closest('button')!)
    expect(storeState.openRequirement).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }))
  })

  it('loads data on mount and shows empty state without a project', () => {
    render(<Dashboard />)
    expect(storeState.loadTraceability).toHaveBeenCalled()
    storeState.project = null
    render(<Dashboard />)
    expect(screen.getByText(/Open or create a project/)).toBeInTheDocument()
  })
})
```

In `src/renderer/src/App.test.tsx`, mirror the TraceabilityMatrix mock for `./components/Dashboard` and add:

```tsx
  it('shows the dashboard tab and renders it when selected', () => {
    storeState.activeTab = 'dashboard'
    render(<App />)
    expect(screen.getByTestId('panel-dashboard')).toBeInTheDocument()
  })
```

- [ ] **Step 7: Full renderer suite + typecheck**

```bash
./node_modules/.bin/vitest run src/renderer
./node_modules/.bin/tsc --noEmit -p tsconfig.web.json
```
Expected: green except the 1 pre-existing ArchitectureCanvas failure; typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add -A src
git commit -m "feat(dashboard): project dashboard tab — KPIs, breakdowns, unallocated and recent lists

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Post-plan verification (controller, not a task)

After the final review: rebuild and relaunch the app, then verify live via the Playwright driver (`.claude/skills/run-app/driver.mjs`): create a heading + subheading, add a requirement under each, check numbering; open Traceability, toggle a cell, confirm coverage updates; open Dashboard, confirm KPI numbers and click-through to a requirement.
