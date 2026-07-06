import { describe, it, expect } from 'vitest'
import { computeStats } from './stats'
import type { Requirement } from '../../../../types'

function req(partial: Partial<Requirement> & { id: number }): Requirement {
  return {
    moduleId: 1, reqId: `SRS-${partial.id}`, text: `R${partial.id}`,
    acceptanceCriteria: null, source: null, rationale: null,
    status: 'Draft', priority: 'Medium', reqType: 'Functional',
    headingId: null, position: 0, deletedAt: null, createdAt: '', updatedAt: '2026-01-01', ...partial
  }
}

const el = { id: 1, projectId: 1, parentId: null, blockId: 'SYS-001', name: '', elementTypeId: null, description: null, color: null, posX: 0, posY: 0, width: 160, height: 80, deletedAt: null, createdAt: '', updatedAt: '' }

describe('computeStats', () => {
  it('counts totals, coverage and unallocated', () => {
    const s = computeStats(
      [req({ id: 1 }), req({ id: 2 }), req({ id: 3 })],
      [el],
      [{ elementId: 1, requirementId: 1 }, { elementId: 1, requirementId: 2 }]
    )
    expect(s.totalRequirements).toBe(3)
    expect(s.totalObjects).toBe(1)
    expect(s.coveragePct).toBe(67)
    expect(s.unallocated.map((r) => r.id)).toEqual([3])
  })

  it('handles the empty project without dividing by zero', () => {
    const s = computeStats([], [], [])
    expect(s.coveragePct).toBe(0)
    expect(s.totalRequirements).toBe(0)
  })

  it('tallies status, priority and type sorted by count descending', () => {
    const s = computeStats(
      [req({ id: 1, status: 'Approved' }), req({ id: 2, status: 'Approved' }), req({ id: 3, status: 'Draft', priority: 'High' })],
      [], []
    )
    expect(s.byStatus).toEqual([['Approved', 2], ['Draft', 1]])
    expect(s.byPriority).toEqual([['Medium', 2], ['High', 1]])
    expect(s.byType).toEqual([['Functional', 3]])
  })

  it('lists the 8 most recently updated requirements, newest first', () => {
    const reqs = Array.from({ length: 10 }, (_, i) => req({ id: i + 1, updatedAt: `2026-01-${String(i + 1).padStart(2, '0')}` }))
    const s = computeStats(reqs, [], [])
    expect(s.recent).toHaveLength(8)
    expect(s.recent[0].id).toBe(10)
    expect(s.recent[7].id).toBe(3)
  })
})
