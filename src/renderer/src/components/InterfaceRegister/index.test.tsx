import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import InterfaceRegister from './index'
import { useStore } from '../../store'

vi.mock('../../store')

const elements = [
  { id: 10, projectId: 1, parentId: null, blockId: 'SYS-001', name: 'ECU', elementTypeId: null, description: null, color: null, posX: 0, posY: 0, width: 140, height: 60, deletedAt: null, createdAt: '', updatedAt: '' },
  { id: 20, projectId: 1, parentId: null, blockId: 'SYS-002', name: 'Sensor', elementTypeId: null, description: null, color: null, posX: 0, posY: 0, width: 140, height: 60, deletedAt: null, createdAt: '', updatedAt: '' }
]
const connections = [
  { id: 1, projectId: 1, connId: 'ICN-0001', sourceId: 10, targetId: 20, sourceHandle: null, targetHandle: null, name: 'CAN', connectionTypeId: null, description: null, deletedAt: null, createdAt: '', updatedAt: '' }
]

beforeEach(() => {
  localStorage.clear()
  ;(useStore as any).mockReturnValue({
    connections, elements, connectionTypes: [], projectConnectionCustomFields: [], architectures: [],
    loadInterfaces: vi.fn(), addConnection: vi.fn(), setActiveTab: vi.fn(),
    selectRequirement: vi.fn(), selectedConnectionId: null,
    selectConnection: vi.fn(), project: { id: 1, name: 'P' }
  })
})

it('renders one interface row with mandatory ID + object ID columns', () => {
  render(<InterfaceRegister />)
  expect(screen.getByText('ICN-0001')).toBeInTheDocument()
  expect(screen.getByText('SYS-001')).toBeInTheDocument()
  expect(screen.getByText('SYS-002')).toBeInTheDocument()
})
