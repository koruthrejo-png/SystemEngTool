import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useStore } from '../../store'
import { Button, Chip, SectionLabel, Select } from '../ui'
import { REQUIREMENT_STATUSES, REQUIREMENT_PRIORITIES } from '../../../../types'
import { buildOutline, visibleRows, canReparent, moveTargets, type OutlineRow } from './outline'
import { applyFilters } from './filter'
import FilterPanel from './FilterPanel'

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
    selectedModuleId, modules, requirements, deletedRequirements, acSummary,
    showDeleted, setShowDeleted,
    filterRules, setFilterRules, filterCombine, setFilterCombine,
    selectedRequirementId, selectRequirement,
    addRequirement, updateRequirement, removeRequirement, restoreRequirement,
    checkedIds, toggleChecked, setChecked,
    updateRequirements, removeRequirements,
    headings, collapsedHeadingIds, toggleHeadingCollapsed,
    addHeading, renameHeading, moveHeading, reparentHeading, removeHeading
  } = useStore()
  const [colWidths, setColWidths] = useState<number[]>(loadWidths)
  const [dragReqId, setDragReqId] = useState<number | null>(null)
  const [dragHeadingId, setDragHeadingId] = useState<number | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [movingHeadingId, setMovingHeadingId] = useState<number | null>(null)

  // Every drop target names the section it puts the dragged row into: a heading row names
  // itself, a requirement row names the section it lives in (null = module root).
  function canDropInto(headingId: number | null, targetReqId?: number): boolean {
    if (dragReqId != null) return dragReqId !== targetReqId
    if (dragHeadingId != null) return canReparent(headings, dragHeadingId, headingId)
    return false
  }

  // Drop a requirement row onto a heading (or another req) to move it into that section;
  // drop a heading row the same way to move the whole section — subheadings and
  // requirements follow their parent, so only the dragged heading is written.
  function dropInto(headingId: number | null, targetReqId?: number): void {
    const reqId = dragReqId
    const headId = dragHeadingId
    setDragReqId(null)
    setDragHeadingId(null)
    setDragOverKey(null)
    if (!canDropInto(headingId, targetReqId)) return
    if (reqId != null) {
      const dragged = requirements.find((r) => r.id === reqId)
      if (dragged && dragged.headingId !== headingId) updateRequirement(reqId, { headingId })
    } else if (headId != null) {
      const dragged = headings.find((h) => h.id === headId)
      if (dragged && dragged.parentId !== headingId) reparentHeading(headId, headingId)
    }
  }

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
  const displayed = applyFilters(showDeleted ? deletedRequirements : requirements, filterRules, filterCombine)
  const allChecked = displayed.length > 0 && displayed.every((r) => checkedIds.includes(r.id))
  const rows: OutlineRow[] = showDeleted
    ? displayed.map((r) => ({ kind: 'requirement' as const, requirement: r }))
    : visibleRows(buildOutline(headings, displayed), new Set(collapsedHeadingIds))

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
          {!showDeleted && (
            <>
              <Button variant="secondary" onClick={() => addHeading({ moduleId: selectedModuleId! })}>+ Heading</Button>
              <Button onClick={handleAdd}>+ New Requirement</Button>
            </>
          )}
        </div>
      </div>

      {/* Filter builder */}
      <FilterPanel
        rules={filterRules}
        combine={filterCombine}
        onRulesChange={setFilterRules}
        onCombineChange={setFilterCombine}
      />

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
          {rows.length === 0 && (
            <div className="p-4 text-sm text-ink-faint">
              {showDeleted ? 'No deleted requirements.' : 'No requirements match.'}
            </div>
          )}
          {rows.map((row, i) =>
            row.kind === 'heading' ? (
              <div
                key={`h-${row.heading.id}`}
                data-testid={`heading-row-${row.heading.id}`}
                onDragOver={(e) => { if (canDropInto(row.heading.id)) { e.preventDefault(); setDragOverKey(`h-${row.heading.id}`) } }}
                onDragLeave={() => setDragOverKey((k) => (k === `h-${row.heading.id}` ? null : k))}
                onDrop={(e) => { e.preventDefault(); dropInto(row.heading.id) }}
                className={`flex items-center gap-2 px-4 py-2 border-b border-line bg-workspace group/h ${dragOverKey === `h-${row.heading.id}` ? 'ring-2 ring-inset ring-action' : ''}`}
              >
                <button
                  aria-label={collapsedHeadingIds.includes(row.heading.id) ? 'Expand section' : 'Collapse section'}
                  onClick={() => toggleHeadingCollapsed(row.heading.id)}
                  className="w-4 text-ink-faint hover:text-ink"
                >
                  {collapsedHeadingIds.includes(row.heading.id) ? '▸' : '▾'}
                </button>
                {/* Drag handle. Only the number grabs, not the whole row: a draggable row
                    would stop the title <input> below from selecting text. */}
                <span
                  data-testid={`heading-drag-${row.heading.id}`}
                  title="Drag to move section"
                  draggable
                  onDragStart={(e) => { setDragHeadingId(row.heading.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move' }}
                  onDragEnd={() => { setDragHeadingId(null); setDragOverKey(null) }}
                  className="min-w-[3rem] shrink-0 whitespace-nowrap pr-2 text-xs font-mono text-ink-faint cursor-grab active:cursor-grabbing"
                >
                  {row.number}
                </span>
                {/* fixed width: an <input> can't size to its content, so the toolbar
                    stays next to the title instead of being pushed to the row's edge */}
                <input
                  key={`${row.heading.id}:${row.heading.title}`}
                  aria-label="Heading title"
                  defaultValue={row.heading.title}
                  placeholder="Untitled section"
                  onBlur={(e) => { if (e.target.value !== row.heading.title) renameHeading(row.heading.id, e.target.value) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  className={`w-64 min-w-0 bg-transparent outline-none font-semibold text-ink text-sm ${row.depth === 0 ? 'uppercase tracking-wide' : ''}`}
                />
                <span className="flex items-center gap-3 text-xs opacity-0 group-hover/h:opacity-100 transition-opacity shrink-0">
                  <button aria-label="Move section up" onClick={() => moveHeading(row.heading.id, 'up')} className="text-ink-faint hover:text-ink">↑</button>
                  <button aria-label="Move section down" onClick={() => moveHeading(row.heading.id, 'down')} className="text-ink-faint hover:text-ink">↓</button>
                  <button
                    aria-label="Move section to"
                    title="Move to…"
                    onClick={() => setMovingHeadingId((v) => (v === row.heading.id ? null : row.heading.id))}
                    className="text-ink-faint hover:text-action"
                  >
                    ⇄
                  </button>
                  <button
                    aria-label="Add requirement to section"
                    onClick={() => addRequirement({ moduleId: selectedModuleId!, text: '', headingId: row.heading.id })}
                    className="text-action hover:text-action-hover font-medium whitespace-nowrap"
                  >
                    + Req
                  </button>
                  <button
                    aria-label="Add subheading"
                    onClick={() => addHeading({ moduleId: selectedModuleId!, parentId: row.heading.id })}
                    className="text-action hover:text-action-hover font-medium whitespace-nowrap"
                  >
                    + Sub
                  </button>
                  <button aria-label="Delete section" onClick={() => removeHeading(row.heading.id)} className="text-ink-faint hover:text-error text-base leading-none">×</button>
                </span>
                {/* Keyboard-accessible re-parent (item 31). Mirrors ModuleTree's ⇄ picker;
                    additive to the drag path above. Options exclude self + descendants. */}
                {movingHeadingId === row.heading.id && (
                  <select
                    aria-label={`Move section ${row.number} to`}
                    autoFocus
                    defaultValue={row.heading.parentId === null ? '' : String(row.heading.parentId)}
                    onChange={(e) => {
                      reparentHeading(row.heading.id, e.target.value === '' ? null : Number(e.target.value))
                      setMovingHeadingId(null)
                    }}
                    onBlur={() => setMovingHeadingId(null)}
                    className="text-xs border border-line rounded px-1 py-1 bg-white text-ink focus:outline-none focus:border-action shrink-0"
                  >
                    <option value="">(top level)</option>
                    {moveTargets(headings, row.heading.id).map(({ heading, number }) => (
                      <option key={heading.id} value={heading.id}>{number} {heading.title || 'Untitled section'}</option>
                    ))}
                  </select>
                )}
              </div>
            ) : (
              (() => {
                const req = row.requirement
                return (
                  <div
                    key={req.id}
                    onClick={() => !showDeleted && selectRequirement(req.id)}
                    draggable={!showDeleted}
                    onDragStart={(e) => { setDragReqId(req.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move' }}
                    onDragEnd={() => { setDragReqId(null); setDragOverKey(null) }}
                    onDragOver={(e) => { if (canDropInto(req.headingId, req.id)) { e.preventDefault(); setDragOverKey(`r-${req.id}`) } }}
                    onDragLeave={() => setDragOverKey((k) => (k === `r-${req.id}` ? null : k))}
                    onDrop={(e) => { e.preventDefault(); dropInto(req.headingId, req.id) }}
                    style={gridStyle}
                    className={[
                    'grid',
                    'gap-x-3 items-start px-4 py-3 border-b border-line/60 group border-l-2',
                    i % 2 === 1 ? 'bg-workspace/50' : 'bg-white',
                    showDeleted ? 'opacity-60 border-l-transparent' : 'cursor-pointer hover:bg-action-tint/20',
                    dragOverKey === `r-${req.id}` ? 'ring-2 ring-inset ring-action' : '',
                    !showDeleted && selectedRequirementId === req.id
                      ? '!bg-action-tint/40 border-l-action'
                      : 'border-l-transparent'
                  ].join(' ')}>
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
                      {acSummary[req.id] ? (
                        <>
                          <span className="text-xs font-mono text-ink-faint mr-1.5">
                            {acSummary[req.id].passed}/{acSummary[req.id].total}
                          </span>
                          {acSummary[req.id].first}
                        </>
                      ) : (
                        <span className="text-ink-faint/50">—</span>
                      )}
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
                )
              })()
            )
          )}
        </div>
      </div>
    </div>
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
