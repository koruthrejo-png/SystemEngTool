import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useStore } from './index'
import type { Layer } from '../../../types'

const layer = (id: number, name: string, state: Layer['state'] = 'visible', position = id): Layer =>
  ({ id, architectureId: 5, name, state, position, deletedAt: null, createdAt: '', updatedAt: '' })

beforeEach(() => {
  ;(window as any).api = {
    layers: {
      list: vi.fn().mockResolvedValue([layer(1, 'Power'), layer(2, 'Comms')]),
      assignments: vi.fn().mockResolvedValue({ elementLayers: [{ elementId: 100, layerId: 1 }], connectionLayers: [] }),
      create: vi.fn().mockResolvedValue(layer(3, 'Thermal', 'visible', 2)),
      rename: vi.fn().mockResolvedValue(layer(1, 'Renamed')),
      setState: vi.fn().mockResolvedValue(layer(1, 'Power', 'faded')),
      delete: vi.fn().mockResolvedValue(undefined),
      assignElement: vi.fn().mockResolvedValue(undefined),
      unassignElement: vi.fn().mockResolvedValue(undefined),
      assignConnection: vi.fn().mockResolvedValue(undefined),
      unassignConnection: vi.fn().mockResolvedValue(undefined)
    }
  }
  useStore.setState({ activeArchitectureId: 5, layers: [], elementLayers: [], connectionLayers: [] })
})

describe('loadLayers', () => {
  it('loads layers + assignments for the active architecture', async () => {
    await useStore.getState().loadLayers()
    const s = useStore.getState()
    expect(s.layers.map((l) => l.id)).toEqual([1, 2])
    expect(s.elementLayers).toEqual([{ elementId: 100, layerId: 1 }])
    expect((window as any).api.layers.list).toHaveBeenCalledWith(5)
  })

  it('clears layers when no active architecture', async () => {
    useStore.setState({ activeArchitectureId: null, layers: [layer(9, 'Stale')] })
    await useStore.getState().loadLayers()
    expect(useStore.getState().layers).toEqual([])
    expect((window as any).api.layers.list).not.toHaveBeenCalled()
  })
})

describe('cycleLayerState', () => {
  it('cycles visible -> faded -> hidden -> visible via setState', async () => {
    useStore.setState({ layers: [layer(1, 'Power', 'visible')] })
    await useStore.getState().cycleLayerState(1)
    expect((window as any).api.layers.setState).toHaveBeenCalledWith(1, 'faded')

    useStore.setState({ layers: [layer(1, 'Power', 'faded')] })
    await useStore.getState().cycleLayerState(1)
    expect((window as any).api.layers.setState).toHaveBeenCalledWith(1, 'hidden')

    useStore.setState({ layers: [layer(1, 'Power', 'hidden')] })
    await useStore.getState().cycleLayerState(1)
    expect((window as any).api.layers.setState).toHaveBeenCalledWith(1, 'visible')
  })
})

describe('toggleElementLayer', () => {
  it('assigns when not a member, unassigns when a member', async () => {
    useStore.setState({ elementLayers: [] })
    await useStore.getState().toggleElementLayer(100, 2)
    expect((window as any).api.layers.assignElement).toHaveBeenCalledWith(100, 2)

    useStore.setState({ elementLayers: [{ elementId: 100, layerId: 2 }] })
    await useStore.getState().toggleElementLayer(100, 2)
    expect((window as any).api.layers.unassignElement).toHaveBeenCalledWith(100, 2)
  })
})
