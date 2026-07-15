import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ElementPanel from './index'
import { useStore } from '../../store'

vi.mock('../../store')

const el = { id: 100, projectId: 1, architectureId: 1, parentId: null, blockId: 'SYS-001', name: 'Pump', elementTypeId: null, description: null, color: null, lineStyle: null, posX: 0, posY: 0, width: 140, height: 60, deletedAt: null, createdAt: '', updatedAt: '' }
const layer = (id: number, name: string) => ({ id, architectureId: 1, name, state: 'visible', position: id, deletedAt: null, createdAt: '', updatedAt: '' })

beforeEach(() => {
  ;(window as any).api = { elementLinks: { list: vi.fn().mockResolvedValue([]) } }
  ;(useStore as any).mockReturnValue({
    selectedElementId: 100, elements: [el], elementTypes: [], projectRequirements: [],
    layers: [layer(1, 'Power'), layer(2, 'Comms')], elementLayers: [{ elementId: 100, layerId: 1 }],
    updateElement: vi.fn(), removeElement: vi.fn(), addElementLink: vi.fn(), removeElementLink: vi.fn(),
    toggleElementLayer: vi.fn()
  })
})

it('shows a checkbox per layer, checked for assigned layers', () => {
  render(<ElementPanel />)
  expect((screen.getByLabelText('Power') as HTMLInputElement).checked).toBe(true)
  expect((screen.getByLabelText('Comms') as HTMLInputElement).checked).toBe(false)
})

it('defaults the line style select to solid when unset', () => {
  render(<ElementPanel />)
  expect((screen.getByLabelText('Line style') as HTMLSelectElement).value).toBe('solid')
})

it('changing line style calls updateElement with { lineStyle }', () => {
  const updateElement = vi.fn()
  ;(useStore as any).mockReturnValue({
    selectedElementId: 100, elements: [el], elementTypes: [], projectRequirements: [],
    layers: [], elementLayers: [],
    updateElement, removeElement: vi.fn(), addElementLink: vi.fn(), removeElementLink: vi.fn(),
    toggleElementLayer: vi.fn()
  })
  render(<ElementPanel />)
  fireEvent.change(screen.getByLabelText('Line style'), { target: { value: 'dashed' } })
  expect(updateElement).toHaveBeenCalledWith(100, { lineStyle: 'dashed' })
})

it('toggles layer membership on checkbox click', () => {
  const toggle = vi.fn()
  ;(useStore as any).mockReturnValue({
    selectedElementId: 100, elements: [el], elementTypes: [], projectRequirements: [],
    layers: [layer(2, 'Comms')], elementLayers: [],
    updateElement: vi.fn(), removeElement: vi.fn(), addElementLink: vi.fn(), removeElementLink: vi.fn(),
    toggleElementLayer: toggle
  })
  render(<ElementPanel />)
  fireEvent.click(screen.getByLabelText('Comms'))
  expect(toggle).toHaveBeenCalledWith(100, 2)
})
