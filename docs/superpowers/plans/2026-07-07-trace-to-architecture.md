# Trace to Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ARCHITECTURE section in the requirement drawer — see linked architecture elements, link/unlink, click through to the canvas.

**Architecture:** Pure renderer change. One new `ArchitectureSection` function inside `RequirementDetail/index.tsx` (sibling of `TraceabilitySection`, rendered right after it), consuming only existing store members: `traceLinks`, `elements`, `loadTraceability`, `toggleTraceLink`, `selectElement`, `setActiveTab`. No backend, preload, type, or store changes.

**Tech Stack:** React + zustand; vitest + @testing-library/react.

Spec: `docs/superpowers/specs/2026-07-07-trace-to-architecture-design.md`

## Global Constraints

- Tailwind semantic tokens only in classNames (`text-ink`, `text-ink-muted`, `text-ink-faint`, `border-line`, `text-error`, `bg-action-tint`, etc.).
- Tests: `./node_modules/.bin/vitest run <paths>` — NEVER `npm run` (npm shim broken). Typecheck: `./node_modules/.bin/tsc --noEmit -p tsconfig.web.json` clean (node config untouched by this plan but run both in Task 2).
- All renderer tests must pass (known baseline exception: 1 pre-existing ArchitectureCanvas failure). Extensions to existing test files' store mocks are additive only — never weaken assertions.
- Commits go straight to `main`. Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- PATH prefix required in every shell: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"`.
- Out of scope: canvas-side linking (exists), connection-requirement links, multi-select linking, picker search, canvas scroll-into-view.

---

### Task 1: ArchitectureSection in the requirement drawer

**Files:**
- Modify: `src/renderer/src/components/RequirementDetail/index.tsx` (add section render at line ~249 after `<TraceabilitySection req={req} />`, add `ArchitectureSection` function at end of file)
- Create: `src/renderer/src/components/RequirementDetail/architecture.test.tsx`
- Modify: `src/renderer/src/components/RequirementDetail/index.test.tsx`, `src/renderer/src/components/RequirementDetail/traceability.test.tsx`, `src/renderer/src/components/RequirementDetail/acceptance.test.tsx` (additive store-mock extension only: `traceLinks: []`, `elements: []`, plus `vi.fn()` stubs `selectElement`, `setActiveTab`, `toggleTraceLink` — `loadTraceability` is already stubbed in all three)
- Modify: `src/renderer/src/App.test.tsx` ONLY IF the detail-panel test fails (same additive extension; check before assuming — its mock already carries `loadTraceability` etc. from the drawer's TraceabilitySection, so it likely already renders; the new section additionally needs `traceLinks`/`elements` arrays to `.filter`/`.find` over)

**Interfaces:**
- Consumes (all existing): store `traceLinks: ElementRequirementLink[]`, `elements: ArchitectureElement[]`, `loadTraceability(): Promise<void>`, `toggleTraceLink(elementId: number, requirementId: number): Promise<void>`, `selectElement(id: number | null): void`, `setActiveTab(tab)`; types `ArchitectureElement { id, blockId, name, ... }`, `ElementRequirementLink { elementId, requirementId }`.
- Produces: `data-testid="arch-section"`; row navigate buttons; `aria-label="Unlink {blockId}"` remove buttons; `aria-label="Link element"` select; `Link` button.

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/src/components/RequirementDetail/architecture.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import RequirementDetail from './index'
import type { ArchitectureElement, Requirement } from '../../../../types'

const mockLoadTraceability = vi.fn()
const mockToggleTraceLink = vi.fn().mockResolvedValue(undefined)
const mockSelectElement = vi.fn()
const mockSetActiveTab = vi.fn()

const req = {
  id: 5, moduleId: 3, reqId: 'SRS-0005', text: 'The system shall regulate temperature.',
  acceptanceCriteria: null, source: null, rationale: null, position: 0,
  status: 'Draft', priority: 'Medium', reqType: 'Functional', headingId: null,
  deletedAt: null, createdAt: '', updatedAt: ''
} as Requirement

function el(over: Partial<ArchitectureElement>): ArchitectureElement {
  return {
    id: 1, projectId: 1, parentId: null, blockId: 'BLK-001', name: 'Controller',
    elementTypeId: null, posX: 0, posY: 0, width: 160, height: 80,
    createdAt: '', updatedAt: '',
    ...over
  } as ArchitectureElement
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
    acItems: [], acSummary: {},
    elements: [
      el({ id: 1, blockId: 'BLK-001', name: 'Controller' }),
      el({ id: 2, blockId: 'BLK-002', name: 'Sensor' })
    ],
    traceLinks: [{ elementId: 1, requirementId: 5 }],
    updateRequirement: vi.fn(), loadCustomFields: vi.fn(),
    addCustomField: vi.fn(), updateCustomField: vi.fn(), removeCustomField: vi.fn(),
    addReqLink: vi.fn(), removeReqLink: vi.fn(), openRequirement: vi.fn(),
    loadAcItems: vi.fn(), addAcItem: vi.fn(), updateAcItem: vi.fn(),
    removeAcItem: vi.fn(), moveAcItem: vi.fn(),
    loadTraceability: mockLoadTraceability,
    toggleTraceLink: mockToggleTraceLink,
    selectElement: mockSelectElement,
    setActiveTab: mockSetActiveTab
  })
})

describe('architecture section', () => {
  it('lists linked elements and excludes unlinked ones', () => {
    render(<RequirementDetail />)
    const section = screen.getByTestId('arch-section')
    expect(within(section).getByText('BLK-001')).toBeInTheDocument()
    expect(within(section).getByText('Controller')).toBeInTheDocument()
    expect(within(section).queryByText('BLK-002')).toBeNull()
  })

  it('row click navigates to the architecture tab with the element selected', () => {
    render(<RequirementDetail />)
    fireEvent.click(within(screen.getByTestId('arch-section')).getByText('BLK-001'))
    expect(mockSetActiveTab).toHaveBeenCalledWith('architecture')
    expect(mockSelectElement).toHaveBeenCalledWith(1)
  })

  it('unlink button toggles the link off', () => {
    render(<RequirementDetail />)
    fireEvent.click(screen.getByLabelText('Unlink BLK-001'))
    expect(mockToggleTraceLink).toHaveBeenCalledWith(1, 5)
  })

  it('picker offers only unlinked elements; Link adds and resets the picker', () => {
    render(<RequirementDetail />)
    const select = screen.getByLabelText('Link element') as HTMLSelectElement
    const optionTexts = Array.from(select.options).map((o) => o.text)
    expect(optionTexts.some((t) => t.includes('BLK-002'))).toBe(true)
    expect(optionTexts.some((t) => t.includes('BLK-001'))).toBe(false)
    const linkBtn = screen.getByRole('button', { name: 'Link' }) as HTMLButtonElement
    expect(linkBtn.disabled).toBe(true)
    fireEvent.change(select, { target: { value: '2' } })
    expect(linkBtn.disabled).toBe(false)
    fireEvent.click(linkBtn)
    expect(mockToggleTraceLink).toHaveBeenCalledWith(2, 5)
    expect(select.value).toBe('')
  })

  it('renders None. when the requirement has no linked elements', () => {
    storeState.traceLinks = []
    render(<RequirementDetail />)
    expect(within(screen.getByTestId('arch-section')).getByText('None.')).toBeInTheDocument()
  })

  it('loads traceability on mount', () => {
    render(<RequirementDetail />)
    expect(mockLoadTraceability).toHaveBeenCalled()
  })
})
```

(The `as ArchitectureElement` cast absorbs nullable fields the interface has beyond these — check the interface only if `tsc` complains.)

- [ ] **Step 2: Run to verify fail**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/RequirementDetail/architecture.test.tsx`
Expected: FAIL — `arch-section` test id not found.

- [ ] **Step 3: Implement the section**

In `src/renderer/src/components/RequirementDetail/index.tsx`:

1. Add `ArchitectureElement` to the types import if not present.
2. After `<TraceabilitySection req={req} />` (line ~249) add:

```tsx
        <ArchitectureSection req={req} />
```

3. At the end of the file add:

```tsx
function ArchitectureSection({ req }: { req: Requirement }): JSX.Element {
  const { traceLinks, elements, loadTraceability, toggleTraceLink, selectElement, setActiveTab } = useStore()
  const [pickId, setPickId] = useState<string>('')

  useEffect(() => { loadTraceability() }, [req.id])

  const byId = new Map(elements.map((e) => [e.id, e]))
  const linked = traceLinks
    .filter((l) => l.requirementId === req.id)
    .map((l) => byId.get(l.elementId))
    .filter((e): e is ArchitectureElement => e !== undefined)
  const linkedIds = new Set(linked.map((e) => e.id))
  const candidates = elements.filter((e) => !linkedIds.has(e.id))

  return (
    <div data-testid="arch-section" className="space-y-2 pt-2 border-t border-line">
      <SectionLabel className="block pt-2">Architecture</SectionLabel>
      {linked.length === 0 && <div className="text-xs text-ink-faint">None.</div>}
      {linked.map((e) => (
        <div key={e.id} className="flex items-center gap-2">
          <button
            onClick={() => { setActiveTab('architecture'); selectElement(e.id) }}
            className="flex-1 min-w-0 text-left flex gap-2 items-baseline hover:bg-action-tint/20 rounded px-1 py-0.5"
          >
            <span className="text-xs font-mono text-ink-faint shrink-0">{e.blockId}</span>
            <span className="text-xs text-ink truncate">{e.name || '—'}</span>
          </button>
          <button
            aria-label={`Unlink ${e.blockId}`}
            title="Unlink"
            onClick={() => { toggleTraceLink(e.id, req.id) }}
            className="text-ink-faint hover:text-error text-lg leading-none px-1"
          >
            ×
          </button>
        </div>
      ))}
      <div className="flex gap-2 items-center">
        <Select
          aria-label="Link element"
          value={pickId}
          onChange={(e) => setPickId(e.target.value)}
          className="flex-1 !py-1.5"
        >
          <option value="">Select element…</option>
          {candidates.map((e) => (
            <option key={e.id} value={e.id}>{e.blockId} — {e.name || 'Unnamed'}</option>
          ))}
        </Select>
        <Button
          disabled={pickId === ''}
          onClick={() => { toggleTraceLink(Number(pickId), req.id); setPickId('') }}
          className="!py-1.5"
        >
          Link
        </Button>
      </div>
    </div>
  )
}
```

(`Select`, `Button`, `SectionLabel`, `useStore`, `useState`, `useEffect` are already imported in this file — verify and extend the import lists only if something is missing.)

- [ ] **Step 4: Extend sibling test mocks additively**

In each of `index.test.tsx`, `traceability.test.tsx`, `acceptance.test.tsx` (same directory), add to the `storeState` base object: `traceLinks: []`, `elements: []`, and `vi.fn()` stubs for `selectElement`, `setActiveTab`, `toggleTraceLink` (skip any key already present). Do not touch any assertion.

- [ ] **Step 5: Run the RequirementDetail suite + App tests**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/RequirementDetail src/renderer/src/App.test.tsx`
Expected: architecture.test.tsx 6/6 PASS; index 8/8, traceability 4/4, acceptance 7/7 still green; App 8/8 — if App fails on missing `traceLinks`/`elements`/`toggleTraceLink`-family members, extend its base store mock additively the same way.

- [ ] **Step 6: Full renderer suite + typecheck + commit**

Run: `./node_modules/.bin/vitest run src/renderer`
Expected: only the 1 pre-existing ArchitectureCanvas failure.

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.web.json
git add src/renderer/src/components/RequirementDetail src/renderer/src/App.test.tsx
git commit -m "feat(trace): architecture section in requirement drawer — link/unlink elements, click-through to canvas"
```
(Drop `App.test.tsx` from `git add` if untouched.)

---

### Task 2: Verification — full suite, typechecks, build

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

If Steps 1-3 forced changes, commit them; otherwise nothing to commit.

---

## Post-plan verification (controller, not a task)

Playwright driver against SmokeTest: open a requirement that has a matrix-linked element → ARCHITECTURE section lists it (blockId + name); pick an unlinked element + Link → row appears and `element_requirement_links` has the row; × → row gone in UI and DB; click a linked row → Architecture tab active with that element selected (ElementPanel visible for it); picker options exclude linked elements.
