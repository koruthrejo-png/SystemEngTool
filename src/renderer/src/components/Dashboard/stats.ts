import type { Requirement, ArchitectureElement, ElementRequirementLink, Module, RequirementLink } from '../../../../types'

export interface ModuleCoverage {
  moduleId: number
  name: string
  total: number
  linked: number
  pct: number
}

export interface DashboardStats {
  totalRequirements: number
  totalObjects: number
  coveragePct: number
  unallocated: Requirement[]
  byStatus: [string, number][]
  byPriority: [string, number][]
  byType: [string, number][]
  recent: Requirement[]
  createdThisWeek: number
  subsystemCount: number
  perModule: ModuleCoverage[]
  criticalGaps: Requirement[]
}

function tally(reqs: Requirement[], key: (r: Requirement) => string): [string, number][] {
  const counts = new Map<string, number>()
  for (const r of reqs) counts.set(key(r), (counts.get(key(r)) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

export function timeAgo(iso: string, now: Date = new Date()): string {
  const m = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function computeStats(
  requirements: Requirement[],
  elements: ArchitectureElement[],
  links: ElementRequirementLink[],
  modules: Module[] = [],
  now: Date = new Date()
): DashboardStats {
  const linkedIds = new Set(links.map((l) => l.requirementId))
  const unallocated = requirements.filter((r) => !linkedIds.has(r.id))
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000
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
    recent: [...requirements].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8),
    createdThisWeek: requirements.filter((r) => new Date(r.createdAt).getTime() >= weekAgo).length,
    subsystemCount: elements.filter((e) => e.parentId === null).length,
    perModule: modules
      .map((m) => {
        const reqs = requirements.filter((r) => r.moduleId === m.id)
        const linked = reqs.filter((r) => linkedIds.has(r.id)).length
        return {
          moduleId: m.id,
          name: m.name,
          total: reqs.length,
          linked,
          pct: reqs.length === 0 ? 0 : Math.round((linked / reqs.length) * 100)
        }
      })
      .filter((m) => m.total > 0),
    criticalGaps: unallocated.filter((r) => r.priority === 'High')
  }
}

export interface DerivationStats {
  total: number
  linked: number
  pct: number
  unlinked: Requirement[]
}

export function derivationStats(
  requirements: Requirement[],
  reqLinks: RequirementLink[],
  moduleId: number | null,
  direction: 'hasParent' | 'hasChildren'
): DerivationStats {
  const scoped = moduleId === null ? requirements : requirements.filter((r) => r.moduleId === moduleId)
  const linkedIds = direction === 'hasParent'
    ? new Set(reqLinks.map((l) => l.childReqId))
    : new Set(reqLinks.map((l) => l.parentReqId))
  const unlinked = scoped.filter((r) => !linkedIds.has(r.id))
  const linked = scoped.length - unlinked.length
  return {
    total: scoped.length,
    linked,
    pct: scoped.length === 0 ? 0 : Math.round((linked / scoped.length) * 100),
    unlinked
  }
}
