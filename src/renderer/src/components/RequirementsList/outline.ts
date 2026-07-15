import type { ReqHeading, Requirement } from '../../../../types'

export type OutlineRow =
  | { kind: 'heading'; heading: ReqHeading; number: string; depth: number }
  | { kind: 'requirement'; requirement: Requirement }

// Display order: ungrouped requirements first, then each top-level heading
// (numbered 1..N by position), its requirements, then its subheadings — nested
// to any depth with a dotted path (1, 1.1, 1.1.1…) — each with their requirements.
export function buildOutline(headings: ReqHeading[], requirements: Requirement[]): OutlineRow[] {
  const rows: OutlineRow[] = []
  const byPosition = (a: ReqHeading, b: ReqHeading): number => a.position - b.position || a.id - b.id
  const reqsUnder = (headingId: number | null): Requirement[] =>
    requirements.filter((r) => r.headingId === headingId)
  const childrenOf = (parentId: number): ReqHeading[] =>
    headings.filter((h) => h.parentId === parentId).sort(byPosition)

  for (const r of reqsUnder(null)) rows.push({ kind: 'requirement', requirement: r })

  const ids = new Set(headings.map((h) => h.id))
  const tops = headings.filter((h) => h.parentId === null || !ids.has(h.parentId)).sort(byPosition)

  const seen = new Set<number>() // guard against malformed cyclic parent chains
  const walk = (heading: ReqHeading, number: string, depth: number): void => {
    if (seen.has(heading.id)) return
    seen.add(heading.id)
    rows.push({ kind: 'heading', heading, number, depth })
    for (const r of reqsUnder(heading.id)) rows.push({ kind: 'requirement', requirement: r })
    childrenOf(heading.id).forEach((child, k) => walk(child, `${number}.${k + 1}`, depth + 1))
  }
  tops.forEach((top, i) => walk(top, `${i + 1}`, 0))
  return rows
}

// Cycle guard: a heading may never become its own descendant. Walk up from the target;
// hitting `id` means the target is the heading itself or something nested under it.
// Mirrors the server-side walk in reparentHeading (src/main/handlers/headings.ts), which
// is the authority — this copy only decides whether the UI offers the drop.
export function canReparent(headings: ReqHeading[], id: number, newParentId: number | null): boolean {
  let cur = newParentId
  while (cur != null) {
    if (cur === id) return false
    cur = headings.find((h) => h.id === cur)?.parentId ?? null
  }
  return true
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
