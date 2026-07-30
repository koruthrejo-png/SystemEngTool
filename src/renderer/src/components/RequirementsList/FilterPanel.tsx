import { useEffect, useRef, useState } from 'react'
import { Button, Input, Select } from '../ui'
import {
  FILTERABLE_ATTRS,
  OPERATOR_LABELS,
  attrDef,
  type FilterCombine,
  type FilterOperator,
  type FilterRule
} from './filter'

const OPERATORS = Object.keys(OPERATOR_LABELS) as FilterOperator[]
const COMPACT = '!w-auto !py-1 !px-2 !text-xs'
// rule-row controls flex to share the width so the remove-× never overflows the popup
const FIELD = 'flex-1 min-w-0 !py-1 !px-2 !text-xs'

export default function FilterPanel({
  rules,
  combine,
  onRulesChange,
  onCombineChange,
  open,
  onClose
}: {
  rules: FilterRule[]
  combine: FilterCombine
  onRulesChange: (rules: FilterRule[]) => void
  onCombineChange: (c: FilterCombine) => void
  open?: boolean
  onClose?: () => void
}): JSX.Element | null {
  // Floating draggable window position; header drag updates it. ponytail: no viewport clamp — add if it drifts offscreen.
  const [pos, setPos] = useState({ x: 380, y: 128 })
  const [dragging, setDragging] = useState(false)
  const off = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (!dragging) return
    const move = (e: MouseEvent): void => setPos({ x: e.clientX - off.current.x, y: e.clientY - off.current.y })
    const up = (): void => setDragging(false)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [dragging])

  const patch = (id: string, changes: Partial<FilterRule>): void =>
    onRulesChange(rules.map((r) => (r.id === id ? { ...r, ...changes } : r)))

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-label="Filters"
      className="fixed z-50 w-[520px] max-w-[calc(100vw-2rem)] bg-white border border-line rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.16)]"
      style={{ left: pos.x, top: pos.y }}
    >
      {/* Drag handle header */}
      <div
        onMouseDown={(e) => {
          off.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
          setDragging(true)
        }}
        className="flex items-center justify-between px-4 h-10 border-b border-line bg-workspace rounded-t-lg cursor-move select-none"
      >
        <span className="text-xs font-bold uppercase tracking-[0.05em] text-ink-faint">Filters</span>
        <div className="flex items-center gap-3">
          {rules.length > 0 && (
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => onRulesChange([])}
              className="text-xs text-ink-faint hover:text-ink"
            >
              Clear
            </button>
          )}
          <button
            aria-label="Close filters"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => onClose?.()}
            className="text-ink-faint hover:text-error text-lg leading-none"
          >
            ×
          </button>
        </div>
      </div>

      <div className="px-4 py-3 flex flex-col gap-2">
        {rules.length >= 2 && (
          <div className="flex items-center gap-1">
            {(['AND', 'OR'] as const).map((c) => (
              <button
                key={c}
                onClick={() => onCombineChange(c)}
                className={`text-xs px-2 py-1 rounded ${
                  combine === c ? 'bg-action-tint text-action font-medium' : 'text-ink-faint hover:text-ink'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {rules.length === 0 && <div className="text-xs text-ink-faint">No filters yet.</div>}

        {rules.map((rule) => {
          const def = attrDef(rule.attr)
          const noValue = rule.op === 'isEmpty' || rule.op === 'isNotEmpty'
          return (
            <div key={rule.id} className="flex gap-2 items-center min-w-0">
              <Select
                aria-label="Filter attribute"
                value={rule.attr}
                onChange={(e) => patch(rule.id, { attr: e.target.value as FilterRule['attr'] })}
                className={FIELD}
              >
                {FILTERABLE_ATTRS.map((a) => (
                  <option key={a.key} value={a.key}>{a.label}</option>
                ))}
              </Select>

              <Select
                aria-label="Filter operator"
                value={rule.op}
                onChange={(e) => patch(rule.id, { op: e.target.value as FilterOperator })}
                className={FIELD}
              >
                {OPERATORS.map((op) => (
                  <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
                ))}
              </Select>

              {!noValue &&
                (def.kind === 'enum' ? (
                  <Select
                    aria-label="Filter value"
                    value={rule.value}
                    onChange={(e) => patch(rule.id, { value: e.target.value })}
                    className={FIELD}
                  >
                    <option value="">…</option>
                    {def.options!.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    aria-label="Filter value"
                    value={rule.value}
                    placeholder="value"
                    onChange={(e) => patch(rule.id, { value: e.target.value })}
                    className={FIELD}
                  />
                ))}

              <button
                aria-label="Remove filter"
                onClick={() => onRulesChange(rules.filter((r) => r.id !== rule.id))}
                className="shrink-0 text-ink-faint hover:text-error text-base leading-none"
              >
                ×
              </button>
            </div>
          )
        })}

        <div>
          <Button
            variant="ghost"
            className={COMPACT}
            onClick={() =>
              onRulesChange([...rules, { id: crypto.randomUUID(), attr: 'text', op: 'contains', value: '' }])
            }
          >
            + Add filter
          </Button>
        </div>
      </div>
    </div>
  )
}
