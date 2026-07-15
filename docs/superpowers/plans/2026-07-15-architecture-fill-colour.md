# Object Fill Colour Implementation Plan (item 29, Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an architecture object a per-object fill colour, chosen from a preset swatch palette or a native picker, in the `Style ▾` popover Phase 1 built.

**Architecture:** One nullable column (`architecture_elements.fill_color`), NULL = today's white. `'fillColor'` joins `ELEMENT_PROP_KEYS`, which buys undo/redo with no further code — exactly how item 26 got it for `lineStyle`. No new IPC, no preload change. The palette is a pure data module (`swatches.ts`) with paired dark-border / pale-fill shades of one hue list.

**Tech Stack:** Electron 31 + React 18 + Zustand + better-sqlite3 + Tailwind + Vitest + React Flow (`@xyflow/react`).

**Spec:** `docs/superpowers/specs/2026-07-15-architecture-fill-colour-design.md`. Parent: `docs/superpowers/specs/2026-07-15-architecture-top-bar-design.md`.

## Global Constraints

- **Node/npm work normally.** `npx vitest run`, `npx tsc`, `npx electron-vite build`. Ignore any older repo note claiming npm is broken.
- **Test baseline is 306 passed / 52 failed (358), 40 files passed / 10 failed.** All 52 failures are `ERR_DLOPEN_FAILED` (item 23: better-sqlite3 is built for Electron ABI 125, the test runner's node is 127). **This is pre-existing. Do not chase it. Do not "fix" it by rebuilding — that breaks the app.** Your task passes if renderer tests pass and the failure count does not rise.
- **Never write migration or handler tests** — they fail on arrival under item 23 and rot unread. Backend correctness is proven by the live-verify in Task 5.
- **`updateElement` NULL idiom is load-bearing:** `'fillColor' in input ? (input.fillColor ?? null) : existing.fill_color`. The `??` form used for `name`/`posX` CANNOT write NULL. The ✕ chip depends on the `in` form.
- **jsdom normalises colours:** `style.background` returns `'rgb(227, 243, 241)'`, never `'#e3f3f1'`. Assert rgb triples.
- **Both typechecks must stay clean:** `npx tsc --noEmit -p tsconfig.web.json` and `-p tsconfig.node.json`.
- Commit after each task. Work directly on `main` (repo convention).

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/main/db/migrations.ts` | add `fill_color` column | 1 |
| `src/main/handlers/elements.ts` | map + persist `fill_color` | 1 |
| `src/types/index.ts` | `fillColor` on element + update input | 1 |
| `src/renderer/src/store/index.ts` | `'fillColor'` in `ELEMENT_PROP_KEYS` → undo | 1 |
| `src/renderer/src/store/elementStyle.test.ts` | **create** — undo coverage for fill edits | 1 |
| `src/renderer/src/components/ArchitectureCanvas/swatches.ts` | **create** — palette data + `NAVY` | 2 |
| `src/renderer/src/components/ArchitectureCanvas/swatches.test.ts` | **create** — legibility contract | 2 |
| `src/renderer/src/components/ArchitectureCanvas/BlockNode.tsx` | render fill; container overlay rule | 3 |
| `src/renderer/src/components/ArchitectureCanvas/nodes.ts` | pass `fillColor` into node data | 3 |
| `src/renderer/src/components/ArchitectureCanvas/index.tsx` | `Swatches` component + Fill field + NAVY bug fix | 4 |

**Typed fixtures that break the moment `fillColor` becomes required** (all four are compile errors, not test failures — fix them in the task that adds the field):

| Fixture | Field to add | Task |
|---|---|---|
| `src/renderer/src/store/index.test.ts:13` `mockElement` | `fillColor: null` | 1 |
| `src/renderer/src/components/ArchitectureCanvas/nodes.test.ts:9` `el()` | `fillColor: null` | 1 |
| `src/renderer/src/components/InterfaceRegister/rows.test.ts:5` `el()` | `fillColor: null` | 1 |
| `src/renderer/src/components/ArchitectureCanvas/BlockNode.test.tsx:14` `data` | `fillColor: null` | 3 |

Two fixtures do **not** break, and need no edit: `RequirementDetail/architecture.test.tsx:18` (uses an `as ArchitectureElement` cast, which tolerates missing fields) and `ArchitectureCanvas/index.test.tsx:36` `mockEl` (an untyped object literal).

---

## Task 1: Data layer — `fill_color` column, types, handler, undo

**Files:**
- Modify: `src/main/db/migrations.ts:213` (append after the `pre_nest_height` line)
- Modify: `src/main/handlers/elements.ts:8-18` (`rowToElement`), `:64-86` (`updateElement`)
- Modify: `src/types/index.ts:192` (`ArchitectureElement`), `:261` (`UpdateElementInput`)
- Modify: `src/renderer/src/store/index.ts:22` (`ELEMENT_PROP_KEYS`)
- Create: `src/renderer/src/store/elementStyle.test.ts`
- Modify (fixtures): `src/renderer/src/store/index.test.ts:13`, `src/renderer/src/components/ArchitectureCanvas/nodes.test.ts:9`, `src/renderer/src/components/InterfaceRegister/rows.test.ts:5`

**Interfaces:**
- Produces: `ArchitectureElement.fillColor: string | null`; `UpdateElementInput.fillColor?: string | null`. Tasks 3 and 4 both rely on these exact names.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/store/elementStyle.test.ts`. Modelled on the sibling `connectionStyle.test.ts` — including its comment about **not** calling the store's `undo()`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useStore } from './index'
import type { ArchitectureElement } from '../../../types'

const el = (over: Partial<ArchitectureElement> = {}): ArchitectureElement => ({
  id: 1, projectId: 1, architectureId: 1, parentId: null, blockId: 'SYS-001', name: 'Pump',
  elementTypeId: null, description: null, color: null, lineStyle: null, fillColor: null,
  posX: 0, posY: 0, width: 140, height: 60,
  preNestWidth: null, preNestHeight: null,
  deletedAt: null, createdAt: '', updatedAt: '', ...over
})

beforeEach(() => {
  ;(window as any).api = {
    elements: {
      update: vi.fn(async (_id: number, input: any) => el({ ...input }))
    }
  }
  useStore.setState({ elements: [el()], undoStack: [], redoStack: [] })
})

describe('updateElement fill edits are undoable', () => {
  it('captures a fillColor change; the pushed undo command replays the previous value', async () => {
    await useStore.getState().updateElement(1, { fillColor: '#e3f3f1' })
    expect((window as any).api.elements.update).toHaveBeenLastCalledWith(1, { fillColor: '#e3f3f1' })
    expect(useStore.getState().undoStack.length).toBe(1)

    // Invoke the captured undo command DIRECTLY. Do NOT call the store's `undo()` action:
    // it runs `loadArchitecture()` in a finally block, which touches many other `window.api.*`
    // methods this focused test does not mock. The command itself is the unit under test.
    await useStore.getState().undoStack[0].undo()
    expect((window as any).api.elements.update).toHaveBeenLastCalledWith(1, { fillColor: null })
  })

  it('captures clearing a fill back to null', async () => {
    useStore.setState({ elements: [el({ fillColor: '#e3f3f1' })] })
    await useStore.getState().updateElement(1, { fillColor: null })
    expect((window as any).api.elements.update).toHaveBeenLastCalledWith(1, { fillColor: null })
    expect(useStore.getState().undoStack.length).toBe(1)

    await useStore.getState().undoStack[0].undo()
    expect((window as any).api.elements.update).toHaveBeenLastCalledWith(1, { fillColor: '#e3f3f1' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/store/elementStyle.test.ts`
Expected: FAIL. Two distinct failures prove the test is real — a TypeScript error that `fillColor` does not exist on `ArchitectureElement`, and `undoStack.length` being `0` because `ELEMENT_PROP_KEYS` does not list `fillColor`.

- [ ] **Step 3: Add the column**

`src/main/db/migrations.ts` — append immediately after the `pre_nest_height` line (`:213`):

```ts
addColumnIfMissing(db, 'architecture_elements', 'fill_color', 'TEXT')
```

Nullable, no backfill, no `DEFAULT` — NULL means "no fill" and renders white. Do not add a `NOT NULL DEFAULT`.

- [ ] **Step 4: Add the types**

`src/types/index.ts` — in `ArchitectureElement`, directly after `lineStyle: LineStyle | null` (`:192`):

```ts
  fillColor: string | null
```

In `UpdateElementInput`, directly after `lineStyle?: LineStyle | null` (`:261`):

```ts
  fillColor?: string | null
```

Do **not** touch `CreateElementInput` — new elements get NULL fill, which is today's appearance.

- [ ] **Step 5: Map and persist it in the handler**

`src/main/handlers/elements.ts` — in `rowToElement`, after `lineStyle: row.line_style ?? null,` (`:13`):

```ts
    fillColor: row.fill_color ?? null,
```

In `updateElement`, add `fill_color = ?` to the `UPDATE` column list (`:67`), so that line reads:

```ts
      description = ?, color = ?, line_style = ?, fill_color = ?, pos_x = ?, pos_y = ?, width = ?, height = ?,
```

and add the matching bind **immediately after** the `lineStyle` bind at `:78`, preserving argument order:

```ts
    'fillColor' in input ? (input.fillColor ?? null) : existing.fill_color,
```

> **Use the `in` form exactly as written.** `input.fillColor ?? existing.fill_color` would treat an explicit `null` as "not supplied" and silently keep the old colour — breaking the ✕ chip in Task 4.

- [ ] **Step 6: Register the store prop key**

`src/renderer/src/store/index.ts:22`:

```ts
const ELEMENT_PROP_KEYS = ['name', 'color', 'elementTypeId', 'description', 'blockId', 'lineStyle', 'fillColor'] as const
```

That single addition is the whole undo/redo change — `updateElement` filters this list to build its capture (`:607`).

- [ ] **Step 7: Fix the three fixtures the required field broke**

Add `fillColor: null` to each. These are compile errors, not test failures.

`src/renderer/src/store/index.test.ts:15` — the line reads `elementTypeId: null, description: null, color: null, lineStyle: null,`; make it:
```ts
  elementTypeId: null, description: null, color: null, lineStyle: null, fillColor: null,
```

`src/renderer/src/components/ArchitectureCanvas/nodes.test.ts:12` — same edit:
```ts
    elementTypeId: null, description: null, color: null, lineStyle: null, fillColor: null,
```

`src/renderer/src/components/InterfaceRegister/rows.test.ts:7` — the line reads `description: null, color: null, lineStyle: null, posX: 0, ...`; make it:
```ts
    description: null, color: null, lineStyle: null, fillColor: null, posX: 0, posY: 0, width: 140, height: 60,
```

- [ ] **Step 8: Run the tests and both typechecks**

```bash
npx vitest run src/renderer/src/store/elementStyle.test.ts
npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json
```
Expected: 2 tests pass; both typechecks print nothing and exit 0.

- [ ] **Step 9: Run the full suite to confirm the baseline did not move**

Run: `npx vitest run 2>&1 | tail -5`
Expected: `Test Files 10 failed | 40 passed`, `Tests 52 failed | 308 passed` — the 52 are the unchanged `ERR_DLOPEN_FAILED` set, and passed rose by your 2 new tests.

- [ ] **Step 10: Commit**

```bash
git add src/main/db/migrations.ts src/main/handlers/elements.ts src/types/index.ts \
        src/renderer/src/store/index.ts src/renderer/src/store/elementStyle.test.ts \
        src/renderer/src/store/index.test.ts \
        src/renderer/src/components/ArchitectureCanvas/nodes.test.ts \
        src/renderer/src/components/InterfaceRegister/rows.test.ts
git commit -m "feat(arch): add fill_color column with undoable store edits"
```

---

## Task 2: The swatch palette module

**Files:**
- Create: `src/renderer/src/components/ArchitectureCanvas/swatches.ts`
- Create: `src/renderer/src/components/ArchitectureCanvas/swatches.test.ts`

**Interfaces:**
- Produces: `NAVY: string`, `type Swatch = { name: string; border: string; fill: string }`, `SWATCHES: Swatch[]`. Task 3 imports `NAVY`; Task 4 imports `SWATCHES` and `NAVY`. (`Swatch` is exported because `SWATCHES` is annotated with it; no task imports the type directly.)

Independent of Task 1 — pure data, no types from the store.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/components/ArchitectureCanvas/swatches.test.ts`. This encodes the palette's legibility contract, which is the whole reason the module is separate:

```ts
import { describe, it, expect } from 'vitest'
import { SWATCHES, NAVY } from './swatches'

// WCAG relative luminance + contrast ratio. Six lines, no dependency.
const lum = (hex: string): number => {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (hi + 0.05) / (lo + 0.05)
}

describe('SWATCHES legibility contract', () => {
  // The header always carries white bold text (BlockNode.tsx:40), so every border
  // shade must clear WCAG AA against white. This is the invariant a future hand
  // breaks by pasting in a pretty colour.
  it('every border shade clears AA (4.5:1) against white header text', () => {
    for (const s of SWATCHES) {
      expect.soft(contrast(s.border, '#ffffff'), `${s.name} border`).toBeGreaterThanOrEqual(4.5)
    }
  })

  // Deliberately NOT an AA assertion against text-ink-faint (#64748b): no fill can
  // pass it — plain white only reaches 4.76:1, so the token is marginal before any
  // fill exists (see spec §1.1). "Pale" is the property actually relied on.
  it('every fill shade is pale', () => {
    for (const s of SWATCHES) {
      expect.soft(lum(s.fill), `${s.name} fill`).toBeGreaterThan(0.8)
    }
  })

  it('leads with NAVY, the existing default border colour', () => {
    expect(SWATCHES[0].border).toBe(NAVY)
    expect(NAVY).toBe('#1a365d')
  })

  it('has unique hue names, so chips are addressable by label', () => {
    const names = SWATCHES.map((s) => s.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/components/ArchitectureCanvas/swatches.test.ts`
Expected: FAIL — `Failed to resolve import "./swatches"`.

- [ ] **Step 3: Write the module**

Create `src/renderer/src/components/ArchitectureCanvas/swatches.ts`:

```ts
// Paired palette: each hue carries a dark `border` shade (sits under the header's
// white text) and a pale `fill` shade (sits under the body's dark text). One list,
// two shades — so a teal-bordered block with a teal fill visibly matches.
// The contract is enforced in swatches.test.ts; keep new entries inside it.

export const NAVY = '#1a365d'

export type Swatch = { name: string; border: string; fill: string }

export const SWATCHES: Swatch[] = [
  { name: 'Navy', border: NAVY, fill: '#e8eef6' },
  { name: 'Slate', border: '#475569', fill: '#eef1f5' },
  { name: 'Teal', border: '#0f766e', fill: '#e3f3f1' },
  { name: 'Green', border: '#3f6212', fill: '#eef4e4' },
  { name: 'Amber', border: '#a16207', fill: '#fbf2e0' },
  { name: 'Red', border: '#9f1239', fill: '#fbe9ee' },
  { name: 'Purple', border: '#6b21a8', fill: '#f3e9fb' },
  { name: 'Grey', border: '#3f3f46', fill: '#f1f1f2' }
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/components/ArchitectureCanvas/swatches.test.ts`
Expected: PASS, 4 tests. Border contrasts land between 4.92:1 (Amber, the tightest) and 12.14:1 (Navy); fill luminances between 0.843 and 0.894.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ArchitectureCanvas/swatches.ts \
        src/renderer/src/components/ArchitectureCanvas/swatches.test.ts
git commit -m "feat(arch): add paired border/fill swatch palette with a legibility test"
```

---

## Task 3: Render the fill

**Files:**
- Modify: `src/renderer/src/components/ArchitectureCanvas/BlockNode.tsx:5-17` (data type), `:19` (NAVY), `:26-29` (frame), `:59` (container overlay)
- Modify: `src/renderer/src/components/ArchitectureCanvas/nodes.ts:151-164` (node data)
- Modify: `src/renderer/src/components/ArchitectureCanvas/BlockNode.test.tsx:14` (fixture) — add tests
- Modify: `src/renderer/src/components/ArchitectureCanvas/nodes.test.ts` — add one test

**Interfaces:**
- Consumes: `ArchitectureElement.fillColor` (Task 1); `NAVY` from `./swatches` (Task 2).
- Produces: `BlockNodeData.fillColor: string | null`.

- [ ] **Step 1: Write the failing tests**

In `src/renderer/src/components/ArchitectureCanvas/BlockNode.test.tsx`, first add `fillColor: null` to the `data` fixture at `:14` so the file compiles:

```ts
const data: BlockNodeData = {
  label: 'Engine', blockId: 'SYS-001', color: null, lineStyle: null, fillColor: null, selected: true,
  nested: false, childCount: 0,
  typeName: null, connectionCount: 0, faded: false,
  onResizeEnd: vi.fn()
}
```

Then append these tests inside the existing `describe('BlockNode', ...)` block, before its closing `})` at `:108`. They reuse the `frame` helper idiom already at `:82`:

```tsx
  it('paints the frame in the fill colour, white when unset', () => {
    const frame = (d: BlockNodeData): HTMLElement =>
      render(<BlockNode data={d} {...({} as any)} />).container.firstChild as HTMLElement

    // jsdom normalises hex to rgb() — assert the triple, not the hex.
    expect(frame(data).style.background).toBe('rgb(255, 255, 255)')
    expect(frame({ ...data, fillColor: '#e3f3f1' }).style.background).toBe('rgb(227, 243, 241)')
  })

  it('keeps a filled container legible: drop zone stays, workspace overlay drops', () => {
    const { container: filled } = render(
      <BlockNode data={{ ...data, childCount: 2, fillColor: '#e3f3f1' }} {...({} as any)} />
    )
    // the dashed drop zone must survive — it is what marks the nest target
    expect(filled.querySelector('.border-dashed')).not.toBeNull()
    // ...but the opaque overlay must not, or the fill washes out on nesting
    expect(filled.querySelector('.bg-workspace\\/60')).toBeNull()
  })

  it('keeps the workspace overlay on an unfilled container', () => {
    const { container: plain } = render(
      <BlockNode data={{ ...data, childCount: 2, fillColor: null }} {...({} as any)} />
    )
    expect(plain.querySelector('.bg-workspace\\/60')).not.toBeNull()
  })
```

In `src/renderer/src/components/ArchitectureCanvas/nodes.test.ts`, append inside `describe('buildNodes', ...)`:

```ts
  it('passes fillColor through to node data', () => {
    const nodes = buildNodes([el({ id: 1, fillColor: '#e3f3f1' })], [], [], null, vi.fn(), new Map())
    expect((nodes[0].data as { fillColor: string | null }).fillColor).toBe('#e3f3f1')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/renderer/src/components/ArchitectureCanvas/BlockNode.test.tsx \
               src/renderer/src/components/ArchitectureCanvas/nodes.test.ts
```
Expected: FAIL — `fillColor` is not a property of `BlockNodeData`; background reads `''`; `.bg-workspace/60` is still present on the filled container.

- [ ] **Step 3: Add `fillColor` to the node data type and drop the duplicate NAVY**

`src/renderer/src/components/ArchitectureCanvas/BlockNode.tsx` — add the import at the top, beside the existing `LineStyle` import (`:3`):

```tsx
import { NAVY } from './swatches'
```

Add the field to `BlockNodeData`, after `lineStyle` (`:9`):

```ts
  fillColor: string | null
```

Delete the local declaration at `:19` (`const NAVY = '#1a365d'`) — it now comes from `swatches.ts`, so the hex lives in exactly one place.

- [ ] **Step 4: Paint the frame**

`src/renderer/src/components/ArchitectureCanvas/BlockNode.tsx:26-29` — move `bg-white` out of the `className` and into the style object as `background`:

```tsx
    <div
      style={{
        background: d.fillColor ?? '#ffffff',
        borderColor: headerColor,
        borderStyle: d.lineStyle ?? 'solid'
      }}
      className={`border rounded-t text-sm select-none h-full w-full flex flex-col
        ${d.selected ? 'ring-2 ring-action/60' : ''}`}
    >
```

The header keeps painting its own opaque `headerColor` over this (`:39`), so the fill reads as the body only.

- [ ] **Step 5: Let the fill win on containers**

`src/renderer/src/components/ArchitectureCanvas/BlockNode.tsx:59` — the dashed drop zone stays unconditionally; only the opaque overlay is conditional:

```tsx
      <div className={`px-3 py-2 flex-1 min-h-0 ${
        d.childCount > 0
          ? 'm-1 rounded border border-dashed border-line' + (d.fillColor ? '' : ' bg-workspace/60')
          : ''
      }`}>
```

Without this, nesting a child into a filled block washes its colour to ~40% — near-invisible with pale swatches.

- [ ] **Step 6: Pass it through `buildNodes`**

`src/renderer/src/components/ArchitectureCanvas/nodes.ts` — in the `data` object, after `lineStyle: el.lineStyle,` (`:155`):

```ts
      fillColor: el.fillColor,
```

- [ ] **Step 7: Run the tests and both typechecks**

```bash
npx vitest run src/renderer/src/components/ArchitectureCanvas/
npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json
```
Expected: all pass, including the 4 new tests. Typechecks silent.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/ArchitectureCanvas/BlockNode.tsx \
        src/renderer/src/components/ArchitectureCanvas/BlockNode.test.tsx \
        src/renderer/src/components/ArchitectureCanvas/nodes.ts \
        src/renderer/src/components/ArchitectureCanvas/nodes.test.ts
git commit -m "feat(arch): render object fill colour; fill wins over the container overlay"
```

---

## Task 4: The Fill control, the palette UI, and the Phase 1 picker bug

**Files:**
- Modify: `src/renderer/src/components/ArchitectureCanvas/index.tsx:123-147` (`ObjectStyleMenu`), plus a new `Swatches` component above it
- Modify: `src/renderer/src/components/ArchitectureCanvas/index.test.tsx` — add tests

**Interfaces:**
- Consumes: `SWATCHES`, `NAVY`, `type Swatch` from `./swatches` (Task 2); `updateElement(id, { fillColor })` (Task 1).

- [ ] **Step 1: Write the failing tests**

In `src/renderer/src/components/ArchitectureCanvas/index.test.tsx`, append inside the existing `describe('contextual segment', ...)` block:

```tsx
    it('offers Fill swatches and a Fill picker when an object is selected', async () => {
      mockSel.elementId = 100
      render(<ArchitectureCanvas />)
      await userEvent.click(screen.getByRole('button', { name: 'Style ▾' }))
      expect(screen.getByLabelText('Fill')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Fill Teal' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Border Teal' })).toBeInTheDocument()
    })

    it('clicking a Fill swatch calls updateElement with that hex only', async () => {
      mockSel.elementId = 100
      render(<ArchitectureCanvas />)
      await userEvent.click(screen.getByRole('button', { name: 'Style ▾' }))
      await userEvent.click(screen.getByRole('button', { name: 'Fill Teal' }))
      expect(mockUpdateElement).toHaveBeenCalledWith(100, { fillColor: '#e3f3f1' })
    })

    it('clicking the Fill clear chip calls updateElement with null, not white', async () => {
      mockSel.elementId = 100
      render(<ArchitectureCanvas />)
      await userEvent.click(screen.getByRole('button', { name: 'Style ▾' }))
      await userEvent.click(screen.getByRole('button', { name: 'Fill None' }))
      // null, so a later type-inherited colour (B1) can still win. '#ffffff' would block it forever.
      expect(mockUpdateElement).toHaveBeenCalledWith(100, { fillColor: null })
    })

    it('clicking a Border swatch calls updateElement with { color } only', async () => {
      mockSel.elementId = 100
      render(<ArchitectureCanvas />)
      await userEvent.click(screen.getByRole('button', { name: 'Style ▾' }))
      await userEvent.click(screen.getByRole('button', { name: 'Border Teal' }))
      expect(mockUpdateElement).toHaveBeenCalledWith(100, { color: '#0f766e' })
    })

    it('shows NAVY in the border picker for an uncoloured object, matching what the block renders', async () => {
      mockSel.elementId = 100
      render(<ArchitectureCanvas />)
      await userEvent.click(screen.getByRole('button', { name: 'Style ▾' }))
      // BlockNode renders `d.color ?? NAVY`; the picker must not claim white.
      expect(screen.getByLabelText('Border')).toHaveValue('#1a365d')
    })
```

Every one of these opens the popover first. Phase 1's `Menu` renders `{open && <div>{children}</div>}` (`index.tsx:80`), so the controls are genuinely absent from the DOM until the trigger is clicked — a test that skips the click fails on "not found" and tells you nothing about the value.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/src/components/ArchitectureCanvas/index.test.tsx`
Expected: FAIL — no `Fill` label, no swatch buttons; the last test fails with the picker reading `#ffffff` instead of `#1a365d` (that is the Phase 1 bug, now pinned by a test).

- [ ] **Step 3: Add the `Swatches` component**

`src/renderer/src/components/ArchitectureCanvas/index.tsx` — add to the existing import block at the top:

```tsx
import { SWATCHES, NAVY } from './swatches'
```

Add this component immediately above `ObjectStyleMenu` (`:123`):

```tsx
// One row of preset chips. `shade` picks which column of the paired palette to show:
// dark shades sit under the header's white text, pale ones under the body's dark text.
// Deliberately not selection-aware — the native picker below already reports the current
// colour, and it can hold a hex no chip has.
function Swatches({ shade, label, clearable, onPick }: {
  shade: 'border' | 'fill'
  label: string
  clearable?: boolean
  onPick: (hex: string | null) => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-1 mb-1">
      {clearable && (
        <button
          type="button"
          aria-label={`${label} None`}
          title="None"
          onClick={() => onPick(null)}
          className="h-5 w-5 rounded border border-line text-[10px] leading-none text-ink-faint hover:border-ink-faint"
        >
          ✕
        </button>
      )}
      {SWATCHES.map((s) => (
        <button
          key={s.name}
          type="button"
          aria-label={`${label} ${s.name}`}
          title={s.name}
          onClick={() => onPick(s[shade])}
          style={{ background: s[shade] }}
          className="h-5 w-5 rounded border border-line hover:border-ink-faint"
        />
      ))}
    </div>
  )
}
```

`<button type="button">`, not the `<div onClick>` used by the tree/nav rows — this adds nothing to the batched a11y backlog.

- [ ] **Step 4: Wire both rows into `ObjectStyleMenu` and fix the picker bug**

Replace `ObjectStyleMenu` (`:123-147`) with:

```tsx
// Contextual segment: object styling. Writes on change — no local state, no onBlur.
function ObjectStyleMenu({ el }: { el: ArchitectureElement }): JSX.Element {
  const { updateElement } = useStore()
  return (
    <Menu label="Style ▾">
      <MenuCard>
        <Field label="Border">
          <Swatches shade="border" label="Border" onPick={(c) => updateElement(el.id, { color: c })} />
          <input
            type="color"
            aria-label="Border"
            value={el.color ?? NAVY}
            onChange={(e) => updateElement(el.id, { color: e.target.value })}
            className="h-9 w-full rounded border border-line cursor-pointer"
          />
        </Field>
        <Field label="Fill">
          <Swatches shade="fill" label="Fill" clearable onPick={(c) => updateElement(el.id, { fillColor: c })} />
          <input
            type="color"
            aria-label="Fill"
            value={el.fillColor ?? '#ffffff'}
            onChange={(e) => updateElement(el.id, { fillColor: e.target.value })}
            className="h-9 w-full rounded border border-line cursor-pointer"
          />
        </Field>
        <Field label="Line style">
          <Select
            aria-label="Line style"
            value={el.lineStyle ?? 'solid'}
            onChange={(e) => updateElement(el.id, { lineStyle: e.target.value as LineStyle })}
          >{LINE_STYLES}</Select>
        </Field>
      </MenuCard>
    </Menu>
  )
}
```

Two things changed beyond adding Fill:
- `value={el.color ?? '#ffffff'}` became `value={el.color ?? NAVY}` — the **Phase 1 bug fix**. The picker showed white while `BlockNode.tsx:23` rendered navy.
- The Fill picker keeps `?? '#ffffff'` deliberately: white is the honest *display* of "no fill". Only the ✕ chip writes NULL — a native picker cannot.

- [ ] **Step 5: Run the tests and both typechecks**

```bash
npx vitest run src/renderer/src/components/ArchitectureCanvas/index.test.tsx
npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json
```
Expected: all pass, including the 5 new tests.

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run 2>&1 | tail -5`
Expected: `Test Files 10 failed | 40 passed`; failures still exactly 52, all `ERR_DLOPEN_FAILED`; passed now 306 + 11 new = 317.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/ArchitectureCanvas/index.tsx \
        src/renderer/src/components/ArchitectureCanvas/index.test.tsx
git commit -m "feat(arch): add Fill control with swatch palette; fix border picker showing white"
```

---

## Task 5: Build, live-verify, docs

**Files:**
- Modify: `handoff.md`
- Modify: `docs/superpowers/specs/2026-07-02-ui-overhaul-design.md` (§6 backlog status)

No code. This task is where the backend is actually proven — item 23 means the migration, the `rowToElement` mapping and the `updateElement` passthrough have **zero** automated coverage.

- [ ] **Step 1: Build**

Run: `npx electron-vite build 2>&1 | tail -3`
Expected: `✓ built in <n>ms`, three targets, no errors.

- [ ] **Step 2: Live-verify in the running app**

Drive the built app with `.claude/skills/run-app/driver.mjs` against the `thermal` dev project at 1500×900. Pace commands ~4s apart — readline fires input faster than `launch` completes:

**Pass 1 — read the node's centre**, since React Flow nodes do **not** respond to the driver's `click` command (it calls `querySelector().click()`, which React Flow ignores). You need real mouse input, and for that you need coordinates:

```bash
SCREENSHOT_DIR=$CLAUDE_JOB_DIR/tmp/shots node -e '
const {spawn}=require("child_process");
const p=spawn("node",[".claude/skills/run-app/driver.mjs"],{stdio:["pipe","inherit","inherit"],env:process.env});
const rect = "(()=>{const n=document.querySelector(\".react-flow__node\");if(!n)return \"NONE\";const r=n.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()";
const cmds=["launch","resize 1500x900","click-text Architecture","eval "+rect];
let i=0; const next=()=>{ if(i>=cmds.length){p.stdin.end();setTimeout(()=>process.exit(0),1000);return;}
  p.stdin.write(cmds[i++]+"\n"); setTimeout(next,4000); }; setTimeout(next,1000);'
```

**Pass 2 — select it and drive the palette**, substituting the `X Y` printed by pass 1 (on the `thermal` Default architecture it was `862 487`, but do not assume — it moves with viewport and zoom):

```bash
SCREENSHOT_DIR=$CLAUDE_JOB_DIR/tmp/shots node -e '
const {spawn}=require("child_process");
const p=spawn("node",[".claude/skills/run-app/driver.mjs"],{stdio:["pipe","inherit","inherit"],env:process.env});
const bg = "(()=>{const n=document.querySelector(\".react-flow__node > div\");return n && n.style.background;})()";
const cmds=["launch","resize 1500x900","click-text Architecture",
 "mouse move 862 487","mouse down","mouse up",
 "click-text Style ▾","ss 20-style-open",
 "click-text Fill Teal","eval "+bg,"ss 21-teal-fill",
 "click-text Fill None","eval "+bg,"ss 22-cleared"];
let i=0; const next=()=>{ if(i>=cmds.length){p.stdin.end();setTimeout(()=>process.exit(0),1000);return;}
  p.stdin.write(cmds[i++]+"\n"); setTimeout(next,4000); }; setTimeout(next,1000);'
```

> **Correction (verified 2026-07-15, during execution): `click-text` does NOT match `aria-label`.** An earlier draft of this plan claimed it did. It does not — `driver.mjs:79-80` only ever reads `e.textContent`. The swatch chips are *empty* buttons (colour comes from `style.background`; the name lives in `aria-label`/`title`), so they have no `textContent` and `click-text "Fill Teal"` returns `NOT_FOUND`. Click them by selector instead:
>
> ```
> click button[aria-label="Fill Teal"]
> click button[aria-label="Fill None"]
> ```
>
> The driver's `click` command uses `querySelector().click()`, which works fine on real buttons — it only fails on React Flow nodes, which ignore synthetic clicks. Fixing `click-text` to fall back to `aria-label` is a worthwhile driver improvement, but out of scope here.

Environment facts, so they are not rediscovered: the work area is 1512×898, so **1500 is the realistic maximum width**; the BrowserWindow refuses to go **below 900 wide**; and readline fires piped input faster than `launch` completes, which is why every command is paced ~4s apart rather than piped as a heredoc.

To confirm what actually landed in the database (checks 2 and 4), read it directly rather than trusting the UI:

```bash
sqlite3 "$HOME/Library/Application Support/reqarch2/projects/thermal.reqarch" \
  "SELECT id, block_id, color, fill_color, typeof(fill_color) FROM architecture_elements WHERE deleted_at IS NULL;"
```

Path verified 2026-07-15 — the dev projects live under `Application Support/reqarch2/projects/`, **not** in `~/Documents`. `SmokeTest.reqarch` sits beside `thermal.reqarch`; leave it alone (it still holds an un-migrated legacy tree).

`typeof(fill_color)` is the entire point of check 4: after clicking ✕ it must print `null`, **not** `text`. A `#ffffff` string looks identical on screen and is what a broken `??` idiom (Task 1 Step 5) produces. The same query run before Task 1 errors with `no such column: fill_color`, which is a useful confirmation you are pointed at the right database.

Useful baseline in that DB today: `SYS-003` has a hand-set `color` of `#66ffbd`, and every other object has `color` NULL. That single row is a live example of the border colours B1 will later fail to override — worth eyeballing while you are in there.

All seven checks must pass:

1. Select an object → `Style ▾` shows a Border row (8 chips + picker), a Fill row (✕ + 8 chips + picker), and Line style.
2. Click the Teal fill chip → body paints pale teal; the header keeps its own colour. Confirm the DB with `sqlite3` or a driver `eval`: `fill_color` = `#e3f3f1`.
3. Cmd+Z → fill reverts in one step. Cmd+Shift+Z → returns.
4. Click ✕ → body returns to white, and `SELECT fill_color` reads **NULL**, not `#ffffff`. *(This is the `in`-idiom check from Task 1 Step 5 — the single most regressable point in this plan.)*
5. Nest a child into a filled block → the fill stays at full strength and the dashed drop zone is still legible over it.
6. Select an uncoloured object → the Border picker shows navy, matching the block's rendered border (the Phase 1 bug from Task 4 Step 4).
7. Relaunch → fills persist; untouched legacy objects still render white.

- [ ] **Step 3: Update the docs**

In `handoff.md`, add a COMPLETE section for Phase 2 following the house style of its siblings: spec + plan paths, commit range, what shipped, the test baseline, live-verify results, and known deferrals. Record explicitly:
- Fill is **per-object only**; type inheritance is Phase 3/B1 by user decision, so it is answered once for border and fill together.
- **✕/None is Fill-only** by user decision — `color` still has no NULL path, so **B1 will meet hand-set border colours that refuse to inherit**.
- The spec's §1.1 finding: `text-ink-faint` is 4.76:1 on plain white, i.e. already marginal *before* any fill — a pre-existing token-level a11y issue this phase surfaced but did not cause. Belongs to the batched a11y pass.

In `docs/superpowers/specs/2026-07-02-ui-overhaul-design.md` §6, update item 29's status to record Phase 2 shipped and Phase 3 (B1/B2/B3) still open.

- [ ] **Step 4: Commit**

```bash
git add handoff.md docs/superpowers/specs/2026-07-02-ui-overhaul-design.md
git commit -m "docs: record item 29 Phase 2 (object fill colour) as complete"
```

---

## Notes for the reviewer

- **The single highest-risk line in this plan** is Task 1 Step 5's `'fillColor' in input ? ... : existing.fill_color`. It looks redundant next to the neighbouring `input.name ?? existing.name` and invites "simplification" — which silently breaks the ✕ chip while every renderer test still passes. Task 5's live-verify check 4 is the only thing that catches it.
- **Do not add type-inheritance** (`el.fillColor ?? type.fillColor ?? white`). It is Phase 3/B1, deliberately deferred so the question is settled once for border and fill together. B1 is also not the one-liner the parent spec claims — `element_types.color` is never populated and no type-colour editor exists.
- **Do not assert fill contrast against AA** in `swatches.test.ts`. It cannot pass; plain white only reaches 4.76:1. The `> 0.8` luminance floor is the honest contract.
- 52 test failures are expected and pre-existing (item 23). A task is done when renderer tests pass and that number has not risen.
