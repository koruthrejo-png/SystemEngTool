import { useStore } from '../../store'
import { Button, Chip, SectionLabel, Select } from '../ui'
import { REQUIREMENT_STATUSES, REQUIREMENT_PRIORITIES, REQUIREMENT_TYPES } from '../../../../types'

const GRID = 'grid grid-cols-[28px_90px_1.5fr_1fr_90px_1fr_100px_92px_80px_36px]'

export default function RequirementsList(): JSX.Element {
  const {
    selectedModuleId, modules, requirements, deletedRequirements,
    showDeleted, setShowDeleted,
    statusFilter, setStatusFilter,
    priorityFilter, setPriorityFilter,
    typeFilter, setTypeFilter,
    selectedRequirementId, selectRequirement,
    addRequirement, removeRequirement, restoreRequirement,
    checkedIds, toggleChecked, setChecked,
    updateRequirements, removeRequirements
  } = useStore()

  if (!selectedModuleId) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-ink-faint">
        Select a module to view its requirements.
      </div>
    )
  }

  const module = modules.find((m) => m.id === selectedModuleId)
  const displayed = (showDeleted ? deletedRequirements : requirements).filter((r) =>
    (statusFilter === 'All' || r.status === statusFilter) &&
    (priorityFilter === 'All' || r.priority === priorityFilter) &&
    (typeFilter === 'All' || r.reqType === typeFilter)
  )
  const allChecked = displayed.length > 0 && displayed.every((r) => checkedIds.includes(r.id))

  async function handleAdd(): Promise<void> {
    await addRequirement({ moduleId: selectedModuleId!, text: '' })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="h-12 px-4 border-b border-line flex items-center justify-between shrink-0 bg-white">
        <span className="text-lg font-semibold tracking-tight text-ink">{module?.name ?? 'Requirements'}</span>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-error"
            />
            <span className="text-xs text-ink-faint">Show deleted</span>
          </label>
          <span className="text-xs text-ink-faint">
            {displayed.length} item{displayed.length !== 1 ? 's' : ''}
          </span>
          {!showDeleted && <Button onClick={handleAdd}>+ New Requirement</Button>}
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="h-10 px-4 border-b border-line bg-white flex items-center gap-5 shrink-0">
        <FilterSelect label="Status" value={statusFilter} options={REQUIREMENT_STATUSES} onChange={setStatusFilter} />
        <FilterSelect label="Priority" value={priorityFilter} options={REQUIREMENT_PRIORITIES} onChange={setPriorityFilter} />
        <FilterSelect label="Type" value={typeFilter} options={REQUIREMENT_TYPES} onChange={setTypeFilter} />
      </div>

      {/* Bulk actions */}
      {!showDeleted && checkedIds.length > 0 && (
        <div className="h-10 px-4 border-b border-line bg-action-tint/30 flex items-center gap-4 shrink-0">
          <span className="text-xs font-medium text-ink">{checkedIds.length} selected</span>
          <BulkSelect label="Set status" options={REQUIREMENT_STATUSES} onApply={(v) => updateRequirements(checkedIds, { status: v })} />
          <BulkSelect label="Set priority" options={REQUIREMENT_PRIORITIES} onApply={(v) => updateRequirements(checkedIds, { priority: v })} />
          <button
            onClick={() => removeRequirements(checkedIds)}
            className="text-xs text-error hover:underline font-medium"
          >
            Delete selected
          </button>
          <button
            onClick={() => setChecked([])}
            className="text-xs text-ink-faint hover:text-ink"
          >
            Clear
          </button>
        </div>
      )}

      {/* Column headers */}
      <div className={`${GRID} gap-x-3 px-4 py-2 border-b border-line bg-workspace shrink-0`}>
        <span className="flex items-center">
          {!showDeleted && (
            <input
              type="checkbox"
              aria-label="Select all"
              checked={allChecked}
              onChange={() => setChecked(allChecked ? [] : displayed.map((r) => r.id))}
              className="w-3.5 h-3.5 rounded accent-action"
            />
          )}
        </span>
        <SectionLabel>ID</SectionLabel>
        <SectionLabel>Requirement</SectionLabel>
        <SectionLabel>Acceptance Criteria</SectionLabel>
        <SectionLabel>Source</SectionLabel>
        <SectionLabel>Rationale</SectionLabel>
        <SectionLabel>Type</SectionLabel>
        <SectionLabel>Status</SectionLabel>
        <SectionLabel>Priority</SectionLabel>
        <span />
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {displayed.length === 0 && (
          <div className="p-4 text-sm text-ink-faint">
            {showDeleted ? 'No deleted requirements.' : 'No requirements match.'}
          </div>
        )}
        {displayed.map((req, i) => (
          <div
            key={req.id}
            onClick={() => !showDeleted && selectRequirement(req.id)}
            className={[
              GRID,
              'gap-x-3 items-start px-4 py-3 border-b border-line/60 group border-l-2',
              i % 2 === 1 ? 'bg-workspace/50' : 'bg-white',
              showDeleted ? 'opacity-60 border-l-transparent' : 'cursor-pointer hover:bg-action-tint/20',
              !showDeleted && selectedRequirementId === req.id
                ? '!bg-action-tint/40 border-l-action'
                : 'border-l-transparent'
            ].join(' ')}
          >
            <div className="flex items-start pt-1" onClick={(e) => e.stopPropagation()}>
              {!showDeleted && (
                <input
                  type="checkbox"
                  aria-label={`Select ${req.reqId}`}
                  checked={checkedIds.includes(req.id)}
                  onChange={() => toggleChecked(req.id)}
                  className="w-3.5 h-3.5 rounded accent-action"
                />
              )}
            </div>
            <span className="text-xs font-mono text-ink-faint pt-0.5 truncate">{req.reqId}</span>
            <span className="text-sm text-ink break-words pr-1">
              {req.text || <span className="text-ink-faint/50 italic">—</span>}
            </span>
            <span className="text-sm text-ink-muted break-words pr-1">
              {req.acceptanceCriteria || <span className="text-ink-faint/50">—</span>}
            </span>
            <span className="text-xs text-ink-muted truncate">
              {req.source || <span className="text-ink-faint/50">—</span>}
            </span>
            <span className="text-sm text-ink-muted break-words pr-1">
              {req.rationale || <span className="text-ink-faint/50">—</span>}
            </span>
            <span className="text-xs text-ink-muted pt-0.5 truncate">{req.reqType}</span>
            <div className="pt-0.5"><Chip value={req.status} /></div>
            <div className="pt-0.5"><Chip value={req.priority} /></div>
            <div className="flex items-start justify-center pt-0.5">
              {showDeleted ? (
                <button
                  onClick={(e) => { e.stopPropagation(); restoreRequirement(req.id) }}
                  className="text-xs text-action hover:text-action-hover font-medium whitespace-nowrap"
                >
                  Restore
                </button>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); removeRequirement(req.id) }}
                  aria-label="Delete requirement"
                  title="Delete requirement"
                  className="opacity-0 group-hover:opacity-100 text-ink-faint hover:text-error transition-opacity text-base leading-none"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FilterSelect<T extends string>({
  label, value, options, onChange
}: {
  label: string
  value: T | 'All'
  options: readonly T[]
  onChange: (value: T | 'All') => void
}): JSX.Element {
  return (
    <label className="flex items-center gap-1.5">
      <SectionLabel>{label}</SectionLabel>
      <Select
        aria-label={`Filter by ${label.toLowerCase()}`}
        value={value}
        onChange={(e) => onChange(e.target.value as T | 'All')}
        className="!w-auto !py-1 !px-2 !text-xs"
      >
        <option value="All">All</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </Select>
    </label>
  )
}

function BulkSelect<T extends string>({
  label, options, onApply
}: {
  label: string
  options: readonly T[]
  onApply: (value: T) => void
}): JSX.Element {
  return (
    <Select
      aria-label={label}
      value=""
      onChange={(e) => { if (e.target.value) onApply(e.target.value as T) }}
      className="!w-auto !py-1 !px-2 !text-xs"
    >
      <option value="" disabled>{label}…</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </Select>
  )
}
