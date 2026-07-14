import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LayerPanel from './LayerPanel'
import { useStore } from '../../store'

vi.mock('../../store')

const layer = (id: number, name: string, state = 'visible') => ({ id, architectureId: 1, name, state, position: id, deletedAt: null, createdAt: '', updatedAt: '' })

beforeEach(() => {
  ;(useStore as any).mockReturnValue({
    layers: [layer(1, 'Power', 'visible'), layer(2, 'Comms', 'faded')],
    addLayer: vi.fn(), renameLayer: vi.fn(), cycleLayerState: vi.fn(), removeLayer: vi.fn()
  })
})

it('renders a row per layer', () => {
  render(<LayerPanel />)
  expect(screen.getByText('Power')).toBeInTheDocument()
  expect(screen.getByText('Comms')).toBeInTheDocument()
})

it('cycles a layer state when its dot is clicked', () => {
  const cycle = vi.fn()
  ;(useStore as any).mockReturnValue({
    layers: [layer(1, 'Power', 'visible')],
    addLayer: vi.fn(), renameLayer: vi.fn(), cycleLayerState: cycle, removeLayer: vi.fn()
  })
  render(<LayerPanel />)
  fireEvent.click(screen.getByLabelText('Cycle visibility of Power'))
  expect(cycle).toHaveBeenCalledWith(1)
})

it('adds a layer via the + affordance', () => {
  const addLayer = vi.fn()
  ;(useStore as any).mockReturnValue({
    layers: [], addLayer, renameLayer: vi.fn(), cycleLayerState: vi.fn(), removeLayer: vi.fn()
  })
  render(<LayerPanel />)
  fireEvent.click(screen.getByLabelText('New layer'))
  const input = screen.getByPlaceholderText('Layer name')
  fireEvent.change(input, { target: { value: 'Thermal' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(addLayer).toHaveBeenCalledWith('Thermal')
})
