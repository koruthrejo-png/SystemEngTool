import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConnectionPanel from './index'

const mockUpdateConnection = vi.fn().mockResolvedValue(undefined)
const mockRemoveConnection = vi.fn().mockResolvedValue(undefined)

;(window as any).api = {
  connectionLinks: { list: vi.fn().mockResolvedValue([]) }
}

vi.mock('../../store', () => ({
  useStore: () => ({
    selectedConnectionId: 1,
    connections: [{
      id: 1, projectId: 1, connId: 'ICN-0001', sourceId: 1, targetId: 2,
      name: 'Power bus', connectionTypeId: null, description: '28V DC',
      deletedAt: null, createdAt: '', updatedAt: ''
    }],
    connectionTypes: [
      { id: 1, projectId: 1, name: 'Power', color: null, isBuiltIn: true, deletedAt: null, createdAt: '', updatedAt: '' }
    ],
    projectRequirements: [],
    updateConnection: mockUpdateConnection,
    removeConnection: mockRemoveConnection,
    addConnectionLink: vi.fn(),
    removeConnectionLink: vi.fn(),
    connectionCustomFields: [],
    loadConnectionCustomFields: vi.fn(),
    addConnectionCustomField: vi.fn(),
    updateConnectionCustomField: vi.fn(),
    removeConnectionCustomField: vi.fn(),
    layers: [],
    connectionLayers: [],
    toggleConnectionLayer: vi.fn()
  })
}))

describe('ConnectionPanel', () => {
  beforeEach(() => mockUpdateConnection.mockClear())

  it('renders connection ID read-only', () => {
    render(<ConnectionPanel />)
    expect(screen.getByText('ICN-0001')).toBeInTheDocument()
  })

  it('renders name field with current value', () => {
    render(<ConnectionPanel />)
    expect(screen.getByDisplayValue('Power bus')).toBeInTheDocument()
  })

  it('calls updateConnection on name blur', async () => {
    render(<ConnectionPanel />)
    const field = screen.getByDisplayValue('Power bus')
    await userEvent.clear(field)
    await userEvent.type(field, 'Control bus')
    fireEvent.blur(field)
    await waitFor(() => expect(mockUpdateConnection).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'Control bus' })))
  })

  it('renders description field', () => {
    render(<ConnectionPanel />)
    expect(screen.getByDisplayValue('28V DC')).toBeInTheDocument()
  })

  it('renders type dropdown', () => {
    render(<ConnectionPanel />)
    expect(screen.getByLabelText('Type')).toBeInTheDocument()
  })
})
