import { useEffect } from 'react'
import { useStore } from '../../store'

export default function TraceabilityMatrix(): JSX.Element {
  const { project, projectRequirements, elements, traceLinks, loadTraceability, toggleTraceLink } = useStore()

  useEffect(() => { if (project) loadTraceability() }, [project?.id])

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-ink-faint">
        Open or create a project to view traceability.
      </div>
    )
  }

  const linked = new Set(traceLinks.map((l) => `${l.elementId}:${l.requirementId}`))
  const reqLinkCount = (rid: number): number => traceLinks.filter((l) => l.requirementId === rid).length
  const elLinkCount = (eid: number): number => traceLinks.filter((l) => l.elementId === eid).length
  const linkedReqs = projectRequirements.filter((r) => reqLinkCount(r.id) > 0).length
  const coverage = projectRequirements.length === 0 ? 0 : Math.round((linkedReqs / projectRequirements.length) * 100)

  return (
    <div className="flex flex-col h-full">
      <div className="h-12 px-4 border-b border-line bg-white flex items-center justify-between shrink-0">
        <span className="text-lg font-semibold tracking-tight text-ink">Traceability Matrix</span>
        <div className="flex items-center gap-4 text-xs text-ink-muted" data-testid="coverage-summary">
          <span>Requirements <b className="text-ink">{projectRequirements.length}</b></span>
          <span>Linked <b className="text-ink">{linkedReqs}</b></span>
          <span>Unlinked <b className={projectRequirements.length - linkedReqs > 0 ? 'text-error' : 'text-ink'}>{projectRequirements.length - linkedReqs}</b></span>
          <span className="flex items-center gap-1.5">
            <span className="w-24 h-1.5 rounded bg-line overflow-hidden inline-block">
              <span className="block h-full bg-action" style={{ width: `${coverage}%` }} />
            </span>
            <b className="text-ink">{coverage}%</b>
          </span>
        </div>
      </div>
      {elements.length === 0 || projectRequirements.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-sm text-ink-faint">
          Needs at least one requirement and one object to build the matrix.
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 bg-workspace border-b border-r border-line" />
                {elements.map((el) => (
                  <th key={el.id} className="sticky top-0 z-10 bg-workspace border-b border-line px-1 pt-3 pb-2 align-bottom font-medium text-ink-muted">
                    <span className="[writing-mode:vertical-rl] rotate-180 whitespace-nowrap max-h-44 overflow-hidden inline-block">
                      {el.name ? `${el.name} · ${el.blockId}` : el.blockId}
                    </span>
                  </th>
                ))}
                <th className="sticky top-0 z-10 bg-workspace border-b border-line px-2 pb-2 align-bottom font-medium text-ink-faint">Objects</th>
              </tr>
            </thead>
            <tbody>
              {projectRequirements.map((req) => (
                <tr key={req.id}>
                  <td className="sticky left-0 z-10 bg-white border-b border-r border-line/60 px-3 py-1.5 whitespace-nowrap">
                    <span className="font-mono text-ink-faint mr-2">{req.reqId}</span>
                    <span className="text-ink inline-block max-w-[240px] truncate align-bottom">{req.text}</span>
                  </td>
                  {elements.map((el) => {
                    const on = linked.has(`${el.id}:${req.id}`)
                    return (
                      <td key={el.id} className="border-b border-line/60 text-center p-0">
                        <button
                          aria-label={`${on ? 'Unlink' : 'Link'} ${req.reqId} and ${el.blockId}`}
                          onClick={() => toggleTraceLink(el.id, req.id)}
                          className={`w-9 h-7 ${on ? 'text-action font-bold' : 'text-line hover:text-ink-faint'}`}
                        >
                          {on ? '●' : '·'}
                        </button>
                      </td>
                    )
                  })}
                  <td className={`border-b border-line/60 text-center px-2 font-medium ${reqLinkCount(req.id) === 0 ? 'text-error' : 'text-ink-muted'}`}>
                    {reqLinkCount(req.id)}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="sticky left-0 z-10 bg-workspace border-r border-line px-3 py-1.5 text-ink-faint font-medium whitespace-nowrap">Requirements per object</td>
                {elements.map((el) => (
                  <td key={el.id} className="text-center text-ink-muted bg-workspace font-medium">{elLinkCount(el.id)}</td>
                ))}
                <td className="bg-workspace" />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
