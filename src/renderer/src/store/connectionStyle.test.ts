import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useStore } from './index'
import type { ArchitectureConnection } from '../../../types'

const conn = (over: Partial<ArchitectureConnection> = {}): ArchitectureConnection => ({
  id: 1, projectId: 1, architectureId: 1, connId: 'ICN-0001', sourceId: 10, targetId: 20,
  sourceHandle: null, targetHandle: null, name: null, connectionTypeId: null,
  lineStyle: 'solid', markerStart: 'none', markerEnd: 'arrowclosed',
  description: null, deletedAt: null, createdAt: '', updatedAt: '', ...over
})

beforeEach(() => {
  ;(window as any).api = {
    connections: {
      update: vi.fn(async (_id: number, input: any) => conn({ ...input }))
    }
  }
  useStore.setState({ connections: [conn()], undoStack: [], redoStack: [] })
})

describe('updateConnection style edits are undoable', () => {
  it('captures a lineStyle change; the pushed undo command replays the previous value', async () => {
    await useStore.getState().updateConnection(1, { lineStyle: 'dashed' })
    expect((window as any).api.connections.update).toHaveBeenLastCalledWith(1, { lineStyle: 'dashed' })
    expect(useStore.getState().undoStack.length).toBe(1)

    // Invoke the captured undo command DIRECTLY. Do NOT call the store's `undo()` action:
    // it runs `loadArchitecture()` in a finally block, which touches many other `window.api.*`
    // methods this focused test does not mock. The command itself is the unit under test.
    await useStore.getState().undoStack[0].undo()
    expect((window as any).api.connections.update).toHaveBeenLastCalledWith(1, { lineStyle: 'solid' })
  })

  it('captures markerStart and markerEnd changes', async () => {
    await useStore.getState().updateConnection(1, { markerEnd: 'arrow' })
    expect(useStore.getState().undoStack.length).toBe(1)
    await useStore.getState().updateConnection(1, { markerStart: 'arrow' })
    expect(useStore.getState().undoStack.length).toBe(2)
  })
})
