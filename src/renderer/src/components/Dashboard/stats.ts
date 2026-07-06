import type { Requirement, ArchitectureElement, ElementRequirementLink } from '../../../../types'

export interface DashboardStats {
  totalRequirements: number
  totalObjects: number
  coveragePct: number
  unallocated: Requirement[]
  byStatus: [string, number][]
  byPriority: [string, number][]
  byType: [string, number][]
  recent: Requirement[]
}

function tally(reqs: Requirement[], key: (r: Requirement) => string): [string, number][] {
  const counts = new Map<string, number>()
  for (const r of reqs) counts.set(key(r), (counts.get(key(r)) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

export function computeStats(
  requirements: Requirement[],
  elements: ArchitectureElement[],
  links: ElementRequirementLink[]
): DashboardStats {
  const linkedIds = new Set(links.map((l) => l.requirementId))
  const unallocated = requirements.filter((r) => !linkedIds.has(r.id))
  return {
    totalRequirements: requirements.length,
    totalObjects: elements.length,
    coveragePct: requirements.length === 0
      ? 0
      : Math.round(((requirements.length - unallocated.length) / requirements.length) * 100),
    unallocated,
    byStatus: tally(requirements, (r) => r.status),
    byPriority: tally(requirements, (r) => r.priority),
    byType: tally(requirements, (r) => r.reqType),
    recent: [...requirements].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8)
  }
}
