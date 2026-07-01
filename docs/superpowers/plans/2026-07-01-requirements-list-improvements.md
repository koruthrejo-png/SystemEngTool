# Requirements List Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add soft-delete/restore UI, a full multi-column table layout, and custom key-value fields to the Requirements tab.

**Architecture:** Three independent UI layers built on top of the existing data model: (1) DB migration + new IPC handlers for custom fields and deleted-list queries, (2) store extensions for the new state and actions, (3) updated React components consuming that state.

**Tech Stack:** Electron 31, React 18, Zustand, better-sqlite3, Tailwind CSS, TypeScript, electron-vite

## Global Constraints

- All IPC handlers registered in `src/main/index.ts` via a `register*Handlers()` call
- Preload exposes all IPC through `window.api.*` via `contextBridge.exposeInMainWorld`
- Soft-delete pattern: set `deleted_at` timestamp; never hard-delete requirements
- Custom fields ARE hard-deleted (user-defined metadata, no recovery needed)
- Tailwind only — no inline styles, no new CSS files
- Save on `onBlur`, not on every keystroke
- No new dependencies

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/types/index.ts` | Modify | Add `RequirementCustomField`, `CreateCustomFieldInput`, `UpdateCustomFieldInput` |
| `src/main/db/migrations.ts` | Modify | Add `requirement_custom_fields` table |
| `src/main/handlers/requirements.ts` | Modify | Add `listDeletedRequirements` + IPC handler `requirements:listDeleted` |
| `src/main/handlers/requirementCustomFields.ts` | Create | 4 IPC handlers: list, create, update, delete |
| `src/main/index.ts` | Modify | Register `registerCustomFieldHandlers()` |
| `src/preload/index.ts` | Modify | Expose `requirements.listDeleted`, `requirements.restore`, and `customFields.*` |
| `src/renderer/src/store/index.ts` | Modify | Add `customFields`, `showDeleted`, `deletedRequirements`, and 5 new actions |
| `src/renderer/src/components/RequirementsList/index.tsx` | Modify | CSS grid table, delete icon, show-deleted toggle |
| `src/renderer/src/components/RequirementDetail/index.tsx` | Modify | Custom fields section at bottom of panel |

---

## Task 1: Types + DB Migration

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/main/db/migrations.ts`

**Interfaces:**
- Produces: `RequirementCustomField` type used by Tasks 2, 4, 6

- [ ] **Step 1: Add `RequirementCustomField` type to `src/types/index.ts`**

Append after the `UpdateRequirementInput` interface:

```ts
export interface RequirementCustomField {
  id: number
  requirementId: number
  key: string
  value: string
  position: number
  createdAt: string
  updatedAt: string
}

export interface UpdateCustomFieldInput {
  key?: string
  value?: string
}
```

- [ ] **Step 2: Add migration for `requirement_custom_fields` in `src/main/db/migrations.ts`**

Add this table inside the `db.exec(...)` template literal in `runMigrations`, after the `connection_requirement_links` table block (before the closing backtick):

```sql
    CREATE TABLE IF NOT EXISTS requirement_custom_fields (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      requirement_id INTEGER NOT NULL REFERENCES requirements(id),
      key            TEXT    NOT NULL DEFAULT '',
      value          TEXT    NOT NULL DEFAULT '',
      position       INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT    NOT NULL,
      updated_at     TEXT    NOT NULL
    );
```

- [ ] **Step 3: Verify migration compiles**

```bash
cd /Users/rejopckoruth/Documents/ReqArch2 && npx tsc --noEmit -p tsconfig.node.json --composite false 2>&1 | head -20
```

Expected: no errors (or only pre-existing errors unrelated to these files).

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/main/db/migrations.ts
git commit -m "feat: add RequirementCustomField type and DB migration"
```

---

## Task 2: Custom Fields IPC Handlers

**Files:**
- Create: `src/main/handlers/requirementCustomFields.ts`

**Interfaces:**
- Consumes: `RequirementCustomField`, `UpdateCustomFieldInput` from `../../types`
- Produces: IPC channels `customFields:list`, `customFields:create`, `customFields:update`, `customFields:delete`

- [ ] **Step 1: Create `src/main/handlers/requirementCustomFields.ts`**

```ts
import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import type { RequirementCustomField, UpdateCustomFieldInput } from '../../types'

function now(): string { return new Date().toISOString() }

function rowToField(row: any): RequirementCustomField {
  return {
    id: row.id,
    requirementId: row.requirement_id,
    key: row.key,
    value: row.value,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function registerCustomFieldHandlers(): void {
  ipcMain.handle('customFields:list', (_e, requirementId: number) => {
    return (getDatabase()
      .prepare('SELECT * FROM requirement_custom_fields WHERE requirement_id = ? ORDER BY position, id')
      .all(requirementId) as any[]).map(rowToField)
  })

  ipcMain.handle('customFields:create', (_e, requirementId: number) => {
    const db = getDatabase()
    const ts = now()
    const row = db.prepare('SELECT COALESCE(MAX(position), -1) as mp FROM requirement_custom_fields WHERE requirement_id = ?').get(requirementId) as any
    const nextPos = (row.mp as number) + 1
    const result = db
      .prepare('INSERT INTO requirement_custom_fields (requirement_id, key, value, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(requirementId, '', '', nextPos, ts, ts)
    return rowToField(db.prepare('SELECT * FROM requirement_custom_fields WHERE id = ?').get(result.lastInsertRowid))
  })

  ipcMain.handle('customFields:update', (_e, id: number, patch: UpdateCustomFieldInput) => {
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM requirement_custom_fields WHERE id = ?').get(id) as any
    if (!existing) throw new Error(`Custom field ${id} not found`)
    db.prepare('UPDATE requirement_custom_fields SET key = ?, value = ?, updated_at = ? WHERE id = ?')
      .run(patch.key ?? existing.key, patch.value ?? existing.value, now(), id)
    return rowToField(db.prepare('SELECT * FROM requirement_custom_fields WHERE id = ?').get(id))
  })

  ipcMain.handle('customFields:delete', (_e, id: number) => {
    getDatabase().prepare('DELETE FROM requirement_custom_fields WHERE id = ?').run(id)
  })
}
```

- [ ] **Step 2: Register the handler in `src/main/index.ts`**

Add the import at the top:
```ts
import { registerCustomFieldHandlers } from './handlers/requirementCustomFields'
```

Add the call inside `app.whenReady().then(() => {`:
```ts
  registerCustomFieldHandlers()
```

Place it after `registerRequirementHandlers()`.

- [ ] **Step 3: Verify compile**

```bash
npx tsc --noEmit -p tsconfig.node.json --composite false 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/handlers/requirementCustomFields.ts src/main/index.ts
git commit -m "feat: add custom fields IPC handlers"
```

---

## Task 3: `requirements:listDeleted` IPC + Preload

**Files:**
- Modify: `src/main/handlers/requirements.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Produces: IPC channel `requirements:listDeleted(moduleId)` → `Requirement[]`
- Produces: `window.api.requirements.listDeleted`, `window.api.requirements.restore`, `window.api.customFields.*`

- [ ] **Step 1: Add `listDeletedRequirements` to `src/main/handlers/requirements.ts`**

Add after the `listRequirements` function:

```ts
export function listDeletedRequirements(moduleId: number): Requirement[] {
  return (getDatabase()
    .prepare('SELECT * FROM requirements WHERE module_id = ? AND deleted_at IS NOT NULL ORDER BY updated_at DESC')
    .all(moduleId) as any[]).map(rowToRequirement)
}
```

Register it inside `registerRequirementHandlers()`, after the `requirements:restore` line:

```ts
  ipcMain.handle('requirements:listDeleted', (_e, moduleId: number) => listDeletedRequirements(moduleId))
```

- [ ] **Step 2: Update `src/preload/index.ts`**

Replace the entire file with:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type {
  Project, Module, Requirement,
  CreateModuleInput, UpdateModuleInput,
  CreateRequirementInput, UpdateRequirementInput,
  RequirementCustomField, UpdateCustomFieldInput,
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
    listDeleted: (moduleId: number): Promise<Requirement[]> => ipcRenderer.invoke('requirements:listDeleted', moduleId),
    listByProject: (projectId: number): Promise<Requirement[]> => ipcRenderer.invoke('requirements:listByProject', projectId),
    create: (input: CreateRequirementInput): Promise<Requirement> => ipcRenderer.invoke('requirements:create', input),
    update: (id: number, input: UpdateRequirementInput): Promise<Requirement> => ipcRenderer.invoke('requirements:update', id, input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('requirements:delete', id),
    restore: (id: number): Promise<void> => ipcRenderer.invoke('requirements:restore', id)
  },
  customFields: {
    list: (requirementId: number): Promise<RequirementCustomField[]> => ipcRenderer.invoke('customFields:list', requirementId),
    create: (requirementId: number): Promise<RequirementCustomField> => ipcRenderer.invoke('customFields:create', requirementId),
    update: (id: number, patch: UpdateCustomFieldInput): Promise<RequirementCustomField> => ipcRenderer.invoke('customFields:update', id, patch),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('customFields:delete', id)
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

- [ ] **Step 3: Verify compile**

```bash
npx tsc --noEmit -p tsconfig.node.json --composite false 2>&1 | head -20
npx tsc --noEmit -p tsconfig.web.json --composite false 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/handlers/requirements.ts src/preload/index.ts
git commit -m "feat: add listDeleted IPC and expose customFields + restore in preload"
```

---

## Task 4: Store Extensions

**Files:**
- Modify: `src/renderer/src/store/index.ts`

**Interfaces:**
- Consumes: `RequirementCustomField`, `UpdateCustomFieldInput` from `../../../../types`
- Produces: store actions `loadCustomFields`, `addCustomField`, `updateCustomField`, `removeCustomField`, `restoreRequirement`, `setShowDeleted`; state `customFields`, `showDeleted`, `deletedRequirements`

- [ ] **Step 1: Update the store interface and initial state in `src/renderer/src/store/index.ts`**

Add `RequirementCustomField, UpdateCustomFieldInput` to the import from `../../../../types`.

Add to the `Store` interface (after `projectRequirements`):
```ts
  customFields: RequirementCustomField[]
  showDeleted: boolean
  deletedRequirements: Requirement[]
```

Add to the `Store` interface actions section (after `removeRequirement`):
```ts
  restoreRequirement: (id: number) => Promise<void>
  setShowDeleted: (show: boolean) => Promise<void>
  loadCustomFields: (requirementId: number) => Promise<void>
  addCustomField: (requirementId: number) => Promise<void>
  updateCustomField: (id: number, patch: UpdateCustomFieldInput) => Promise<void>
  removeCustomField: (id: number) => Promise<void>
```

Add to the initial state object (after `projectRequirements: []`):
```ts
  customFields: [], showDeleted: false, deletedRequirements: [],
```

- [ ] **Step 2: Add the new action implementations**

Add these inside the `create<Store>((set, get) => ({...}))` object, after `removeRequirement`:

```ts
  restoreRequirement: async (id) => {
    await window.api.requirements.restore(id)
    const { selectedModuleId } = get()
    if (!selectedModuleId) return
    const [requirements, deletedRequirements] = await Promise.all([
      window.api.requirements.list(selectedModuleId),
      window.api.requirements.listDeleted(selectedModuleId)
    ])
    set({ requirements, deletedRequirements, selectedRequirementId: null, customFields: [] })
  },

  setShowDeleted: async (show) => {
    set({ showDeleted: show, selectedRequirementId: null, customFields: [] })
    if (show) {
      const { selectedModuleId } = get()
      if (!selectedModuleId) return
      const deletedRequirements = await window.api.requirements.listDeleted(selectedModuleId)
      set({ deletedRequirements })
    }
  },

  loadCustomFields: async (requirementId) => {
    const customFields = await window.api.customFields.list(requirementId)
    set({ customFields })
  },

  addCustomField: async (requirementId) => {
    const field = await window.api.customFields.create(requirementId)
    set((s) => ({ customFields: [...s.customFields, field] }))
  },

  updateCustomField: async (id, patch) => {
    const updated = await window.api.customFields.update(id, patch)
    set((s) => ({ customFields: s.customFields.map((f) => (f.id === id ? updated : f)) }))
  },

  removeCustomField: async (id) => {
    await window.api.customFields.delete(id)
    set((s) => ({ customFields: s.customFields.filter((f) => f.id !== id) }))
  },
```

Update `selectRequirement` to clear `customFields` immediately so stale fields from the previous requirement don't flash:

Find the existing `selectRequirement` action and replace it with:
```ts
  selectRequirement: (id) => set({ selectedRequirementId: id, customFields: [] }),
```

Also update `selectModule` to reset `showDeleted`, `deletedRequirements`, and `customFields` when a different module is selected:

Find the existing `selectModule` action and replace it with:
```ts
  selectModule: async (id) => {
    set({ selectedModuleId: id, requirements: [], selectedRequirementId: null, showDeleted: false, deletedRequirements: [], customFields: [] })
    if (id === null) return
    const requirements = await window.api.requirements.list(id)
    set({ requirements })
  },
```

- [ ] **Step 3: Verify compile**

```bash
npx tsc --noEmit -p tsconfig.web.json --composite false 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/store/index.ts
git commit -m "feat: extend store with custom fields and delete/restore actions"
```

---

## Task 5: RequirementsList — Table Layout + Delete/Restore UI

**Files:**
- Modify: `src/renderer/src/components/RequirementsList/index.tsx`

**Interfaces:**
- Consumes: `showDeleted`, `deletedRequirements`, `setShowDeleted`, `removeRequirement`, `restoreRequirement` from store

- [ ] **Step 1: Replace `src/renderer/src/components/RequirementsList/index.tsx` entirely**

```tsx
import { useStore } from '../../store'

const GRID = 'grid grid-cols-[80px_1fr_1fr_120px_1fr_36px]'

export default function RequirementsList(): JSX.Element {
  const {
    selectedModuleId, modules, requirements, deletedRequirements,
    showDeleted, setShowDeleted,
    selectedRequirementId, selectRequirement,
    addRequirement, removeRequirement, restoreRequirement
  } = useStore()

  if (!selectedModuleId) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        Select a module to view its requirements.
      </div>
    )
  }

  const module = modules.find((m) => m.id === selectedModuleId)
  const displayed = showDeleted ? deletedRequirements : requirements

  async function handleAdd(): Promise<void> {
    await addRequirement({ moduleId: selectedModuleId!, text: '' })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between shrink-0">
        <span className="text-sm font-semibold text-gray-700">{module?.name ?? 'Requirements'}</span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-red-500"
            />
            <span className="text-xs text-gray-500">Show deleted</span>
          </label>
          <span className="text-xs text-gray-400">
            {displayed.length} item{displayed.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Column headers */}
      <div className={`${GRID} gap-x-3 px-3 py-1.5 border-b border-gray-200 bg-gray-50 shrink-0`}>
        <span className="text-xs font-medium uppercase tracking-wide text-gray-400">ID</span>
        <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Requirement</span>
        <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Acceptance Criteria</span>
        <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Source</span>
        <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Rationale</span>
        <span />
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {displayed.length === 0 && (
          <div className="p-4 text-sm text-gray-400">
            {showDeleted ? 'No deleted requirements.' : 'No requirements yet.'}
          </div>
        )}
        {displayed.map((req) => (
          <div
            key={req.id}
            onClick={() => !showDeleted && selectRequirement(req.id)}
            className={[
              GRID,
              'gap-x-3 items-start px-3 py-3 border-b border-gray-50 group',
              showDeleted ? 'opacity-60' : 'cursor-pointer hover:bg-gray-50',
              !showDeleted && selectedRequirementId === req.id
                ? 'bg-blue-50 border-l-2 border-l-blue-500'
                : ''
            ].join(' ')}
          >
            <span className="text-xs font-mono text-gray-400 pt-0.5 truncate">{req.reqId}</span>
            <span className="text-sm text-gray-800 break-words pr-1">
              {req.text || <span className="text-gray-300 italic">—</span>}
            </span>
            <span className="text-sm text-gray-600 break-words pr-1">
              {req.acceptanceCriteria || <span className="text-gray-300">—</span>}
            </span>
            <span className="text-xs text-gray-500 truncate">
              {req.source || <span className="text-gray-300">—</span>}
            </span>
            <span className="text-sm text-gray-600 break-words pr-1">
              {req.rationale || <span className="text-gray-300">—</span>}
            </span>
            <div className="flex items-start justify-center pt-0.5">
              {showDeleted ? (
                <button
                  onClick={(e) => { e.stopPropagation(); restoreRequirement(req.id) }}
                  className="text-xs text-blue-500 hover:text-blue-700 font-medium whitespace-nowrap"
                >
                  Restore
                </button>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); removeRequirement(req.id) }}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity text-base leading-none"
                  title="Delete requirement"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      {!showDeleted && (
        <div className="p-2 border-t border-gray-100 shrink-0">
          <button onClick={handleAdd} className="text-sm text-blue-600 hover:underline">
            + Requirement
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify compile**

```bash
npx tsc --noEmit -p tsconfig.web.json --composite false 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/RequirementsList/index.tsx
git commit -m "feat: requirements list — table layout, delete icon, show-deleted toggle"
```

---

## Task 6: RequirementDetail — Custom Fields Section

**Files:**
- Modify: `src/renderer/src/components/RequirementDetail/index.tsx`

**Interfaces:**
- Consumes: `customFields`, `loadCustomFields`, `addCustomField`, `updateCustomField`, `removeCustomField` from store

- [ ] **Step 1: Replace `src/renderer/src/components/RequirementDetail/index.tsx` entirely**

```tsx
import { useState, useEffect, useRef } from 'react'
import { useStore } from '../../store'

export default function RequirementDetail(): JSX.Element {
  const {
    selectedRequirementId, requirements, updateRequirement,
    customFields, loadCustomFields, addCustomField, updateCustomField, removeCustomField
  } = useStore()
  const req = requirements.find((r) => r.id === selectedRequirementId) ?? null

  const [text, setText] = useState('')
  const [ac, setAc] = useState('')
  const [source, setSource] = useState('')
  const [rationale, setRationale] = useState('')

  // Local edits for custom fields: keyed by field id
  const [localFields, setLocalFields] = useState<Record<number, { key: string; value: string }>>({})
  const newFieldRef = useRef<HTMLInputElement>(null)
  const prevCustomFieldCount = useRef(customFields.length)

  useEffect(() => {
    if (!req) return
    setText(req.text)
    setAc(req.acceptanceCriteria ?? '')
    setSource(req.source ?? '')
    setRationale(req.rationale ?? '')
    loadCustomFields(req.id)
  }, [req?.id])

  // Sync localFields when customFields change
  useEffect(() => {
    setLocalFields((prev) => {
      const next: Record<number, { key: string; value: string }> = {}
      for (const f of customFields) {
        next[f.id] = prev[f.id] ?? { key: f.key, value: f.value }
      }
      return next
    })
    // Focus label input on newly added field
    if (customFields.length > prevCustomFieldCount.current) {
      setTimeout(() => newFieldRef.current?.focus(), 50)
    }
    prevCustomFieldCount.current = customFields.length
  }, [customFields])

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

  function setLocalField(id: number, part: 'key' | 'value', val: string): void {
    setLocalFields((prev) => ({ ...prev, [id]: { ...prev[id], [part]: val } }))
  }

  async function handleAddField(): Promise<void> {
    await addCustomField(req!.id)
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

        {/* Custom fields */}
        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wide text-gray-400">Custom Fields</label>
          {customFields.map((field, i) => {
            const local = localFields[field.id] ?? { key: field.key, value: field.value }
            const isNewest = i === customFields.length - 1
            return (
              <div key={field.id} className="flex gap-2 items-center">
                <input
                  ref={isNewest ? newFieldRef : undefined}
                  value={local.key}
                  onChange={(e) => setLocalField(field.id, 'key', e.target.value)}
                  onBlur={() => updateCustomField(field.id, { key: local.key })}
                  placeholder="Field name"
                  className="w-2/5 text-sm px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <input
                  value={local.value}
                  onChange={(e) => setLocalField(field.id, 'value', e.target.value)}
                  onBlur={() => updateCustomField(field.id, { value: local.value })}
                  placeholder="Value"
                  className="flex-1 text-sm px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button
                  onClick={() => removeCustomField(field.id)}
                  className="text-gray-400 hover:text-red-500 text-lg leading-none px-1"
                  title="Remove field"
                >
                  ×
                </button>
              </div>
            )
          })}
          <button onClick={handleAddField}
            className="text-sm text-blue-600 hover:underline">
            + Add Field
          </button>
        </div>
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

- [ ] **Step 2: Verify compile**

```bash
npx tsc --noEmit -p tsconfig.web.json --composite false 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/RequirementDetail/index.tsx
git commit -m "feat: custom fields section in requirement detail panel"
```

---

## Task 7: Build and Smoke Test

- [ ] **Step 1: Run full typecheck**

```bash
npx tsc --noEmit -p tsconfig.node.json --composite false && npx tsc --noEmit -p tsconfig.web.json --composite false && echo "All types OK"
```

Expected: `All types OK`

- [ ] **Step 2: Build**

The app needs to be rebuilt. Since `npm` is not in the shell PATH, use the electron-vite binary directly:

```bash
./node_modules/.bin/electron-vite build 2>&1
```

Expected: three successful vite builds (main, preload, renderer). The preload should output as `out/preload/index.js` (CJS) due to the rollup config added in `electron.vite.config.ts`.

- [ ] **Step 3: Install correct better-sqlite3 native binary for Electron**

The `better_sqlite3.node` in `node_modules` must be the Electron-compatible build (NODE_MODULE_VERSION 125). This was already done during debugging. Verify it's still correct:

```bash
ls -la node_modules/better-sqlite3/build/Release/better_sqlite3.node
```

If it was reset (e.g. by a fresh `npm install`), re-download and replace:
```bash
curl -sL "https://github.com/WiseLibs/better-sqlite3/releases/download/v12.11.1/better-sqlite3-v12.11.1-electron-v125-darwin-arm64.tar.gz" -o /tmp/bsqlite3.tar.gz
mkdir -p /tmp/bsqlite3 && tar -xzf /tmp/bsqlite3.tar.gz -C /tmp/bsqlite3
cp /tmp/bsqlite3/build/Release/better_sqlite3.node node_modules/better-sqlite3/build/Release/better_sqlite3.node
```

- [ ] **Step 4: Launch and verify**

```bash
"./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" "./out/main/index.js" &
```

Manual checks:
1. Create or open a project → select a module → requirements show in multi-column table with column headers
2. Hover a requirement row → trash icon (×) appears at right
3. Click × → requirement disappears from list
4. Check "Show deleted" → requirement reappears greyed out with "Restore" button
5. Click Restore → requirement returns to active list; "Show deleted" stays on showing remaining deleted items
6. Select a requirement → detail panel shows all fields plus "Custom Fields" section with "+ Add Field"
7. Click "+ Add Field" → new row with empty key/value inputs; label input is focused
8. Type a field name and tab to value; type a value and click elsewhere → field persists on re-select
9. Click × next to a custom field → field removed

- [ ] **Step 5: Final commit**

```bash
git add electron.vite.config.ts
git commit -m "feat: requirements list improvements — multi-column table, soft delete, custom fields"
```
