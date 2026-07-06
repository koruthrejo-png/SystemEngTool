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
          <KpiCard label="Objects" value={String(stats.totalObjects)} icon={boxIcon} sub={`${stats.subsystemCount} subsystem${stats.subsystemCount === 1 ? '' : 's'}`} />
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
          <text x="21" y="20.5" textAnchor="middle" className="fill-ink font-sans text-[8px] font-bold">
            {total}
          </text>
          <text x="21" y="26" textAnchor="middle" className="fill-ink-faint font-sans text-[3px] font-semibold tracking-[0.5px]">
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
