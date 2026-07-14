import { describe, it, expect } from 'vitest'
import { topLevelModules, childrenOf, descendantIds, flattenTree } from './moduleTree'
import type { Module } from '../../../../types'

const mod = (id: number, parentId: number | null, name = `M${id}`): Module => ({
  id, projectId: 1, parentId, kind: 'module', name, idPrefix: 'M', idPadding: 4,
  nextCounter: 1, position: 0, deletedAt: null, createdAt: '', updatedAt: ''
})

describe('moduleTree helpers', () => {
  const mods = [mod(1, null), mod(2, 1), mod(3, 2), mod(4, null), mod(5, 99)] // 5 has dangling parent

  it('topLevelModules includes null-parent and orphaned modules', () => {
    expect(topLevelModules(mods).map((m) => m.id)).toEqual([1, 4, 5])
  })

  it('childrenOf returns direct children only', () => {
    expect(childrenOf(mods, 1).map((m) => m.id)).toEqual([2])
    expect(childrenOf(mods, 2).map((m) => m.id)).toEqual([3])
    expect(childrenOf(mods, 4)).toEqual([])
  })

  it('descendantIds walks the whole subtree', () => {
    expect([...descendantIds(mods, 1)].sort()).toEqual([2, 3])
    expect(descendantIds(mods, 4).size).toBe(0)
  })

  it('flattenTree yields depth-first order with depths', () => {
    expect(flattenTree(mods).map((e) => [e.module.id, e.depth])).toEqual([
      [1, 0], [2, 1], [3, 2], [4, 0], [5, 0]
    ])
  })
})
