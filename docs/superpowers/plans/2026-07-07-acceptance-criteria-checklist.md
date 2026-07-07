# Acceptance Criteria Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-text acceptance criteria with structured per-item checklists (text + Unverified/Passed/Failed status), edited in the requirement drawer and summarized in the requirements table.

**Architecture:** New `acceptance_criteria` child table mirroring the `requirement_custom_fields` idiom (main handlers → preload → `window.api` → zustand store → React). One-time idempotent migration splits existing free text line-per-item. Drawer gets a checklist section replacing the textarea; the table's Acceptance Criteria column shows `passed/total` + first item via a per-module summary loaded in one query.

**Tech Stack:** Electron IPC (better-sqlite3) → preload → zustand → React; vitest + @testing-library/react.

Spec: `docs/superpowers/specs/2026-07-07-acceptance-criteria-checklist-design.md`

## Global Constraints

- Renderer NEVER touches the DB directly — all data flows through `window.api` (preload) → `ipcMain.handle` (main). Every new `window.api` method appears in BOTH `src/preload/index.ts` and `src/types/api.d.ts`.
- Tailwind semantic tokens only in classNames (`text-ink`, `bg-workspace`, `border-line`, `bg-action`, `text-error`, etc.; `bg-white`/`text-white` established convention).
- Tests: `./node_modules/.bin/vitest run <paths>` — NEVER `npm run` (npm shim broken). Typechecks: `./node_modules/.bin/tsc --noEmit -p tsconfig.web.json` AND `-p tsconfig.node.json` — both clean.
- Do NOT write vitest tests under `src/main/**` (better-sqlite3 ABI mismatch; baseline = 47 main-process failures + 1 pre-existing ArchitectureCanvas failure). Main-process code is verified by typecheck + live app checks. All renderer tests must pass.
- Commits go straight to `main`. Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- PATH prefix required in every shell: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"`.
- `CHIP_STYLES` in `src/renderer/src/components/ui/index.tsx` is a shared value-key namespace — new keys must not collide with existing ones (Draft/Review/Approved/Rejected/High/Medium/Low).
- Out of scope: verification method/evidence per item, dashboard AC stats, traceability-matrix integration, drag-and-drop reorder, bulk status ops.

---

### Task 1: Backend — types, table + free-text migration, handlers, IPC/preload mirrors

**Files:**
- Modify: `src/types/index.ts` (after the `REQUIREMENT_TYPES` block ~line 34, and after `UpdateCustomFieldInput`)
- Modify: `src/main/db/migrations.ts`
- Create: `src/main/handlers/acceptanceCriteria.ts`
- Modify: `src/main/index.ts` (import + register)
- Modify: `src/preload/index.ts` (new group after `customFields`)
- Modify: `src/types/api.d.ts` (new group after `customFields`)

**Interfaces:**
- Consumes: existing `getDatabase()`, `addColumnIfMissing` pattern (not needed here), `now()` idiom from sibling handlers.
- Produces (Tasks 2-4 rely on): `AcceptanceCriterion`, `AC_STATUSES`, `AcStatus`, `UpdateAcceptanceCriterionInput` types; `window.api.acceptanceCriteria.{list, create, update, remove, move, listByModule}` exactly as typed below.

No vitest here (main-process). Verified by typecheck now + live checks in Task 5.

- [ ] **Step 1: Add types**

In `src/types/index.ts`, after the `REQUIREMENT_TYPES`/`RequirementType` block:

```ts
export const AC_STATUSES = ['Unverified', 'Passed', 'Failed'] as const
export type AcStatus = (typeof AC_STATUSES)[number]

export interface AcceptanceCriterion {
  id: number
  requirementId: number
  text: string
  status: AcStatus
  position: number
  createdAt: string
  updatedAt: string
}

export interface UpdateAcceptanceCriterionInput {
  text?: string
  status?: AcStatus
}
```

- [ ] **Step 2: Migration — table + idempotent free-text conversion**

In `src/main/db/migrations.ts`, append to the `db.exec` CREATE-TABLE block (before the closing backtick):

```sql
    CREATE TABLE IF NOT EXISTS acceptance_criteria (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      requirement_id INTEGER NOT NULL REFERENCES requirements(id),
      text           TEXT    NOT NULL,
      status         TEXT    NOT NULL DEFAULT 'Unverified',
      position       INTEGER NOT NULL,
      created_at     TEXT    NOT NULL,
      updated_at     TEXT    NOT NULL
    );
```

Then, at the END of `runMigrations` (after all `addColumnIfMissing` calls), add the conversion:

```ts
  // One-time conversion: split legacy free-text acceptance_criteria into checklist items.
  // Per-row idempotent — each converted row is set to NULL, so re-runs are no-ops.
  const legacyRows = db
    .prepare("SELECT id, acceptance_criteria FROM requirements WHERE acceptance_criteria IS NOT NULL AND TRIM(acceptance_criteria) != ''")
    .all() as { id: number; acceptance_criteria: string }[]
  if (legacyRows.length > 0) {
    const ts = new Date().toISOString()
    const insert = db.prepare(
      'INSERT INTO acceptance_criteria (requirement_id, text, status, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    const clear = db.prepare('UPDATE requirements SET acceptance_criteria = NULL WHERE id = ?')
    db.transaction(() => {
      for (const row of legacyRows) {
        const lines = row.acceptance_criteria.split('\n').map((l) => l.trim()).filter((l) => l !== '')
        lines.forEach((line, i) => insert.run(row.id, line, 'Unverified', i, ts, ts))
        clear.run(row.id)
      }
    })()
  }
```

- [ ] **Step 3: Handler file**

Create `src/main/handlers/acceptanceCriteria.ts`:

```ts
import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import type { AcceptanceCriterion, UpdateAcceptanceCriterionInput } from '../../types'

function now(): string { return new Date().toISOString() }

function rowToCriterion(row: any): AcceptanceCriterion {
  return {
    id: row.id,
    requirementId: row.requirement_id,
    text: row.text,
    status: row.status,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function registerAcceptanceCriteriaHandlers(): void {
  ipcMain.handle('acceptanceCriteria:list', (_e, requirementId: number) => {
    return (getDatabase()
      .prepare('SELECT * FROM acceptance_criteria WHERE requirement_id = ? ORDER BY position, id')
      .all(requirementId) as any[]).map(rowToCriterion)
  })

  ipcMain.handle('acceptanceCriteria:listByModule', (_e, moduleId: number) => {
    return (getDatabase()
      .prepare(`
        SELECT ac.* FROM acceptance_criteria ac
        JOIN requirements r ON r.id = ac.requirement_id
        WHERE r.module_id = ? AND r.deleted_at IS NULL
        ORDER BY ac.requirement_id, ac.position, ac.id
      `)
      .all(moduleId) as any[]).map(rowToCriterion)
  })

  ipcMain.handle('acceptanceCriteria:create', (_e, requirementId: number, text: string) => {
    const db = getDatabase()
    const ts = now()
    const row = db.prepare('SELECT COALESCE(MAX(position), -1) as mp FROM acceptance_criteria WHERE requirement_id = ?').get(requirementId) as any
    const result = db
      .prepare('INSERT INTO acceptance_criteria (requirement_id, text, status, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(requirementId, text, 'Unverified', (row.mp as number) + 1, ts, ts)
    return rowToCriterion(db.prepare('SELECT * FROM acceptance_criteria WHERE id = ?').get(result.lastInsertRowid))
  })

  ipcMain.handle('acceptanceCriteria:update', (_e, id: number, patch: UpdateAcceptanceCriterionInput) => {
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM acceptance_criteria WHERE id = ?').get(id) as any
    if (!existing) throw new Error(`Acceptance criterion ${id} not found`)
    db.prepare('UPDATE acceptance_criteria SET text = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(patch.text ?? existing.text, patch.status ?? existing.status, now(), id)
    return rowToCriterion(db.prepare('SELECT * FROM acceptance_criteria WHERE id = ?').get(id))
  })

  ipcMain.handle('acceptanceCriteria:delete', (_e, id: number) => {
    getDatabase().prepare('DELETE FROM acceptance_criteria WHERE id = ?').run(id)
  })

  ipcMain.handle('acceptanceCriteria:move', (_e, id: number, direction: 'up' | 'down') => {
    const db = getDatabase()
    db.transaction(() => {
      const item = db.prepare('SELECT * FROM acceptance_criteria WHERE id = ?').get(id) as any
      if (!item) throw new Error(`Acceptance criterion ${id} not found`)
      const neighbor = db.prepare(`
        SELECT * FROM acceptance_criteria
        WHERE requirement_id = ?
          AND position ${direction === 'up' ? '<' : '>'} ?
        ORDER BY position ${direction === 'up' ? 'DESC' : 'ASC'} LIMIT 1
      `).get(item.requirement_id, item.position) as any
      if (!neighbor) return
      const ts = now()
      db.prepare('UPDATE acceptance_criteria SET position = ?, updated_at = ? WHERE id = ?').run(neighbor.position, ts, item.id)
      db.prepare('UPDATE acceptance_criteria SET position = ?, updated_at = ? WHERE id = ?').run(item.position, ts, neighbor.id)
    })()
  })
}
```

- [ ] **Step 4: Register in main**

In `src/main/index.ts`: add import `import { registerAcceptanceCriteriaHandlers } from './handlers/acceptanceCriteria'` after the `registerCustomFieldHandlers` import, and call `registerAcceptanceCriteriaHandlers()` after `registerCustomFieldHandlers()` in the registration block.

- [ ] **Step 5: Preload mirror**

In `src/preload/index.ts`, add `AcceptanceCriterion, UpdateAcceptanceCriterionInput` to the types import, then after the `customFields` group:

```ts
  acceptanceCriteria: {
    list: (requirementId: number): Promise<AcceptanceCriterion[]> => ipcRenderer.invoke('acceptanceCriteria:list', requirementId),
    listByModule: (moduleId: number): Promise<AcceptanceCriterion[]> => ipcRenderer.invoke('acceptanceCriteria:listByModule', moduleId),
    create: (requirementId: number, text: string): Promise<AcceptanceCriterion> => ipcRenderer.invoke('acceptanceCriteria:create', requirementId, text),
    update: (id: number, patch: UpdateAcceptanceCriterionInput): Promise<AcceptanceCriterion> => ipcRenderer.invoke('acceptanceCriteria:update', id, patch),
    remove: (id: number): Promise<void> => ipcRenderer.invoke('acceptanceCriteria:delete', id),
    move: (id: number, direction: 'up' | 'down'): Promise<void> => ipcRenderer.invoke('acceptanceCriteria:move', id, direction)
  },
```

- [ ] **Step 6: api.d.ts mirror**

In `src/types/api.d.ts`, add `AcceptanceCriterion, UpdateAcceptanceCriterionInput` to the import, then after the `customFields` group:

```ts
      acceptanceCriteria: {
        list(requirementId: number): Promise<AcceptanceCriterion[]>
        listByModule(moduleId: number): Promise<AcceptanceCriterion[]>
        create(requirementId: number, text: string): Promise<AcceptanceCriterion>
        update(id: number, patch: UpdateAcceptanceCriterionInput): Promise<AcceptanceCriterion>
        remove(id: number): Promise<void>
        move(id: number, direction: 'up' | 'down'): Promise<void>
      }
```

- [ ] **Step 7: Typecheck both configs**

Run:
```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.node.json
./node_modules/.bin/tsc --noEmit -p tsconfig.web.json
```
Expected: both clean, no output.

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/main/db/migrations.ts src/main/handlers/acceptanceCriteria.ts src/main/index.ts src/preload/index.ts src/types/api.d.ts
git commit -m "feat(ac): acceptance_criteria table, free-text line-split migration, CRUD+move IPC"
```

---

### Task 2: Store — acItems, acSummary, actions, summary helper

**Files:**
- Create: `src/renderer/src/store/acSummary.ts`
- Modify: `src/renderer/src/store/index.ts`
- Test: `src/renderer/src/store/acceptanceCriteria.test.ts` (create), `src/renderer/src/store/acSummary.test.ts` (create)

**Interfaces:**
- Consumes: `window.api.acceptanceCriteria.*` (Task 1), `AcceptanceCriterion` type.
- Produces (Tasks 3-4 rely on): store members `acItems: AcceptanceCriterion[]`, `acSummary: Record<number, AcSummaryEntry>`, `loadAcItems(reqId)`, `addAcItem(reqId, text)`, `updateAcItem(id, patch)`, `removeAcItem(id)`, `moveAcItem(id, direction)`; helper `summarize(items: AcceptanceCriterion[]): Record<number, AcSummaryEntry>` with `AcSummaryEntry = { passed: number; total: number; first: string }` exported from `store/acSummary.ts`.

- [ ] **Step 1: Write failing helper test**

Create `src/renderer/src/store/acSummary.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { summarize } from './acSummary'
import type { AcceptanceCriterion } from '../../../types'

function item(over: Partial<AcceptanceCriterion>): AcceptanceCriterion {
  return {
    id: 1, requirementId: 1, text: '', status: 'Unverified', position: 0,
    createdAt: '', updatedAt: '', ...over
  }
}

describe('summarize', () => {
  it('groups by requirement with passed count and first text by position', () => {
    const s = summarize([
      item({ id: 1, requirementId: 10, text: 'boots in 2s', status: 'Passed', position: 1 }),
      item({ id: 2, requirementId: 10, text: 'logs errors', status: 'Unverified', position: 0 }),
      item({ id: 3, requirementId: 20, text: 'x', status: 'Failed', position: 0 })
    ])
    expect(s[10]).toEqual({ passed: 1, total: 2, first: 'logs errors' })
    expect(s[20]).toEqual({ passed: 0, total: 1, first: 'x' })
  })

  it('empty input yields empty map', () => {
    expect(summarize([])).toEqual({})
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `./node_modules/.bin/vitest run src/renderer/src/store/acSummary.test.ts`
Expected: FAIL — `summarize` not found (module doesn't exist).

- [ ] **Step 3: Implement helper**

Create `src/renderer/src/store/acSummary.ts`:

```ts
import type { AcceptanceCriterion } from '../../../types'

export interface AcSummaryEntry {
  passed: number
  total: number
  first: string
}

// Input is expected in (requirementId, position) order — listByModule/list return it that way —
// but first-item selection re-checks position to stay order-independent.
export function summarize(items: AcceptanceCriterion[]): Record<number, AcSummaryEntry> {
  const out: Record<number, AcSummaryEntry & { firstPos: number }> = {}
  for (const it of items) {
    const cur = out[it.requirementId]
    if (!cur) {
      out[it.requirementId] = { passed: it.status === 'Passed' ? 1 : 0, total: 1, first: it.text, firstPos: it.position }
    } else {
      cur.total += 1
      if (it.status === 'Passed') cur.passed += 1
      if (it.position < cur.firstPos) { cur.first = it.text; cur.firstPos = it.position }
    }
  }
  return Object.fromEntries(
    Object.entries(out).map(([k, { passed, total, first }]) => [k, { passed, total, first }])
  )
}
```

- [ ] **Step 4: Run helper test — passes**

Run: `./node_modules/.bin/vitest run src/renderer/src/store/acSummary.test.ts`
Expected: 2/2 PASS.

- [ ] **Step 5: Write failing store tests**

Create `src/renderer/src/store/acceptanceCriteria.test.ts`. Follow the store-test conventions already used in `src/renderer/src/store/index.test.ts` (mock `window.api`, reset store state in `beforeEach`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useStore } from './index'
import type { AcceptanceCriterion } from '../../../types'

function item(over: Partial<AcceptanceCriterion>): AcceptanceCriterion {
  return {
    id: 1, requirementId: 5, text: 'c1', status: 'Unverified', position: 0,
    createdAt: '', updatedAt: '', ...over
  }
}

const mockList = vi.fn()
const mockListByModule = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockRemove = vi.fn()
const mockMove = vi.fn()

beforeEach(() => {
  mockList.mockReset().mockResolvedValue([item({ id: 1 })])
  mockListByModule.mockReset().mockResolvedValue([item({ id: 1 })])
  mockCreate.mockReset().mockResolvedValue(item({ id: 2, text: '' }))
  mockUpdate.mockReset().mockResolvedValue(item({ id: 1, status: 'Passed' }))
  mockRemove.mockReset().mockResolvedValue(undefined)
  mockMove.mockReset().mockResolvedValue(undefined)
  ;(window as any).api = {
    ...(window as any).api,
    acceptanceCriteria: {
      list: mockList, listByModule: mockListByModule, create: mockCreate,
      update: mockUpdate, remove: mockRemove, move: mockMove
    }
  }
  useStore.setState({ acItems: [], acSummary: {}, selectedModuleId: 3 })
})

describe('acceptance criteria store actions', () => {
  it('loadAcItems fetches items for the requirement', async () => {
    await useStore.getState().loadAcItems(5)
    expect(mockList).toHaveBeenCalledWith(5)
    expect(useStore.getState().acItems).toHaveLength(1)
  })

  it('addAcItem creates then refetches items and module summary', async () => {
    await useStore.getState().addAcItem(5, '')
    expect(mockCreate).toHaveBeenCalledWith(5, '')
    expect(mockList).toHaveBeenCalledWith(5)
    expect(mockListByModule).toHaveBeenCalledWith(3)
    expect(useStore.getState().acSummary[5]).toEqual({ passed: 0, total: 1, first: 'c1' })
  })

  it('updateAcItem patches then refetches', async () => {
    await useStore.getState().updateAcItem(1, { status: 'Passed' }, 5)
    expect(mockUpdate).toHaveBeenCalledWith(1, { status: 'Passed' })
    expect(mockList).toHaveBeenCalledWith(5)
  })

  it('removeAcItem deletes then refetches', async () => {
    await useStore.getState().removeAcItem(1, 5)
    expect(mockRemove).toHaveBeenCalledWith(1)
    expect(mockList).toHaveBeenCalledWith(5)
  })

  it('moveAcItem moves then refetches', async () => {
    await useStore.getState().moveAcItem(1, 'down', 5)
    expect(mockMove).toHaveBeenCalledWith(1, 'down')
    expect(mockList).toHaveBeenCalledWith(5)
  })
})
```

- [ ] **Step 6: Run to verify fail**

Run: `./node_modules/.bin/vitest run src/renderer/src/store/acceptanceCriteria.test.ts`
Expected: FAIL — `loadAcItems` (etc.) not a function.

- [ ] **Step 7: Implement store slice**

In `src/renderer/src/store/index.ts`:

Add to the types import: `AcceptanceCriterion, UpdateAcceptanceCriterionInput`. Add `import { summarize, type AcSummaryEntry } from './acSummary'`.

Interface additions (near the `customFields` members):

```ts
  acItems: AcceptanceCriterion[]
  acSummary: Record<number, AcSummaryEntry>
  loadAcItems: (requirementId: number) => Promise<void>
  addAcItem: (requirementId: number, text: string) => Promise<void>
  updateAcItem: (id: number, patch: UpdateAcceptanceCriterionInput, requirementId: number) => Promise<void>
  removeAcItem: (id: number, requirementId: number) => Promise<void>
  moveAcItem: (id: number, direction: 'up' | 'down', requirementId: number) => Promise<void>
```

Initial state: add `acItems: [], acSummary: {},` next to `customFields: [],` (line ~107).

Implementation (place after the custom-field actions). All mutations refetch the item list and the module summary — one shared internal helper keeps it DRY:

```ts
  loadAcItems: async (requirementId) => {
    const acItems = await window.api.acceptanceCriteria.list(requirementId)
    set({ acItems })
  },

  addAcItem: async (requirementId, text) => {
    await window.api.acceptanceCriteria.create(requirementId, text)
    await refreshAc(requirementId)
  },

  updateAcItem: async (id, patch, requirementId) => {
    await window.api.acceptanceCriteria.update(id, patch)
    await refreshAc(requirementId)
  },

  removeAcItem: async (id, requirementId) => {
    await window.api.acceptanceCriteria.remove(id)
    await refreshAc(requirementId)
  },

  moveAcItem: async (id, direction, requirementId) => {
    await window.api.acceptanceCriteria.move(id, direction)
    await refreshAc(requirementId)
  },
```

where `refreshAc` is a module-level helper placed AFTER the `export const useStore = create<Store>(...)` definition (the store's `create` callback is a plain object literal `(set, get) => ({...})` — do NOT restructure it; use the store's static accessors instead):

```ts
async function refreshAc(requirementId: number): Promise<void> {
  const { selectedModuleId } = useStore.getState()
  const [acItems, moduleItems] = await Promise.all([
    window.api.acceptanceCriteria.list(requirementId),
    selectedModuleId != null
      ? window.api.acceptanceCriteria.listByModule(selectedModuleId)
      : Promise.resolve([])
  ])
  useStore.setState({ acItems, acSummary: summarize(moduleItems) })
}
```

(Function declarations are hoisted, so the actions inside the `create` object literal can call `refreshAc` even though it is defined below the store.)

Wire summary loading into `selectModule` (line ~120): add `acItems: [], acSummary: {},` to the reset `set(...)`, and extend the `Promise.all` to also fetch `window.api.acceptanceCriteria.listByModule(id)`, then include `acSummary: summarize(acItemsForModule)` in the final `set`:

```ts
    const [requirements, headings, moduleAcItems] = await Promise.all([
      window.api.requirements.list(id),
      window.api.headings.list(id),
      window.api.acceptanceCriteria.listByModule(id)
    ])
    set({ requirements, headings, acSummary: summarize(moduleAcItems) })
```

Also add `acItems: []` to the `selectRequirement` reset set (line ~130, next to `customFields: []`).

- [ ] **Step 8: Run store tests — pass; run full store dir**

Run: `./node_modules/.bin/vitest run src/renderer/src/store`
Expected: new file 5/5 PASS, `acSummary.test.ts` 2/2, existing store tests still pass. If existing `index.test.ts` fixtures now fail because `selectModule` calls `acceptanceCriteria.listByModule`, extend their `window.api` mock with an `acceptanceCriteria` stub group (`listByModule: vi.fn().mockResolvedValue([])`, etc.) — additive only, do not weaken assertions.

- [ ] **Step 9: Typecheck + commit**

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.web.json
git add src/renderer/src/store/acSummary.ts src/renderer/src/store/acSummary.test.ts src/renderer/src/store/acceptanceCriteria.test.ts src/renderer/src/store/index.ts
git commit -m "feat(ac): store slice — acItems/acSummary, CRUD+move actions, summarize helper"
```

---

### Task 3: Drawer — checklist section replaces textarea; Chip statuses

**Files:**
- Modify: `src/renderer/src/components/ui/index.tsx` (CHIP_STYLES only)
- Modify: `src/renderer/src/components/RequirementDetail/index.tsx`
- Test: `src/renderer/src/components/RequirementDetail/acceptance.test.tsx` (create)
- Modify: `src/renderer/src/components/RequirementDetail/index.test.tsx` (extend store mock only)

**Interfaces:**
- Consumes: store members from Task 2 (`acItems`, `loadAcItems`, `addAcItem`, `updateAcItem(id, patch, requirementId)`, `removeAcItem(id, requirementId)`, `moveAcItem(id, direction, requirementId)`); `AC_STATUSES`, `AcStatus`; `Chip` primitive.
- Produces: `data-testid="ac-section"`; per-item controls with aria-labels `Criterion status`, `Criterion text`, `Move criterion up`, `Move criterion down`, `Remove criterion`; button `+ Add criterion`.

- [ ] **Step 1: Add chip styles**

In `src/renderer/src/components/ui/index.tsx`, add to `CHIP_STYLES` (keys verified non-colliding):

```ts
  Unverified: 'bg-workspace text-ink-muted border border-line',
  Passed: 'bg-action-tint text-action-hover',
  Failed: 'bg-error/10 text-error',
```

- [ ] **Step 2: Write failing component tests**

Create `src/renderer/src/components/RequirementDetail/acceptance.test.tsx`. Mirror the store-mock pattern of the sibling `traceability.test.tsx` (module-level `vi.mock` of the store with a `storeState` object):

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import RequirementDetail from './index'
import type { AcceptanceCriterion, Requirement } from '../../../../types'

const mockLoadAcItems = vi.fn()
const mockAddAcItem = vi.fn().mockResolvedValue(undefined)
const mockUpdateAcItem = vi.fn().mockResolvedValue(undefined)
const mockRemoveAcItem = vi.fn().mockResolvedValue(undefined)
const mockMoveAcItem = vi.fn().mockResolvedValue(undefined)

const req: Requirement = {
  id: 5, moduleId: 3, reqId: 'SRS-0001', text: 'The system shall X.',
  acceptanceCriteria: null, source: null, rationale: null, position: 0,
  status: 'Draft', priority: 'Medium', reqType: 'Functional', headingId: null,
  deletedAt: null, createdAt: '', updatedAt: ''
} as Requirement

function item(over: Partial<AcceptanceCriterion>): AcceptanceCriterion {
  return {
    id: 1, requirementId: 5, text: 'c1', status: 'Unverified', position: 0,
    createdAt: '', updatedAt: '', ...over
  }
}

const storeState: Record<string, unknown> = {}

vi.mock('../../store', () => ({
  useStore: (): Record<string, unknown> => storeState
}))

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(storeState, {
    requirements: [req], selectedRequirementId: 5, customFields: [],
    headings: [], modules: [], projectRequirements: [], reqLinks: [],
    acItems: [
      item({ id: 1, text: 'boots in 2s', status: 'Passed', position: 0 }),
      item({ id: 2, text: 'logs errors', status: 'Unverified', position: 1 })
    ],
    updateRequirement: vi.fn(), loadCustomFields: vi.fn(),
    addCustomField: vi.fn(), updateCustomField: vi.fn(), removeCustomField: vi.fn(),
    loadTraceability: vi.fn(), addReqLink: vi.fn(), removeReqLink: vi.fn(),
    openRequirement: vi.fn(),
    loadAcItems: mockLoadAcItems, addAcItem: mockAddAcItem,
    updateAcItem: mockUpdateAcItem, removeAcItem: mockRemoveAcItem,
    moveAcItem: mockMoveAcItem
  })
})

describe('acceptance criteria checklist', () => {
  it('renders items in order with status chips', () => {
    render(<RequirementDetail />)
    const section = screen.getByTestId('ac-section')
    const inputs = within(section).getAllByLabelText('Criterion text') as HTMLInputElement[]
    expect(inputs.map((i) => i.value)).toEqual(['boots in 2s', 'logs errors'])
    expect(within(section).getByText('Passed')).toBeInTheDocument()
    expect(within(section).getByText('Unverified')).toBeInTheDocument()
  })

  it('chip click cycles status Passed -> Failed', () => {
    render(<RequirementDetail />)
    const chips = within(screen.getByTestId('ac-section')).getAllByLabelText('Criterion status')
    fireEvent.click(chips[0])
    expect(mockUpdateAcItem).toHaveBeenCalledWith(1, { status: 'Failed' }, 5)
  })

  it('text blur saves the edited text', () => {
    render(<RequirementDetail />)
    const inputs = within(screen.getByTestId('ac-section')).getAllByLabelText('Criterion text')
    fireEvent.change(inputs[1], { target: { value: 'logs errors to file' } })
    fireEvent.blur(inputs[1])
    expect(mockUpdateAcItem).toHaveBeenCalledWith(2, { text: 'logs errors to file' }, 5)
  })

  it('add button creates an empty criterion', () => {
    render(<RequirementDetail />)
    fireEvent.click(screen.getByText('+ Add criterion'))
    expect(mockAddAcItem).toHaveBeenCalledWith(5, '')
  })

  it('move and remove buttons call the store with the item id', () => {
    render(<RequirementDetail />)
    const section = screen.getByTestId('ac-section')
    fireEvent.click(within(section).getAllByLabelText('Move criterion down')[0])
    expect(mockMoveAcItem).toHaveBeenCalledWith(1, 'down', 5)
    fireEvent.click(within(section).getAllByLabelText('Remove criterion')[1])
    expect(mockRemoveAcItem).toHaveBeenCalledWith(2, 5)
  })

  it('loads items when the requirement changes', () => {
    render(<RequirementDetail />)
    expect(mockLoadAcItems).toHaveBeenCalledWith(5)
  })
})
```

- [ ] **Step 3: Run to verify fail**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/RequirementDetail/acceptance.test.tsx`
Expected: FAIL — `ac-section` test id not found.

- [ ] **Step 4: Implement drawer section**

In `src/renderer/src/components/RequirementDetail/index.tsx`:

1. Add `Chip` to the ui import; add `AcStatus, AC_STATUSES` (and `AcceptanceCriterion` if needed) to the types import.
2. Destructure the new store members in the main component: `acItems, loadAcItems, addAcItem, updateAcItem, removeAcItem, moveAcItem`.
3. Delete the free-text plumbing: `ac` state, `setAc(req.acceptanceCriteria ?? '')` in the `[req?.id]` effect, `acceptanceCriteria: ac || undefined` from the `save()` payload, and the whole `<Field label="Acceptance Criteria"><Textarea .../></Field>` block.
4. In the `[req?.id]` effect, add `if (req) loadAcItems(req.id)`.
5. Local text-edit state so typing doesn't fight the store (custom-fields `localFields` idiom): `const [localAcTexts, setLocalAcTexts] = useState<Record<number, string>>({})`; reset to `{}` in the `[req?.id]` effect; sync effect on `acItems` change mirrors the existing `customFields` sync effect.
6. Replace the removed Field with (placed where the textarea Field was):

```tsx
        <div data-testid="ac-section" className="space-y-2">
          <SectionLabel className="block">Acceptance Criteria</SectionLabel>
          {acItems.map((item, i) => {
            const localText = localAcTexts[item.id] ?? item.text
            const next: AcStatus = AC_STATUSES[(AC_STATUSES.indexOf(item.status) + 1) % AC_STATUSES.length]
            const isNewest = i === acItems.length - 1
            return (
              <div key={item.id} className="flex gap-2 items-center">
                <button
                  aria-label="Criterion status"
                  title={`Mark ${next}`}
                  onClick={() => updateAcItem(item.id, { status: next }, req.id)}
                  className="shrink-0"
                >
                  <Chip value={item.status} />
                </button>
                <Input
                  ref={isNewest ? newAcRef : undefined}
                  aria-label="Criterion text"
                  value={localText}
                  onChange={(e) => setLocalAcTexts((p) => ({ ...p, [item.id]: e.target.value }))}
                  onBlur={() => updateAcItem(item.id, { text: localText }, req.id)}
                  placeholder="Criterion"
                  className="flex-1 !py-1.5"
                />
                <button aria-label="Move criterion up" onClick={() => moveAcItem(item.id, 'up', req.id)}
                  className="text-ink-faint hover:text-ink">↑</button>
                <button aria-label="Move criterion down" onClick={() => moveAcItem(item.id, 'down', req.id)}
                  className="text-ink-faint hover:text-ink">↓</button>
                <button aria-label="Remove criterion" onClick={() => removeAcItem(item.id, req.id)}
                  className="text-ink-faint hover:text-error text-lg leading-none px-1">×</button>
              </div>
            )
          })}
          <Button variant="ghost" onClick={handleAddCriterion} className="!px-2">+ Add criterion</Button>
        </div>
```

with, alongside the existing `newFieldRef`/`handleAddField`:

```tsx
  const newAcRef = useRef<HTMLInputElement>(null)
  const focusNewAc = useRef(false)

  async function handleAddCriterion(): Promise<void> {
    focusNewAc.current = true
    await addAcItem(req!.id, '')
  }
```

and a focus effect mirroring the existing custom-fields one:

```tsx
  useEffect(() => {
    if (focusNewAc.current) {
      newAcRef.current?.focus()
      focusNewAc.current = false
    }
  }, [acItems.length])
```

(`req.id` inside the map is safe — section only renders when `req` is non-null, same as TraceabilitySection. Blur/click handlers fire-and-forget the promise, matching the file's existing convention.)

7. In `src/renderer/src/components/RequirementDetail/index.test.tsx`, extend the `storeState` mock with `acItems: []`, `loadAcItems: vi.fn()`, `addAcItem: vi.fn()`, `updateAcItem: vi.fn()`, `removeAcItem: vi.fn()`, `moveAcItem: vi.fn()` — additive only. Any existing assertion on the Acceptance Criteria textarea must be updated to the new section (if one asserts the textarea exists, re-point it at `ac-section`).

- [ ] **Step 5: Run RequirementDetail suite**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/RequirementDetail`
Expected: `acceptance.test.tsx` 6/6 PASS; `index.test.tsx` and `traceability.test.tsx` still green.

- [ ] **Step 6: Typecheck + commit**

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.web.json
git add src/renderer/src/components/ui/index.tsx src/renderer/src/components/RequirementDetail
git commit -m "feat(ac): drawer checklist — status chip cycle, inline edit, move/remove, add+focus"
```

---

### Task 4: Requirements table — summary cell

**Files:**
- Modify: `src/renderer/src/components/RequirementsList/index.tsx` (the acceptance-criteria cell, ~line 270)
- Test: `src/renderer/src/components/RequirementsList/index.test.tsx` (append; extend store mock)

**Interfaces:**
- Consumes: `acSummary` from the store (Task 2).
- Produces: none (leaf UI).

- [ ] **Step 1: Write failing test**

Append to `src/renderer/src/components/RequirementsList/index.test.tsx` (inside the existing top-level describe, using the file's established `storeState`/render helpers; add `acSummary: {}` to the base mock state first):

```tsx
  it('acceptance criteria cell shows passed/total and first item text', () => {
    storeState.acSummary = { [baseReq.id]: { passed: 2, total: 5, first: 'boots in 2s' } }
    renderList()
    expect(screen.getByText('2/5')).toBeInTheDocument()
    expect(screen.getByText('boots in 2s')).toBeInTheDocument()
  })

  it('acceptance criteria cell shows em-dash when requirement has no items', () => {
    storeState.acSummary = {}
    renderList()
    const row = screen.getByText(baseReq.reqId).closest('div[style]') as HTMLElement
    expect(within(row).queryByText(/\d+\/\d+/)).toBeNull()
  })
```

Adapt identifier names (`storeState`, `baseReq`, `renderList`) to the file's actual helpers — the assertions are the contract, and add `import { within } ...` if the file doesn't have it.

- [ ] **Step 2: Run to verify fail**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/RequirementsList/index.test.tsx`
Expected: the two new tests FAIL (no `2/5` rendered; cell still reads `req.acceptanceCriteria`).

- [ ] **Step 3: Implement cell**

In `src/renderer/src/components/RequirementsList/index.tsx`: destructure `acSummary` from `useStore()`, then replace

```tsx
                    <span className="text-sm text-ink-muted break-words pr-1">
                      {req.acceptanceCriteria || <span className="text-ink-faint/50">—</span>}
                    </span>
```

with

```tsx
                    <span className="text-sm text-ink-muted break-words pr-1">
                      {acSummary[req.id] ? (
                        <>
                          <span className="text-xs font-mono text-ink-faint mr-1.5">
                            {acSummary[req.id].passed}/{acSummary[req.id].total}
                          </span>
                          {acSummary[req.id].first}
                        </>
                      ) : (
                        <span className="text-ink-faint/50">—</span>
                      )}
                    </span>
```

- [ ] **Step 4: Run list suite**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/RequirementsList`
Expected: new tests PASS, all existing tests green.

- [ ] **Step 5: Typecheck + commit**

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.web.json
git add src/renderer/src/components/RequirementsList
git commit -m "feat(ac): requirements table shows passed/total + first criterion"
```

---

### Task 5: Verification — full suite, typechecks, build

**Files:** none (verification only; fix regressions if found and document them).

- [ ] **Step 1: Full suite vs baseline**

Run: `./node_modules/.bin/vitest run`
Expected: failures = 47 main-process ABI + 1 pre-existing ArchitectureCanvas, nothing else.

- [ ] **Step 2: Both typechecks**

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.node.json
./node_modules/.bin/tsc --noEmit -p tsconfig.web.json
```
Expected: clean.

- [ ] **Step 3: Build**

Run: `./node_modules/.bin/electron-vite build`
Expected: 3 targets build clean.

- [ ] **Step 4: Commit (only if fixes were needed)**

If Steps 1-3 forced changes, commit them with a message describing the fix; otherwise nothing to commit.

---

## Post-plan verification (controller, not a task)

Launch via the Playwright driver against the SmokeTest project: a requirement that had legacy free-text criteria shows them migrated line-per-item (all Unverified) and its `requirements.acceptance_criteria` is NULL; add a criterion (input auto-focused), type text, blur — persists; chip click cycles Unverified→Passed→Failed→Unverified with correct colors; ↑↓ reorders; × removes; table cell shows `passed/total` + first item and updates live; relaunch app — items, statuses, order persist; re-open a legacy-migrated requirement after relaunch — no duplicate items (idempotence).
