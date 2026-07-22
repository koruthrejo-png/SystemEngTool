import type { RequirementType, RequirementStatus, RequirementPriority } from '../../types'

// A flat requirement shape both CSV and ReqIF export consume. Enums are typed on the way
// out (assembled from typed rows); ParsedRow keeps them as raw strings, validated on import.
export interface ExportRow {
  reqId: string
  module: string
  section: string
  text: string
  acceptanceCriteria: string
  source: string
  rationale: string
  reqType: RequirementType
  status: RequirementStatus
  priority: RequirementPriority
  derivedFrom: string[]
  custom: Record<string, string>
}

export interface ParsedRow {
  reqId: string
  section: string
  text: string
  acceptanceCriteria: string
  source: string
  rationale: string
  reqType: string
  status: string
  priority: string
  derivedFrom: string[]
  custom: Record<string, string>
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Title-path from root to the given heading, joined ' > '. '' when headingId is null.
export function buildSectionPath(
  headingId: number | null,
  byId: Map<number, { parentId: number | null; title: string }>
): string {
  const parts: string[] = []
  let cur = headingId
  const seen = new Set<number>()
  while (cur != null && !seen.has(cur)) {
    seen.add(cur)
    const h = byId.get(cur)
    if (!h) break
    parts.unshift(h.title)
    cur = h.parentId
  }
  return parts.join(' > ')
}

// Reverse of buildSectionPath: resolve a title-path back to an existing heading id, or null.
export function findHeadingByPath(
  path: string,
  headings: { id: number; parentId: number | null; title: string }[]
): number | null {
  if (path.trim() === '') return null
  const byId = new Map(headings.map((h) => [h.id, h]))
  for (const h of headings) {
    if (buildSectionPath(h.id, byId) === path) return h.id
  }
  return null
}
