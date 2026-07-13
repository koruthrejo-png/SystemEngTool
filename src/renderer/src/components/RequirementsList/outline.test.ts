import { describe, it, expect } from 'vitest'
import { buildOutline, visibleRows, type OutlineRow } from './outline'
import type { ReqHeading, Requirement } from '../../../../types'

function heading(partial: Partial<ReqHeading> & { id: number }): ReqHeading {
  return {
    moduleId: 1, parentId: null, title: `H${partial.id}`, position: 0,
    deletedAt: null, createdAt: '', updatedAt: '', ...partial
  }
}

function req(partial: Partial<Requirement> & { id: number }): Requirement {
  return {
    moduleId: 1, reqId: `SRS-${partial.id}`, text: `R${partial.id}`,
    acceptanceCriteria: null, source: null, rationale: null,
    status: 'Draft', priority: 'Medium', reqType: 'Functional',
    headingId: null, position: 0, deletedAt: null, createdAt: '', updatedAt: '', ...partial
  }
}

const shape = (rows: OutlineRow[]): string[] =>
  rows.map((r) => (r.kind === 'heading' ? `${r.number} ${r.heading.title}` : r.requirement.reqId))

describe('buildOutline', () => {
  it('puts ungrouped requirements first, then numbered headings with their requirements', () => {
    const rows = buildOutline(
      [heading({ id: 10, position: 0 }), heading({ id: 20, position: 1 })],
      [req({ id: 1 }), req({ id: 2, headingId: 10 }), req({ id: 3, headingId: 20 })]
    )
    expect(shape(rows)).toEqual(['SRS-1', '1 H10', 'SRS-2', '2 H20', 'SRS-3'])
  })

  it('numbers subheadings 1.1, 1.2 under their parent, after the parent\'s own requirements', () => {
    const rows = buildOutline(
      [
        heading({ id: 10, position: 0 }),
        heading({ id: 11, parentId: 10, position: 0 }),
        heading({ id: 12, parentId: 10, position: 1 })
      ],
      [req({ id: 1, headingId: 10 }), req({ id: 2, headingId: 11 }), req({ id: 3, headingId: 12 })]
    )
    expect(shape(rows)).toEqual(['1 H10', 'SRS-1', '1.1 H11', 'SRS-2', '1.2 H12', 'SRS-3'])
  })

  it('orders headings by position then id, and renumbers accordingly', () => {
    const rows = buildOutline(
      [heading({ id: 10, position: 1 }), heading({ id: 20, position: 0 })],
      []
    )
    expect(shape(rows)).toEqual(['1 H20', '2 H10'])
  })

  it('treats a subheading with a missing parent as a top-level heading (orphan guard)', () => {
    const rows = buildOutline([heading({ id: 11, parentId: 99, position: 0 })], [])
    expect(shape(rows)).toEqual(['1 H11'])
  })

  it('numbers arbitrarily deep subheadings with a dotted path (1.1.1)', () => {
    const rows = buildOutline(
      [
        heading({ id: 10, position: 0 }),
        heading({ id: 11, parentId: 10, position: 0 }),
        heading({ id: 12, parentId: 11, position: 0 }),
        heading({ id: 20, position: 1 })
      ],
      []
    )
    expect(shape(rows)).toEqual(['1 H10', '1.1 H11', '1.1.1 H12', '2 H20'])
  })

  it('reports depth per nesting level', () => {
    const rows = buildOutline(
      [
        heading({ id: 10, position: 0 }),
        heading({ id: 11, parentId: 10, position: 0 }),
        heading({ id: 12, parentId: 11, position: 0 })
      ],
      []
    )
    const depths = rows.filter((r) => r.kind === 'heading').map((r) => (r as { depth: number }).depth)
    expect(depths).toEqual([0, 1, 2])
  })
})

describe('visibleRows', () => {
  const outline = buildOutline(
    [
      heading({ id: 10, position: 0 }),
      heading({ id: 11, parentId: 10, position: 0 }),
      heading({ id: 20, position: 1 })
    ],
    [req({ id: 1, headingId: 10 }), req({ id: 2, headingId: 11 }), req({ id: 3, headingId: 20 })]
  )

  it('returns everything when nothing is collapsed', () => {
    expect(visibleRows(outline, new Set())).toEqual(outline)
  })

  it('collapsing a top heading hides its requirements and subheadings but not later top headings', () => {
    expect(shape(visibleRows(outline, new Set([10])))).toEqual(['1 H10', '2 H20', 'SRS-3'])
  })

  it('collapsing a subheading hides only its own requirements', () => {
    expect(shape(visibleRows(outline, new Set([11])))).toEqual(['1 H10', 'SRS-1', '1.1 H11', '2 H20', 'SRS-3'])
  })
})
