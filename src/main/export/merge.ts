import type { ParsedRow } from './model'
import { REQUIREMENT_TYPES, REQUIREMENT_STATUSES, REQUIREMENT_PRIORITIES } from '../../types'

export interface ImportAction { kind: 'create' | 'update'; targetId: number | null; row: ParsedRow }
export interface ImportPlan { actions: ImportAction[]; errors: string[]; skipped: number }

const ENUM_SETS: { field: keyof ParsedRow; label: string; values: readonly string[] }[] = [
  { field: 'reqType', label: 'type', values: REQUIREMENT_TYPES },
  { field: 'status', label: 'status', values: REQUIREMENT_STATUSES },
  { field: 'priority', label: 'priority', values: REQUIREMENT_PRIORITIES }
]

export function planImport(rows: ParsedRow[], existingByReqId: Map<string, number>): ImportPlan {
  const actions: ImportAction[] = []
  const errors: string[] = []
  let skipped = 0
  rows.forEach((row, i) => {
    const label = row.reqId || `row ${i + 1}`
    // Non-empty enum cells must be valid union values (blank = leave existing on update).
    const bad = ENUM_SETS.find((e) => {
      const v = row[e.field] as string
      return v !== '' && !e.values.includes(v)
    })
    if (bad) {
      errors.push(`${label}: invalid ${bad.label} "${row[bad.field]}"`)
      skipped++
      return
    }
    const targetId = row.reqId ? existingByReqId.get(row.reqId) ?? null : null
    if (targetId != null) {
      actions.push({ kind: 'update', targetId, row })
      return
    }
    if (row.text.trim() === '') {
      errors.push(`${label}: missing text, cannot create`)
      skipped++
      return
    }
    actions.push({ kind: 'create', targetId: null, row })
  })
  return { actions, errors, skipped }
}

export function resolveDerivedFrom(
  derivedFrom: string[],
  knownReqIds: Set<string>
): { resolved: string[]; errors: string[] } {
  const resolved: string[] = []
  const errors: string[] = []
  for (const parent of derivedFrom) {
    if (knownReqIds.has(parent)) resolved.push(parent)
    else errors.push(`unknown derived_from "${parent}"`)
  }
  return { resolved, errors }
}
