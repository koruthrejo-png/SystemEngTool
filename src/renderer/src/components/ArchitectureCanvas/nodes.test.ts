import { describe, it, expect, vi } from 'vitest'
import { buildNodes, resolveDrop, fitChildInParent } from './nodes'
import type { ArchitectureElement } from '../../../../types'

function el(partial: Partial<ArchitectureElement> & { id: number }): ArchitectureElement {
  return {
    projectId: 1, architectureId: null, parentId: null, blockId: `SYS-${partial.id}`, name: `E${partial.id}`,
    elementTypeId: null, description: null, color: null,
    posX: 0, posY: 0, width: 160, height: 80,
    deletedAt: null, createdAt: '', updatedAt: '',
    ...partial
  }
}

describe('buildNodes', () => {
  it('orders parents before children regardless of input order', () => {
    const els = [el({ id: 3, parentId: 2 }), el({ id: 2, parentId: 1 }), el({ id: 1 })]
    const ids = buildNodes(els, [], [], null, vi.fn()).map((n) => n.id)
    expect(ids).toEqual(['1', '2', '3'])
  })

  it('sets parentId without extent so children can be dragged out', () => {
    const nodes = buildNodes([el({ id: 1 }), el({ id: 2, parentId: 1 })], [], [], null, vi.fn())
    const child = nodes.find((n) => n.id === '2')!
    expect(child.parentId).toBe('1')
    expect(child.extent).toBeUndefined()
  })

  it('renders an element whose parent is missing as a root (orphan guard)', () => {
    const nodes = buildNodes([el({ id: 2, parentId: 99 })], [], [], null, vi.fn())
    expect(nodes).toHaveLength(1)
    expect(nodes[0].parentId).toBeUndefined()
  })

  it('wires onResizeEnd through node data with the element id', () => {
    const spy = vi.fn()
    const nodes = buildNodes([el({ id: 7 })], [], [], null, spy)
    ;(nodes[0].data as { onResizeEnd: (x: number, y: number, w: number, h: number) => void }).onResizeEnd(10, 20, 300, 200)
    expect(spy).toHaveBeenCalledWith(7, 10, 20, 300, 200)
  })

  it('marks nested blocks and counts direct children in node data', () => {
    const nodes = buildNodes(
      [el({ id: 1 }), el({ id: 2, parentId: 1 }), el({ id: 3, parentId: 1 }), el({ id: 4 })],
      [],
      [],
      null,
      vi.fn()
    )
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n.data as { nested: boolean; childCount: number }]))
    expect(byId['1']).toMatchObject({ nested: false, childCount: 2 })
    expect(byId['2']).toMatchObject({ nested: true, childCount: 0 })
    expect(byId['4']).toMatchObject({ nested: false, childCount: 0 })
  })

  it('resolves typeName from elementTypes and null when unknown/missing', () => {
    const types = [{ id: 5, projectId: 1, name: 'Sensor', color: null, isBuiltIn: true, deletedAt: null, createdAt: '', updatedAt: '' }]
    const nodes = buildNodes(
      [el({ id: 1, elementTypeId: 5 }), el({ id: 2, elementTypeId: 99 }), el({ id: 3, elementTypeId: null })],
      types as any, [], null, vi.fn()
    )
    expect((nodes[0].data as any).typeName).toBe('Sensor')
    expect((nodes[1].data as any).typeName).toBeNull() // unknown id
    expect((nodes[2].data as any).typeName).toBeNull() // no type
  })

  it('counts connections incident on each element (source or target), self-loop once', () => {
    const conns = [
      { id: 1, sourceId: 1, targetId: 2 },
      { id: 2, sourceId: 3, targetId: 1 },
      { id: 3, sourceId: 1, targetId: 1 } // self-loop
    ]
    const nodes = buildNodes(
      [el({ id: 1 }), el({ id: 2 }), el({ id: 3 })],
      [], conns as any, null, vi.fn()
    )
    const count = (id: string) => (nodes.find((n) => n.id === id)!.data as any).connectionCount
    expect(count('1')).toBe(3) // conn 1 (source) + conn 2 (target) + conn 3 (self, once)
    expect(count('2')).toBe(1)
    expect(count('3')).toBe(1)
  })
})

describe('fitChildInParent', () => {
  it('keeps a child that already fits, clamped below the header', () => {
    const r = fitChildInParent(
      { width: 400, height: 300 },
      { posX: 100, posY: 100, width: 160, height: 80 }
    )
    expect(r).toEqual({ childX: 100, childY: 100, parentWidth: 400, parentHeight: 300 })
  })

  it('clamps a child dropped over the header/edges into the content area', () => {
    const r = fitChildInParent(
      { width: 400, height: 300 },
      { posX: 0, posY: 0, width: 160, height: 80 }
    )
    expect(r).toEqual({ childX: 12, childY: 36, parentWidth: 400, parentHeight: 300 })
  })

  it('grows the parent when the child does not fit', () => {
    const r = fitChildInParent(
      { width: 150, height: 60 },
      { posX: 5, posY: 5, width: 200, height: 100 }
    )
    // parent grows to child + padding (and header room); child sits at the padding origin
    expect(r).toEqual({ childX: 12, childY: 36, parentWidth: 224, parentHeight: 148 })
  })
})

describe('resolveDrop', () => {
  const container = el({ id: 1, posX: 100, posY: 100, width: 400, height: 300 })
  const small = el({ id: 2, posX: 600, posY: 600 })

  it('nests when the dragged center lands inside another block, storing parent-relative position', () => {
    // dragged abs (150,150), size 160x80 → center (230,190) inside container (100..500, 100..400)
    const r = resolveDrop(2, { x: 150, y: 150 }, [container, small])
    expect(r).toEqual({ parentId: 1, posX: 50, posY: 50 })
  })

  it('clears parent when dropped outside every candidate', () => {
    const nested = { ...small, parentId: 1, posX: 50, posY: 50 }
    const r = resolveDrop(2, { x: 900, y: 900 }, [container, nested])
    expect(r).toEqual({ parentId: null, posX: 900, posY: 900 })
  })

  it('picks the innermost (smallest) candidate when containers overlap', () => {
    const outer = el({ id: 1, posX: 0, posY: 0, width: 800, height: 600 })
    const inner = el({ id: 2, parentId: 1, posX: 100, posY: 100, width: 300, height: 200 })
    // dragged center (230,190) is inside both; inner wins; pos relative to inner's abs (100,100)
    const r = resolveDrop(3, { x: 150, y: 150 }, [outer, inner, el({ id: 3 })])
    expect(r).toEqual({ parentId: 2, posX: 50, posY: 50 })
  })

  it('never nests a node into itself or its own descendants', () => {
    const parent = el({ id: 1, posX: 0, posY: 0, width: 800, height: 600 })
    const child = { ...el({ id: 2, posX: 10, posY: 10, width: 700, height: 500 }), parentId: 1 }
    // dragging the PARENT over its child's area must not nest into the child
    const r = resolveDrop(1, { x: 50, y: 50 }, [parent, child])
    expect(r).toEqual({ parentId: null, posX: 50, posY: 50 })
  })
})
