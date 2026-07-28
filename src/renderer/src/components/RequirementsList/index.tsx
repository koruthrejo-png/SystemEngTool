import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useStore } from '../../store'
import { isTyping } from '../ArchitectureCanvas/deleteKey'
import { Button, Chip, SectionLabel, Select } from '../ui'
import { REQUIREMENT_STATUSES, REQUIREMENT_PRIORITIES } from '../../../../types'
import { buildOutline, visibleRows, canReparent, moveTargets, type OutlineRow } from './outline'
import { applyFilters } from './filter'
import FilterPanel from './FilterPanel'
import HeaderMenu from '../HeaderMenu'

// The checkbox (left) and actions (right) columns are structural: fixed position/width,
// never reordered or resized. Only these data columns in between are drag-reorderable and
// resizable, keyed so the header and every row body cell follow the same live order.
type DataColKey = 'reqId' | 'entryType' | 'text' | 'ac' | 'source' | 'rationale' | 'reqType' | 'status' | 'priority' | 'verificationMethod'
interface DataCol {
  key: DataColKey
  label: string
  width: number
  hidden?: boolean
}

const CHECKBOX_WIDTH = 28
const ACTIONS_WIDTH = 56
const MIN_COL_WIDTH = 48
const COLUMNS_STORAGE_KEY = 'reqarch.reqTable.columns.v3'

// Grow a textarea to fit its content (inline-edit cells have no fixed height).
function autoGrow(el: HTMLTextAreaElement): void {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

// Excel-style always-editable cell for free-text fields. Uncontrolled (defaultValue) so
// typing is smooth; remount via a `key` at the call site when the stored value changes.
// stopPropagation on mousedown so clicking to place the caret doesn't start the row drag;
// click/dblclick are left to bubble so the row still highlights / opens the drawer.
function EditableCell({ value, multiline, onSave, allowEmpty = true }: {
  value: string
  multiline: boolean
  onSave: (v: string) => void
  allowEmpty?: boolean
}): JSX.Element {
  // Plain-text look: no visible box until you hover or focus, so unselected rows read clean.
  const base =
    'w-full bg-transparent border border-transparent rounded px-1.5 py-0.5 hover:border-line/70 focus:border-action focus:bg-white focus:outline-none transition-colors'
  function commit(el: HTMLInputElement | HTMLTextAreaElement): void {
    const trimmed = el.value.trim()
    if (!allowEmpty && trimmed === '') { el.value = value; return } // NOT NULL field: revert
    if (trimmed !== value) onSave(trimmed)
    else el.value = value
  }
  if (multiline) {
    return (
      <textarea
        defaultValue={value}
        rows={1}
        ref={(el) => { if (el) autoGrow(el) }}
        onInput={(e) => autoGrow(e.currentTarget)}
        onMouseDown={(e) => e.stopPropagation()}
        onBlur={(e) => commit(e.currentTarget)}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.currentTarget.value = value; e.currentTarget.blur() } }}
        className={`${base} text-sm text-ink leading-snug resize-none overflow-hidden block`}
      />
    )
  }
  return (
    <input
      defaultValue={value}
      onMouseDown={(e) => e.stopPropagation()}
      onBlur={(e) => commit(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') { e.currentTarget.value = value; e.currentTarget.blur() }
      }}
      className={`${base} text-xs text-ink-muted`}
    />
  )
}

const DEFAULT_DATA_COLUMNS: DataCol[] = [
  { key: 'reqId', label: 'ID', width: 90 },
  { key: 'entryType', label: 'Entry Type', width: 120 },
  { key: 'text', label: 'Text', width: 280 },
  { key: 'ac', label: 'Acceptance Criteria', width: 200 },
  { key: 'source', label: 'Source', width: 110 },
  { key: 'rationale', label: 'Rationale', width: 180 },
  { key: 'reqType', label: 'Type', width: 100 },
  { key: 'status', label: 'Status', width: 92 },
  { key: 'priority', label: 'Priority', width: 80 },
  { key: 'verificationMethod', label: 'Verification Method', width: 140 }
]

const DEFAULT_KEYS = DEFAULT_DATA_COLUMNS.map((c) => c.key).sort().join(',')

// Restore saved order + widths, but only if the set of keys still matches the defaults
// exactly (guards against a stale saved layout after columns are added/removed in code).
// Labels always come from code so a rename like Requirement → Text takes effect on reload.
function loadColumns(): DataCol[] {
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMNS_STORAGE_KEY) ?? '') as DataCol[]
    const keysMatch =
      Array.isArray(saved) &&
      saved.every((c) => typeof c?.width === 'number') &&
      saved.map((c) => c.key).sort().join(',') === DEFAULT_KEYS
    if (keysMatch) {
      return saved.map((c) => ({ ...DEFAULT_DATA_COLUMNS.find((d) => d.key === c.key)!, width: c.width, hidden: !!c.hidden }))
    }
  } catch {
    /* fall through to defaults */
  }
  return DEFAULT_DATA_COLUMNS.map((c) => ({ ...c }))
}

export default function RequirementsList(): JSX.Element {
  const {
    selectedModuleId, modules, requirements, deletedRequirements,
    showDeleted, setShowDeleted,
    filterRules, setFilterRules, filterCombine, setFilterCombine,
    selectedRequirementId, selectRequirement,
    addRequirement, addRequirementBelow, duplicateRequirement, updateRequirement, removeRequirement, restoreRequirement,
    checkedIds, toggleChecked, setChecked,
    updateRequirements, removeRequirements,
    headings, collapsedHeadingIds, toggleHeadingCollapsed,
    addHeading, renameHeading, moveHeading, reparentHeading, removeHeading,
    exportCsv, exportReqif, importCsv
  } = useStore()
  const [columns, setColumns] = useState<DataCol[]>(loadColumns)
  const [dragCol, setDragCol] = useState<DataColKey | null>(null)
  const [dragOverCol, setDragOverCol] = useState<DataColKey | null>(null)
  const [dragReqId, setDragReqId] = useState<number | null>(null)
  const [dragHeadingId, setDragHeadingId] = useState<number | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  // single click highlights a row (view-only); double click opens its detail panel
  const [highlightedId, setHighlightedId] = useState<number | null>(null)
  // right-click context menu, anchored at the cursor for one requirement
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; reqId: number } | null>(null)
  const [ctxSubmenu, setCtxSubmenu] = useState<'section' | null>(null)
  // left-click on a column header, anchored at the cursor, to hide that column
  const [colMenu, setColMenu] = useState<{ x: number; y: number; key: DataColKey } | null>(null)

  // Escape → close the context menu and deselect (drop highlight + close detail panel).
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key !== 'Escape' || isTyping(e)) return
      setCtxMenu(null)
      setColMenu(null)
      setHighlightedId(null)
      if (useStore.getState().selectedRequirementId !== null) selectRequirement(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectRequirement])
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

  function persistColumns(cols: DataCol[]): void {
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(cols))
  }

  function startResize(e: ReactMouseEvent, key: DataColKey): void {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = columns.find((c) => c.key === key)!.width
    const onMove = (ev: MouseEvent): void => {
      setColumns((prev) => {
        const next = prev.map((c) =>
          c.key === key ? { ...c, width: Math.max(MIN_COL_WIDTH, Math.round(startWidth + ev.clientX - startX)) } : c
        )
        persistColumns(next)
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

  // Drop the dragged column next to the target. Direction-aware so both ways work:
  // dragging right drops it AFTER the target, dragging left drops it BEFORE — otherwise
  // a rightward move onto the immediate neighbour would land in the same spot (no-op).
  function reorderColumns(dragKey: DataColKey, targetKey: DataColKey): void {
    setDragCol(null)
    setDragOverCol(null)
    if (dragKey === targetKey) return
    setColumns((prev) => {
      const movingRight = prev.findIndex((c) => c.key === dragKey) < prev.findIndex((c) => c.key === targetKey)
      const dragged = prev.find((c) => c.key === dragKey)!
      const without = prev.filter((c) => c.key !== dragKey)
      const at = without.findIndex((c) => c.key === targetKey) + (movingRight ? 1 : 0)
      without.splice(at, 0, dragged)
      persistColumns(without)
      return without
    })
  }

  function setColumnHidden(key: DataColKey, hidden: boolean): void {
    setColumns((prev) => {
      const next = prev.map((c) => (c.key === key ? { ...c, hidden } : c))
      persistColumns(next)
      return next
    })
  }

  // Only visible columns drive the header, body cells, and the grid track template.
  const visibleColumns = columns.filter((c) => !c.hidden)

  const gridStyle = {
    gridTemplateColumns: `${CHECKBOX_WIDTH}px ${visibleColumns.map((c) => `${c.width}px`).join(' ')} ${ACTIONS_WIDTH}px`
  }

  // One data cell, rendered by column key so header and body share the live column order.
  function cell(key: DataColKey, req: (typeof requirements)[number]): JSX.Element {
    switch (key) {
      case 'reqId':
        return <span className="text-xs font-mono text-ink-faint pt-0.5 truncate">{req.reqId}</span>
      case 'entryType':
        return (
          <EditableCell key={req.entryType} value={req.entryType} multiline={false} allowEmpty={false}
            onSave={(v) => updateRequirement(req.id, { entryType: v })} />
        )
      case 'text':
        return (
          <EditableCell key={req.text} value={req.text} multiline
            onSave={(v) => updateRequirement(req.id, { text: v })} />
        )
      case 'ac':
        return (
          <EditableCell key={req.acceptanceCriteria ?? ''} value={req.acceptanceCriteria ?? ''} multiline
            onSave={(v) => updateRequirement(req.id, { acceptanceCriteria: v })} />
        )
      case 'source':
        return (
          <EditableCell key={req.source ?? ''} value={req.source ?? ''} multiline={false}
            onSave={(v) => updateRequirement(req.id, { source: v })} />
        )
      case 'rationale':
        return (
          <EditableCell key={req.rationale ?? ''} value={req.rationale ?? ''} multiline
            onSave={(v) => updateRequirement(req.id, { rationale: v })} />
        )
      case 'reqType':
        return <span className="text-xs text-ink-muted pt-0.5 truncate">{req.reqType}</span>
      case 'status':
        return <div className="pt-0.5"><Chip value={req.status} /></div>
      case 'priority':
        return <div className="pt-0.5"><Chip value={req.priority} /></div>
      case 'verificationMethod':
        return <span className="text-xs text-ink-muted pt-0.5 truncate">{req.verificationMethod ?? '—'}</span>
    }
  }

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
          <HeaderMenu
            align="right"
            trigger={
              <span className="flex items-center gap-1 text-xs text-ink-faint hover:text-ink">
                Columns <span className="text-[10px]">▾</span>
              </span>
            }
          >
            {() => (
              <div className="py-1">
                {columns.map((col) => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-ink hover:bg-workspace cursor-pointer whitespace-nowrap"
                  >
                    <input
                      type="checkbox"
                      checked={!col.hidden}
                      onChange={(e) => setColumnHidden(col.key, !e.target.checked)}
                      className="w-3.5 h-3.5 rounded accent-action"
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </HeaderMenu>
          {!showDeleted && (
            <>
              <HeaderMenu
                align="right"
                trigger={
                  <span className="flex items-center gap-1 text-xs text-ink-faint hover:text-ink px-2">
                    Export <span className="text-[10px]">▾</span>
                  </span>
                }
              >
                {(close) => (
                  <div className="py-1 text-sm text-ink whitespace-nowrap">
                    {([
                      ['Current module (CSV)', () => exportCsv(selectedModuleId)],
                      ['Whole project (CSV)', () => exportCsv(null)],
                      ['Current module (ReqIF)', () => exportReqif(selectedModuleId)],
                      ['Whole project (ReqIF)', () => exportReqif(null)]
                    ] as const).map(([label, fn]) => (
                      <button
                        key={label}
                        className="block w-full text-left px-3 py-1.5 hover:bg-workspace"
                        onClick={() => { fn(); close() }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </HeaderMenu>
              <Button variant="secondary" onClick={() => importCsv(selectedModuleId!)}>Import CSV</Button>
              <Button variant="secondary" onClick={() => addHeading({ moduleId: selectedModuleId! })}>+ Heading</Button>
              <Button onClick={handleAdd}>+ New Entry</Button>
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
            {visibleColumns.map((col) => (
              <span
                key={col.key}
                onDragOver={(e) => { if (dragCol && dragCol !== col.key) { e.preventDefault(); setDragOverCol(col.key) } }}
                onDragLeave={() => setDragOverCol((k) => (k === col.key ? null : k))}
                onDrop={(e) => { e.preventDefault(); if (dragCol) reorderColumns(dragCol, col.key) }}
                className={`relative flex items-center min-w-0 -my-2 py-2 ${dragCol === col.key ? 'bg-action-tint/50' : ''} ${dragOverCol === col.key ? 'shadow-[inset_2px_0_0_0_var(--tw-shadow-color)] shadow-action' : ''}`}
              >
                {/* Label: drag to reorder; plain click opens a menu to hide it. Resize handle
                    (mousedown) stays separate. */}
                <span
                  draggable
                  title="Drag to reorder · click to hide"
                  onClick={(e) => { e.stopPropagation(); setColMenu({ x: e.clientX, y: e.clientY, key: col.key }) }}
                  onDragStart={(e) => { setDragCol(col.key); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move' }}
                  onDragEnd={() => { setDragCol(null); setDragOverCol(null) }}
                  className="cursor-grab active:cursor-grabbing select-none"
                >
                  <SectionLabel>{col.label}</SectionLabel>
                </span>
                <span
                  role="separator"
                  aria-label={`Resize ${col.label} column`}
                  onMouseDown={(e) => startResize(e, col.key)}
                  className="absolute -right-2.5 -top-2 -bottom-2 w-2.5 cursor-col-resize flex justify-center group/handle"
                >
                  <span className="w-px h-full bg-transparent group-hover/handle:bg-action" />
                </span>
              </span>
            ))}
            <span />
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
                    onClick={() => !showDeleted && setHighlightedId(req.id)}
                    onDoubleClick={() => !showDeleted && selectRequirement(req.id)}
                    onContextMenu={(e) => {
                      if (showDeleted) return
                      e.preventDefault()
                      setHighlightedId(req.id)
                      setCtxSubmenu(null)
                      setCtxMenu({ x: e.clientX, y: e.clientY, reqId: req.id })
                    }}
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
                    !showDeleted && (selectedRequirementId === req.id || highlightedId === req.id)
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
                    {visibleColumns.map((col) => (
                      <span
                        key={col.key}
                        className={`min-w-0 -my-3 py-3 ${dragCol === col.key ? 'bg-action-tint/40' : ''}`}
                      >
                        {cell(col.key, req)}
                      </span>
                    ))}
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

      {ctxMenu && (
        <>
          {/* full-screen backdrop: any click (or another right-click) dismisses the menu */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setCtxMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null) }}
          />
          <div
            role="menu"
            style={{ top: ctxMenu.y, left: ctxMenu.x }}
            className="fixed z-50 min-w-[190px] bg-white border border-line rounded shadow-lg py-1 text-sm"
          >
            {ctxSubmenu === 'section' ? (
              <div className="max-h-72 overflow-auto">
                <button
                  role="menuitem"
                  onClick={() => setCtxSubmenu(null)}
                  className="w-full text-left px-3 py-1.5 text-ink-faint hover:bg-action-tint/40"
                >
                  ‹ Back
                </button>
                <button
                  role="menuitem"
                  onClick={() => { updateRequirement(ctxMenu.reqId, { headingId: null }); setCtxMenu(null) }}
                  className="w-full text-left px-3 py-1.5 text-ink hover:bg-action-tint/40"
                >
                  (none)
                </button>
                {buildOutline(headings, []).map((row) =>
                  row.kind === 'heading' ? (
                    <button
                      key={row.heading.id}
                      role="menuitem"
                      onClick={() => { updateRequirement(ctxMenu.reqId, { headingId: row.heading.id }); setCtxMenu(null) }}
                      className="w-full text-left px-3 py-1.5 text-ink hover:bg-action-tint/40"
                    >
                      <span className="font-mono text-xs text-ink-faint mr-2">{row.number}</span>{row.heading.title}
                    </button>
                  ) : null
                )}
              </div>
            ) : (
              <>
                <button
                  role="menuitem"
                  onClick={() => { addRequirementBelow(ctxMenu.reqId); setCtxMenu(null) }}
                  className="w-full text-left px-3 py-1.5 text-ink hover:bg-action-tint/40"
                >
                  Add entry below
                </button>
                <button
                  role="menuitem"
                  onClick={() => { duplicateRequirement(ctxMenu.reqId); setCtxMenu(null) }}
                  className="w-full text-left px-3 py-1.5 text-ink hover:bg-action-tint/40"
                >
                  Duplicate
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    const r = requirements.find((x) => x.id === ctxMenu.reqId)
                    if (r) navigator.clipboard.writeText(r.reqId)
                    setCtxMenu(null)
                  }}
                  className="w-full text-left px-3 py-1.5 text-ink hover:bg-action-tint/40"
                >
                  Copy ID
                </button>
                <button
                  role="menuitem"
                  onClick={() => setCtxSubmenu('section')}
                  className="w-full text-left px-3 py-1.5 text-ink hover:bg-action-tint/40"
                >
                  Move to section ›
                </button>
                <div className="my-1 border-t border-line" />
                <button
                  role="menuitem"
                  onClick={() => { removeRequirement(ctxMenu.reqId); setCtxMenu(null) }}
                  className="w-full text-left px-3 py-1.5 text-error hover:bg-error/10"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </>
      )}

      {colMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setColMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setColMenu(null) }}
          />
          <div
            role="menu"
            style={{ top: colMenu.y, left: colMenu.x }}
            className="fixed z-50 min-w-[170px] bg-white border border-line rounded shadow-lg py-1 text-sm"
          >
            <button
              role="menuitem"
              onClick={() => { setColumnHidden(colMenu.key, true); setColMenu(null) }}
              className="w-full text-left px-3 py-1.5 text-ink hover:bg-action-tint/40"
            >
              Hide column
            </button>
          </div>
        </>
      )}
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
