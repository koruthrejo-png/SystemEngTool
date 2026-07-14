# Requirements File Structure (Folders Contain Modules) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace module-in-module nesting with folders: pure containers that hold folders and modules, where a module is a leaf that owns requirements.

**Architecture:** One new column, `modules.kind` (`'folder' | 'module'`), keeps the existing self-referencing tree and every `module_id` foreign key exactly as they are. Two invariants are enforced by guards in `src/main/handlers/modules.ts` (only folders may be a parent) and `src/main/handlers/requirements.ts` (only modules may own requirements). An idempotent migration splits every legacy parent module into a folder plus a same-name module that inherits its prefix and counter, so requirement IDs never change.

**Tech Stack:** Electron 31 + better-sqlite3, React 18 + Zustand, Tailwind, Vitest + Testing Library.

Spec: `docs/superpowers/specs/2026-07-14-requirements-file-structure-design.md`

## Global Constraints

- **`npm` is NOT usable** — the Logi node22 `npm` shim is broken. Put node on PATH with `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"` and call binaries directly: `./node_modules/.bin/vitest`, `./node_modules/.bin/tsc`, `./node_modules/.bin/electron-vite`. If you are in a git worktree without its own `node_modules`, call the main checkout's binaries by absolute path: `/Users/rejopckoruth/Documents/ReqArch2/node_modules/.bin/vitest`.
- **Main-process tests do not run.** `better-sqlite3` is compiled for Electron ABI 125, so any vitest file that opens the database dies with `ERR_DLOPEN_FAILED`. That is the pre-existing 47-failure baseline — it is NOT something you broke and NOT something to fix. Handler tests in this plan are written to match codebase convention and are gated by the live-verify in Task 6, not by a green vitest run. **The renderer suite is the real gate and must stay green.**
- Enum columns are enforced in TypeScript, never with a DB `CHECK` — follow `LAYER_STATES` / `REQUIREMENT_STATUSES`.
- Kind values are exactly `'folder'` and `'module'`. Folder rows store `id_prefix = ''`.
- No new dependencies.
- Renderer test baseline before you start: **243 passed** (or higher). Never let it drop.

---

### Task 1: `kind` column, types, and handler guards

**Files:**
- Modify: `src/types/index.ts` (add `MODULE_KINDS`/`ModuleKind`; `Module`, `CreateModuleInput`)
- Modify: `src/main/db/migrations.ts` (one `addColumnIfMissing` call)
- Modify: `src/main/handlers/modules.ts` (`rowToModule`, `createModule`, `moveModule`, new `assertFolderParent`)
- Modify: `src/main/handlers/requirements.ts:36-38` (`createRequirement` folder guard)
- Test: `src/main/handlers/modules.test.ts` (extend)

**Interfaces:**
- Consumes: nothing.
- Produces: `MODULE_KINDS: readonly ['folder','module']`, `type ModuleKind = 'folder' | 'module'`, `Module.kind: ModuleKind`, `CreateModuleInput.kind: ModuleKind`. Every later task depends on these names.

- [ ] **Step 1: Write the failing tests**

Append these to the `describe('modules handler', ...)` block in `src/main/handlers/modules.test.ts`:

```ts
  it('createModule defaults a folder to no prefix and reports its kind', () => {
    const folder = createModule({ projectId, parentId: null, kind: 'folder', name: 'Vehicle', idPrefix: '', idPadding: 4 })
    expect(folder.kind).toBe('folder')
    const mod = createModule({ projectId, parentId: folder.id, kind: 'module', name: 'Chassis', idPrefix: 'CHS', idPadding: 4 })
    expect(mod.kind).toBe('module')
    expect(mod.parentId).toBe(folder.id)
  })

  it('createModule rejects a module as parent', () => {
    const mod = createModule({ projectId, parentId: null, kind: 'module', name: 'System', idPrefix: 'SYS', idPadding: 4 })
    expect(() =>
      createModule({ projectId, parentId: mod.id, kind: 'module', name: 'Nested', idPrefix: 'NST', idPadding: 4 })
    ).toThrow(/Only folders/)
  })

  it('moveModule rejects a module as the new parent', () => {
    const folder = createModule({ projectId, parentId: null, kind: 'folder', name: 'Vehicle', idPrefix: '', idPadding: 4 })
    const a = createModule({ projectId, parentId: folder.id, kind: 'module', name: 'A', idPrefix: 'AAA', idPadding: 4 })
    const b = createModule({ projectId, parentId: folder.id, kind: 'module', name: 'B', idPrefix: 'BBB', idPadding: 4 })
    expect(() => moveModule(a.id, b.id)).toThrow(/Only folders/)
    expect(() => moveModule(a.id, folder.id)).not.toThrow()
  })

  it('createRequirement rejects a folder', () => {
    const folder = createModule({ projectId, parentId: null, kind: 'folder', name: 'Vehicle', idPrefix: '', idPadding: 4 })
    expect(() => createRequirement({ moduleId: folder.id, text: 'nope' })).toThrow(/Folders cannot own requirements/)
  })
```

Fix the imports at the top of that file — `moveModule` and `createRequirement` are not imported yet:

```ts
import { listModules, createModule, updateModule, deleteModule, restoreModule, moveModule } from './modules'
import { createRequirement } from './requirements'
```

Every pre-existing `createModule({...})` call in this file now misses `kind` and will not typecheck. Add `kind: 'module'` to each of them (there are 5, plus the nested-modules test — see Step 2).

Delete the now-invalid test `supports nested modules via parentId` (a module inside a module is exactly what this change forbids); the new `createModule rejects a module as parent` test replaces it.

- [ ] **Step 2: Run the test to see how it fails**

```bash
export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"
./node_modules/.bin/vitest run src/main/handlers/modules.test.ts
```

Expected: FAIL with `ERR_DLOPEN_FAILED` — this file cannot run in vitest (see Global Constraints). That is the expected result both before and after your change. Your real gate for this task is Step 5 (`tsc`), and Task 6's live-verify.

- [ ] **Step 3: Add the types**

In `src/types/index.ts`, above `export interface Module`:

```ts
export const MODULE_KINDS = ['folder', 'module'] as const
export type ModuleKind = (typeof MODULE_KINDS)[number]
```

Add `kind: ModuleKind` to `Module` (after `parentId`) and to `CreateModuleInput` (after `parentId`).

- [ ] **Step 4: Add the column and the guards**

In `src/main/db/migrations.ts`, next to the other `addColumnIfMissing` calls:

```ts
  addColumnIfMissing(db, 'modules', 'kind', "TEXT NOT NULL DEFAULT 'module'")
```

In `src/main/handlers/modules.ts`:

```ts
import Database from 'better-sqlite3'
import type { Module, ModuleKind, CreateModuleInput, UpdateModuleInput } from '../../types'
```

```ts
// Invariant: only a folder may contain folders or modules. Guarded here, not by the schema.
function assertFolderParent(db: Database.Database, parentId: number | null): void {
  if (parentId == null) return
  const parent = db.prepare('SELECT kind FROM modules WHERE id = ?').get(parentId) as any
  if (!parent) throw new Error(`Module ${parentId} not found`)
  if ((parent.kind ?? 'module') !== 'folder') throw new Error('Only folders can contain folders or modules')
}
```

In `rowToModule`, add after `parentId`:

```ts
    kind: (row.kind ?? 'module') as ModuleKind,
```

Replace the body of `createModule`:

```ts
export function createModule(input: CreateModuleInput): Module {
  const db = getDatabase()
  const ts = now()
  assertFolderParent(db, input.parentId ?? null)
  const result = db.prepare(`
    INSERT INTO modules (project_id, parent_id, kind, name, id_prefix, id_padding, next_counter, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
  `).run(input.projectId, input.parentId ?? null, input.kind, input.name, input.idPrefix, input.idPadding, ts, ts)
  return rowToModule(db.prepare('SELECT * FROM modules WHERE id = ?').get(result.lastInsertRowid))
}
```

In `moveModule`, add the folder check immediately after the existing cycle-guard `while` loop closes and before the `UPDATE` (keep the cycle guard exactly as it is — it must run first so "move into my own descendant" still reports the cycle error):

```ts
  assertFolderParent(db, newParentId)
```

In `src/main/handlers/requirements.ts`, in `createRequirement`, replace the module lookup (currently lines 36-38):

```ts
    const mod = db.prepare('SELECT id_prefix, id_padding, next_counter, kind FROM modules WHERE id = ?').get(input.moduleId) as any
    if (!mod) throw new Error(`Module ${input.moduleId} not found`)
    if ((mod.kind ?? 'module') === 'folder') throw new Error('Folders cannot own requirements')
```

- [ ] **Step 5: Typecheck both projects**

```bash
export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"
./node_modules/.bin/tsc --noEmit -p tsconfig.node.json
./node_modules/.bin/tsc --noEmit -p tsconfig.web.json
```

Expected: `tsconfig.node.json` clean. `tsconfig.web.json` will report errors in renderer test fixtures that build `Module` objects without `kind` — leave them, Tasks 3-5 fix each one. Note which files they are.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/main/db/migrations.ts src/main/handlers/modules.ts src/main/handlers/requirements.ts src/main/handlers/modules.test.ts
git commit -m "feat(modules): kind column ('folder' | 'module') + parent/ownership guards"
```

---

### Task 2: Split migration

**Files:**
- Modify: `src/main/db/migrations.ts` (append a data migration at the end of `runMigrations`)

**Interfaces:**
- Consumes: the `modules.kind` column from Task 1.
- Produces: no exported symbols. Guarantees that after `runMigrations`, no live `kind='module'` row has live children.

- [ ] **Step 1: Write the migration**

Append to the end of `runMigrations` in `src/main/db/migrations.ts`, after the "Default architecture" migration:

```ts
  // One-time: folders contain modules (backlog item 21). A module with children becomes a
  // folder; if it also owns requirements or headings, those move to a new same-name module
  // inside it that inherits the prefix + counter, so req IDs never change.
  // Idempotent — afterwards no kind='module' row has children, so re-runs match nothing.
  const parentsToConvert = db
    .prepare(`
      SELECT * FROM modules p
      WHERE p.deleted_at IS NULL AND p.kind = 'module'
        AND EXISTS (SELECT 1 FROM modules c WHERE c.parent_id = p.id AND c.deleted_at IS NULL)
    `)
    .all() as any[]
  if (parentsToConvert.length > 0) {
    const kts = new Date().toISOString()
    db.transaction(() => {
      for (const p of parentsToConvert) {
        const owned = db.prepare(`
          SELECT (SELECT COUNT(*) FROM requirements WHERE module_id = ?)
               + (SELECT COUNT(*) FROM req_headings WHERE module_id = ?) AS n
        `).get(p.id, p.id) as { n: number }
        if (owned.n > 0) {
          const r = db.prepare(`
            INSERT INTO modules (project_id, parent_id, kind, name, id_prefix, id_padding, next_counter, position, created_at, updated_at)
            VALUES (?, ?, 'module', ?, ?, ?, ?, 0, ?, ?)
          `).run(p.project_id, p.id, p.name, p.id_prefix, p.id_padding, p.next_counter, kts, kts)
          const newId = Number(r.lastInsertRowid)
          // Soft-deleted rows move too — they must follow their requirements' module.
          db.prepare('UPDATE requirements SET module_id = ? WHERE module_id = ?').run(newId, p.id)
          db.prepare('UPDATE req_headings SET module_id = ? WHERE module_id = ?').run(newId, p.id)
        }
        db.prepare("UPDATE modules SET kind = 'folder', id_prefix = '', next_counter = 1, updated_at = ? WHERE id = ?")
          .run(kts, p.id)
      }
    })()
  }
```

Two details that matter:

1. The `UPDATE requirements SET module_id` runs **before** the parent is flipped to `'folder'`, and both live inside one transaction — a crash mid-way leaves the old model intact.
2. `owned.n` deliberately counts soft-deleted requirements and headings. A module whose only requirements are deleted still gets a real module to hold them, so a later "Show deleted" restore has somewhere to land.

- [ ] **Step 2: Typecheck**

```bash
export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"
./node_modules/.bin/tsc --noEmit -p tsconfig.node.json
```

Expected: clean. (This migration is verified against real data in Task 6 — vitest cannot open the DB.)

- [ ] **Step 3: Commit**

```bash
git add src/main/db/migrations.ts
git commit -m "feat(modules): split legacy parent modules into folder + same-name module"
```

---

### Task 3: New-item form gains a Folder | Module toggle

**Files:**
- Modify: `src/renderer/src/components/ModuleTree/NewModuleForm.tsx`
- Test: `src/renderer/src/components/ModuleTree/NewModuleForm.test.tsx` (create)

**Interfaces:**
- Consumes: `ModuleKind`, `CreateModuleInput.kind` (Task 1).
- Produces: `NewModuleForm` unchanged props (`projectId`, `parentId`, `onSubmit`, `onCancel`); it now always submits a `kind`, and submits `idPrefix: ''` for folders. The store's `addModule` forwards `CreateModuleInput` verbatim, so no store change is needed anywhere.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/components/ModuleTree/NewModuleForm.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import NewModuleForm from './NewModuleForm'

const setup = () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<NewModuleForm projectId={1} parentId={null} onSubmit={onSubmit} onCancel={vi.fn()} />)
  return onSubmit
}

describe('NewModuleForm', () => {
  it('submits a module with a prefix by default', () => {
    const onSubmit = setup()
    fireEvent.change(screen.getByPlaceholderText('Module name'), { target: { value: 'Chassis' } })
    fireEvent.change(screen.getByPlaceholderText('ID prefix (e.g. SRS)'), { target: { value: 'chs' } })
    fireEvent.submit(screen.getByPlaceholderText('Module name').closest('form')!)
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'module', name: 'Chassis', idPrefix: 'CHS', parentId: null })
    )
  })

  it('hides the prefix inputs for a folder and submits an empty prefix', () => {
    const onSubmit = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Folder' }))
    expect(screen.queryByPlaceholderText('ID prefix (e.g. SRS)')).not.toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Folder name'), { target: { value: 'Vehicle' } })
    fireEvent.submit(screen.getByPlaceholderText('Folder name').closest('form')!)
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'folder', name: 'Vehicle', idPrefix: '' })
    )
  })

  it('does not submit a module without a prefix', () => {
    const onSubmit = setup()
    fireEvent.change(screen.getByPlaceholderText('Module name'), { target: { value: 'Chassis' } })
    fireEvent.submit(screen.getByPlaceholderText('Module name').closest('form')!)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"
./node_modules/.bin/vitest run src/renderer/src/components/ModuleTree/NewModuleForm.test.tsx
```

Expected: FAIL — no button named `Folder` exists yet.

- [ ] **Step 3: Implement**

Replace `src/renderer/src/components/ModuleTree/NewModuleForm.tsx` entirely:

```tsx
import { useState } from 'react'
import type { CreateModuleInput, ModuleKind } from '../../../../types'
import { Button, Input } from '../ui'

interface Props {
  projectId: number
  parentId: number | null
  onSubmit: (input: CreateModuleInput) => Promise<void>
  onCancel: () => void
}

export default function NewModuleForm({ projectId, parentId, onSubmit, onCancel }: Props): JSX.Element {
  const [kind, setKind] = useState<ModuleKind>('module')
  const [name, setName] = useState('')
  const [prefix, setPrefix] = useState('')
  const [padding, setPadding] = useState(4)
  const isFolder = kind === 'folder'

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!name.trim()) return
    if (!isFolder && !prefix.trim()) return
    await onSubmit({
      projectId,
      parentId,
      kind,
      name: name.trim(),
      idPrefix: isFolder ? '' : prefix.trim().toUpperCase(),
      idPadding: padding
    })
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 space-y-2 bg-workspace border-t border-line">
      <div className="flex rounded border border-line overflow-hidden text-xs">
        {([['folder', 'Folder'], ['module', 'Module']] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`flex-1 px-2 py-1 ${kind === k ? 'bg-action text-white' : 'bg-white text-ink-muted hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <Input autoFocus placeholder={isFolder ? 'Folder name' : 'Module name'} value={name}
        onChange={(e) => setName(e.target.value)} className="!py-1.5" />
      {!isFolder && (
        <div className="flex gap-2">
          <Input placeholder="ID prefix (e.g. SRS)" value={prefix} onChange={(e) => setPrefix(e.target.value)} className="flex-1 !py-1.5" />
          <Input type="number" min={1} max={8} value={padding} onChange={(e) => setPadding(Number(e.target.value))}
            title="ID digit count" className="!w-16 !py-1.5" />
        </div>
      )}
      <div className="flex gap-2">
        <Button type="submit" className="flex-1 !py-1.5">Add</Button>
        <Button type="button" variant="secondary" onClick={onCancel} className="flex-1 !py-1.5">Cancel</Button>
      </div>
    </form>
  )
}
```

The toggle copies the Dashboard's direction toggle-group styling (`Dashboard/index.tsx:325-334`), which pairs the value with an explicit label. Do not render `{k}` under a `capitalize` class instead — CSS does not change text content, so the button's accessible name would stay `"folder"` and the test's `getByRole('button', { name: 'Folder' })` would not match.

- [ ] **Step 4: Run the test to verify it passes**

```bash
./node_modules/.bin/vitest run src/renderer/src/components/ModuleTree/NewModuleForm.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ModuleTree/NewModuleForm.tsx src/renderer/src/components/ModuleTree/NewModuleForm.test.tsx
git commit -m "feat(modules): folder|module toggle in the new-item form"
```

---

### Task 4: Tree renders folders and modules differently

**Files:**
- Modify: `src/renderer/src/components/ModuleTree/ModuleNode.tsx`
- Modify: `src/renderer/src/components/ModuleTree/index.tsx` (button copy only)
- Test: `src/renderer/src/components/ModuleTree/index.test.tsx` (rewrite fixtures + expectations)

**Interfaces:**
- Consumes: `Module.kind` (Task 1), `NewModuleForm` (Task 3).
- Produces: aria-labels other tests and the live-verify rely on — `Add to ${name}` (folders only, replaces `Add submodule to ${name}`), `Move ${name}`, `Move ${name} to`.

- [ ] **Step 1: Write the failing tests**

Rewrite `src/renderer/src/components/ModuleTree/index.test.tsx`. The fixture helper gains a `kind`, and the tree becomes folder `System` (id 1) containing module `Software` (id 2), plus folder `Hardware` (id 3) and module `Payload` (id 4) at top level:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import ModuleTree from './index'

const storeState: any = {}

vi.mock('../../store', () => ({
  useStore: () => storeState
}))

const mod = (id: number, parentId: number | null, name: string, kind: 'folder' | 'module' = 'module'): any => ({
  id, projectId: 1, parentId, kind, name,
  idPrefix: kind === 'folder' ? '' : 'M', idPadding: 4,
  nextCounter: 1, position: 0, deletedAt: null, createdAt: '', updatedAt: ''
})

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(storeState, {
    project: { id: 1, name: 'Demo' },
    modules: [
      mod(1, null, 'System', 'folder'),
      mod(2, 1, 'Software'),
      mod(3, null, 'Hardware', 'folder'),
      mod(4, null, 'Payload')
    ],
    selectedModuleId: null,
    selectModule: vi.fn().mockResolvedValue(undefined),
    addModule: vi.fn().mockResolvedValue(undefined),
    updateModule: vi.fn().mockResolvedValue(undefined),
    removeModule: vi.fn().mockResolvedValue(undefined),
    moveModule: vi.fn().mockResolvedValue(undefined)
  })
})

describe('ModuleTree hierarchy', () => {
  it('renders modules nested inside folders', () => {
    render(<ModuleTree />)
    expect(screen.getByText('System')).toBeInTheDocument()
    expect(screen.getByText('Software')).toBeInTheDocument()
    expect(screen.getByText('Hardware')).toBeInTheDocument()
  })

  it('clicking a folder toggles it and never selects', () => {
    render(<ModuleTree />)
    fireEvent.click(screen.getByText('System'))
    expect(storeState.selectModule).not.toHaveBeenCalled()
    expect(screen.queryByText('Software')).not.toBeInTheDocument() // collapsed
    fireEvent.click(screen.getByText('System'))
    expect(screen.getByText('Software')).toBeInTheDocument()
  })

  it('calls selectModule when a module row is clicked', () => {
    render(<ModuleTree />)
    fireEvent.click(screen.getByText('Software'))
    expect(storeState.selectModule).toHaveBeenCalledWith(2)
  })

  it('offers the add-child form on folders only', () => {
    render(<ModuleTree />)
    expect(screen.getByLabelText('Add to System')).toBeInTheDocument()
    expect(screen.queryByLabelText('Add to Software')).not.toBeInTheDocument()
  })

  it('opens the add-child form scoped to the folder and submits with parentId', () => {
    render(<ModuleTree />)
    fireEvent.click(screen.getByLabelText('Add to System'))
    fireEvent.change(screen.getByPlaceholderText('Module name'), { target: { value: 'Subsystem' } })
    fireEvent.change(screen.getByPlaceholderText('ID prefix (e.g. SRS)'), { target: { value: 'SUB' } })
    fireEvent.submit(screen.getByPlaceholderText('Module name').closest('form')!)
    expect(storeState.addModule).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 1, kind: 'module', name: 'Subsystem', idPrefix: 'SUB' })
    )
  })

  it('move picker lists folders only, excluding self and descendants', () => {
    render(<ModuleTree />)
    fireEvent.click(screen.getByLabelText('Move System'))
    const select = screen.getByLabelText('Move System to')
    const options = within(select).getAllByRole('option').map((o) => o.textContent)
    expect(options).toContain('(top level)')
    expect(options).toContain('Hardware')
    expect(options).not.toContain('System') // self
    expect(options).not.toContain('Software') // descendant, and a module
    expect(options).not.toContain('Payload') // a module can never be a parent
    fireEvent.change(select, { target: { value: '3' } })
    expect(storeState.moveModule).toHaveBeenCalledWith(1, 3)
  })

  it('move to top level passes null', () => {
    render(<ModuleTree />)
    fireEvent.click(screen.getByLabelText('Move Software'))
    fireEvent.change(screen.getByLabelText('Move Software to'), { target: { value: '' } })
    expect(storeState.moveModule).toHaveBeenCalledWith(2, null)
  })

  it('shows the new-item form when + New is clicked', () => {
    render(<ModuleTree />)
    fireEvent.click(screen.getByText('+ New'))
    expect(screen.getByPlaceholderText('Module name')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

```bash
export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"
./node_modules/.bin/vitest run src/renderer/src/components/ModuleTree/index.test.tsx
```

Expected: FAIL — `Add to System` does not exist (it is `Add submodule to System`), folder clicks still call `selectModule`, and `+ New` is still `+ New Module`.

- [ ] **Step 3: Implement `ModuleNode`**

In `src/renderer/src/components/ModuleTree/ModuleNode.tsx`, replace the derived-values block (currently `const children = ...` through `const moveTargets = ...`):

```tsx
  const isFolder = module.kind === 'folder'
  const children = isFolder ? childrenOf(allModules, module.id) : []
  const isSelected = !isFolder && selectedModuleId === module.id
  const excluded = descendantIds(allModules, module.id)
  // Only folders can hold anything, so only folders are move targets.
  const moveTargets = allModules.filter((m) => m.kind === 'folder' && m.id !== module.id && !excluded.has(m.id))
```

Change the row's click handler:

```tsx
        onClick={() => (isFolder ? setExpanded(!expanded) : onSelect(module.id))}
```

Replace the twisty button and the icon (the twisty is folder-only; the icon tells the two kinds apart):

```tsx
        {isFolder ? (
          <button className="w-4 shrink-0 text-ink-faint hover:text-ink-muted"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}>
            {children.length > 0 ? (expanded ? '▾' : '▸') : ''}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        {isFolder ? (
          <svg className="w-3.5 h-3.5 shrink-0 text-ink-faint" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M2 5.5A1.5 1.5 0 013.5 4h4.379a1.5 1.5 0 011.06.44l1.122 1.12a1.5 1.5 0 001.06.44H16.5A1.5 1.5 0 0118 7.5v7A1.5 1.5 0 0116.5 16h-13A1.5 1.5 0 012 14.5v-9z" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5 shrink-0 text-ink-faint" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm7 0v3h3l-3-3z" />
          </svg>
        )}
```

Make the `+` button folder-only and re-label it (a module cannot take children):

```tsx
            {isFolder && (
              <button
                aria-label={`Add to ${module.name}`}
                title="New folder or module"
                className="px-1 text-ink-faint hover:text-action leading-none"
                onClick={(e) => { e.stopPropagation(); setAddingChild(true); setExpanded(true) }}
              >
                +
              </button>
            )}
```

Leave the `⇄` move button, the rename form, the context menu, the move `<select>`, the `addingChild` form block, and the recursive `children.map(...)` render exactly as they are — `children` is now empty for modules, so the recursion naturally stops at leaves.

- [ ] **Step 4: Implement the `ModuleTree` button copy**

In `src/renderer/src/components/ModuleTree/index.tsx`, the bottom button now creates either kind:

```tsx
          <Button className="w-full" onClick={() => setShowForm(true)}>+ New</Button>
```

Also update the empty-state copy on the line above the `topLevel.map`:

```tsx
          <div className="px-4 py-2 text-sm text-ink-faint">Nothing here yet.</div>
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
./node_modules/.bin/vitest run src/renderer/src/components/ModuleTree/
```

Expected: PASS — `index.test.tsx` (8 tests), `NewModuleForm.test.tsx` (3), `moduleTree.test.ts` (unchanged, still green: those helpers are kind-agnostic).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/ModuleTree/
git commit -m "feat(modules): folders expand, modules select — kind-aware tree rows"
```

---

### Task 5: Keep folders out of module lists

**Files:**
- Modify: `src/renderer/src/components/Dashboard/stats.ts:64` (`perModule`)
- Modify: `src/renderer/src/components/Dashboard/index.tsx:321` (derivation module filter)
- Modify: `src/renderer/src/components/RequirementDetail/index.tsx:329` (link-picker module select)
- Modify: `src/main/handlers/search.ts:28-32` (module query)
- Test: `src/renderer/src/components/Dashboard/stats.test.ts` (extend)
- Test: any renderer test whose `Module` fixtures now fail to typecheck (from Task 1, Step 5)

**Interfaces:**
- Consumes: `Module.kind` (Task 1).
- Produces: nothing new. This task is the ripple: every consumer that means "things that hold requirements" filters to `kind === 'module'`.

- [ ] **Step 1: Write the failing test**

Add to `src/renderer/src/components/Dashboard/stats.test.ts`. Match the file's existing fixture helpers — if it already has a `mod`/`module` factory, extend that one with `kind` instead of adding a second:

```ts
  it('perModule ignores folders even when rows still point at one', () => {
    const folder: any = { id: 1, projectId: 1, parentId: null, kind: 'folder', name: 'Vehicle', idPrefix: '', idPadding: 4, nextCounter: 1, position: 0, deletedAt: null, createdAt: '', updatedAt: '' }
    const module: any = { ...folder, id: 2, parentId: 1, kind: 'module', name: 'Chassis', idPrefix: 'CHS' }
    // req(1, 1) points at the folder — a pre-migration leftover. Without the kind filter the
    // folder has total > 0 and survives into perModule, so this fails for the right reason.
    const stats = computeStats([req(1, 1), req(2, 2)], [], [], [folder, module])
    expect(stats.perModule.map((m) => m.moduleId)).toEqual([2])
  })
```

`req(id, moduleId)` is whatever requirement factory the file already uses — reuse it, do not invent a second one. If its signature differs, adapt the call; the assertion is the point.

- [ ] **Step 2: Run it to verify it fails**

```bash
export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"
./node_modules/.bin/vitest run src/renderer/src/components/Dashboard/stats.test.ts
```

Expected: FAIL — `perModule` returns `[1, 2]`; the folder survives because it has a requirement pointing at it. Do not "fix" the test by emptying the folder: an empty folder is already dropped by the existing `.filter((m) => m.total > 0)`, which would make this test pass before the change and prove nothing.

- [ ] **Step 3: Apply the four filters**

`src/renderer/src/components/Dashboard/stats.ts` — `perModule`:

```ts
    perModule: modules
      .filter((m) => m.kind === 'module')
      .map((m) => {
```

`src/renderer/src/components/Dashboard/index.tsx` — the derivation module filter options:

```tsx
            {flattenTree(modules).filter(({ module: m }) => m.kind === 'module').map(({ module: m, depth }) => (
              <option key={m.id} value={m.id}>{' '.repeat(depth * 2)}{m.name}</option>
            ))}
```

`src/renderer/src/components/RequirementDetail/index.tsx` — the link-picker module select:

```tsx
              {flattenTree(modules).filter(({ module: m }) => m.kind === 'module').map(({ module: m, depth }) => (
                <option key={m.id} value={m.id}>{' '.repeat(depth * 2)}{m.name}</option>
              ))}
```

Both keep `flattenTree`'s `depth` for indentation, so a module still renders nested under its folder's depth.

`src/main/handlers/search.ts` — the module query:

```ts
  const modules = (db.prepare(`
    SELECT * FROM modules
    WHERE project_id = ? AND deleted_at IS NULL AND kind = 'module' AND name LIKE ? ESCAPE '\\'
    ORDER BY name LIMIT 10
  `).all(projectId, like) as any[]).map(rowToModule)
```

Folders are excluded from search on purpose: a folder hit would navigate via `selectModule`, and folders are not selectable.

- [ ] **Step 4: Fix the remaining fixture typecheck errors**

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.web.json
```

Every remaining error is a test fixture building a `Module` without `kind` (the list you noted in Task 1, Step 5 — expect `Dashboard/index.test.tsx`, `RequirementDetail/traceability.test.tsx`, and any other file with a module factory). Add `kind: 'module'` to each. Do not change what those tests assert.

- [ ] **Step 5: Run the full renderer suite**

```bash
./node_modules/.bin/vitest run src/renderer
./node_modules/.bin/tsc --noEmit -p tsconfig.web.json
./node_modules/.bin/tsc --noEmit -p tsconfig.node.json
```

Expected: renderer suite green at 243+ passed, 0 failed. Both typechecks clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/Dashboard/ src/renderer/src/components/RequirementDetail/ src/main/handlers/search.ts
git commit -m "fix(modules): keep folders out of module lists, pickers, and search"
```

---

### Task 6: Build, live-verify, docs

**Files:**
- Modify: `handoff.md` (status section)
- Modify: `docs/superpowers/specs/2026-07-02-ui-overhaul-design.md` (§6 backlog: mark item 21 done)
- Modify: `.superpowers/sdd/progress.md` (append this plan's ledger section)

**Interfaces:**
- Consumes: everything above.
- Produces: verified evidence that the migration is correct against real data. This is the only gate the migration and the handler guards ever get — vitest cannot open the DB.

- [ ] **Step 1: Full build + suites**

```bash
export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"
./node_modules/.bin/vitest run
./node_modules/.bin/tsc --noEmit -p tsconfig.web.json
./node_modules/.bin/tsc --noEmit -p tsconfig.node.json
./node_modules/.bin/electron-vite build
```

Expected: renderer green (243+ passed); main-process handler files still fail with `ERR_DLOPEN_FAILED` at the pre-existing 47-48 baseline and no higher; both typechecks clean; 3-target build clean.

- [ ] **Step 2: Capture the pre-migration state**

Before launching, snapshot a dev project that actually has nested modules — the migration only proves itself against real legacy data. Find the project DB (the app writes under Electron's userData; `/tmp/reqarch-debug.txt` logs the path on open), then:

```bash
export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"
node -e "const D=require('/Users/rejopckoruth/Documents/ReqArch2/node_modules/better-sqlite3');const db=new D(process.argv[1]);console.log(db.prepare('SELECT id,parent_id,name,id_prefix,next_counter FROM modules WHERE deleted_at IS NULL').all());console.log(db.prepare('SELECT id,module_id,req_id FROM requirements WHERE deleted_at IS NULL').all())" <path-to.reqarch>
```

That `node` invocation fails with `ERR_DLOPEN_FAILED` for the same ABI reason as the tests. If it does, read the DB with the `sqlite3` CLI instead:

```bash
sqlite3 <path-to.reqarch> "SELECT id,parent_id,kind,name,id_prefix,next_counter FROM modules WHERE deleted_at IS NULL;"
sqlite3 <path-to.reqarch> "SELECT id,module_id,req_id FROM requirements WHERE deleted_at IS NULL;"
```

If no dev project has a nested module, **make one first** on the pre-change build (`git stash` is unsafe here — see the worktree note in the environment; instead check out `main` in a scratch clone, or simply create the nesting through the UI before merging this branch). Record the rows — you are proving the split against them.

- [ ] **Step 2b: Check for legacy rows the migration deliberately skips**

The migration only converts parents that are themselves live (`deleted_at IS NULL`). `deleteModule` reparents live children to the grandparent before soft-deleting, so a soft-deleted row should never still have live children — but builds predating that behavior could have left some. Confirm none exist:

```bash
sqlite3 <path-to.reqarch> "SELECT COUNT(*) FROM modules p WHERE p.deleted_at IS NOT NULL AND p.kind='module' AND EXISTS (SELECT 1 FROM modules c WHERE c.parent_id=p.id AND c.deleted_at IS NULL);"
```

Expected: `0`. If it is not 0, stop and report — those children are attached to a soft-deleted module that will never become a folder, and the fix belongs in the migration, not the UI.

- [ ] **Step 3: Live-verify in the running app**

Launch with the Playwright driver (`.claude/skills/run-app/driver.mjs`) and check all seven:

1. **Migration split** — open the project from Step 2. The old parent module now renders as a folder containing a same-name module. Its requirements are under that module and their `req_id`s are **identical** to Step 2's snapshot.
2. **Migration idempotence** — quit and relaunch. The tree is unchanged; no second same-name module appears. Confirm with `sqlite3 ... "SELECT id,parent_id,kind,name FROM modules WHERE deleted_at IS NULL;"`.
3. **Counter continuity** — add a requirement to the migrated module. Its `req_id` continues the old sequence (if the snapshot ended at `VEH-0002`, the new one is `VEH-0003`).
4. **Create folder** — `+ New` → Folder → name it. It appears with a folder icon and no prefix inputs were shown. `sqlite3` shows `kind='folder'`, `id_prefix=''`.
5. **Folder click** — select a module, then click a folder. The folder expands/collapses and the requirements pane **keeps showing the selected module** (never blanks).
6. **Module is a leaf** — a module row shows no `+` button, and the `⇄` move picker on any row lists folders only.
7. **Search excludes folders** — search a folder's name. It returns no module hit. Search a module's name. It still hits.

Note the driver limits recorded in the handoff: tree rows are `<div onClick>` and cannot be reached by `click-text` (click via eval), and committing an inline rename needs a real `focusout`.

- [ ] **Step 4: Update the docs**

In `docs/superpowers/specs/2026-07-02-ui-overhaul-design.md` §6, strike item 21 the way items 16/17 are struck, with the commit range.

In `handoff.md`, add a COMPLETE section for this work (what shipped, the migration's split rule, the `kind` invariants and where they are guarded, the test baseline, and any deferrals). Note explicitly: **folders are excluded from global search**, and **`selectedModuleId` never holds a folder** — that invariant is what keeps every downstream consumer folder-free, so do not regress the folder-click handler into a selection.

Append a ledger section for this plan to `.superpowers/sdd/progress.md`.

- [ ] **Step 5: Commit**

```bash
git add handoff.md docs/superpowers/specs/2026-07-02-ui-overhaul-design.md .superpowers/sdd/progress.md
git commit -m "docs: requirements file structure complete — handoff + ledger"
```

---

## Notes for the executor

- **Do not chase `ERR_DLOPEN_FAILED`.** Every main-process test file has failed that way for the whole life of this project; the binary is built for Electron, not node. Task 6's live-verify is how backend work is proven here.
- The store needs **no** changes. `addModule` forwards `CreateModuleInput` verbatim, and `selectedModuleId` only ever receives module ids because the folder row never calls `onSelect`.
- `moduleTree.ts` needs **no** changes. `topLevelModules`, `childrenOf`, `descendantIds`, and `flattenTree` all key on `parentId` and stay kind-agnostic — including the orphan-safety guard.
- `deleteModule` needs **no** changes. Its reparent-children-to-grandparent transaction already works for folders: deleting a folder lifts its children to the grandparent folder, or to top level.
