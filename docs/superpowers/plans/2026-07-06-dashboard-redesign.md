# Dashboard Executive Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Dashboard tab to the user's executive-mockup visual language (icon KPI cards, status donut, per-module traceability bars, activity feed, critical-gaps panel) using only real project data.

**Architecture:** Pure-function stats extension (`Dashboard/stats.ts`) feeds a rewritten presentational `Dashboard/index.tsx`. Zero schema/IPC/preload/store changes — everything derives from store state already loaded (`projectRequirements`, `elements`, `traceLinks`, `modules`). Donut and bars are hand-rolled SVG/div, no chart library.

**Tech Stack:** React + TypeScript, zustand store (read-only consumption), Tailwind semantic tokens, vitest + @testing-library/react.

Spec: `docs/superpowers/specs/2026-07-06-dashboard-redesign-design.md`

## Global Constraints

- Renderer NEVER touches the DB directly — all data flows through `window.api` (this plan adds NO new api methods).
- Tailwind semantic tokens only in classNames (`text-ink`, `bg-workspace`, `border-line`, `bg-action`, `text-error`, `bg-navy/10`, etc.; `bg-white`/`text-white` are established convention). EXCEPTION defined by this plan: SVG presentation attributes (`stroke`, `fill`) may use the hex constants in `STATUS_COLORS`/track hex `#e2e8f0`, which mirror tailwind.config.js tokens — classes themselves stay token-only.
- Status donut colors are fixed by entity (never by rank): Approved `#42682d` (action), Review `#1a365d` (navy), Draft `#64748b` (ink-faint), Rejected `#ba1a1a` (error). Identity is never color-alone: legend always shows dot + name + count + %.
- Tests: `./node_modules/.bin/vitest run <paths>` — NEVER `npm run` (npm shim broken). Typecheck: `./node_modules/.bin/tsc --noEmit -p tsconfig.web.json` and `./node_modules/.bin/tsc --noEmit -p tsconfig.node.json`.
- Do NOT write vitest tests under `src/main/**` (better-sqlite3 ABI mismatch — 47 pre-existing main-process failures + 1 pre-existing ArchitectureCanvas "connection mode toggle" failure are the baseline). All renderer tests must pass.
- Commits go straight to `main`. Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- PATH prefix required in every shell: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"`.
- Out of scope (do NOT build): sidebar chrome, breadcrumb, footer, Export Report, Sync Models, avatars, audit log, verification/compliance data models.

---

### Task 1: Stats extension — per-module coverage, weekly trend, critical gaps, timeAgo

**Files:**
- Modify: `src/renderer/src/components/Dashboard/stats.ts`
- Test: `src/renderer/src/components/Dashboard/stats.test.ts` (append tests; existing tests keep passing unchanged — new params have defaults)

**Interfaces:**
- Consumes: existing `computeStats(requirements, elements, links)` and its `DashboardStats`.
- Produces (Task 2 relies on): `computeStats(requirements: Requirement[], elements: ArchitectureElement[], links: ElementRequirementLink[], modules: Module[] = [], now: Date = new Date()): DashboardStats` with NEW fields `createdThisWeek: number`, `subsystemCount: number`, `perModule: ModuleCoverage[]`, `criticalGaps: Requirement[]`; exported `interface ModuleCoverage { moduleId: number; name: string; total: number; linked: number; pct: number }`; exported `timeAgo(iso: string, now?: Date): string`.

- [ ] **Step 1: Write the failing tests**

Append to `src/renderer/src/components/Dashboard/stats.test.ts` (inside the existing `describe('computeStats', …)` block add the first four; `timeAgo` gets its own describe at file end; extend the existing imports with `timeAgo`):

```ts
  it('counts requirements created within the last 7 days', () => {
    const now = new Date('2026-07-06T12:00:00Z')
    const s = computeStats(
      [
        req({ id: 1, createdAt: '2026-07-05T12:00:00Z' }), // 1 day ago → in
        req({ id: 2, createdAt: '2026-06-29T13:00:00Z' }), // 6.96 days ago → in
        req({ id: 3, createdAt: '2026-06-28T12:00:00Z' }) // 8 days ago → out
      ],
      [], [], [], now
    )
    expect(s.createdThisWeek).toBe(2)
  })

  it('computes per-module coverage and omits requirement-less modules', () => {
    const modules = [
      { id: 1, name: 'SRS', position: 0 } as any,
      { id: 2, name: 'HW', position: 1 } as any,
      { id: 3, name: 'Empty', position: 2 } as any
    ]
    const s = computeStats(
      [req({ id: 1, moduleId: 1 }), req({ id: 2, moduleId: 1 }), req({ id: 3, moduleId: 2 })],
      [el],
      [{ elementId: 1, requirementId: 1 }],
      modules
    )
    expect(s.perModule).toEqual([
      { moduleId: 1, name: 'SRS', total: 2, linked: 1, pct: 50 },
      { moduleId: 2, name: 'HW', total: 1, linked: 0, pct: 0 }
    ])
  })

  it('collects high-priority unallocated requirements as critical gaps', () => {
    const s = computeStats(
      [
        req({ id: 1, priority: 'High' }), // linked → not a gap
        req({ id: 2, priority: 'High' }), // unallocated High → gap
        req({ id: 3, priority: 'Medium' }) // unallocated but Medium → not a gap
      ],
      [el],
      [{ elementId: 1, requirementId: 1 }]
    )
    expect(s.criticalGaps.map((r) => r.id)).toEqual([2])
  })

  it('counts top-level elements as subsystems', () => {
    const s = computeStats([], [el, { ...el, id: 2, parentId: 1 }], [])
    expect(s.totalObjects).toBe(2)
    expect(s.subsystemCount).toBe(1)
  })
```

```ts
describe('timeAgo', () => {
  const now = new Date('2026-07-06T12:00:00Z')
  it('formats minutes, hours, days and just-now', () => {
    expect(timeAgo('2026-07-06T11:59:40Z', now)).toBe('just now')
    expect(timeAgo('2026-07-06T11:15:00Z', now)).toBe('45m ago')
    expect(timeAgo('2026-07-06T09:00:00Z', now)).toBe('3h ago')
    expect(timeAgo('2026-07-03T12:00:00Z', now)).toBe('3d ago')
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/Dashboard/stats.test.ts`
Expected: FAIL — `timeAgo` not exported; `createdThisWeek`/`perModule`/`criticalGaps`/`subsystemCount` undefined. The 4 pre-existing tests still pass.

- [ ] **Step 3: Implement the extension**

In `src/renderer/src/components/Dashboard/stats.ts`, add `Module` to the type import, add the two exports, and extend `computeStats` (existing fields unchanged):

```ts
import type { Requirement, ArchitectureElement, ElementRequirementLink, Module } from '../../../../types'

export interface ModuleCoverage {
  moduleId: number
  name: string
  total: number
  linked: number
  pct: number
}

export function timeAgo(iso: string, now: Date = new Date()): string {
  const m = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
```

`DashboardStats` gains:

```ts
  createdThisWeek: number
  subsystemCount: number
  perModule: ModuleCoverage[]
  criticalGaps: Requirement[]
```

New signature and added return fields (`linkedIds`/`unallocated` already exist in the function body):

```ts
export function computeStats(
  requirements: Requirement[],
  elements: ArchitectureElement[],
  links: ElementRequirementLink[],
  modules: Module[] = [],
  now: Date = new Date()
): DashboardStats {
  const linkedIds = new Set(links.map((l) => l.requirementId))
  const unallocated = requirements.filter((r) => !linkedIds.has(r.id))
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000
  return {
    // …existing fields exactly as they are…
    createdThisWeek: requirements.filter((r) => new Date(r.createdAt).getTime() >= weekAgo).length,
    subsystemCount: elements.filter((e) => e.parentId === null).length,
    perModule: modules
      .map((m) => {
        const reqs = requirements.filter((r) => r.moduleId === m.id)
        const linked = reqs.filter((r) => linkedIds.has(r.id)).length
        return {
          moduleId: m.id,
          name: m.name,
          total: reqs.length,
          linked,
          pct: reqs.length === 0 ? 0 : Math.round((linked / reqs.length) * 100)
        }
      })
      .filter((m) => m.total > 0),
    criticalGaps: unallocated.filter((r) => r.priority === 'High')
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/Dashboard/stats.test.ts`
Expected: PASS (9 tests: 4 pre-existing + 5 new).

- [ ] **Step 5: Typecheck and commit**

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.web.json
git add src/renderer/src/components/Dashboard/stats.ts src/renderer/src/components/Dashboard/stats.test.ts
git commit -m "feat(dashboard): stats for weekly trend, per-module coverage, critical gaps, timeAgo

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Dashboard component rewrite — executive layout

**Files:**
- Modify: `src/renderer/src/components/Dashboard/index.tsx` (full rewrite)
- Test: `src/renderer/src/components/Dashboard/index.test.tsx` (full rewrite)

**Interfaces:**
- Consumes: Task 1's `computeStats(requirements, elements, links, modules)`, `timeAgo(iso)`, `ModuleCoverage`; store fields `project`, `projectRequirements`, `elements`, `traceLinks`, `modules`, `loadTraceability`, `openRequirement`, `setActiveTab`; `SectionLabel` and `Chip` from `../ui`.
- Produces: nothing consumed later — `App.tsx` keeps importing the default export unchanged.

- [ ] **Step 1: Write the failing component tests**

Replace `src/renderer/src/components/Dashboard/index.test.tsx` entirely:

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
  headingId: null, position: 0, deletedAt: null,
  createdAt: '2026-01-01', updatedAt: '2026-01-01', ...extra
})

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(storeState, {
    project: { id: 1, name: 'Demo' },
    projectRequirements: [
      req(1, { status: 'Approved' }),
      req(2, { priority: 'High', updatedAt: '2026-01-02' })
    ],
    elements: [
      { id: 1, projectId: 1, parentId: null, blockId: 'SYS-001', name: '', elementTypeId: null, description: null, color: null, posX: 0, posY: 0, width: 160, height: 80, deletedAt: null, createdAt: '', updatedAt: '' },
      { id: 2, projectId: 1, parentId: 1, blockId: 'SYS-002', name: '', elementTypeId: null, description: null, color: null, posX: 0, posY: 0, width: 160, height: 80, deletedAt: null, createdAt: '', updatedAt: '' }
    ],
    modules: [{ id: 1, name: 'SRS', position: 0 }],
    traceLinks: [{ elementId: 1, requirementId: 1 }],
    loadTraceability: vi.fn().mockResolvedValue(undefined),
    openRequirement: vi.fn().mockResolvedValue(undefined),
    setActiveTab: vi.fn()
  })
})

describe('Dashboard (executive layout)', () => {
  it('renders the four KPI cards with real values', () => {
    render(<Dashboard />)
    const kpis = screen.getByTestId('kpi-cards')
    expect(within(kpis).getByText('Total Requirements')).toBeInTheDocument()
    expect(within(kpis).getByText('Allocation Coverage')).toBeInTheDocument()
    expect(within(kpis).getByText('50%')).toBeInTheDocument()
    expect(within(kpis).getByText('Trace Gaps')).toBeInTheDocument()
    // SRS-2 is High priority and unallocated → 1 gap
    expect(within(within(kpis).getByText('Trace Gaps').closest('div')!.parentElement!).getByText('1')).toBeInTheDocument()
    expect(within(kpis).getByText('1 subsystems')).toBeInTheDocument()
  })

  it('renders the status donut with a legend entry per status', () => {
    render(<Dashboard />)
    const donut = screen.getByTestId('status-donut')
    expect(within(donut).getByText('Approved')).toBeInTheDocument()
    expect(within(donut).getByText('Draft')).toBeInTheDocument()
    expect(within(donut).getAllByText(/50%/).length).toBeGreaterThanOrEqual(1)
  })

  it('renders per-module coverage bars', () => {
    render(<Dashboard />)
    const bars = screen.getByTestId('module-bars')
    expect(within(bars).getByText('SRS')).toBeInTheDocument()
    expect(within(bars).getByText('50% linked')).toBeInTheDocument()
  })

  it('renders recent activity with badges and opens a requirement on click', () => {
    render(<Dashboard />)
    const activity = screen.getByTestId('recent-activity')
    expect(within(activity).getAllByText('CREATED').length).toBe(1) // SRS-1: createdAt === updatedAt
    expect(within(activity).getAllByText('EDITED').length).toBe(1) // SRS-2: differs
    fireEvent.click(within(activity).getByText('SRS-1').closest('button')!)
    expect(storeState.openRequirement).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  })

  it('renders critical gaps and the traceability shortcut', () => {
    render(<Dashboard />)
    const gaps = screen.getByTestId('critical-gaps')
    expect(within(gaps).getByText('SRS-2')).toBeInTheDocument()
    fireEvent.click(within(gaps).getByText('SRS-2').closest('button')!)
    expect(storeState.openRequirement).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }))
    fireEvent.click(screen.getByText('Open Traceability Matrix'))
    expect(storeState.setActiveTab).toHaveBeenCalledWith('traceability')
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

- [ ] **Step 2: Run tests to verify they fail**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/Dashboard/index.test.tsx`
Expected: FAIL — `status-donut`, `module-bars`, `recent-activity`, `critical-gaps` test ids don't exist; KPI labels differ.

- [ ] **Step 3: Rewrite the component**

Replace `src/renderer/src/components/Dashboard/index.tsx` entirely:

```tsx
import { useEffect } from 'react'
import { useStore } from '../../store'
import { SectionLabel, Chip } from '../ui'
import { computeStats, timeAgo } from './stats'
import type { ModuleCoverage } from './stats'
import type { Requirement } from '../../../../types'

// Chart-mark colors: hex mirrors of tailwind tokens (SVG attrs can't take classes).
// Fixed per status entity — see plan Global Constraints.
const STATUS_COLORS: Record<string, string> = {
  Approved: '#42682d', // action
  Review: '#1a365d', // navy
  Draft: '#64748b', // ink-faint
  Rejected: '#ba1a1a' // error
}
const TRACK_COLOR = '#e2e8f0' // line

const docIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M9 13h6M9 17h6" />
  </svg>
)
const boxIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
  </svg>
)
const badgeIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12l2.5 2.5 4.5-4.5" />
  </svg>
)
const warnIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
)

export default function Dashboard(): JSX.Element {
  const {
    project, projectRequirements, elements, traceLinks, modules,
    loadTraceability, openRequirement, setActiveTab
  } = useStore()

  useEffect(() => { if (project) loadTraceability() }, [project?.id])

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-ink-faint">
        Open or create a project to view the dashboard.
      </div>
    )
  }

  const stats = computeStats(projectRequirements, elements, traceLinks, modules)

  return (
    <div className="h-full overflow-y-auto bg-workspace">
      <div className="p-6 flex flex-col gap-5 max-w-6xl">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{project.name} — Project Dashboard</h1>

        <div className="grid grid-cols-4 gap-4" data-testid="kpi-cards">
          <KpiCard
            label="Total Requirements"
            value={String(stats.totalRequirements)}
            icon={docIcon}
            sub={stats.createdThisWeek > 0
              ? <span className="text-action font-medium">↗ +{stats.createdThisWeek} this week</span>
              : undefined}
          />
          <KpiCard label="Objects" value={String(stats.totalObjects)} icon={boxIcon} sub={`${stats.subsystemCount} subsystems`} />
          <KpiCard
            label="Allocation Coverage"
            value={`${stats.coveragePct}%`}
            icon={badgeIcon}
            sub={
              <span className="block w-full h-1.5 rounded bg-line overflow-hidden mt-1">
                <span className="block h-full bg-action" style={{ width: `${stats.coveragePct}%` }} />
              </span>
            }
          />
          <KpiCard
            label="Trace Gaps"
            value={String(stats.criticalGaps.length)}
            icon={warnIcon}
            alert={stats.criticalGaps.length > 0}
            sub="High priority unallocated"
          />
        </div>

        <div className="grid grid-cols-5 gap-4">
          <div className="col-span-2">
            <DonutCard byStatus={stats.byStatus} total={stats.totalRequirements} />
          </div>
          <div className="col-span-3">
            <ModuleBarsCard perModule={stats.perModule} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <ActivityCard reqs={stats.recent} onOpen={openRequirement} />
          <GapsCard
            gaps={stats.criticalGaps}
            onOpen={openRequirement}
            onMatrix={() => setActiveTab('traceability')}
          />
        </div>
      </div>
    </div>
  )
}

function KpiCard({
  label, value, icon, sub, alert = false
}: {
  label: string
  value: string
  icon: JSX.Element
  sub?: React.ReactNode
  alert?: boolean
}): JSX.Element {
  return (
    <div className="bg-white border border-line rounded p-4">
      <div className="flex items-start justify-between">
        <SectionLabel className="block mb-1">{label}</SectionLabel>
        <span className={alert ? 'text-error' : 'text-ink-faint'}>{icon}</span>
      </div>
      <div className={`text-2xl font-semibold tracking-tight ${alert ? 'text-error' : 'text-ink'}`}>{value}</div>
      {sub !== undefined && <div className="text-[11px] text-ink-muted mt-0.5">{sub}</div>}
    </div>
  )
}

function DonutCard({ byStatus, total }: { byStatus: [string, number][]; total: number }): JSX.Element {
  // 100-unit circumference donut (r = 100 / 2π); offset starts at 12 o'clock (+25).
  let offset = 25
  const segs = byStatus.map(([status, count]) => {
    const pct = total === 0 ? 0 : (count / total) * 100
    const seg = { status, count, pct, offset }
    offset -= pct
    return seg
  })
  return (
    <div className="bg-white border border-line rounded p-4 h-full" data-testid="status-donut">
      <SectionLabel className="block mb-3">Requirement Status</SectionLabel>
      <div className="flex items-center gap-6">
        <svg viewBox="0 0 42 42" className="w-36 h-36 shrink-0" role="img" aria-label="Requirement status breakdown">
          <circle cx="21" cy="21" r="15.9155" fill="none" stroke={TRACK_COLOR} strokeWidth="5" />
          {segs.map((s) => {
            if (s.pct <= 0) return null
            const dash = Math.max(s.pct - 1, 0.5) // 1-unit gap between segments
            return (
              <circle
                key={s.status}
                cx="21" cy="21" r="15.9155" fill="none"
                stroke={STATUS_COLORS[s.status] ?? TRACK_COLOR}
                strokeWidth="5"
                strokeDasharray={`${dash} ${100 - dash}`}
                strokeDashoffset={s.offset}
              />
            )
          })}
          <text x="21" y="20.5" textAnchor="middle" className="fill-ink" style={{ font: '700 8px Inter, sans-serif' }}>
            {total}
          </text>
          <text x="21" y="26" textAnchor="middle" className="fill-ink-faint" style={{ font: '600 3px Inter, sans-serif', letterSpacing: '0.5px' }}>
            ACTIVE
          </text>
        </svg>
        <div className="flex flex-col gap-2 text-xs">
          {segs.map((s) => (
            <div key={s.status} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ background: STATUS_COLORS[s.status] ?? TRACK_COLOR }} />
              <span className="text-ink">{s.status}</span>
              <span className="text-ink-muted">{s.count} ({Math.round(s.pct)}%)</span>
            </div>
          ))}
          {total === 0 && <div className="text-ink-faint">No requirements.</div>}
        </div>
      </div>
    </div>
  )
}

function ModuleBarsCard({ perModule }: { perModule: ModuleCoverage[] }): JSX.Element {
  return (
    <div className="bg-white border border-line rounded p-4 h-full" data-testid="module-bars">
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Traceability Coverage by Module</SectionLabel>
        <span className="flex items-center gap-3 text-[11px] text-ink-muted">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-action inline-block" />Linked</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-line inline-block" />Unlinked</span>
        </span>
      </div>
      {perModule.length === 0 && <div className="text-xs text-ink-faint">No requirements yet.</div>}
      <div className="space-y-3">
        {perModule.map((m) => (
          <div key={m.moduleId} className="text-xs" title={`${m.linked} of ${m.total} requirements linked`}>
            <div className="flex justify-between mb-1">
              <span className="text-ink font-medium">{m.name}</span>
              <span className="text-ink-muted">{m.pct}% linked</span>
            </div>
            <div className="h-2 rounded bg-line overflow-hidden">
              <div className="h-full bg-action" style={{ width: `${m.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ActivityCard({
  reqs, onOpen
}: {
  reqs: Requirement[]
  onOpen: (req: Requirement) => Promise<void>
}): JSX.Element {
  return (
    <div className="bg-white border border-line rounded p-4" data-testid="recent-activity">
      <SectionLabel className="block mb-2">Recent Activity</SectionLabel>
      {reqs.length === 0 && <div className="text-xs text-ink-faint">No requirements yet.</div>}
      <div className="divide-y divide-line/60">
        {reqs.map((r) => {
          const created = r.createdAt === r.updatedAt
          return (
            <button
              key={r.id}
              onClick={() => onOpen(r)}
              className="w-full text-left py-1.5 px-1 rounded flex items-center gap-2 hover:bg-action-tint/20"
            >
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${created ? 'bg-action-tint text-action-hover' : 'bg-navy/10 text-navy'}`}>
                {created ? 'CREATED' : 'EDITED'}
              </span>
              <span className="text-xs font-mono text-ink-faint shrink-0">{r.reqId}</span>
              <span className="text-xs text-ink truncate flex-1">{r.text || '—'}</span>
              <span className="text-[11px] text-ink-faint shrink-0">{timeAgo(r.updatedAt)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function GapsCard({
  gaps, onOpen, onMatrix
}: {
  gaps: Requirement[]
  onOpen: (req: Requirement) => Promise<void>
  onMatrix: () => void
}): JSX.Element {
  return (
    <div className="bg-white border border-line rounded p-4 flex flex-col" data-testid="critical-gaps">
      <div className="flex items-center gap-1.5 mb-2 text-error">
        {warnIcon}
        <SectionLabel className="!text-error">Critical Trace Gaps</SectionLabel>
      </div>
      {gaps.length === 0 && (
        <div className="text-xs text-ink-faint">No high-priority requirements are unallocated.</div>
      )}
      <div className="space-y-2 flex-1">
        {gaps.slice(0, 5).map((r) => (
          <button
            key={r.id}
            onClick={() => onOpen(r)}
            className="w-full text-left border border-line rounded p-2.5 hover:border-action"
          >
            <span className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono text-ink-faint">{r.reqId}</span>
              <Chip value={r.priority} />
            </span>
            <span className="block text-xs text-ink truncate">{r.text || <i className="text-ink-faint/50">—</i>}</span>
          </button>
        ))}
      </div>
      <button onClick={onMatrix} className="mt-3 text-xs font-medium text-action hover:text-action-hover self-center">
        Open Traceability Matrix
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run the component tests**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/Dashboard`
Expected: PASS (6 component tests + 9 stats tests).

- [ ] **Step 5: Full renderer suite + typecheck**

```bash
./node_modules/.bin/vitest run src/renderer
./node_modules/.bin/tsc --noEmit -p tsconfig.web.json
./node_modules/.bin/tsc --noEmit -p tsconfig.node.json
```
Expected: renderer suite green except the 1 pre-existing ArchitectureCanvas failure (note: `App.test.tsx` mocks Dashboard, so it is unaffected); both typechecks clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/Dashboard
git commit -m "feat(dashboard): executive layout — icon KPIs, status donut, module coverage bars, activity feed, critical gaps

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Post-plan verification (controller, not a task)

Build (`./node_modules/.bin/electron-vite build`), relaunch via the Playwright driver (`.claude/skills/run-app/driver.mjs`), and verify on the SmokeTest project: 4 KPI cards with icons and real numbers (+N this week only if reqs created in last 7 days), donut segments + legend percentages sum sensibly, SRS module bar shows its real linked %, Recent Activity badges and time-ago, Critical Trace Gaps lists High-priority unallocated reqs, gap card click opens the requirement, "Open Traceability Matrix" switches tabs. Screenshot against mockup for overall fidelity.
