import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useStore } from './index'

const arch = (id: number, name: string, position = 0) => ({ id, projectId: 1, name, position, deletedAt: null, createdAt: '', updatedAt: '' })

beforeEach(() => {
  localStorage.clear()
  ;(window as any).api = {
    architectures: {
      list: vi.fn().mockResolvedValue([arch(10, 'Default', 0), arch(11, 'Comms', 1)]),
      create: vi.fn().mockResolvedValue(arch(12, 'New', 2)),
      rename: vi.fn(), delete: vi.fn().mockResolvedValue(undefined)
    },
    elements: { list: vi.fn().mockResolvedValue([]) },
    connections: { list: vi.fn().mockResolvedValue([]) },
    elementTypes: { list: vi.fn().mockResolvedValue([]) },
    connectionTypes: { list: vi.fn().mockResolvedValue([]) },
    requirements: { listByProject: vi.fn().mockResolvedValue([]) }
  }
  useStore.setState({ project: { id: 1, name: 'P' } as any, architectures: [], activeArchitectureId: null })
})

describe('loadArchitectures', () => {
  it('loads list and defaults active to the first architecture', async () => {
    await useStore.getState().loadArchitectures()
    const s = useStore.getState()
    expect(s.architectures.map((a) => a.id)).toEqual([10, 11])
    expect(s.activeArchitectureId).toBe(10)
    expect((window as any).api.elements.list).toHaveBeenCalledWith(1, 10)
  })

  it('restores the persisted active architecture when still present', async () => {
    localStorage.setItem('reqarch.activeArchitecture.1', '11')
    await useStore.getState().loadArchitectures()
    expect(useStore.getState().activeArchitectureId).toBe(11)
    expect((window as any).api.elements.list).toHaveBeenCalledWith(1, 11)
  })
})

describe('setActiveArchitecture', () => {
  it('persists the choice and reloads the canvas for that architecture', async () => {
    await useStore.getState().loadArchitectures()
    await useStore.getState().setActiveArchitecture(11)
    expect(useStore.getState().activeArchitectureId).toBe(11)
    expect(localStorage.getItem('reqarch.activeArchitecture.1')).toBe('11')
    expect((window as any).api.connections.list).toHaveBeenLastCalledWith(1, 11)
  })
})

describe('removeArchitecture', () => {
  it('switches active to a surviving sibling after delete', async () => {
    await useStore.getState().loadArchitectures() // active = 10
    ;(window as any).api.architectures.list.mockResolvedValue([arch(11, 'Comms', 1)])
    await useStore.getState().removeArchitecture(10)
    expect((window as any).api.architectures.delete).toHaveBeenCalledWith(10)
    expect(useStore.getState().activeArchitectureId).toBe(11)
  })
})
