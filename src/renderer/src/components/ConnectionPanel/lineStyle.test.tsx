import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ConnectionPanel from './index'
import { useStore } from '../../store'

vi.mock('../../store')

const conn = {
  id: 1, projectId: 1, architectureId: 1, connId: 'ICN-0001', sourceId: 10, targetId: 20,
  sourceHandle: null, targetHandle: null, name: null, connectionTypeId: null,
  lineStyle: 'solid', markerStart: 'none', markerEnd: 'arrowclosed',
  description: null, deletedAt: null, createdAt: '', updatedAt: ''
}

beforeEach(() => {
  ;(window as any).api = { connectionLinks: { list: vi.fn().mockResolvedValue([]) } }
  ;(useStore as any).mockReturnValue({
    selectedConnectionId: 1, connections: [conn], connectionTypes: [], projectRequirements: [],
    updateConnection: vi.fn(), removeConnection: vi.fn(), addConnectionLink: vi.fn(), removeConnectionLink: vi.fn(),
    connectionCustomFields: [], loadConnectionCustomFields: vi.fn(),
    addConnectionCustomField: vi.fn(), updateConnectionCustomField: vi.fn(), removeConnectionCustomField: vi.fn(),
    layers: [], connectionLayers: [], toggleConnectionLayer: vi.fn()
  })
})

it('renders the three style selects with current values', () => {
  render(<ConnectionPanel />)
  expect((screen.getByLabelText('Line style') as HTMLSelectElement).value).toBe('solid')
  expect((screen.getByLabelText('Arrow start') as HTMLSelectElement).value).toBe('none')
  expect((screen.getByLabelText('Arrow end') as HTMLSelectElement).value).toBe('arrowclosed')
})

it('changing line style calls updateConnection with { lineStyle }', () => {
  const updateConnection = vi.fn()
  ;(useStore as any).mockReturnValue({
    selectedConnectionId: 1, connections: [conn], connectionTypes: [], projectRequirements: [],
    updateConnection, removeConnection: vi.fn(), addConnectionLink: vi.fn(), removeConnectionLink: vi.fn(),
    connectionCustomFields: [], loadConnectionCustomFields: vi.fn(),
    addConnectionCustomField: vi.fn(), updateConnectionCustomField: vi.fn(), removeConnectionCustomField: vi.fn(),
    layers: [], connectionLayers: [], toggleConnectionLayer: vi.fn()
  })
  render(<ConnectionPanel />)
  fireEvent.change(screen.getByLabelText('Line style'), { target: { value: 'dashed' } })
  expect(updateConnection).toHaveBeenCalledWith(1, { lineStyle: 'dashed' })
})

it('changing arrow end calls updateConnection with { markerEnd }', () => {
  const updateConnection = vi.fn()
  ;(useStore as any).mockReturnValue({
    selectedConnectionId: 1, connections: [conn], connectionTypes: [], projectRequirements: [],
    updateConnection, removeConnection: vi.fn(), addConnectionLink: vi.fn(), removeConnectionLink: vi.fn(),
    connectionCustomFields: [], loadConnectionCustomFields: vi.fn(),
    addConnectionCustomField: vi.fn(), updateConnectionCustomField: vi.fn(), removeConnectionCustomField: vi.fn(),
    layers: [], connectionLayers: [], toggleConnectionLayer: vi.fn()
  })
  render(<ConnectionPanel />)
  fireEvent.change(screen.getByLabelText('Arrow end'), { target: { value: 'arrow' } })
  expect(updateConnection).toHaveBeenCalledWith(1, { markerEnd: 'arrow' })
})
