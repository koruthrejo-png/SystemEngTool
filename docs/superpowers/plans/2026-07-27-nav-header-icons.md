# Nav Header Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a uniform header icon cluster — 🔔 notifications, ? help, ⚙ settings — beside the existing avatar menu, surfacing requirements that need attention and giving help/settings a first-class home.

**Architecture:** Notifications derive from a pure `attentionItems(requirements, links)` over already-loaded project data (three fixed groups, deduped badge count); the same `traceGaps` predicate is shared with the Dashboard so both agree. Help exposes a keyboard-shortcuts modal (only real shortcuts) and an About modal reading the app version via one new read-only IPC. The gear opens the existing Settings modal; the avatar menu drops its now-redundant Settings item and gains a People shortcut. All menus reuse the existing `HeaderMenu`/`MenuItem` primitives.

**Tech Stack:** Electron + React + TypeScript, Zustand store, Vitest + @testing-library/react, electron-vite, better-sqlite3.

**Spec:** `docs/superpowers/specs/2026-07-25-nav-header-icons-design.md`

## Global Constraints

- No new runtime dependencies — icons are plain glyphs or inline SVG (app's no-Material-Symbols convention).
- Pure logic lives in Electron-free modules so it unit-tests without the sqlite ABI; components mock `../../store` and `window.api` per the existing renderer test idiom.
- Never fabricate data: the bell is a live derived view, no persisted/unread/dismiss state in v1.
- Attribution and any DB writes are stamped by main — but this feature is read-only except the one `app:getVersion` IPC.
- Enums are TS-enforced. Valid statuses: `['Draft','Review','Approved','Rejected','N/A']`; verification: `['Unverified','In Progress','Passed','Failed']`; priorities include `'High'`.
- Gate before "done": `npm run typecheck` clean (node + web), `npx electron-vite build` clean (3 targets), `npm test` green.

---

## File Structure

- `src/renderer/src/components/attention.ts` — **new**, pure. `traceGaps` + `attentionItems`.
- `src/renderer/src/components/attention.test.ts` — **new**, unit tests.
- `src/renderer/src/components/Dashboard/stats.ts` — **modify** `criticalGaps` to reuse `traceGaps`.
- `src/main/handlers/app.ts` — **new**, `app:getVersion` IPC.
- `src/main/index.ts` — **modify**, register the app handler.
- `src/preload/index.ts` — **modify**, add `api.app.getVersion`.
- `src/types/api.d.ts` — **modify**, declare `app.getVersion`.
- `src/renderer/src/components/NotificationsBell.tsx` — **new**, bell button + dropdown.
- `src/renderer/src/components/NotificationsBell.test.tsx` — **new**.
- `src/renderer/src/components/HelpMenu.tsx` — **new**, help dropdown + KeyboardShortcuts + About modals.
- `src/renderer/src/components/HelpMenu.test.tsx` — **new**.
- `src/renderer/src/App.tsx` — **modify**, load traceability on project open + wire the icon cluster + profile polish.

---

### Task 1: Pure `attentionItems` + shared trace-gap predicate

**Files:**
- Create: `src/renderer/src/components/attention.ts`
- Modify: `src/renderer/src/components/Dashboard/stats.ts:48-49,78`
- Test: `src/renderer/src/components/attention.test.ts`

**Interfaces:**
- Consumes: `Requirement`, `ElementRequirementLink` from `src/types`.
- Produces:
  - `traceGaps(requirements: Requirement[], links: ElementRequirementLink[]): Requirement[]`
  - `interface AttentionItems { traceGaps: Requirement[]; inReview: Requirement[]; verificationFailed: Requirement[]; count: number }`
  - `attentionItems(requirements: Requirement[], links: ElementRequirementLink[]): AttentionItems`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/components/attention.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { attentionItems, traceGaps } from './attention'
import type { Requirement, ElementRequirementLink } from '../../../types'

function req(over: Partial<Requirement>): Requirement {
  return {
    id: 1, moduleId: 1, reqId: 'R-1', text: 'x', acceptanceCriteria: null,
    source: null, rationale: null, position: 0, status: 'Draft', priority: 'Medium',
    reqType: 'Functional', entryType: 'Requirement', verificationStatus: 'Unverified',
    headingId: null, deletedAt: null, createdAt: '', updatedAt: '', createdBy: null, updatedBy: null,
    ...over
  }
}
const link = (requirementId: number): ElementRequirementLink => ({ elementId: 1, requirementId })

describe('traceGaps', () => {
  it('selects High-priority requirements linked to no element', () => {
    const gap = req({ id: 1, priority: 'High' })
    const linkedHigh = req({ id: 2, priority: 'High' })
    const lowUnlinked = req({ id: 3, priority: 'Low' })
    expect(traceGaps([gap, linkedHigh, lowUnlinked], [link(2)])).toEqual([gap])
  })
})

describe('attentionItems', () => {
  it('groups trace gaps, in-review, verification-failed and counts distinct requirements', () => {
    const gap = req({ id: 1, priority: 'High' })
    const review = req({ id: 2, status: 'Review' })
    const failed = req({ id: 3, verificationStatus: 'Failed' })
    const r = attentionItems([gap, review, failed], [])
    expect(r.traceGaps).toEqual([gap])
    expect(r.inReview).toEqual([review])
    expect(r.verificationFailed).toEqual([failed])
    expect(r.count).toBe(3)
  })

  it('counts a requirement in two groups once', () => {
    const both = req({ id: 9, priority: 'High', status: 'Review' })
    const r = attentionItems([both], [])
    expect(r.traceGaps).toEqual([both])
    expect(r.inReview).toEqual([both])
    expect(r.count).toBe(1)
  })

  it('is empty and zero when nothing needs attention', () => {
    const ok = req({ id: 1, priority: 'Low', status: 'Approved' })
    const r = attentionItems([ok], [link(1)])
    expect(r).toEqual({ traceGaps: [], inReview: [], verificationFailed: [], count: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/components/attention.test.ts`
Expected: FAIL — `Failed to resolve import "./attention"` / `attentionItems is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/renderer/src/components/attention.ts`:

```ts
import type { Requirement, ElementRequirementLink } from '../../../types'

/** High-priority requirements linked to no architecture element. Shared with the Dashboard. */
export function traceGaps(requirements: Requirement[], links: ElementRequirementLink[]): Requirement[] {
  const linkedIds = new Set(links.map((l) => l.requirementId))
  return requirements.filter((r) => !linkedIds.has(r.id) && r.priority === 'High')
}

export interface AttentionItems {
  traceGaps: Requirement[]
  inReview: Requirement[]
  verificationFailed: Requirement[]
  count: number
}

/** Requirements needing attention, in three fixed groups; `count` = distinct requirements. */
export function attentionItems(requirements: Requirement[], links: ElementRequirementLink[]): AttentionItems {
  const tg = traceGaps(requirements, links)
  const inReview = requirements.filter((r) => r.status === 'Review')
  const verificationFailed = requirements.filter((r) => r.verificationStatus === 'Failed')
  const count = new Set([...tg, ...inReview, ...verificationFailed].map((r) => r.id)).size
  return { traceGaps: tg, inReview, verificationFailed, count }
}
```

- [ ] **Step 4: Refactor `stats.ts` to reuse `traceGaps`**

In `src/renderer/src/components/Dashboard/stats.ts`, add the import near the top (with the other imports):

```ts
import { traceGaps } from '../attention'
```

Replace line 78:

```ts
    criticalGaps: unallocated.filter((r) => r.priority === 'High')
```

with:

```ts
    criticalGaps: traceGaps(requirements, links)
```

(`unallocated` on line 49 stays — it is still used for `coveragePct` and `perModule`. `traceGaps(requirements, links)` returns exactly `unallocated.filter(High)`.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/renderer/src/components/attention.test.ts src/renderer/src/components/Dashboard/stats.test.ts`
Expected: PASS (attention new tests green; Dashboard stats tests still green — `criticalGaps` unchanged in behaviour).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/attention.ts src/renderer/src/components/attention.test.ts src/renderer/src/components/Dashboard/stats.ts
git commit -m "feat(attention): pure attentionItems + shared traceGaps predicate"
```

---

### Task 2: `app:getVersion` IPC

**Files:**
- Create: `src/main/handlers/app.ts`
- Modify: `src/main/index.ts:1-63` (import + register)
- Modify: `src/preload/index.ts:22` (add `app` bridge)
- Modify: `src/types/api.d.ts` (declare `app.getVersion`)

**Interfaces:**
- Produces: renderer `window.api.app.getVersion(): Promise<string>` returning `app.getVersion()` (Electron), e.g. `"1.0.0"`.

- [ ] **Step 1: Create the handler**

Create `src/main/handlers/app.ts`:

```ts
import { app, ipcMain } from 'electron'

export function registerAppHandlers(): void {
  ipcMain.handle('app:getVersion', () => app.getVersion())
}
```

- [ ] **Step 2: Register it in `src/main/index.ts`**

Add the import alongside the other handler imports (after line 21):

```ts
import { registerAppHandlers } from './handlers/app'
```

Add the call alongside the other `register…()` calls (after line 63 `registerBaselineHandlers()`):

```ts
  registerAppHandlers()
```

- [ ] **Step 3: Expose it in the preload bridge**

In `src/preload/index.ts`, inside the `contextBridge.exposeInMainWorld('api', { … })` object, add an `app` section (place it right after the `project: { … }` block):

```ts
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion')
  },
```

- [ ] **Step 4: Declare it in `src/types/api.d.ts`**

Add an `app` member to the `api` interface (mirror the `project` block style):

```ts
      app: {
        getVersion(): Promise<string>
      }
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS (both node + web typechecks clean; `window.api.app.getVersion` now typed).

- [ ] **Step 6: Commit**

```bash
git add src/main/handlers/app.ts src/main/index.ts src/preload/index.ts src/types/api.d.ts
git commit -m "feat(ipc): app:getVersion read-only channel"
```

---

### Task 3: Notifications bell + load traceability on project open

**Files:**
- Create: `src/renderer/src/components/NotificationsBell.tsx`
- Test: `src/renderer/src/components/NotificationsBell.test.tsx`
- Modify: `src/renderer/src/App.tsx:26` (load traceability on project open), `:17` (import), `:87-90` (header wiring)

**Interfaces:**
- Consumes: `attentionItems` (Task 1); store `projectRequirements`, `traceLinks`, `openRequirement`, `loadTraceability`, `project` (all already exist — see `store/index.ts:619` `loadTraceability`, `:249` `openRequirement`).
- Produces: default-exported `NotificationsBell` React component (no props).

Note: `openRequirement(req)` already sets `activeTab: 'requirements'` and selects the module + requirement (`store/index.ts:249-253`), so a row click needs only `openRequirement(req)`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/components/NotificationsBell.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import NotificationsBell from './NotificationsBell'
import type { Requirement } from '../../../types'

const mockOpenRequirement = vi.fn()
const storeState: Record<string, unknown> = {}
vi.mock('../store', () => ({ useStore: (): Record<string, unknown> => storeState }))

function req(over: Partial<Requirement>): Requirement {
  return {
    id: 1, moduleId: 1, reqId: 'R-1', text: 'x', acceptanceCriteria: null, source: null,
    rationale: null, position: 0, status: 'Draft', priority: 'Medium', reqType: 'Functional',
    entryType: 'Requirement', verificationStatus: 'Unverified', headingId: null, deletedAt: null,
    createdAt: '', updatedAt: '', createdBy: null, updatedBy: null, ...over
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(storeState, {
    project: { id: 1, name: 'P' },
    projectRequirements: [],
    traceLinks: [],
    openRequirement: mockOpenRequirement
  })
})

describe('NotificationsBell', () => {
  it('hides the badge when nothing needs attention', () => {
    render(<NotificationsBell />)
    expect(screen.queryByTestId('bell-badge')).toBeNull()
  })

  it('shows the distinct attention count on the badge', () => {
    storeState.projectRequirements = [
      req({ id: 1, reqId: 'R-1', priority: 'High' }),
      req({ id: 2, reqId: 'R-2', status: 'Review' })
    ]
    render(<NotificationsBell />)
    expect(screen.getByTestId('bell-badge')).toHaveTextContent('2')
  })

  it('renders groups and navigates on row click', () => {
    const gap = req({ id: 1, reqId: 'R-1', text: 'unlinked high', priority: 'High' })
    storeState.projectRequirements = [gap]
    render(<NotificationsBell />)
    fireEvent.click(screen.getByLabelText('Notifications'))
    expect(screen.getByText('Trace gaps')).toBeInTheDocument()
    fireEvent.click(screen.getByText(/R-1/))
    expect(mockOpenRequirement).toHaveBeenCalledWith(gap)
  })

  it('shows the empty state when opened with nothing pending', () => {
    render(<NotificationsBell />)
    fireEvent.click(screen.getByLabelText('Notifications'))
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/components/NotificationsBell.test.tsx`
Expected: FAIL — `Failed to resolve import "./NotificationsBell"`.

- [ ] **Step 3: Write the component**

Create `src/renderer/src/components/NotificationsBell.tsx`:

```tsx
import { useStore } from '../store'
import HeaderMenu, { MenuItem } from './HeaderMenu'
import { attentionItems } from './attention'
import type { Requirement } from '../../../types'

const GROUPS: [keyof ReturnType<typeof attentionItems>, string][] = [
  ['traceGaps', 'Trace gaps'],
  ['inReview', 'In review'],
  ['verificationFailed', 'Verification failed']
]

export default function NotificationsBell(): JSX.Element {
  const { projectRequirements, traceLinks, openRequirement } = useStore()
  const items = attentionItems(projectRequirements, traceLinks)

  return (
    <HeaderMenu
      align="right"
      trigger={
        <span
          aria-label="Notifications"
          className="relative flex items-center justify-center w-6 h-6 text-white/70 hover:text-white"
        >
          <span aria-hidden className="text-base leading-none">🔔</span>
          {items.count > 0 && (
            <span
              data-testid="bell-badge"
              className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-semibold leading-none"
            >
              {items.count}
            </span>
          )}
        </span>
      }
    >
      {(close) => {
        const rows = GROUPS.filter(([key]) => (items[key] as Requirement[]).length > 0)
        if (rows.length === 0) {
          return <div className="px-3 py-3 text-sm text-ink-faint">You're all caught up.</div>
        }
        return (
          <div className="max-h-96 overflow-auto min-w-[16rem]">
            {rows.map(([key, label]) => (
              <div key={key}>
                <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</div>
                {(items[key] as Requirement[]).map((r) => (
                  <MenuItem key={r.id} onClick={() => { close(); openRequirement(r) }}>
                    <span className="font-mono text-xs text-ink-faint mr-2">{r.reqId}</span>
                    <span className="text-ink">{r.text.length > 60 ? r.text.slice(0, 60) + '…' : r.text}</span>
                  </MenuItem>
                ))}
              </div>
            ))}
          </div>
        )
      }}
    </HeaderMenu>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/components/NotificationsBell.test.tsx`
Expected: PASS (4/4).

- [ ] **Step 5: Load traceability on project open + wire the bell into the header**

In `src/renderer/src/App.tsx`:

Add the import near the other component imports (after line 17):

```tsx
import NotificationsBell from './components/NotificationsBell'
```

Add `loadTraceability` to the destructured store on line 20 (append to the existing list):

```tsx
  const { project, me, activeTab, setActiveTab, loadProject, loadMe, loadArchitectures, loadInterfaces, loadTraceability, selectedElementId, selectedConnectionId, detailPanelOpen, selectedRequirementId, lastError, clearError } = useStore()
```

Add an effect that loads traceability whenever a project is open (right after the `loadProject(); loadMe()` mount effect on line 26) — this is what the always-visible bell needs, since `loadProject` does not load `projectRequirements`/`traceLinks` and `loadTraceability` is otherwise only run by the Dashboard/Traceability tabs. It is idempotent, so the Dashboard's own call stays:

```tsx
  useEffect(() => { if (project) loadTraceability() }, [project?.id])
```

Wire the bell into the header right group. Change the block at lines 87-90 from:

```tsx
        <div className="ml-auto flex items-center gap-3">
          <div className="w-56"><GlobalSearch /></div>
          <Button onClick={() => setShowNewDialog(true)}>+ New Project</Button>
          <div className="w-px h-6 bg-white/20" />
```

to:

```tsx
        <div className="ml-auto flex items-center gap-3">
          <div className="w-56"><GlobalSearch /></div>
          <Button onClick={() => setShowNewDialog(true)}>+ New Project</Button>
          <div className="w-px h-6 bg-white/20" />
          <NotificationsBell />
```

- [ ] **Step 6: Run App tests + typecheck**

Run: `npx vitest run src/renderer/src/App.test.tsx && npm run typecheck`
Expected: typecheck PASS. `App.test.tsx` shows the SAME pre-existing "open"-button failure that fails on base (documented in handoff) and no new failures — if `App.test.tsx` mocks the store, add `projectRequirements: [], traceLinks: [], loadTraceability: vi.fn(), openRequirement: vi.fn()` to its store mock so the bell renders.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/NotificationsBell.tsx src/renderer/src/components/NotificationsBell.test.tsx src/renderer/src/App.tsx
git commit -m "feat(header): notifications bell + load traceability on project open"
```

---

### Task 4: Help menu — keyboard shortcuts + About

**Files:**
- Create: `src/renderer/src/components/HelpMenu.tsx`
- Test: `src/renderer/src/components/HelpMenu.test.tsx`
- Modify: `src/renderer/src/App.tsx:17` (import), `:90` (header wiring, after the bell)

**Interfaces:**
- Consumes: `HeaderMenu`/`MenuItem`; `window.api.app.getVersion` (Task 2).
- Produces: default-exported `HelpMenu` React component (no props); two internal modals (keyboard shortcuts, about).

Real shortcuts to list (verified in the code, do NOT add others):
- **⌘K / Ctrl+K** — Focus global search (`GlobalSearch/index.tsx:14`)
- **⌘Z / ⌘⇧Z** — Undo / redo on the architecture canvas (`ArchitectureCanvas/index.tsx:411-415`)
- **⌘D / Ctrl+D** — Duplicate the selected object on the canvas (`ArchitectureCanvas/index.tsx:389`)
- **Delete / Backspace** — Delete the selected object/connection on the canvas (`ArchitectureCanvas/deleteKey.ts`, RF block delete)
- **Esc** — Deselect / close the open panel or dialog (`ArchitectureCanvas/index.tsx:363`, `RequirementsList/index.tsx:142`, dialogs)
- **Enter** — Commit the current inline edit or dialog (`App.tsx:148`, inline edits)

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/components/HelpMenu.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import HelpMenu from './HelpMenu'

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as any).api = { ...(window as any).api, app: { getVersion: vi.fn().mockResolvedValue('1.2.3') } }
})

describe('HelpMenu', () => {
  it('opens the keyboard shortcuts modal listing a real shortcut', () => {
    render(<HelpMenu />)
    fireEvent.click(screen.getByLabelText('Help'))
    fireEvent.click(screen.getByText('Keyboard shortcuts'))
    expect(screen.getByText('Keyboard shortcuts', { selector: 'h2, [role="heading"], *' })).toBeInTheDocument()
    expect(screen.getByText(/Focus global search/)).toBeInTheDocument()
  })

  it('opens the About modal showing the app version', async () => {
    render(<HelpMenu />)
    fireEvent.click(screen.getByLabelText('Help'))
    fireEvent.click(screen.getByText('About ReqArch'))
    await waitFor(() => expect(screen.getByText(/1\.2\.3/)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/components/HelpMenu.test.tsx`
Expected: FAIL — `Failed to resolve import "./HelpMenu"`.

- [ ] **Step 3: Write the component**

Create `src/renderer/src/components/HelpMenu.tsx`:

```tsx
import { useEffect, useState } from 'react'
import HeaderMenu, { MenuItem } from './HeaderMenu'
import { SectionLabel, Button } from './ui'

const SHORTCUTS: [string, string][] = [
  ['⌘K / Ctrl+K', 'Focus global search'],
  ['⌘Z / ⌘⇧Z', 'Undo / redo (architecture canvas)'],
  ['⌘D / Ctrl+D', 'Duplicate the selected object (canvas)'],
  ['Delete / Backspace', 'Delete the selected object or connection (canvas)'],
  ['Esc', 'Deselect / close the open panel or dialog'],
  ['Enter', 'Commit the current inline edit or dialog']
]

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/40" onClick={onClose}>
      <div className="bg-white rounded shadow-[0_4px_12px_rgba(0,0,0,0.08)] border border-line p-6 w-96 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <SectionLabel>{title}</SectionLabel>
          <button aria-label="Close" onClick={onClose} className="text-ink-faint hover:text-ink text-base leading-none">×</button>
        </div>
        {children}
        <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
      </div>
    </div>
  )
}

export default function HelpMenu(): JSX.Element {
  const [modal, setModal] = useState<null | 'shortcuts' | 'about'>(null)
  const [version, setVersion] = useState<string>('')

  useEffect(() => {
    if (modal === 'about') window.api.app.getVersion().then(setVersion)
  }, [modal])

  return (
    <>
      <HeaderMenu
        align="right"
        trigger={<span aria-label="Help" className="flex items-center justify-center w-6 h-6 text-white/70 hover:text-white text-base font-semibold leading-none">?</span>}
      >
        {(close) => (
          <>
            <MenuItem onClick={() => { close(); setModal('shortcuts') }}>Keyboard shortcuts</MenuItem>
            <MenuItem onClick={() => { close(); setModal('about') }}>About ReqArch</MenuItem>
          </>
        )}
      </HeaderMenu>

      {modal === 'shortcuts' && (
        <Modal title="Keyboard shortcuts" onClose={() => setModal(null)}>
          <dl className="flex flex-col gap-2 text-sm">
            {SHORTCUTS.map(([keys, desc]) => (
              <div key={keys} className="flex items-baseline justify-between gap-4">
                <dt className="font-mono text-xs text-ink whitespace-nowrap">{keys}</dt>
                <dd className="text-ink-faint text-right">{desc}</dd>
              </div>
            ))}
          </dl>
        </Modal>
      )}

      {modal === 'about' && (
        <Modal title="About ReqArch" onClose={() => setModal(null)}>
          <div className="flex flex-col gap-1 text-sm text-ink">
            <div className="font-medium">ReqArch Suite</div>
            <div className="text-ink-faint">Version {version || '…'}</div>
          </div>
        </Modal>
      )}
    </>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/components/HelpMenu.test.tsx`
Expected: PASS (2/2).

- [ ] **Step 5: Wire the help menu into the header**

In `src/renderer/src/App.tsx`, add the import (after line 17):

```tsx
import HelpMenu from './components/HelpMenu'
```

Add `<HelpMenu />` immediately after `<NotificationsBell />` in the header right group:

```tsx
          <NotificationsBell />
          <HelpMenu />
```

- [ ] **Step 6: Typecheck + App tests**

Run: `npm run typecheck && npx vitest run src/renderer/src/App.test.tsx`
Expected: typecheck PASS; `App.test.tsx` shows only the pre-existing "open"-button failure (add `app: { getVersion: vi.fn().mockResolvedValue('1.0.0') }` to its `window.api` mock if the render throws).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/HelpMenu.tsx src/renderer/src/components/HelpMenu.test.tsx src/renderer/src/App.tsx
git commit -m "feat(header): help menu with keyboard shortcuts + about"
```

---

### Task 5: Settings gear + profile polish

**Files:**
- Modify: `src/renderer/src/App.tsx:90` (gear icon after help), `:102-110` (avatar menu: drop Settings item, add People)

**Interfaces:**
- Consumes: existing `setShowSettings` (`App.tsx:22`), `Settings` modal (single-pane, already has a People section — `Settings/index.tsx:54-68`).
- Produces: no new module. `App.test.tsx` is the covering test.

Note: the Settings modal is single-pane with a People section already visible, so "People" simply opens Settings (same as the gear) until Settings gains addressable sections — per the spec's single-pane fallback.

- [ ] **Step 1: Add the gear icon after the help menu**

In `src/renderer/src/App.tsx`, add the gear button right after `<HelpMenu />` in the header right group:

```tsx
          <HelpMenu />
          <button
            type="button"
            aria-label="Settings"
            onClick={() => setShowSettings(true)}
            className="flex items-center justify-center w-6 h-6 text-white/70 hover:text-white text-base leading-none"
          >
            ⚙
          </button>
          <div className="w-px h-6 bg-white/20" />
```

(This adds a second divider between the icon cluster and the avatar; the existing divider at line 90 already separates `+ New Project` from the cluster.)

- [ ] **Step 2: Drop the redundant Settings item + add People in the avatar menu**

In the avatar `HeaderMenu` children (lines 102-110), replace:

```tsx
            {(close) => (
              <>
                <div className="px-3 py-2 border-b border-line">
                  <div className="text-sm font-medium text-ink truncate">{me?.displayName ?? 'You'}</div>
                  {me?.email && <div className="text-xs text-ink-faint truncate">{me.email}</div>}
                </div>
                <MenuItem onClick={() => { close(); setShowSettings(true) }}>Settings</MenuItem>
              </>
            )}
```

with:

```tsx
            {(close) => (
              <>
                <div className="px-3 py-2 border-b border-line">
                  <div className="text-sm font-medium text-ink truncate">{me?.displayName ?? 'You'}</div>
                  {me?.email && <div className="text-xs text-ink-faint truncate">{me.email}</div>}
                </div>
                <MenuItem onClick={() => { close(); setShowSettings(true) }}>People</MenuItem>
              </>
            )}
```

- [ ] **Step 3: Update `App.test.tsx` for the moved affordance**

If `App.test.tsx` asserts a "Settings" menu item, update that assertion to "People" (the item was renamed). Run: `npx vitest run src/renderer/src/App.test.tsx` and fix any assertion that referenced the removed "Settings" avatar item. The pre-existing "open"-button failure remains (fails on base).

- [ ] **Step 4: Full gate**

Run: `npm run typecheck && npx electron-vite build && npm test`
Expected: typecheck clean (node + web); build clean (3 targets); vitest green except the single documented pre-existing `App.test.tsx` "open"-button failure.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/App.test.tsx
git commit -m "feat(header): settings gear + drop redundant avatar Settings item, add People"
```

---

## Live-Verify (after Task 5, in the running app)

Drive via the Playwright `_electron` driver against the real `SmokeTest.reqarch` (`window.api` directly where a native dialog is not involved — none here):

1. Seed/confirm attention items (a High-priority unallocated req, a `status='Review'` req, a `verificationStatus='Failed'` req) → bell badge shows the distinct count; opening the dropdown shows the three groups; a row click lands on the requirement in the Requirements tab.
2. With nothing pending, the badge is hidden and the dropdown reads "You're all caught up."
3. `?` → Keyboard shortcuts modal lists the real shortcuts; About shows the version from `app.getVersion()` (`1.0.0`).
4. `⚙` opens the Settings modal directly; the avatar menu no longer shows "Settings" and shows "People" (which opens Settings).

## Self-Review (completed while writing)

- **Spec coverage:** header cluster (T3–T5), bell badge distinct count + 3 groups + empty state + navigation (T1, T3), loadTraceability-on-open gotcha (T3), help shortcuts + About + getVersion IPC (T2, T4), gear→Settings (T5), profile polish drop-Settings/add-People (T5). Shared traceGaps predicate with Dashboard (T1). All covered.
- **Placeholders:** none — every code step carries full code.
- **Type consistency:** `attentionItems`/`traceGaps` signatures and `AttentionItems` shape are identical across T1 (def), T3 (use); `window.api.app.getVersion` typed in T2, consumed in T4; `openRequirement(req)` matches store signature.
