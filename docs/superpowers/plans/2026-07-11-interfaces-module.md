# Interfaces Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Interfaces top-nav tab with a project-wide Interface Register (one row per architecture connection) supporting user-defined custom fields, toggleable columns, and creating interfaces from element pickers.

**Architecture:** An interface IS an architecture connection — no new primary entity. The register derives its rows in the renderer from already-loaded `connections` + `elements` (no new backend join). Custom fields get one new child table `connection_custom_fields` mirroring `requirement_custom_fields`, with a project-level list for register columns and a per-connection list for the drawer. The drawer reuses the existing `ConnectionPanel`, extended with a Custom Fields section so it also shows on the canvas.

**Tech Stack:** Electron + React + TypeScript + Vite + Tailwind + Zustand + better-sqlite3. IPC via typed preload bridge (`window.api`).

## Global Constraints

- Renderer never touches the DB directly — all data flows renderer → `window.api` (preload) → main handler → SQLite.
- `src/main/**` vitest files fail on the better-sqlite3 ABI mismatch (Electron ABI 125 vs node ABI 127) — **accepted baseline**. Do NOT rebuild the binary. Gate all main-process changes on `tsc` typecheck + running-app checks (Playwright driver at `.claude/skills/run-app/driver.mjs`). Renderer/pure-helper vitest files DO run — use them.
- Never use `npm run`. Use `./node_modules/.bin/*` directly (`tsc`, `vitest`, `electron-vite`). `node` is on PATH.
- Typecheck command (both projects): `./node_modules/.bin/tsc -p tsconfig.node.json --noEmit && ./node_modules/.bin/tsc -p tsconfig.web.json --noEmit`
- Renderer test command: `./node_modules/.bin/vitest run <path>`
- New child tables use `CREATE TABLE IF NOT EXISTS` inside `runMigrations` (idempotent). New columns use `addColumnIfMissing`.
- Follow existing token/primitive styling — import from `../ui` (`Button`, `Input`, `Select`, `SectionLabel`, `Panel`), mono IDs via `font-mono`, no ad-hoc hex.
- Commit after each task with a `feat(interfaces):` / `test(interfaces):` message.

---

### Task 1: Backend — `connection_custom_fields` table, types, handler

**Files:**
- Modify: `src/main/db/migrations.ts` (add `CREATE TABLE IF NOT EXISTS connection_custom_fields`)
- Modify: `src/types/index.ts` (add `ConnectionCustomField`, `UpdateConnectionCustomFieldInput`)
- Create: `src/main/handlers/connectionCustomFields.ts`
- Modify: `src/main/index.ts` (import + register handler)

**Interfaces:**
- Produces (types): `ConnectionCustomField { id: number; connectionId: number; key: string; value: string; position: number; createdAt: string; updatedAt: string }`; `UpdateConnectionCustomFieldInput { key?: string; value?: string }`
- Produces (IPC channels): `connectionCustomFields:list(connectionId)` → `ConnectionCustomField[]`; `connectionCustomFields:listByProject(projectId)` → `ConnectionCustomField[]`; `connectionCustomFields:create(connectionId)` → `ConnectionCustomField`; `connectionCustomFields:update(id, patch)` → `ConnectionCustomField`; `connectionCustomFields:delete(id)` → `void`

- [ ] **Step 1: Add the table to migrations**

In `src/main/db/migrations.ts`, inside the big `db.exec(\`...\`)` template in `runMigrations` (alongside the other `CREATE TABLE IF NOT EXISTS` blocks — e.g. right after the `acceptance_criteria` table), add:

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

- [ ] **Step 2: Add the types**

In `src/types/index.ts`, near `RequirementCustomField`, add:

```typescript
export interface ConnectionCustomField {
  id: number
  connectionId: number
  key: string
  value: string
  position: number
  createdAt: string
  updatedAt: string
}
export interface UpdateConnectionCustomFieldInput {
  key?: string
  value?: string
}
```

- [ ] **Step 3: Create the handler**

Create `src/main/handlers/connectionCustomFields.ts` (near-verbatim mirror of `requirementCustomFields.ts`, with a project-scoped list added):

```typescript
import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import type { ConnectionCustomField, UpdateConnectionCustomFieldInput } from '../../types'

function now(): string { return new Date().toISOString() }

function rowToField(row: any): ConnectionCustomField {
  return {
    id: row.id,
    connectionId: row.connection_id,
    key: row.key,
    value: row.value,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function registerConnectionCustomFieldHandlers(): void {
  ipcMain.handle('connectionCustomFields:list', (_e, connectionId: number) => {
    return (getDatabase()
      .prepare('SELECT * FROM connection_custom_fields WHERE connection_id = ? ORDER BY position, id')
      .all(connectionId) as any[]).map(rowToField)
  })

  ipcMain.handle('connectionCustomFields:listByProject', (_e, projectId: number) => {
    return (getDatabase()
      .prepare(`
        SELECT ccf.* FROM connection_custom_fields ccf
        JOIN architecture_connections ac ON ac.id = ccf.connection_id
        WHERE ac.project_id = ? AND ac.deleted_at IS NULL
        ORDER BY ccf.connection_id, ccf.position, ccf.id
      `)
      .all(projectId) as any[]).map(rowToField)
  })

  ipcMain.handle('connectionCustomFields:create', (_e, connectionId: number) => {
    const db = getDatabase()
    const ts = now()
    const row = db.prepare('SELECT COALESCE(MAX(position), -1) as mp FROM connection_custom_fields WHERE connection_id = ?').get(connectionId) as any
    const nextPos = (row.mp as number) + 1
    const result = db
      .prepare('INSERT INTO connection_custom_fields (connection_id, key, value, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(connectionId, '', '', nextPos, ts, ts)
    return rowToField(db.prepare('SELECT * FROM connection_custom_fields WHERE id = ?').get(result.lastInsertRowid))
  })

  ipcMain.handle('connectionCustomFields:update', (_e, id: number, patch: UpdateConnectionCustomFieldInput) => {
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM connection_custom_fields WHERE id = ?').get(id) as any
    if (!existing) throw new Error(`Connection custom field ${id} not found`)
    db.prepare('UPDATE connection_custom_fields SET key = ?, value = ?, updated_at = ? WHERE id = ?')
      .run(patch.key ?? existing.key, patch.value ?? existing.value, now(), id)
    return rowToField(db.prepare('SELECT * FROM connection_custom_fields WHERE id = ?').get(id))
  })

  ipcMain.handle('connectionCustomFields:delete', (_e, id: number) => {
    getDatabase().prepare('DELETE FROM connection_custom_fields WHERE id = ?').run(id)
  })
}
```

- [ ] **Step 4: Register the handler**

In `src/main/index.ts`, add the import next to the other handler imports:

```typescript
import { registerConnectionCustomFieldHandlers } from './handlers/connectionCustomFields'
```

and add the call in the registration block (next to `registerCustomFieldHandlers()`):

```typescript
  registerConnectionCustomFieldHandlers()
```

- [ ] **Step 5: Typecheck**

Run: `./node_modules/.bin/tsc -p tsconfig.node.json --noEmit`
Expected: no errors. (Main-process vitest is skipped per Global Constraints — runtime is verified live in Task 6.)

- [ ] **Step 6: Commit**

```bash
git add src/main/db/migrations.ts src/types/index.ts src/main/handlers/connectionCustomFields.ts src/main/index.ts
git commit -m "feat(interfaces): connection_custom_fields table, types, IPC handler"
```

---

### Task 2: Preload bridge + api.d.ts

**Files:**
- Modify: `src/preload/index.ts` (add `connectionCustomFields` bridge object)
- Modify: `src/types/api.d.ts` (declare the new surface)

**Interfaces:**
- Consumes: the IPC channels + types from Task 1.
- Produces: `window.api.connectionCustomFields.{ list, listByProject, create, update, delete }`

- [ ] **Step 1: Add the preload bridge**

In `src/preload/index.ts`, import the types at the top (mirror the existing `RequirementCustomField` import) and add a bridge object next to `customFields`:

```typescript
  connectionCustomFields: {
    list: (connectionId: number): Promise<ConnectionCustomField[]> => ipcRenderer.invoke('connectionCustomFields:list', connectionId),
    listByProject: (projectId: number): Promise<ConnectionCustomField[]> => ipcRenderer.invoke('connectionCustomFields:listByProject', projectId),
    create: (connectionId: number): Promise<ConnectionCustomField> => ipcRenderer.invoke('connectionCustomFields:create', connectionId),
    update: (id: number, patch: UpdateConnectionCustomFieldInput): Promise<ConnectionCustomField> => ipcRenderer.invoke('connectionCustomFields:update', id, patch),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('connectionCustomFields:delete', id)
  },
```

Ensure `ConnectionCustomField` and `UpdateConnectionCustomFieldInput` are added to the `import type { ... } from '../types'` line at the top of the file.

- [ ] **Step 2: Declare it in api.d.ts**

In `src/types/api.d.ts`, add (mirroring the `customFields` block) inside the `api` interface:

```typescript
      connectionCustomFields: {
        list: (connectionId: number) => Promise<ConnectionCustomField[]>
        listByProject: (projectId: number) => Promise<ConnectionCustomField[]>
        create: (connectionId: number) => Promise<ConnectionCustomField>
        update: (id: number, patch: UpdateConnectionCustomFieldInput) => Promise<ConnectionCustomField>
        delete: (id: number) => Promise<void>
      }
```

Make sure `ConnectionCustomField` and `UpdateConnectionCustomFieldInput` are imported at the top of `api.d.ts` alongside the other type imports.

- [ ] **Step 3: Typecheck**

Run: `./node_modules/.bin/tsc -p tsconfig.node.json --noEmit && ./node_modules/.bin/tsc -p tsconfig.web.json --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/types/api.d.ts
git commit -m "feat(interfaces): expose connectionCustomFields over preload bridge"
```

---

### Task 3: Pure helper — interface rows + column visibility

**Files:**
- Create: `src/renderer/src/components/InterfaceRegister/rows.ts`
- Test: `src/renderer/src/components/InterfaceRegister/rows.test.ts`

**Interfaces:**
- Consumes: `ArchitectureConnection`, `ArchitectureElement`, `ConnectionType`, `ConnectionCustomField` from `../../../../types` (adjust relative depth to match sibling components — verify against an existing component import).
- Produces:
  - `type InterfaceRow = { connectionId: number; interfaceId: string; fromId: string; toId: string; name: string; typeName: string; description: string; customValues: Record<string, string> }`
  - `buildInterfaceRows(connections, elements, connectionTypes, customFields): InterfaceRow[]`
  - `customFieldKeys(customFields: ConnectionCustomField[]): string[]` — distinct non-empty keys, first-seen order
  - `BUILTIN_OPTIONAL_COLUMNS: readonly ['name', 'type', 'description']`
  - `loadColumnVisibility(customKeys: string[]): Record<string, boolean>` and `saveColumnVisibility(vis: Record<string, boolean>): void` — localStorage key `reqarch.interfaceRegister.columns.v1`; unknown columns default to visible (`true`)

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/components/InterfaceRegister/rows.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { buildInterfaceRows, customFieldKeys, loadColumnVisibility, saveColumnVisibility } from './rows'
import type { ArchitectureConnection, ArchitectureElement, ConnectionType, ConnectionCustomField } from '../../../../types'

const el = (id: number, blockId: string): ArchitectureElement => ({
  id, projectId: 1, parentId: null, blockId, name: `El ${blockId}`, elementTypeId: null,
  description: null, color: null, posX: 0, posY: 0, width: 140, height: 60,
  deletedAt: null, createdAt: '', updatedAt: ''
})
const conn = (id: number, connId: string, s: number, t: number, extra: Partial<ArchitectureConnection> = {}): ArchitectureConnection => ({
  id, projectId: 1, connId, sourceId: s, targetId: t, sourceHandle: null, targetHandle: null,
  name: null, connectionTypeId: null, description: null, deletedAt: null, createdAt: '', updatedAt: '', ...extra
})
const ccf = (id: number, connectionId: number, key: string, value: string, position = 0): ConnectionCustomField => ({
  id, connectionId, key, value, position, createdAt: '', updatedAt: ''
})

describe('buildInterfaceRows', () => {
  it('maps source/target element blockIds and type name and custom values', () => {
    const elements = [el(10, 'SYS-001'), el(20, 'SYS-002')]
    const types: ConnectionType[] = [{ id: 5, projectId: 1, name: 'Data', color: '#0af', createdAt: '', updatedAt: '' } as ConnectionType]
    const connections = [conn(1, 'ICN-0001', 10, 20, { name: 'CAN', connectionTypeId: 5, description: 'bus' })]
    const fields = [ccf(1, 1, 'Protocol', 'CAN 2.0'), ccf(2, 1, '', 'ignored-empty-key')]
    const rows = buildInterfaceRows(connections, elements, types, fields)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      connectionId: 1, interfaceId: 'ICN-0001', fromId: 'SYS-001', toId: 'SYS-002',
      name: 'CAN', typeName: 'Data', description: 'bus'
    })
    expect(rows[0].customValues['Protocol']).toBe('CAN 2.0')
  })

  it('falls back to empty strings for missing elements/type/null fields', () => {
    const rows = buildInterfaceRows([conn(1, 'ICN-0002', 99, 98)], [], [], [])
    expect(rows[0]).toMatchObject({ fromId: '', toId: '', name: '', typeName: '', description: '' })
  })
})

describe('customFieldKeys', () => {
  it('returns distinct non-empty keys in first-seen order', () => {
    const keys = customFieldKeys([ccf(1, 1, 'B', 'x'), ccf(2, 2, 'A', 'y'), ccf(3, 3, 'B', 'z'), ccf(4, 4, '', 'w')])
    expect(keys).toEqual(['B', 'A'])
  })
})

describe('column visibility persistence', () => {
  beforeEach(() => localStorage.clear())
  it('defaults unknown columns to visible', () => {
    const vis = loadColumnVisibility(['Protocol'])
    expect(vis).toEqual({ name: true, type: true, description: true, Protocol: true })
  })
  it('round-trips saved visibility', () => {
    saveColumnVisibility({ name: false, type: true, description: true, Protocol: false })
    const vis = loadColumnVisibility(['Protocol'])
    expect(vis.name).toBe(false)
    expect(vis.Protocol).toBe(false)
    expect(vis.type).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/InterfaceRegister/rows.test.ts`
Expected: FAIL — cannot find module `./rows`.

- [ ] **Step 3: Implement the helper**

Create `src/renderer/src/components/InterfaceRegister/rows.ts`:

```typescript
import type { ArchitectureConnection, ArchitectureElement, ConnectionType, ConnectionCustomField } from '../../../../types'

export interface InterfaceRow {
  connectionId: number
  interfaceId: string
  fromId: string
  toId: string
  name: string
  typeName: string
  description: string
  customValues: Record<string, string>
}

export const BUILTIN_OPTIONAL_COLUMNS = ['name', 'type', 'description'] as const

const COLUMN_VIS_KEY = 'reqarch.interfaceRegister.columns.v1'

export function buildInterfaceRows(
  connections: ArchitectureConnection[],
  elements: ArchitectureElement[],
  connectionTypes: ConnectionType[],
  customFields: ConnectionCustomField[]
): InterfaceRow[] {
  const elemById = new Map(elements.map((e) => [e.id, e]))
  const typeById = new Map(connectionTypes.map((t) => [t.id, t]))
  const fieldsByConn = new Map<number, ConnectionCustomField[]>()
  for (const f of customFields) {
    const arr = fieldsByConn.get(f.connectionId) ?? []
    arr.push(f)
    fieldsByConn.set(f.connectionId, arr)
  }
  return connections.map((c) => {
    const customValues: Record<string, string> = {}
    for (const f of fieldsByConn.get(c.id) ?? []) {
      if (f.key.trim() !== '') customValues[f.key] = f.value
    }
    return {
      connectionId: c.id,
      interfaceId: c.connId,
      fromId: elemById.get(c.sourceId)?.blockId ?? '',
      toId: elemById.get(c.targetId)?.blockId ?? '',
      name: c.name ?? '',
      typeName: (c.connectionTypeId != null ? typeById.get(c.connectionTypeId)?.name : '') ?? '',
      description: c.description ?? '',
      customValues
    }
  })
}

export function customFieldKeys(customFields: ConnectionCustomField[]): string[] {
  const seen: string[] = []
  for (const f of customFields) {
    if (f.key.trim() !== '' && !seen.includes(f.key)) seen.push(f.key)
  }
  return seen
}

export function loadColumnVisibility(customKeys: string[]): Record<string, boolean> {
  let saved: Record<string, boolean> = {}
  try {
    saved = JSON.parse(localStorage.getItem(COLUMN_VIS_KEY) ?? '{}')
  } catch { saved = {} }
  const vis: Record<string, boolean> = {}
  for (const col of [...BUILTIN_OPTIONAL_COLUMNS, ...customKeys]) {
    vis[col] = saved[col] ?? true
  }
  return vis
}

export function saveColumnVisibility(vis: Record<string, boolean>): void {
  localStorage.setItem(COLUMN_VIS_KEY, JSON.stringify(vis))
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/InterfaceRegister/rows.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/InterfaceRegister/rows.ts src/renderer/src/components/InterfaceRegister/rows.test.ts
git commit -m "feat(interfaces): pure helper for register rows + column visibility"
```

---

### Task 4: Store — interfaces tab, data load, connection custom-field actions

**Files:**
- Modify: `src/renderer/src/store/index.ts`

**Interfaces:**
- Consumes: `window.api.connectionCustomFields.*` (Task 2), `buildInterfaceRows`-adjacent state.
- Produces (store additions):
  - `activeTab` union gains `'interfaces'`
  - `connectionCustomFields: ConnectionCustomField[]` (for the selected connection's drawer)
  - `projectConnectionCustomFields: ConnectionCustomField[]` (all fields in project, for register columns)
  - `loadInterfaces: () => Promise<void>` — loads architecture data + project custom fields
  - `loadConnectionCustomFields: (connectionId: number) => Promise<void>`
  - `addConnectionCustomField: (connectionId: number) => Promise<void>`
  - `updateConnectionCustomField: (id: number, patch: UpdateConnectionCustomFieldInput) => Promise<void>`
  - `removeConnectionCustomField: (id: number) => Promise<void>`

- [ ] **Step 1: Extend the `activeTab` union**

In `src/renderer/src/store/index.ts`, update both the interface field and the setter signature:

```typescript
  activeTab: 'requirements' | 'architecture' | 'traceability' | 'dashboard' | 'interfaces'
```
```typescript
  setActiveTab: (tab: 'requirements' | 'architecture' | 'traceability' | 'dashboard' | 'interfaces') => void
```

- [ ] **Step 2: Add imports and state fields**

Add `ConnectionCustomField, UpdateConnectionCustomFieldInput` to the type import block from `'../../types'`. Add to the state interface (near `connections`):

```typescript
  connectionCustomFields: ConnectionCustomField[]
  projectConnectionCustomFields: ConnectionCustomField[]
```

Add the action signatures to the interface (near `loadCustomFields`):

```typescript
  loadInterfaces: () => Promise<void>
  loadConnectionCustomFields: (connectionId: number) => Promise<void>
  addConnectionCustomField: (connectionId: number) => Promise<void>
  updateConnectionCustomField: (id: number, patch: UpdateConnectionCustomFieldInput) => Promise<void>
  removeConnectionCustomField: (id: number) => Promise<void>
```

Add initial values in the store creator's default object (next to `customFields: []`):

```typescript
  connectionCustomFields: [], projectConnectionCustomFields: [],
```

- [ ] **Step 3: Implement the actions**

Add these actions in the store creator (place near `loadArchitecture` / `loadCustomFields`):

```typescript
  loadInterfaces: async () => {
    const { project } = get()
    if (!project) return
    const [elements, connections, elementTypes, connectionTypes, projectConnectionCustomFields] = await Promise.all([
      window.api.elements.list(project.id),
      window.api.connections.list(project.id),
      window.api.elementTypes.list(project.id),
      window.api.connectionTypes.list(project.id),
      window.api.connectionCustomFields.listByProject(project.id)
    ])
    set({ elements, connections, elementTypes, connectionTypes, projectConnectionCustomFields })
  },

  loadConnectionCustomFields: async (connectionId) => {
    const connectionCustomFields = await window.api.connectionCustomFields.list(connectionId)
    set({ connectionCustomFields })
  },

  addConnectionCustomField: async (connectionId) => {
    const field = await window.api.connectionCustomFields.create(connectionId)
    set((s) => ({
      connectionCustomFields: [...s.connectionCustomFields, field],
      projectConnectionCustomFields: [...s.projectConnectionCustomFields, field]
    }))
  },

  updateConnectionCustomField: async (id, patch) => {
    const updated = await window.api.connectionCustomFields.update(id, patch)
    set((s) => ({
      connectionCustomFields: s.connectionCustomFields.map((f) => (f.id === id ? updated : f)),
      projectConnectionCustomFields: s.projectConnectionCustomFields.map((f) => (f.id === id ? updated : f))
    }))
  },

  removeConnectionCustomField: async (id) => {
    await window.api.connectionCustomFields.delete(id)
    set((s) => ({
      connectionCustomFields: s.connectionCustomFields.filter((f) => f.id !== id),
      projectConnectionCustomFields: s.projectConnectionCustomFields.filter((f) => f.id !== id)
    }))
  },
```

- [ ] **Step 4: Typecheck**

Run: `./node_modules/.bin/tsc -p tsconfig.web.json --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/store/index.ts
git commit -m "feat(interfaces): store state + actions for interfaces tab and connection custom fields"
```

---

### Task 5: Extend ConnectionPanel with a Custom Fields section

**Files:**
- Modify: `src/renderer/src/components/ConnectionPanel/index.tsx`
- Test: `src/renderer/src/components/ConnectionPanel/customFields.test.tsx` (new)

This section renders in both the canvas drawer and the register drawer (both select a connection).

**Interfaces:**
- Consumes: `connectionCustomFields`, `loadConnectionCustomFields`, `addConnectionCustomField`, `updateConnectionCustomField`, `removeConnectionCustomField` from the store (Task 4).

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/components/ConnectionPanel/customFields.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ConnectionPanel from './index'
import { useStore } from '../../store'

vi.mock('../../store')

const conn = {
  id: 1, projectId: 1, connId: 'ICN-0001', sourceId: 10, targetId: 20,
  sourceHandle: null, targetHandle: null, name: 'CAN', connectionTypeId: null,
  description: null, deletedAt: null, createdAt: '', updatedAt: ''
}

beforeEach(() => {
  ;(window as any).api = { connectionLinks: { list: vi.fn().mockResolvedValue([]) } }
})

it('renders custom fields and an Add Field button', () => {
  const addConnectionCustomField = vi.fn()
  ;(useStore as any).mockReturnValue({
    selectedConnectionId: 1, connections: [conn], connectionTypes: [], projectRequirements: [],
    connectionCustomFields: [{ id: 7, connectionId: 1, key: 'Protocol', value: 'CAN 2.0', position: 0, createdAt: '', updatedAt: '' }],
    loadConnectionCustomFields: vi.fn(), addConnectionCustomField, updateConnectionCustomField: vi.fn(),
    removeConnectionCustomField: vi.fn(), updateConnection: vi.fn(), removeConnection: vi.fn(),
    addConnectionLink: vi.fn(), removeConnectionLink: vi.fn()
  })
  render(<ConnectionPanel />)
  expect(screen.getByDisplayValue('Protocol')).toBeInTheDocument()
  expect(screen.getByDisplayValue('CAN 2.0')).toBeInTheDocument()
  fireEvent.click(screen.getByText('+ Add Field'))
  expect(addConnectionCustomField).toHaveBeenCalledWith(1)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/ConnectionPanel/customFields.test.tsx`
Expected: FAIL — no "+ Add Field" / no custom-field inputs rendered.

- [ ] **Step 3: Add the Custom Fields section to ConnectionPanel**

In `src/renderer/src/components/ConnectionPanel/index.tsx`:

Add the new store selectors to the destructure:

```typescript
  const {
    selectedConnectionId, connections, connectionTypes, projectRequirements,
    updateConnection, removeConnection, addConnectionLink, removeConnectionLink,
    connectionCustomFields, loadConnectionCustomFields,
    addConnectionCustomField, updateConnectionCustomField, removeConnectionCustomField
  } = useStore()
```

Load fields when the selected connection changes — extend the existing `useEffect` that keys on `conn?.id`:

```typescript
  useEffect(() => {
    if (!conn) return
    setName(conn.name ?? '')
    setDescription(conn.description ?? '')
    setConnectionTypeId(conn.connectionTypeId)
    window.api.connectionLinks.list(conn.id).then((reqs) => setLinkedReqIds(reqs.map((r) => r.id)))
    loadConnectionCustomFields(conn.id)
  }, [conn?.id])
```

Add the section inside the scrollable body — place it right before the `Requirements` `Field` block (so custom fields sit above requirement links):

```tsx
        <div className="space-y-2 pt-2 border-t border-line">
          <SectionLabel className="block pt-2">Custom Fields</SectionLabel>
          {connectionCustomFields.map((field) => (
            <div key={field.id} className="flex gap-2 items-center">
              <Input
                defaultValue={field.key}
                onBlur={(e) => updateConnectionCustomField(field.id, { key: e.target.value })}
                placeholder="Field name"
                className="!w-2/5 !py-1.5"
              />
              <Input
                defaultValue={field.value}
                onBlur={(e) => updateConnectionCustomField(field.id, { value: e.target.value })}
                placeholder="Value"
                className="flex-1 !py-1.5"
              />
              <button
                onClick={() => removeConnectionCustomField(field.id)}
                className="text-ink-faint hover:text-error text-lg leading-none px-1"
                title="Remove field"
                aria-label="Remove field"
              >
                ×
              </button>
            </div>
          ))}
          <Button variant="ghost" onClick={() => addConnectionCustomField(conn.id)} className="!px-2">+ Add Field</Button>
        </div>
```

(Using `defaultValue` + `onBlur` keeps this section self-contained without adding local mirror state; the `key={field.id}` remounts inputs when the field list changes.)

- [ ] **Step 4: Run to verify it passes**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/ConnectionPanel/customFields.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the existing ConnectionPanel tests to check for regressions**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/ConnectionPanel`
Expected: PASS (both the new file and any pre-existing ConnectionPanel test). If a pre-existing test's store mock now lacks the new selectors and throws, add the new selectors (as `vi.fn()` / `[]`) to that mock.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/ConnectionPanel/index.tsx src/renderer/src/components/ConnectionPanel/customFields.test.tsx
git commit -m "feat(interfaces): custom fields section in ConnectionPanel"
```

---

### Task 6: InterfaceRegister component + tab wiring + live verification

**Files:**
- Create: `src/renderer/src/components/InterfaceRegister/index.tsx`
- Test: `src/renderer/src/components/InterfaceRegister/index.test.tsx`
- Modify: `src/renderer/src/App.tsx` (nav tab + panel + load effect)

**Interfaces:**
- Consumes: store `interfaceRows` data (`connections`, `elements`, `connectionTypes`, `projectConnectionCustomFields`, `loadInterfaces`, `addConnection`, `setActiveTab`, `selectedConnectionId`), and helpers from `./rows` (Task 3).

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/components/InterfaceRegister/index.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import InterfaceRegister from './index'
import { useStore } from '../../store'

vi.mock('../../store')

const elements = [
  { id: 10, projectId: 1, parentId: null, blockId: 'SYS-001', name: 'ECU', elementTypeId: null, description: null, color: null, posX: 0, posY: 0, width: 140, height: 60, deletedAt: null, createdAt: '', updatedAt: '' },
  { id: 20, projectId: 1, parentId: null, blockId: 'SYS-002', name: 'Sensor', elementTypeId: null, description: null, color: null, posX: 0, posY: 0, width: 140, height: 60, deletedAt: null, createdAt: '', updatedAt: '' }
]
const connections = [
  { id: 1, projectId: 1, connId: 'ICN-0001', sourceId: 10, targetId: 20, sourceHandle: null, targetHandle: null, name: 'CAN', connectionTypeId: null, description: null, deletedAt: null, createdAt: '', updatedAt: '' }
]

beforeEach(() => {
  localStorage.clear()
  ;(useStore as any).mockReturnValue({
    connections, elements, connectionTypes: [], projectConnectionCustomFields: [],
    loadInterfaces: vi.fn(), addConnection: vi.fn(), setActiveTab: vi.fn(),
    selectRequirement: vi.fn(), selectedConnectionId: null,
    selectConnection: vi.fn(), project: { id: 1, name: 'P' }
  })
})

it('renders one interface row with mandatory ID + object ID columns', () => {
  render(<InterfaceRegister />)
  expect(screen.getByText('ICN-0001')).toBeInTheDocument()
  expect(screen.getByText('SYS-001')).toBeInTheDocument()
  expect(screen.getByText('SYS-002')).toBeInTheDocument()
})
```

Note: the store action for selecting a connection is `selectConnection(id)` (`src/renderer/src/store/index.ts:416` — sets `selectedConnectionId`, clears `selectedElementId`). Use it in both the mock and the component.

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/InterfaceRegister/index.test.tsx`
Expected: FAIL — cannot find module `./index` (or no matching text).

- [ ] **Step 3: Implement the register component**

Create `src/renderer/src/components/InterfaceRegister/index.tsx`. Requirements:
- Read `connections, elements, connectionTypes, projectConnectionCustomFields` from the store; compute `rows = buildInterfaceRows(...)` and `customKeys = customFieldKeys(projectConnectionCustomFields)`.
- Column-visibility state initialised from `loadColumnVisibility(customKeys)`; a `Columns` button toggles a dropdown of checkboxes for `BUILTIN_OPTIONAL_COLUMNS` (labels: Name/Type/Description) + each custom key; on change, persist with `saveColumnVisibility`.
- Table: sticky header, `overflow-auto` container, zebra rows (mirror RequirementsList styling). Always-visible columns first: **Interface ID** (`row.interfaceId`, `font-mono`), **From** (`row.fromId`, `font-mono`), **To** (`row.toId`, `font-mono`). Then each visible optional/custom column.
- Clicking a row sets the selected connection (use the real store action confirmed in Step 1) — the App renders the `ConnectionPanel` drawer when `selectedConnectionId !== null`.
- Toolbar: interface count (`{rows.length} interfaces`), `Columns` button, `+ New Interface` button that reveals a small inline form with two `Select`s (source, target) populated from `elements` (option label `\`${el.blockId} — ${el.name}\``, value `el.id`) and a Create button calling `addConnection({ projectId, sourceId, targetId })` then `loadInterfaces()`. Read `projectId` from the store `project`.
- `useEffect(() => { loadInterfaces() }, [])` to populate on mount.

Implementation:

```tsx
import { useState, useEffect } from 'react'
import { useStore } from '../../store'
import { Button, Select, SectionLabel } from '../ui'
import { buildInterfaceRows, customFieldKeys, loadColumnVisibility, saveColumnVisibility, BUILTIN_OPTIONAL_COLUMNS } from './rows'

const BUILTIN_LABELS: Record<string, string> = { name: 'Name', type: 'Type', description: 'Description' }

export default function InterfaceRegister(): JSX.Element {
  const {
    project, connections, elements, connectionTypes, projectConnectionCustomFields,
    loadInterfaces, addConnection, selectConnection
  } = useStore() as any

  const [showColumns, setShowColumns] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [sourceId, setSourceId] = useState('')
  const [targetId, setTargetId] = useState('')

  useEffect(() => { loadInterfaces() }, [])

  const rows = buildInterfaceRows(connections, elements, connectionTypes, projectConnectionCustomFields)
  const customKeys = customFieldKeys(projectConnectionCustomFields)
  const [vis, setVis] = useState<Record<string, boolean>>(() => loadColumnVisibility(customKeys))

  useEffect(() => { setVis(loadColumnVisibility(customKeys)) }, [customKeys.join('|')])

  function toggleCol(col: string): void {
    const next = { ...vis, [col]: !vis[col] }
    setVis(next)
    saveColumnVisibility(next)
  }

  const optionalCols = [...BUILTIN_OPTIONAL_COLUMNS, ...customKeys].filter((c) => vis[c])

  async function createInterface(): Promise<void> {
    if (!project || !sourceId || !targetId) return
    await addConnection({ projectId: project.id, sourceId: Number(sourceId), targetId: Number(targetId) })
    await loadInterfaces()
    setShowNew(false); setSourceId(''); setTargetId('')
  }

  function cellValue(row: ReturnType<typeof buildInterfaceRows>[number], col: string): string {
    if (col === 'name') return row.name
    if (col === 'type') return row.typeName
    if (col === 'description') return row.description
    return row.customValues[col] ?? ''
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-line shrink-0">
        <span className="text-sm text-ink-muted">{rows.length} interfaces</span>
        <div className="ml-auto flex items-center gap-2 relative">
          <Button variant="secondary" onClick={() => setShowColumns((v) => !v)}>Columns</Button>
          <Button onClick={() => setShowNew((v) => !v)}>+ New Interface</Button>
          {showColumns && (
            <div className="absolute right-0 top-full mt-1 z-10 bg-white border border-line rounded shadow p-2 w-48">
              {[...BUILTIN_OPTIONAL_COLUMNS, ...customKeys].map((col) => (
                <label key={col} className="flex items-center gap-2 px-1 py-1 text-sm text-ink cursor-pointer">
                  <input type="checkbox" checked={vis[col] ?? true} onChange={() => toggleCol(col)} />
                  {BUILTIN_LABELS[col] ?? col}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {showNew && (
        <div className="flex items-end gap-2 px-5 py-3 border-b border-line bg-workspace shrink-0">
          <div className="flex-1">
            <SectionLabel className="block mb-1">From</SectionLabel>
            <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">— Source —</option>
              {elements.map((el: any) => <option key={el.id} value={el.id}>{el.blockId} — {el.name}</option>)}
            </Select>
          </div>
          <div className="flex-1">
            <SectionLabel className="block mb-1">To</SectionLabel>
            <Select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">— Target —</option>
              {elements.map((el: any) => <option key={el.id} value={el.id}>{el.blockId} — {el.name}</option>)}
            </Select>
          </div>
          <Button onClick={createInterface} disabled={!sourceId || !targetId}>Create</Button>
          <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-workspace z-[1]">
            <tr className="text-left">
              <th className="px-4 py-2"><SectionLabel>Interface ID</SectionLabel></th>
              <th className="px-4 py-2"><SectionLabel>From</SectionLabel></th>
              <th className="px-4 py-2"><SectionLabel>To</SectionLabel></th>
              {optionalCols.map((col) => (
                <th key={col} className="px-4 py-2"><SectionLabel>{BUILTIN_LABELS[col] ?? col}</SectionLabel></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.connectionId}
                onClick={() => selectConnection(row.connectionId)}
                className={`cursor-pointer border-t border-line hover:bg-workspace ${i % 2 === 1 ? 'bg-workspace/40' : ''}`}
              >
                <td className="px-4 py-2 font-mono text-ink">{row.interfaceId}</td>
                <td className="px-4 py-2 font-mono text-ink-muted">{row.fromId}</td>
                <td className="px-4 py-2 font-mono text-ink-muted">{row.toId}</td>
                {optionalCols.map((col) => (
                  <td key={col} className="px-4 py-2 text-ink-muted">{cellValue(row, col) || '—'}</td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={3 + optionalCols.length} className="px-4 py-6 text-center text-ink-faint">No interfaces yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

Note: `selectConnection(id)` already clears `selectedElementId` (store line 416), so no extra deselect handling is needed.

- [ ] **Step 4: Run the component test**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/InterfaceRegister/index.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire the tab into App.tsx**

In `src/renderer/src/App.tsx`:

Import the component:
```typescript
import InterfaceRegister from './components/InterfaceRegister'
```

Add `'interfaces'` to the nav tab list array (after `architecture`):
```typescript
{([['requirements', 'Requirements'], ['architecture', 'Architecture'], ['interfaces', 'Interfaces'], ['traceability', 'Traceability'], ['dashboard', 'Dashboard']] as const).map(([tab, label]) => (
```

Add a load effect (mirror the architecture one) so switching to the tab loads data:
```typescript
  useEffect(() => {
    if (activeTab === 'interfaces' && project) loadInterfaces()
  }, [activeTab, project?.id])
```
(Add `loadInterfaces` to the `useStore()` destructure at the top of the component.)

Add the panel branch. Interfaces shows the register full-width, with the `ConnectionPanel` drawer when a connection is selected — insert before the final architecture `) : (` fallback:
```tsx
      ) : activeTab === 'interfaces' ? (
        <div data-testid="panel-interfaces" className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <InterfaceRegister />
          </div>
          {selectedConnectionId !== null && (
            <Panel className="w-96 shrink-0 border-l overflow-y-auto">
              <ConnectionPanel />
            </Panel>
          )}
        </div>
```
(`ConnectionPanel` is already imported in App.tsx.)

- [ ] **Step 6: Typecheck + full renderer test sweep**

Run: `./node_modules/.bin/tsc -p tsconfig.web.json --noEmit && ./node_modules/.bin/tsc -p tsconfig.node.json --noEmit`
Expected: no errors.

Run: `./node_modules/.bin/vitest run src/renderer`
Expected: no NEW failures vs the documented baseline (the only failing renderer test project-wide is the 1 pre-existing ArchitectureCanvas one; if App.test.tsx breaks on the new tab/selectors, update its store mock and tab-list assertions).

- [ ] **Step 7: Live-verify in the running app**

Build/run via the driver and confirm end-to-end (per Global Constraints, this is the real gate for main-process code):
1. Interfaces tab appears in the nav and opens the register.
2. Existing canvas connections appear as rows with correct Interface ID (`ICN-…`), From/To object IDs (`SYS-…`).
3. `+ New Interface` → pick source + target → Create → new row appears AND the edge appears on the Architecture canvas.
4. Click a row → drawer opens → add a custom field (key `Protocol`, value `CAN`) → it persists; return to register, the `Protocol` column is available in the Columns toggle and shows the value.
5. Toggle a column off, relaunch the app, confirm the column stays hidden (localStorage persistence).
6. A connection drawn on the Architecture canvas shows up in the register.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/InterfaceRegister src/renderer/src/App.tsx
git commit -m "feat(interfaces): Interface Register view, column toggle, create form, tab wiring"
```

---

## Self-Review Notes

- **Spec coverage:** core model (interface=connection) → Tasks 3/6; new-nav tab + register table → Task 6; mandatory ID/object-ID columns → Task 6 Step 3; column visibility + persistence → Tasks 3/6; custom fields table/IPC → Tasks 1/2, store → Task 4, drawer UI → Task 5, register columns → Tasks 3/6; create from element pickers → Task 6; canvas sync (same rows) → inherent (register reads connections). Out-of-scope items intentionally omitted.
- **Connection-select action resolved:** `selectConnection(id)` (store line 416, clears `selectedElementId`) — used directly in Task 6.
- **ABI reality:** backend tasks verified by typecheck + live app, not vitest, per baseline.
