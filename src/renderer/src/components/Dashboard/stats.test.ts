import { describe, it, expect } from 'vitest'
import { computeStats, timeAgo, derivationStats } from './stats'
import type { Requirement } from '../../../../types'

function req(partial: Partial<Requirement> & { id: number }): Requirement {
  return {
    moduleId: 1, reqId: `SRS-${partial.id}`, text: `R${partial.id}`,
    acceptanceCriteria: null, source: null, rationale: null,
    status: 'Draft', priority: 'Medium', reqType: 'Functional',
    headingId: null, position: 0, deletedAt: null, createdAt: '', updatedAt: '2026-01-01', ...partial
  }
}

const el = { id: 1, projectId: 1, architectureId: null, parentId: null, blockId: 'SYS-001', name: '', elementTypeId: null, description: null, color: null, lineStyle: null, posX: 0, posY: 0, width: 160, height: 80, deletedAt: null, createdAt: '', updatedAt: '' }

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

  it('counts requirements created within the last 7 days', () => {
    const now = new Date('2026-07-06T12:00:00Z')
    const s = computeStats(
      [
        req({ id: 1, createdAt: '2026-07-05T12:00:00Z' }), // 1 day ago → in
        req({ id: 2, createdAt: '2026-06-29T13:00:00Z' }), // 6.96 days ago → in
        req({ id: 3, createdAt: '2026-06-28T12:00:00Z' }) // 8 days ago → out
      ],
      [], [], [], now
    )
    expect(s.createdThisWeek).toBe(2)
  })

  it('computes per-module coverage and omits requirement-less modules', () => {
    const modules = [
      { id: 1, name: 'SRS', kind: 'module', position: 0 } as any,
      { id: 2, name: 'HW', kind: 'module', position: 1 } as any,
      { id: 3, name: 'Empty', kind: 'module', position: 2 } as any
    ]
    const s = computeStats(
      [req({ id: 1, moduleId: 1 }), req({ id: 2, moduleId: 1 }), req({ id: 3, moduleId: 2 })],
      [el],
      [{ elementId: 1, requirementId: 1 }],
      modules
    )
    expect(s.perModule).toEqual([
      { moduleId: 1, name: 'SRS', total: 2, linked: 1, pct: 50 },
      { moduleId: 2, name: 'HW', total: 1, linked: 0, pct: 0 }
    ])
  })

  it('perModule ignores folders even when rows still point at one', () => {
    const folder: any = { id: 1, projectId: 1, parentId: null, kind: 'folder', name: 'Vehicle', idPrefix: '', idPadding: 4, nextCounter: 1, position: 0, deletedAt: null, createdAt: '', updatedAt: '' }
    const module: any = { ...folder, id: 2, parentId: 1, kind: 'module', name: 'Chassis', idPrefix: 'CHS' }
    // req 1 points at the folder — a pre-migration leftover. Without the kind filter the
    // folder has total > 0 and survives into perModule, so this fails for the right reason.
    const stats = computeStats([req({ id: 1, moduleId: 1 }), req({ id: 2, moduleId: 2 })], [], [], [folder, module])
    expect(stats.perModule.map((m) => m.moduleId)).toEqual([2])
  })

  it('collects high-priority unallocated requirements as critical gaps', () => {
    const s = computeStats(
      [
        req({ id: 1, priority: 'High' }), // linked → not a gap
        req({ id: 2, priority: 'High' }), // unallocated High → gap
        req({ id: 3, priority: 'Medium' }) // unallocated but Medium → not a gap
      ],
      [el],
      [{ elementId: 1, requirementId: 1 }]
    )
    expect(s.criticalGaps.map((r) => r.id)).toEqual([2])
  })

  it('counts top-level elements as subsystems', () => {
    const s = computeStats([], [el, { ...el, id: 2, parentId: 1 }], [])
    expect(s.totalObjects).toBe(2)
    expect(s.subsystemCount).toBe(1)
  })
})

describe('derivationStats', () => {
  const links = [{ parentReqId: 1, childReqId: 3 }] // req 3 (module 2) derives from req 1 (module 1)
  const reqs = [
    req({ id: 1, moduleId: 1 }), req({ id: 2, moduleId: 1 }),
    req({ id: 3, moduleId: 2 }), req({ id: 4, moduleId: 2 })
  ]

  it('hasChildren: high-level reqs with at least one derived child', () => {
    const s = derivationStats(reqs, links, 1, 'hasChildren')
    expect(s).toMatchObject({ total: 2, linked: 1, pct: 50 })
    expect(s.unlinked.map((r) => r.id)).toEqual([2])
  })

  it('hasParent: low-level reqs traced to a parent', () => {
    const s = derivationStats(reqs, links, 2, 'hasParent')
    expect(s).toMatchObject({ total: 2, linked: 1, pct: 50 })
    expect(s.unlinked.map((r) => r.id)).toEqual([4])
  })

  it('All modules scope and empty input', () => {
    expect(derivationStats(reqs, links, null, 'hasParent').total).toBe(4)
    expect(derivationStats([], [], null, 'hasChildren')).toMatchObject({ total: 0, linked: 0, pct: 0, unlinked: [] })
  })
})

describe('timeAgo', () => {
  const now = new Date('2026-07-06T12:00:00Z')
  it('formats minutes, hours, days and just-now', () => {
    expect(timeAgo('2026-07-06T11:59:40Z', now)).toBe('just now')
    expect(timeAgo('2026-07-06T11:15:00Z', now)).toBe('45m ago')
    expect(timeAgo('2026-07-06T09:00:00Z', now)).toBe('3h ago')
    expect(timeAgo('2026-07-03T12:00:00Z', now)).toBe('3d ago')
  })
})
