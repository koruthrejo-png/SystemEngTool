import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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

// The three style selects moved to the top bar's connection Style popover — see
// ArchitectureCanvas/index.test.tsx. They are deleted here, not mirrored.
it('no longer renders the three style selects — they live in the top bar', () => {
  render(<ConnectionPanel />)
  expect(screen.queryByLabelText('Line style')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Arrow start')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Arrow end')).not.toBeInTheDocument()
})

it('still renders the fields it kept', () => {
  render(<ConnectionPanel />)
  expect(screen.getByLabelText('Type')).toBeInTheDocument()
  expect(screen.getByText('Description')).toBeInTheDocument()
})
