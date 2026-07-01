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
