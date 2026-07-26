import type { Requirement, ElementRequirementLink } from '../../../types'

/** High-priority requirements linked to no architecture element. Shared with the Dashboard. */
export function traceGaps(requirements: Requirement[], links: ElementRequirementLink[]): Requirement[] {
  const linkedIds = new Set(links.map((l) => l.requirementId))
  return requirements.filter((r) => !linkedIds.has(r.id) && r.priority === 'High')
}

export interface AttentionItems {
  traceGaps: Requirement[]
  inReview: Requirement[]
  verificationFailed: Requirement[]
  count: number
}

/** Requirements needing attention, in three fixed groups; `count` = distinct requirements. */
export function attentionItems(requirements: Requirement[], links: ElementRequirementLink[]): AttentionItems {
  const tg = traceGaps(requirements, links)
  const inReview = requirements.filter((r) => r.status === 'Review')
  const verificationFailed = requirements.filter((r) => r.verificationStatus === 'Failed')
  const count = new Set([...tg, ...inReview, ...verificationFailed].map((r) => r.id)).size
  return { traceGaps: tg, inReview, verificationFailed, count }
}
