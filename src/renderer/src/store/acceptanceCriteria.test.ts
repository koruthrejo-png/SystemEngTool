import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useStore } from './index'
import type { AcceptanceCriterion } from '../../../types'

function item(over: Partial<AcceptanceCriterion>): AcceptanceCriterion {
  return {
    id: 1, requirementId: 5, text: 'c1', status: 'Unverified', position: 0,
    createdAt: '', updatedAt: '', ...over
  }
}

const mockList = vi.fn()
const mockListByModule = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockRemove = vi.fn()
const mockMove = vi.fn()

beforeEach(() => {
  mockList.mockReset().mockResolvedValue([item({ id: 1 })])
  mockListByModule.mockReset().mockResolvedValue([item({ id: 1 })])
  mockCreate.mockReset().mockResolvedValue(item({ id: 2, text: '' }))
  mockUpdate.mockReset().mockResolvedValue(item({ id: 1, status: 'Passed' }))
  mockRemove.mockReset().mockResolvedValue(undefined)
  mockMove.mockReset().mockResolvedValue(undefined)
  ;(window as any).api = {
    ...(window as any).api,
    acceptanceCriteria: {
      list: mockList, listByModule: mockListByModule, create: mockCreate,
      update: mockUpdate, remove: mockRemove, move: mockMove
    }
  }
  useStore.setState({ acItems: [], acSummary: {}, selectedModuleId: 3 })
})

describe('acceptance criteria store actions', () => {
  it('loadAcItems fetches items for the requirement', async () => {
    await useStore.getState().loadAcItems(5)
    expect(mockList).toHaveBeenCalledWith(5)
    expect(useStore.getState().acItems).toHaveLength(1)
  })

  it('addAcItem creates then refetches items and derives summary from that list', async () => {
    await useStore.getState().addAcItem(5, '')
    expect(mockCreate).toHaveBeenCalledWith(5, '')
    expect(mockList).toHaveBeenCalledWith(5)
    // refreshAc derives this req's summary entry from the same list — no whole-module re-query.
    expect(mockListByModule).not.toHaveBeenCalled()
    expect(useStore.getState().acSummary[5]).toEqual({ passed: 0, total: 1, first: 'c1' })
  })

  it('updateAcItem patches then refetches', async () => {
    await useStore.getState().updateAcItem(1, { status: 'Passed' }, 5)
    expect(mockUpdate).toHaveBeenCalledWith(1, { status: 'Passed' })
    expect(mockList).toHaveBeenCalledWith(5)
  })

  it('removeAcItem deletes then refetches', async () => {
    await useStore.getState().removeAcItem(1, 5)
    expect(mockRemove).toHaveBeenCalledWith(1)
    expect(mockList).toHaveBeenCalledWith(5)
  })

  it('moveAcItem moves then refetches', async () => {
    await useStore.getState().moveAcItem(1, 'down', 5)
    expect(mockMove).toHaveBeenCalledWith(1, 'down')
    expect(mockList).toHaveBeenCalledWith(5)
  })
})
