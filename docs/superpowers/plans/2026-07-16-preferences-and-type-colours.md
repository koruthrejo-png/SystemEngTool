# Preferences + Colour-by-Type (item 29 B1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Objects on the architecture canvas optionally inherit their element type's border colour, toggled from a new Settings > Preferences section; per-object colour still overrides.

**Architecture:** Border-only inheritance resolved in the pure `buildNodes` helper (`el.color ?? type.color ?? NAVY`), gated by an app-global localStorage toggle read into the Zustand store. Type colours live in the existing `element_types.color` column, seeded for new projects and backfilled for legacy ones, edited via a new `elementTypes:update` IPC surfaced in a Settings modal. A shared palette constant in `src/types` keeps the seed/migration (main) and the swatch pickers (renderer) on one source of truth.

**Tech Stack:** Electron + better-sqlite3 (main), React + Zustand + @xyflow/react (renderer), Vitest.

## Global Constraints

- **Border only** — no `fill_color` on element types; fill stays per-object.
- **Toggle persists in localStorage**, app-global, key `reqarch.prefs.colourByType`. Not DB, not per-project.
- **No new npm dependency.**
- **Must NOT ship dark** — item 23 (better-sqlite3 ABI) is fixed; the suite is fully green (395/395). Backend gets real handler/migration tests.
- **Error surfacing:** store mutations use the existing `run(...)` helper + `lastError` slice added by item 4 (`store/index.ts`). Do not invent a second mechanism.
- Baseline to preserve: `npx vitest run` green, `npx tsc --noEmit` clean, `npx electron-vite build` clean.

---

### Task 1: Shared border palette + BUILT_IN_TYPE_COLORS + UpdateElementTypeInput

**Files:**
- Modify: `src/types/index.ts` (after line 208, near LINE_STYLES)
- Modify: `src/renderer/src/components/ArchitectureCanvas/swatches.ts`
- Test: `src/renderer/src/components/ArchitectureCanvas/swatches.test.ts` (exists — add a case)

**Interfaces:**
- Produces: `NAVY` (moved to `src/types`), `TYPE_BORDER_COLORS` (Record of 8 named border hexes), `BUILT_IN_TYPE_COLORS: Record<string, string>` (built-in type name → hex), `UpdateElementTypeInput { name?: string; color?: string | null }`. `swatches.ts` re-exports `NAVY` so existing `import { NAVY } from './swatches'` consumers (BlockNode, ComponentLibrary, index.tsx) keep working.

- [ ] **Step 1: Add the shared palette + input type to `src/types/index.ts`** — insert after line 208 (`export type LineStyle = ...`):

```ts
// Canonical border hexes — single source shared by the renderer swatch pickers
// (ArchitectureCanvas/swatches.ts) and the main-side seed + backfill migration.
export const NAVY = '#1a365d'
export const TYPE_BORDER_COLORS = {
  Navy: NAVY,
  Slate: '#475569',
  Teal: '#0f766e',
  Green: '#3f6212',
  Amber: '#a16207',
  Red: '#9f1239',
  Purple: '#6b21a8',
  Grey: '#3f3f46'
} as const

// Colour each built-in element type seeds/backfills to. Names must match
// BUILT_IN_ELEMENT_TYPES in handlers/elementTypes.ts.
export const BUILT_IN_TYPE_COLORS: Record<string, string> = {
  System: TYPE_BORDER_COLORS.Navy,
  Subsystem: TYPE_BORDER_COLORS.Teal,
  Component: TYPE_BORDER_COLORS.Slate,
  Function: TYPE_BORDER_COLORS.Green,
  External: TYPE_BORDER_COLORS.Amber
}

export interface UpdateElementTypeInput {
  name?: string
  color?: string | null
}
```

- [ ] **Step 2: Point `swatches.ts` at the shared constants** — replace its top (lines 6–19) so `NAVY` and the `border` fields come from `TYPE_BORDER_COLORS`, keeping the renderer-only `fill` shades local:

```ts
import { NAVY, TYPE_BORDER_COLORS } from '../../../../types'

export { NAVY }

export type Swatch = { name: string; border: string; fill: string }

export const SWATCHES: Swatch[] = [
  { name: 'Navy',   border: TYPE_BORDER_COLORS.Navy,   fill: '#e8eef6' },
  { name: 'Slate',  border: TYPE_BORDER_COLORS.Slate,  fill: '#eef1f5' },
  { name: 'Teal',   border: TYPE_BORDER_COLORS.Teal,   fill: '#e3f3f1' },
  { name: 'Green',  border: TYPE_BORDER_COLORS.Green,  fill: '#eef4e4' },
  { name: 'Amber',  border: TYPE_BORDER_COLORS.Amber,  fill: '#fbf2e0' },
  { name: 'Red',    border: TYPE_BORDER_COLORS.Red,    fill: '#fbe9ee' },
  { name: 'Purple', border: TYPE_BORDER_COLORS.Purple, fill: '#f3e9fb' },
  { name: 'Grey',   border: TYPE_BORDER_COLORS.Grey,   fill: '#f1f1f2' }
]
```

- [ ] **Step 3: Add a parity test** to `swatches.test.ts` (asserts the built-in map stays inside the palette — guards a future hardcode):

```ts
import { SWATCHES } from './swatches'
import { BUILT_IN_TYPE_COLORS, TYPE_BORDER_COLORS } from '../../../../types'

it('every built-in type colour is a palette border hue', () => {
  const borders = SWATCHES.map((s) => s.border)
  for (const hex of Object.values(BUILT_IN_TYPE_COLORS)) expect(borders).toContain(hex)
  expect(borders).toEqual(Object.values(TYPE_BORDER_COLORS))
})
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/renderer/src/components/ArchitectureCanvas/swatches.test.ts && npx tsc --noEmit`
Expected: PASS, clean. (The existing `swatches.test.ts` contrast assertions still pass — hex values are unchanged.)

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/renderer/src/components/ArchitectureCanvas/swatches.ts src/renderer/src/components/ArchitectureCanvas/swatches.test.ts
git commit -m "feat(types): shared border palette + BUILT_IN_TYPE_COLORS + UpdateElementTypeInput

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Seed built-in colours + backfill migration

**Files:**
- Modify: `src/main/handlers/elementTypes.ts` (seedElementTypes, lines 18–29)
- Modify: `src/main/db/migrations.ts` (after line 214, the addColumnIfMissing block)
- Test: `src/main/handlers/elementTypes.test.ts` (add a seed-colour case), `src/main/db/typeColorBackfill.test.ts` (new)

**Interfaces:**
- Consumes: `BUILT_IN_TYPE_COLORS` from `../../types` (main-side path).
- Produces: new projects seed built-in types with colours; `runMigrations` idempotently backfills legacy NULL built-in colours.

- [ ] **Step 1: Write the failing seed test** — add to `elementTypes.test.ts` (import `BUILT_IN_TYPE_COLORS` from `../../types` at top):

```ts
it('seedElementTypes assigns built-in colours', () => {
  seedElementTypes(getDatabase(), projectId)
  const system = listElementTypes(projectId).find((t) => t.name === 'System')!
  expect(system.color).toBe(BUILT_IN_TYPE_COLORS.System)
})
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/main/handlers/elementTypes.test.ts -t "built-in colours"`
Expected: FAIL — `system.color` is `null` (seed inserts NULL today).

- [ ] **Step 3: Make seed insert colours** — in `elementTypes.ts`, add the import and change `seedElementTypes` (lines 23–28):

```ts
import { BUILT_IN_TYPE_COLORS } from '../../types'
// ...
  const insert = db.prepare(
    'INSERT INTO element_types (project_id, name, color, is_built_in, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)'
  )
  for (const name of BUILT_IN_ELEMENT_TYPES) {
    if (!existing.includes(name)) insert.run(projectId, name, BUILT_IN_TYPE_COLORS[name] ?? null, ts, ts)
  }
```

- [ ] **Step 4: Run the seed test, verify it passes**

Run: `npx vitest run src/main/handlers/elementTypes.test.ts`
Expected: PASS (all, including the existing 4).

- [ ] **Step 5: Write the backfill migration test** — new file `src/main/db/typeColorBackfill.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase, closeDatabase, getDatabase } from './connection'
import { runMigrations } from './migrations'
import { createProject } from '../handlers/projects'
import { listElementTypes } from '../handlers/elementTypes'
import { BUILT_IN_TYPE_COLORS } from '../../types'

describe('built-in type colour backfill', () => {
  let tempDir: string
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    openDatabase(join(tempDir, 'test.reqarch'))
  })
  afterEach(() => {
    closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('backfills NULL built-in colours, preserves user colours, is idempotent', () => {
    const db = getDatabase()
    const projectId = createProject('Legacy').id // auto-seeds 5 built-ins
    // Simulate pre-B1 state: built-ins seeded with color NULL, one hand-set by a user.
    db.prepare('UPDATE element_types SET color = NULL WHERE project_id = ? AND is_built_in = 1').run(projectId)
    db.prepare("UPDATE element_types SET color = '#123456' WHERE project_id = ? AND name = 'Component'").run(projectId)

    runMigrations(db)
    let types = listElementTypes(projectId)
    expect(types.find((t) => t.name === 'System')!.color).toBe(BUILT_IN_TYPE_COLORS.System)
    expect(types.find((t) => t.name === 'Component')!.color).toBe('#123456') // user colour untouched

    runMigrations(db) // idempotent — second run changes nothing
    types = listElementTypes(projectId)
    expect(types.find((t) => t.name === 'System')!.color).toBe(BUILT_IN_TYPE_COLORS.System)
    expect(types.find((t) => t.name === 'Component')!.color).toBe('#123456')
  })
})
```

- [ ] **Step 6: Run it, verify it fails**

Run: `npx vitest run src/main/db/typeColorBackfill.test.ts`
Expected: FAIL — `System` colour stays `null` (no backfill yet).

- [ ] **Step 7: Add the backfill to `runMigrations`** — in `migrations.ts`, add the import at top and insert after line 214 (`addColumnIfMissing(db, 'architecture_elements', 'fill_color', 'TEXT')`):

```ts
import { BUILT_IN_TYPE_COLORS } from '../../types'
// ...
  // Backfill built-in element-type colours on legacy projects (pre-B1 seed used color NULL).
  // Idempotent: only NULL built-ins are touched, so a user-set colour is never overwritten
  // and re-runs are no-ops.
  {
    const ts = new Date().toISOString()
    const setColor = db.prepare(
      'UPDATE element_types SET color = ?, updated_at = ? WHERE is_built_in = 1 AND color IS NULL AND name = ?'
    )
    db.transaction(() => {
      for (const [name, color] of Object.entries(BUILT_IN_TYPE_COLORS)) setColor.run(color, ts, name)
    })()
  }
```

- [ ] **Step 8: Run backfill + full suite, verify pass**

Run: `npx vitest run src/main/db/typeColorBackfill.test.ts src/main/handlers/elementTypes.test.ts && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 9: Commit**

```bash
git add src/main/handlers/elementTypes.ts src/main/db/migrations.ts src/main/handlers/elementTypes.test.ts src/main/db/typeColorBackfill.test.ts
git commit -m "feat(db): seed + backfill built-in element-type colours

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: elementTypes:update handler + IPC + preload + api.d.ts

**Files:**
- Modify: `src/main/handlers/elementTypes.ts` (new `updateElementType` + IPC registration)
- Modify: `src/preload/index.ts:64-68` (elementTypes bridge)
- Modify: `src/types/api.d.ts:65-69` (elementTypes block)
- Test: `src/main/handlers/elementTypes.test.ts`

**Interfaces:**
- Consumes: `UpdateElementTypeInput` (Task 1).
- Produces: `updateElementType(id, input): ElementType`; IPC `elementTypes:update`; `window.api.elementTypes.update(id, input): Promise<ElementType>`.

- [ ] **Step 1: Write failing handler tests** — add to `elementTypes.test.ts` (import `updateElementType`):

```ts
it('updateElementType sets a colour', () => {
  seedElementTypes(getDatabase(), projectId)
  const t = listElementTypes(projectId)[0]
  expect(updateElementType(t.id, { color: '#0f766e' }).color).toBe('#0f766e')
})

it('updateElementType clears a colour to null via the "color" in input idiom', () => {
  const t = createElementType({ projectId, name: 'Sensor', color: '#ff0000' })
  expect(updateElementType(t.id, { color: null }).color).toBeNull()
})
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/main/handlers/elementTypes.test.ts -t updateElementType`
Expected: FAIL — `updateElementType` is not exported.

- [ ] **Step 3: Implement the handler** — in `elementTypes.ts`, add the import (`UpdateElementTypeInput`), the function (after `createElementType`), and register the IPC:

```ts
import type { ElementType, CreateElementTypeInput, UpdateElementTypeInput } from '../../types'
// ...
export function updateElementType(id: number, input: UpdateElementTypeInput): ElementType {
  const db = getDatabase()
  const existing = db.prepare('SELECT * FROM element_types WHERE id = ?').get(id) as any
  const name = 'name' in input ? input.name : existing.name
  const color = 'color' in input ? (input.color ?? null) : existing.color
  db.prepare('UPDATE element_types SET name = ?, color = ?, updated_at = ? WHERE id = ?').run(name, color, now(), id)
  return rowToElementType(db.prepare('SELECT * FROM element_types WHERE id = ?').get(id))
}
// ...in registerElementTypeHandlers():
  ipcMain.handle('elementTypes:update', (_e, id: number, input: UpdateElementTypeInput) => updateElementType(id, input))
```

- [ ] **Step 4: Run handler tests, verify pass**

Run: `npx vitest run src/main/handlers/elementTypes.test.ts`
Expected: PASS.

- [ ] **Step 5: Add preload bridge** — in `src/preload/index.ts`, import `UpdateElementTypeInput` and add to the `elementTypes` object (after `delete`, line 67):

```ts
    update: (id: number, input: UpdateElementTypeInput): Promise<ElementType> =>
      ipcRenderer.invoke('elementTypes:update', id, input),
```

- [ ] **Step 6: Add api.d.ts declaration** — in `src/types/api.d.ts`, add to the `elementTypes` block (after `delete`, line 68):

```ts
        update(id: number, input: UpdateElementTypeInput): Promise<ElementType>
```

Ensure `UpdateElementTypeInput` is in the file's type imports (same import line as `CreateElementTypeInput`).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/main/handlers/elementTypes.ts src/preload/index.ts src/types/api.d.ts src/main/handlers/elementTypes.test.ts
git commit -m "feat(arch): elementTypes:update handler + IPC + preload

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Store — colourByType slice + updateElementType action

**Files:**
- Modify: `src/renderer/src/store/index.ts`
- Test: `src/renderer/src/store/index.test.ts`

**Interfaces:**
- Consumes: `window.api.elementTypes.update` (Task 3); `run(...)` helper + `lastError` (item 4, already in this file); `UpdateElementTypeInput`.
- Produces: store state `colourByType: boolean` (init from localStorage), actions `setColourByType(v: boolean)` and `updateElementType(id: number, input: UpdateElementTypeInput): Promise<void>`.

- [ ] **Step 1: Write the failing persistence test** — add to `store/index.test.ts`:

```ts
it('setColourByType updates state and persists to localStorage', () => {
  useStore.getState().setColourByType(true)
  expect(useStore.getState().colourByType).toBe(true)
  expect(localStorage.getItem('reqarch.prefs.colourByType')).toBe('true')
  useStore.getState().setColourByType(false)
  expect(localStorage.getItem('reqarch.prefs.colourByType')).toBe('false')
})
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/renderer/src/store/index.test.ts -t setColourByType`
Expected: FAIL — `setColourByType` is not a function.

- [ ] **Step 3: Add the slice + actions** — in `store/index.ts`:

Interface (in the `interface Store` block, near `lastError`):
```ts
  colourByType: boolean
  setColourByType: (v: boolean) => void
  updateElementType: (id: number, input: UpdateElementTypeInput) => Promise<void>
```

Initial state (in the `create<Store>` object, next to `lastError: null`):
```ts
  colourByType: localStorage.getItem('reqarch.prefs.colourByType') === 'true',
  setColourByType: (v) => {
    localStorage.setItem('reqarch.prefs.colourByType', String(v))
    set({ colourByType: v })
  },
```

Action (next to the other element mutations, using the item-4 `run` wrapper):
```ts
  updateElementType: (id, input) => run(async () => {
    const updated = await window.api.elementTypes.update(id, input)
    set((s) => ({ elementTypes: s.elementTypes.map((t) => (t.id === id ? updated : t)) }))
  }),
```

Add `UpdateElementTypeInput` to the `../../../../types` import at the top of the file (alongside `ElementType`).

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/renderer/src/store/index.test.ts && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/store/index.ts src/renderer/src/store/index.test.ts
git commit -m "feat(store): colourByType preference + updateElementType action

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: nodes.ts — resolve border from type colour when enabled

**Files:**
- Modify: `src/renderer/src/components/ArchitectureCanvas/nodes.ts` (buildNodes, lines 111–169)
- Modify: `src/renderer/src/components/ArchitectureCanvas/index.tsx:305` (buildNodes call)
- Test: `src/renderer/src/components/ArchitectureCanvas/nodes.test.ts`

**Interfaces:**
- Consumes: `colourByType` from the store at the call site.
- Produces: `buildNodes(..., visibilityById, colourByType = false)` — `data.color` now carries the resolved border (`colourByType ? el.color ?? typeColor ?? null : el.color`). `BlockNode`'s existing `d.color ?? NAVY` yields NAVY when null; BlockNode is unchanged.

- [ ] **Step 1: Write failing tests** — add to `nodes.test.ts`, reusing that file's existing element/elementType factories (match their names; the sketch below shows intent):

```ts
it('colourByType ON resolves an uncoloured object to its type colour', () => {
  const els = [makeEl({ id: 1, elementTypeId: 10, color: null })]
  const types = [makeType({ id: 10, color: '#0f766e' })]
  const nodes = buildNodes(els, types, [], null, () => {}, new Map(), true)
  expect((nodes[0].data as BlockNodeData).color).toBe('#0f766e')
})

it('per-object colour overrides the type colour when ON', () => {
  const els = [makeEl({ id: 1, elementTypeId: 10, color: '#abcdef' })]
  const types = [makeType({ id: 10, color: '#0f766e' })]
  const nodes = buildNodes(els, types, [], null, () => {}, new Map(), true)
  expect((nodes[0].data as BlockNodeData).color).toBe('#abcdef')
})

it('colourByType OFF ignores the type colour', () => {
  const els = [makeEl({ id: 1, elementTypeId: 10, color: null })]
  const types = [makeType({ id: 10, color: '#0f766e' })]
  const nodes = buildNodes(els, types, [], null, () => {}, new Map(), false)
  expect((nodes[0].data as BlockNodeData).color).toBeNull()
})
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/renderer/src/components/ArchitectureCanvas/nodes.test.ts -t colourByType`
Expected: FAIL — `buildNodes` ignores the 7th arg; `data.color` is `el.color` (null) for the ON case.

- [ ] **Step 3: Implement** — in `nodes.ts`:

Signature (line 117): add the optional param after `visibilityById`:
```ts
  visibilityById: Map<number, Visibility>,
  colourByType = false
): Node[] {
```

Type-colour map (next to the `typeName` map, line 119):
```ts
  const typeColor = new Map(elementTypes.map((t) => [t.id, t.color]))
```

`data.color` (line 154) — replace `color: el.color,` with:
```ts
      color: colourByType
        ? (el.color ?? (el.elementTypeId != null ? typeColor.get(el.elementTypeId) ?? null : null))
        : el.color,
```

- [ ] **Step 4: Update the call site** — `index.tsx:305`, append `colourByType` as the final argument to `buildNodes(...)`, and pull it from the store where `elementTypes` etc. are already destructured (add `colourByType` to that `useStore()` destructure). The call becomes `buildNodes(elements, elementTypes, connections, selectedElementId, (…) => {…}, visById, colourByType)` (keep the existing `visById`/visibilityById argument, add `colourByType` after it).

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/renderer/src/components/ArchitectureCanvas/nodes.test.ts && npx tsc --noEmit`
Expected: PASS, clean. (Existing 6-arg `buildNodes` calls in tests still compile — the param defaults to `false`.)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/ArchitectureCanvas/nodes.ts src/renderer/src/components/ArchitectureCanvas/index.tsx src/renderer/src/components/ArchitectureCanvas/nodes.test.ts
git commit -m "feat(arch): resolve object border from element-type colour when enabled

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Border-clear (✕) on the object Style popover

**Files:**
- Modify: `src/renderer/src/components/ArchitectureCanvas/index.tsx:173` (ObjectStyleMenu Border row)

**Interfaces:**
- Consumes: existing `Swatches` `clearable` prop (already renders an ✕ that calls `onPick(null)`); `updateElement` already persists `color: null` (`elements.ts:81`, `UpdateElementInput.color?: string | null`).
- Produces: a Border ✕ that clears a hand-set object border so an inherited type colour can take over.

- [ ] **Step 1: Add `clearable`** — line 173, add the prop:

```tsx
          <Swatches shade="border" label="Border" clearable onPick={(c) => updateElement(el.id, { color: c })} />
```

- [ ] **Step 2: Verify no regression + typecheck**

Run: `npx vitest run src/renderer/src/components/ArchitectureCanvas/index.test.tsx && npx tsc --noEmit`
Expected: PASS, clean. (The ✕ button carries `aria-label="Border None"` from the `Swatches` component; existing tests are unaffected.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ArchitectureCanvas/index.tsx
git commit -m "feat(arch): clear (x) affordance on object border colour

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Settings modal — gear button, Preferences toggle, Type Colours picker

**Files:**
- Create: `src/renderer/src/components/Settings/index.tsx`
- Create: `src/renderer/src/components/Settings/index.test.tsx`
- Modify: `src/renderer/src/App.tsx` (gear button + modal mount; header at lines 61–89)

**Interfaces:**
- Consumes: store `colourByType`, `setColourByType`, `elementTypes`, `updateElementType`; `SWATCHES` from `ArchitectureCanvas/swatches.ts`; `SectionLabel`/`Button` from `components/ui`.
- Produces: `<Settings open={boolean} onClose={() => void} />`.

- [ ] **Step 1: Write the Settings component** — `src/renderer/src/components/Settings/index.tsx`:

```tsx
import { useStore } from '../../store'
import { SectionLabel, Button } from '../ui'
import { SWATCHES } from '../ArchitectureCanvas/swatches'

export default function Settings({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element | null {
  const { colourByType, setColourByType, elementTypes, updateElementType } = useStore()
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/40" onClick={onClose}>
      <div
        className="bg-white rounded shadow-[0_4px_12px_rgba(0,0,0,0.08)] border border-line p-6 w-96 flex flex-col gap-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <SectionLabel>Settings</SectionLabel>
          <button aria-label="Close settings" onClick={onClose} className="text-ink-faint hover:text-ink text-base leading-none">×</button>
        </div>

        <section className="flex flex-col gap-2">
          <SectionLabel>Preferences</SectionLabel>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={colourByType}
              onChange={(e) => setColourByType(e.target.checked)}
            />
            Colour objects by type
          </label>
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel>Type Colours</SectionLabel>
          <p className={`text-xs ${colourByType ? 'text-ink-faint' : 'text-ink-faint/50'}`}>
            {colourByType ? 'Objects inherit their type’s border colour.' : 'Turn on “Colour objects by type” to apply these.'}
          </p>
          {elementTypes.map((t) => (
            <div key={t.id} className="flex items-center gap-2">
              <span className="flex-1 text-sm text-ink">{t.name}</span>
              <button
                type="button"
                aria-label={`${t.name} None`}
                title="None"
                onClick={() => updateElementType(t.id, { color: null })}
                className="h-5 w-5 rounded border border-line text-[10px] leading-none text-ink-faint hover:border-ink-faint"
              >
                ✕
              </button>
              {SWATCHES.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  aria-label={`${t.name} ${s.name}`}
                  title={s.name}
                  onClick={() => updateElementType(t.id, { color: s.border })}
                  style={{ background: s.border }}
                  className={`h-5 w-5 rounded border hover:border-ink-faint ${t.color === s.border ? 'border-ink ring-1 ring-ink' : 'border-line'}`}
                />
              ))}
            </div>
          ))}
        </section>

        <div className="flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write the test** — `src/renderer/src/components/Settings/index.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Settings from './index'
import { useStore } from '../../store'

describe('Settings', () => {
  beforeEach(() => {
    useStore.setState({
      colourByType: false,
      elementTypes: [{ id: 1, projectId: 1, name: 'System', color: null, isBuiltIn: true, deletedAt: null, createdAt: '', updatedAt: '' }]
    } as never)
  })

  it('renders nothing when closed', () => {
    const { container } = render(<Settings open={false} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('toggles the colour-by-type preference', () => {
    const spy = vi.spyOn(useStore.getState(), 'setColourByType')
    render(<Settings open onClose={() => {}} />)
    fireEvent.click(screen.getByLabelText('Colour objects by type'))
    expect(spy).toHaveBeenCalledWith(true)
  })

  it('sets a type colour from a swatch', () => {
    const spy = vi.spyOn(useStore.getState(), 'updateElementType')
    render(<Settings open onClose={() => {}} />)
    fireEvent.click(screen.getByLabelText('System Teal'))
    expect(spy).toHaveBeenCalledWith(1, { color: '#0f766e' })
  })
})
```

(If `getByLabelText('Colour objects by type')` does not resolve because the text is a sibling not a wrapping label, wrap the checkbox’s text in the `<label>` as written above — the label wraps the input, so the accessible name is the text.)

- [ ] **Step 3: Run the test, verify pass**

Run: `npx vitest run src/renderer/src/components/Settings/index.test.tsx`
Expected: PASS.

- [ ] **Step 4: Mount in App** — in `src/renderer/src/App.tsx`:

Import: `import Settings from './components/Settings'`
State: add `const [showSettings, setShowSettings] = useState(false)` next to `showNewDialog`.
Header — add a gear button inside the `ml-auto` div (after `New Project`, line 88):
```tsx
          <button aria-label="Settings" onClick={() => setShowSettings(true)} className="text-white/60 hover:text-white text-lg leading-none">⚙</button>
```
Mount — near the other modals (after the `lastError` banner block):
```tsx
      <Settings open={showSettings} onClose={() => setShowSettings(false)} />
```

- [ ] **Step 5: Run App test suite + typecheck**

Run: `npx vitest run src/renderer/src/App.test.tsx src/renderer/src/components/Settings/index.test.tsx && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/Settings src/renderer/src/App.tsx
git commit -m "feat(settings): Settings modal with Preferences toggle + type-colour editor

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Build, live-verify, docs

**Files:**
- Modify: `handoff.md`, `.superpowers/sdd/progress.md`

- [ ] **Step 1: Full gate**

Run: `npx vitest run && npx tsc --noEmit && npx electron-vite build`
Expected: all green (395 prior + the new tests), tsc clean, 3-target build `✓ built`.

- [ ] **Step 2: Live-verify on `thermal`** via the Playwright driver (`.claude/skills/run-app/driver.mjs`; use `/run` skill). Check, restoring `thermal` to baseline afterward:
  1. Open Settings (⚙) → Preferences shows `Colour objects by type` (off), Type Colours lists the 5 built-ins each with a swatch row.
  2. Toggle ON → canvas objects with a type but no hand-set colour take the type colour; relaunch → toggle still ON (localStorage).
  3. Edit a type colour in Settings → objects of that type change; `sqlite3` confirms `element_types.color`.
  4. On an object with a hand-set border (`thermal` `SYS-003` = `#66ffbd`): Style ▾ → Border ✕ → its border clears to the inherited type colour (with toggle ON). Undo returns it.
  5. Backfill: built-in types show colours (not grey) even though the project predates B1; `SYS-003`'s hand-set colour untouched.
  Driver gotchas (from the handoff): re-read node rects after any diagram change; swatch/✕ buttons have `aria-label` not visible text, so click by `button[aria-label="..."]`; undo history is session-scoped.

- [ ] **Step 3: Update docs** — append a "COMPLETE" section to `handoff.md` and a new ledger section to `.superpowers/sdd/progress.md` (commits, what shipped, deferrals). Note item 29 B1 done → item 29 fully closed.

- [ ] **Step 4: Commit**

```bash
git add handoff.md .superpowers/sdd/progress.md
git commit -m "docs: item 29 B1 (colour-by-type + Preferences) complete

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review notes
- **Spec coverage:** Settings surface (Task 7), Preferences slice (Task 4), shared palette (Task 1), seed+backfill (Task 2), `elementTypes:update` (Task 3), border-clear (Task 6), render one-line (Task 5), tests throughout. All spec §1–8 sections map to a task.
- **Simplification found while planning:** the border NULL path already exists end-to-end (`UpdateElementInput.color?: string | null`, `elements.ts:81`), so Task 6 is one line — no backend/type work. The parity test in Task 1 guards a hardcode regression rather than a live divergence (swatches derive from the shared constant).
- **Type consistency:** `UpdateElementTypeInput`, `colourByType`, `updateElementType`, `BUILT_IN_TYPE_COLORS`, `TYPE_BORDER_COLORS` used identically across tasks.
- **Deferred (YAGNI):** no `fill_color` on types; no rename/add/delete type UI; one Preferences toggle only. Native colour picker on the Border/Fill rows still spams undo per drag — pre-existing (Phase 1/2), not touched here.
```
