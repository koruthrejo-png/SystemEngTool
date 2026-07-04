import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useStore } from '../../store'
import { Button, Chip, SectionLabel, Select } from '../ui'
import { REQUIREMENT_STATUSES, REQUIREMENT_PRIORITIES, REQUIREMENT_TYPES } from '../../../../types'

// label '' = structural column (checkbox / actions), not resizable
const COLUMNS = [
  { label: '', width: 28 },
  { label: 'ID', width: 90 },
  { label: 'Requirement', width: 280 },
  { label: 'Acceptance Criteria', width: 200 },
  { label: 'Source', width: 110 },
  { label: 'Rationale', width: 180 },
  { label: 'Type', width: 100 },
  { label: 'Status', width: 92 },
  { label: 'Priority', width: 80 },
  { label: '', width: 56 }
] as const

const MIN_COL_WIDTH = 48
const WIDTHS_STORAGE_KEY = 'reqarch.reqTable.colWidths.v1'

function loadWidths(): number[] {
  try {
    const saved = JSON.parse(localStorage.getItem(WIDTHS_STORAGE_KEY) ?? '')
    if (Array.isArray(saved) && saved.length === COLUMNS.length && saved.every((n) => typeof n === 'number')) {
      return saved
    }
  } catch {
    /* fall through to defaults */
  }
  return COLUMNS.map((c) => c.width)
}

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
  const [colWidths, setColWidths] = useState<number[]>(loadWidths)

  function startResize(e: ReactMouseEvent, index: number): void {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = colWidths[index]
    const onMove = (ev: MouseEvent): void => {
      setColWidths((prev) => {
        const next = [...prev]
        next[index] = Math.max(MIN_COL_WIDTH, Math.round(startWidth + ev.clientX - startX))
        localStorage.setItem(WIDTHS_STORAGE_KEY, JSON.stringify(next))
        return next
      })
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const gridStyle = { gridTemplateColumns: colWidths.map((w) => `${w}px`).join(' ') }

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

      {/* Table (shared horizontal scroll for header + rows) */}
      <div data-testid="req-table-scroll" className="flex-1 overflow-auto">
        <div className="w-max min-w-full">
          {/* Column headers */}
          <div
            data-testid="req-grid-header"
            style={gridStyle}
            className="grid gap-x-3 px-4 py-2 border-b border-line bg-workspace sticky top-0 z-10"
          >
            {COLUMNS.map((col, i) =>
              col.label === '' ? (
                <span key={i} className="flex items-center">
                  {i === 0 && !showDeleted && (
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allChecked}
                      onChange={() => setChecked(allChecked ? [] : displayed.map((r) => r.id))}
                      className="w-3.5 h-3.5 rounded accent-action"
                    />
                  )}
                </span>
              ) : (
                <span key={i} className="relative flex items-center min-w-0">
                  <SectionLabel>{col.label}</SectionLabel>
                  <span
                    role="separator"
                    aria-label={`Resize ${col.label} column`}
                    onMouseDown={(e) => startResize(e, i)}
                    className="absolute -right-2.5 -top-2 -bottom-2 w-2.5 cursor-col-resize flex justify-center group/handle"
                  >
                    <span className="w-px h-full bg-transparent group-hover/handle:bg-action" />
                  </span>
                </span>
              )
            )}
          </div>

          {/* Rows */}
          {displayed.length === 0 && (
            <div className="p-4 text-sm text-ink-faint">
              {showDeleted ? 'No deleted requirements.' : 'No requirements match.'}
            </div>
          )}
          {displayed.map((req, i) => (
          <div
            key={req.id}
            onClick={() => !showDeleted && selectRequirement(req.id)}
            style={gridStyle}
            className={[
              'grid',
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
