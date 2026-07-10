import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ConnectionPanel from './index'
import { useStore } from '../../store'

vi.mock('../../store')

const conn = {
  id: 1, projectId: 1, connId: 'ICN-0001', sourceId: 10, targetId: 20,
  sourceHandle: null, targetHandle: null, name: 'CAN', connectionTypeId: null,
  description: null, deletedAt: null, createdAt: '', updatedAt: ''
}

beforeEach(() => {
  ;(window as any).api = { connectionLinks: { list: vi.fn().mockResolvedValue([]) } }
})

it('renders custom fields and an Add Field button', () => {
  const addConnectionCustomField = vi.fn()
  ;(useStore as any).mockReturnValue({
    selectedConnectionId: 1, connections: [conn], connectionTypes: [], projectRequirements: [],
    connectionCustomFields: [{ id: 7, connectionId: 1, key: 'Protocol', value: 'CAN 2.0', position: 0, createdAt: '', updatedAt: '' }],
    loadConnectionCustomFields: vi.fn(), addConnectionCustomField, updateConnectionCustomField: vi.fn(),
    removeConnectionCustomField: vi.fn(), updateConnection: vi.fn(), removeConnection: vi.fn(),
    addConnectionLink: vi.fn(), removeConnectionLink: vi.fn()
  })
  render(<ConnectionPanel />)
  expect(screen.getByDisplayValue('Protocol')).toBeInTheDocument()
  expect(screen.getByDisplayValue('CAN 2.0')).toBeInTheDocument()
  fireEvent.click(screen.getByText('+ Add Field'))
  expect(addConnectionCustomField).toHaveBeenCalledWith(1)
})
