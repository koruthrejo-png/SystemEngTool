import type { AcceptanceCriterion } from '../../../types'

export interface AcSummaryEntry {
  passed: number
  total: number
  first: string
}

// Input is expected in (requirementId, position) order — listByModule/list return it that way —
// but first-item selection re-checks position to stay order-independent.
export function summarize(items: AcceptanceCriterion[]): Record<number, AcSummaryEntry> {
  const out: Record<number, AcSummaryEntry & { firstPos: number }> = {}
  for (const it of items) {
    const cur = out[it.requirementId]
    if (!cur) {
      out[it.requirementId] = { passed: it.status === 'Passed' ? 1 : 0, total: 1, first: it.text, firstPos: it.position }
    } else {
      cur.total += 1
      if (it.status === 'Passed') cur.passed += 1
      if (it.position < cur.firstPos) { cur.first = it.text; cur.firstPos = it.position }
    }
  }
  return Object.fromEntries(
    Object.entries(out).map(([k, { passed, total, first }]) => [k, { passed, total, first }])
  )
}
