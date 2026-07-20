import type { Requirement } from '../../../../types'
import { REQUIREMENT_STATUSES, REQUIREMENT_PRIORITIES, REQUIREMENT_TYPES } from '../../../../types'

export type FilterOperator =
  | 'contains' | 'notContains' | 'equals' | 'startsWith' | 'isEmpty' | 'isNotEmpty'

export type FilterAttrKey =
  | 'reqId' | 'text' | 'acceptanceCriteria' | 'source' | 'rationale' | 'reqType' | 'status' | 'priority'

export interface FilterRule {
  id: string
  attr: FilterAttrKey
  op: FilterOperator
  value: string
}

export type FilterCombine = 'AND' | 'OR'

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  contains: 'contains',
  notContains: 'does not contain',
  equals: 'equals',
  startsWith: 'starts with',
  isEmpty: 'is empty',
  isNotEmpty: 'is not empty'
}

export interface FilterableAttr {
  key: FilterAttrKey
  label: string
  kind: 'text' | 'enum'
  options?: readonly string[]
  get: (req: Requirement) => string
}

// Ordered for the attribute dropdown; `get` coerces null/undefined to ''.
export const FILTERABLE_ATTRS: readonly FilterableAttr[] = [
  { key: 'reqId', label: 'ID', kind: 'text', get: (r) => r.reqId ?? '' },
  { key: 'text', label: 'Requirement', kind: 'text', get: (r) => r.text ?? '' },
  { key: 'acceptanceCriteria', label: 'Acceptance Criteria', kind: 'text', get: (r) => r.acceptanceCriteria ?? '' },
  { key: 'source', label: 'Source', kind: 'text', get: (r) => r.source ?? '' },
  { key: 'rationale', label: 'Rationale', kind: 'text', get: (r) => r.rationale ?? '' },
  { key: 'reqType', label: 'Type', kind: 'enum', options: REQUIREMENT_TYPES, get: (r) => r.reqType ?? '' },
  { key: 'status', label: 'Status', kind: 'enum', options: REQUIREMENT_STATUSES, get: (r) => r.status ?? '' },
  { key: 'priority', label: 'Priority', kind: 'enum', options: REQUIREMENT_PRIORITIES, get: (r) => r.priority ?? '' }
]

// Non-null: FilterAttrKey is constrained to keys that all appear above.
export function attrDef(key: FilterAttrKey): FilterableAttr {
  return FILTERABLE_ATTRS.find((a) => a.key === key)!
}

const tokens = (value: string): string[] => value.trim().toLowerCase().split(/\s+/).filter(Boolean)

// A value-requiring op whose value yields no usable tokens does nothing; the
// is(Not)Empty ops need no value and are never inert.
export function isInert(rule: FilterRule): boolean {
  if (rule.op === 'isEmpty' || rule.op === 'isNotEmpty') return false
  return tokens(rule.value).length === 0
}

export function matchesRule(req: Requirement, rule: FilterRule): boolean {
  const field = attrDef(rule.attr).get(req).toLowerCase()
  const empty = field.trim() === ''
  switch (rule.op) {
    case 'isEmpty':
      return empty
    case 'isNotEmpty':
      return !empty
    case 'equals': {
      const v = rule.value.trim().toLowerCase()
      return v === '' || field.trim() === v // empty value → inert
    }
    default: {
      const toks = tokens(rule.value)
      if (toks.length === 0) return true // inert
      if (rule.op === 'contains') return toks.some((t) => field.includes(t))
      if (rule.op === 'startsWith') return toks.some((t) => field.startsWith(t))
      return !toks.some((t) => field.includes(t)) // notContains
    }
  }
}

export function applyFilters(reqs: Requirement[], rules: FilterRule[], combine: FilterCombine): Requirement[] {
  const active = rules.filter((r) => !isInert(r))
  if (active.length === 0) return reqs
  return reqs.filter((req) =>
    combine === 'AND'
      ? active.every((r) => matchesRule(req, r))
      : active.some((r) => matchesRule(req, r))
  )
}
