import { describe, it, expect } from 'vitest'
import { attentionItems, traceGaps } from './attention'
import type { Requirement, ElementRequirementLink } from '../../../types'

function req(over: Partial<Requirement>): Requirement {
  return {
    id: 1, moduleId: 1, reqId: 'R-1', text: 'x', acceptanceCriteria: null,
    source: null, rationale: null, position: 0, status: 'Draft', priority: 'Medium',
    reqType: 'Functional', entryType: 'Requirement', verificationStatus: 'Unverified', verificationMethod: null,
    headingId: null, deletedAt: null, createdAt: '', updatedAt: '', createdBy: null, updatedBy: null,
    ...over
  }
}
const link = (requirementId: number): ElementRequirementLink => ({ elementId: 1, requirementId })

describe('traceGaps', () => {
  it('selects High-priority requirements linked to no element', () => {
    const gap = req({ id: 1, priority: 'High' })
    const linkedHigh = req({ id: 2, priority: 'High' })
    const lowUnlinked = req({ id: 3, priority: 'Low' })
    expect(traceGaps([gap, linkedHigh, lowUnlinked], [link(2)])).toEqual([gap])
  })
})

describe('attentionItems', () => {
  it('groups trace gaps, in-review, verification-failed and counts distinct requirements', () => {
    const gap = req({ id: 1, priority: 'High' })
    const review = req({ id: 2, status: 'Review' })
    const failed = req({ id: 3, verificationStatus: 'Failed' })
    const r = attentionItems([gap, review, failed], [])
    expect(r.traceGaps).toEqual([gap])
    expect(r.inReview).toEqual([review])
    expect(r.verificationFailed).toEqual([failed])
    expect(r.count).toBe(3)
  })

  it('counts a requirement in two groups once', () => {
    const both = req({ id: 9, priority: 'High', status: 'Review' })
    const r = attentionItems([both], [])
    expect(r.traceGaps).toEqual([both])
    expect(r.inReview).toEqual([both])
    expect(r.count).toBe(1)
  })

  it('is empty and zero when nothing needs attention', () => {
    const ok = req({ id: 1, priority: 'Low', status: 'Approved' })
    const r = attentionItems([ok], [link(1)])
    expect(r).toEqual({ traceGaps: [], inReview: [], verificationFailed: [], count: 0 })
  })
})
