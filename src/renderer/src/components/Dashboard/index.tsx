import { useEffect } from 'react'
import { useStore } from '../../store'
import { SectionLabel } from '../ui'
import { computeStats } from './stats'
import type { Requirement } from '../../../../types'

export default function Dashboard(): JSX.Element {
  const { project, projectRequirements, elements, traceLinks, loadTraceability, openRequirement } = useStore()

  useEffect(() => { if (project) loadTraceability() }, [project?.id])

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-ink-faint">
        Open or create a project to view the dashboard.
      </div>
    )
  }

  const stats = computeStats(projectRequirements, elements, traceLinks)

  return (
    <div className="h-full overflow-y-auto bg-workspace">
      <div className="p-6 flex flex-col gap-5 max-w-5xl">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{project.name} — Project Dashboard</h1>

        <div className="grid grid-cols-4 gap-4" data-testid="kpi-cards">
          <KpiCard label="Requirements" value={String(stats.totalRequirements)} />
          <KpiCard label="Objects" value={String(stats.totalObjects)} />
          <KpiCard label="Allocation coverage" value={`${stats.coveragePct}%`} />
          <KpiCard label="Unallocated" value={String(stats.unallocated.length)} alert={stats.unallocated.length > 0} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <BreakdownCard title="By Status" data={stats.byStatus} total={stats.totalRequirements} />
          <BreakdownCard title="By Priority" data={stats.byPriority} total={stats.totalRequirements} />
          <BreakdownCard title="By Type" data={stats.byType} total={stats.totalRequirements} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <ReqListCard
            title="Unallocated requirements"
            empty="Every requirement is allocated to an object."
            reqs={stats.unallocated}
            onOpen={openRequirement}
          />
          <ReqListCard
            title="Recently updated"
            empty="No requirements yet."
            reqs={stats.recent}
            onOpen={openRequirement}
          />
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, alert = false }: { label: string; value: string; alert?: boolean }): JSX.Element {
  return (
    <div className="bg-white border border-line rounded p-4">
      <SectionLabel className="block mb-1">{label}</SectionLabel>
      <div className={`text-2xl font-semibold tracking-tight ${alert ? 'text-error' : 'text-ink'}`}>{value}</div>
    </div>
  )
}

function BreakdownCard({ title, data, total }: { title: string; data: [string, number][]; total: number }): JSX.Element {
  return (
    <div className="bg-white border border-line rounded p-4">
      <SectionLabel className="block mb-3">{title}</SectionLabel>
      {data.length === 0 && <div className="text-xs text-ink-faint">No requirements.</div>}
      <div className="space-y-2">
        {data.map(([label, count]) => (
          <div key={label} className="text-xs">
            <div className="flex justify-between mb-0.5">
              <span className="text-ink">{label}</span>
              <span className="text-ink-muted">{count}</span>
            </div>
            <div className="h-1.5 rounded bg-workspace overflow-hidden">
              <div className="h-full bg-action" style={{ width: `${total === 0 ? 0 : Math.round((count / total) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReqListCard({
  title, empty, reqs, onOpen
}: {
  title: string
  empty: string
  reqs: Requirement[]
  onOpen: (req: Requirement) => Promise<void>
}): JSX.Element {
  return (
    <div className="bg-white border border-line rounded p-4">
      <SectionLabel className="block mb-2">{title}</SectionLabel>
      {reqs.length === 0 && <div className="text-xs text-ink-faint">{empty}</div>}
      <div className="divide-y divide-line/60">
        {reqs.map((r) => (
          <button
            key={r.id}
            onClick={() => onOpen(r)}
            className="w-full text-left py-1.5 flex gap-2 items-baseline hover:bg-action-tint/20 px-1 rounded"
          >
            <span className="text-xs font-mono text-ink-faint shrink-0">{r.reqId}</span>
            <span className="text-xs text-ink truncate">{r.text || <i className="text-ink-faint/50">—</i>}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
