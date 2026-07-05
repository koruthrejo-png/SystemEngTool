import type { ReqHeading, Requirement } from '../../../../types'

export type OutlineRow =
  | { kind: 'heading'; heading: ReqHeading; number: string; depth: 0 | 1 }
  | { kind: 'requirement'; requirement: Requirement }

// Display order: ungrouped requirements first, then each top-level heading
// (numbered 1..N by position), its requirements, then its subheadings
// (numbered N.1..) each with their requirements.
export function buildOutline(headings: ReqHeading[], requirements: Requirement[]): OutlineRow[] {
  const rows: OutlineRow[] = []
  const byPosition = (a: ReqHeading, b: ReqHeading): number => a.position - b.position || a.id - b.id
  const reqsUnder = (headingId: number | null): Requirement[] =>
    requirements.filter((r) => r.headingId === headingId)

  for (const r of reqsUnder(null)) rows.push({ kind: 'requirement', requirement: r })

  const ids = new Set(headings.map((h) => h.id))
  const tops = headings.filter((h) => h.parentId === null || !ids.has(h.parentId)).sort(byPosition)
  tops.forEach((top, i) => {
    rows.push({ kind: 'heading', heading: top, number: `${i + 1}`, depth: 0 })
    for (const r of reqsUnder(top.id)) rows.push({ kind: 'requirement', requirement: r })
    const subs = headings.filter((h) => h.parentId === top.id).sort(byPosition)
    subs.forEach((sub, j) => {
      rows.push({ kind: 'heading', heading: sub, number: `${i + 1}.${j + 1}`, depth: 1 })
      for (const r of reqsUnder(sub.id)) rows.push({ kind: 'requirement', requirement: r })
    })
  })
  return rows
}

// Collapse hides a heading's content (requirements + deeper headings), not the heading row itself.
export function visibleRows(rows: OutlineRow[], collapsed: Set<number>): OutlineRow[] {
  const out: OutlineRow[] = []
  let skipDeeperThan: number | null = null
  for (const row of rows) {
    if (row.kind === 'heading') {
      if (skipDeeperThan !== null && row.depth > skipDeeperThan) continue
      skipDeeperThan = null
      out.push(row)
      if (collapsed.has(row.heading.id)) skipDeeperThan = row.depth
    } else {
      if (skipDeeperThan !== null) continue
      out.push(row)
    }
  }
  return out
}
