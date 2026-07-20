import { useState } from 'react'
import { Button, Input, Select } from '../ui'
import {
  FILTERABLE_ATTRS,
  OPERATOR_LABELS,
  attrDef,
  isInert,
  type FilterCombine,
  type FilterOperator,
  type FilterRule
} from './filter'

const OPERATORS = Object.keys(OPERATOR_LABELS) as FilterOperator[]
const COMPACT = '!w-auto !py-1 !px-2 !text-xs'

export default function FilterPanel({
  rules,
  combine,
  onRulesChange,
  onCombineChange
}: {
  rules: FilterRule[]
  combine: FilterCombine
  onRulesChange: (rules: FilterRule[]) => void
  onCombineChange: (c: FilterCombine) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const activeCount = rules.filter((r) => !isInert(r)).length

  const patch = (id: string, changes: Partial<FilterRule>): void =>
    onRulesChange(rules.map((r) => (r.id === id ? { ...r, ...changes } : r)))

  return (
    <>
      {/* Toolbar shell mirrors the filter strip it replaces */}
      <div className="h-10 px-4 border-b border-line bg-white flex items-center gap-5 shrink-0">
        <Button variant="secondary" className={COMPACT} onClick={() => setOpen((v) => !v)}>
          Filter
          {activeCount > 0 && (
            <span className="ml-1.5 px-1.5 rounded-full bg-action text-white text-[10px] font-bold">
              {activeCount}
            </span>
          )}
        </Button>

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

        {rules.length > 0 && (
          <button onClick={() => onRulesChange([])} className="text-xs text-ink-faint hover:text-ink">
            Clear
          </button>
        )}
      </div>

      {open && (
        <div className="px-4 py-2 border-b border-line bg-white flex flex-col gap-2 shrink-0">
          {rules.map((rule) => {
            const def = attrDef(rule.attr)
            const noValue = rule.op === 'isEmpty' || rule.op === 'isNotEmpty'
            return (
              <div key={rule.id} className="flex gap-2 items-center">
                <Select
                  aria-label="Filter attribute"
                  value={rule.attr}
                  onChange={(e) => patch(rule.id, { attr: e.target.value as FilterRule['attr'] })}
                  className={COMPACT}
                >
                  {FILTERABLE_ATTRS.map((a) => (
                    <option key={a.key} value={a.key}>{a.label}</option>
                  ))}
                </Select>

                <Select
                  aria-label="Filter operator"
                  value={rule.op}
                  onChange={(e) => patch(rule.id, { op: e.target.value as FilterOperator })}
                  className={COMPACT}
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
                      className={COMPACT}
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
                      className="!text-xs !py-1 !px-2 !w-40"
                    />
                  ))}

                <button
                  aria-label="Remove filter"
                  onClick={() => onRulesChange(rules.filter((r) => r.id !== rule.id))}
                  className="text-ink-faint hover:text-error text-base leading-none"
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
      )}
    </>
  )
}
