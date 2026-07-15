import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useStore } from './index'
import type { ArchitectureElement } from '../../../types'

const el = (over: Partial<ArchitectureElement> = {}): ArchitectureElement => ({
  id: 1, projectId: 1, architectureId: 1, parentId: null, blockId: 'SYS-001', name: 'Pump',
  elementTypeId: null, description: null, color: null, lineStyle: null, fillColor: null,
  posX: 0, posY: 0, width: 140, height: 60,
  preNestWidth: null, preNestHeight: null,
  deletedAt: null, createdAt: '', updatedAt: '', ...over
})

beforeEach(() => {
  ;(window as any).api = {
    elements: {
      update: vi.fn(async (_id: number, input: any) => el({ ...input }))
    }
  }
  useStore.setState({ elements: [el()], undoStack: [], redoStack: [] })
})

describe('updateElement fill edits are undoable', () => {
  it('captures a fillColor change; the pushed undo command replays the previous value', async () => {
    await useStore.getState().updateElement(1, { fillColor: '#e3f3f1' })
    expect((window as any).api.elements.update).toHaveBeenLastCalledWith(1, { fillColor: '#e3f3f1' })
    expect(useStore.getState().undoStack.length).toBe(1)

    // Invoke the captured undo command DIRECTLY. Do NOT call the store's `undo()` action:
    // it runs `loadArchitecture()` in a finally block, which touches many other `window.api.*`
    // methods this focused test does not mock. The command itself is the unit under test.
    await useStore.getState().undoStack[0].undo()
    expect((window as any).api.elements.update).toHaveBeenLastCalledWith(1, { fillColor: null })
  })

  it('captures clearing a fill back to null', async () => {
    useStore.setState({ elements: [el({ fillColor: '#e3f3f1' })] })
    await useStore.getState().updateElement(1, { fillColor: null })
    expect((window as any).api.elements.update).toHaveBeenLastCalledWith(1, { fillColor: null })
    expect(useStore.getState().undoStack.length).toBe(1)

    await useStore.getState().undoStack[0].undo()
    expect((window as any).api.elements.update).toHaveBeenLastCalledWith(1, { fillColor: '#e3f3f1' })
  })
})
