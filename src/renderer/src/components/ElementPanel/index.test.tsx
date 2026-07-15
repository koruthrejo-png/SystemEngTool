import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ElementPanel from './index'

const mockUpdateElement = vi.fn().mockResolvedValue(undefined)
const mockRemoveElement = vi.fn().mockResolvedValue(undefined)
const mockAddElementLink = vi.fn().mockResolvedValue(undefined)
const mockRemoveElementLink = vi.fn().mockResolvedValue(undefined)

;(window as any).api = {
  elementLinks: { list: vi.fn().mockResolvedValue([]) }
}

vi.mock('../../store', () => ({
  useStore: () => ({
    selectedElementId: 1,
    elements: [{
      id: 1, projectId: 1, parentId: null, blockId: 'SYS-001', name: 'Propulsion',
      elementTypeId: null, description: 'Main engine', color: null,
      posX: 100, posY: 100, width: 160, height: 80,
      deletedAt: null, createdAt: '', updatedAt: ''
    }],
    elementTypes: [
      { id: 1, projectId: 1, name: 'System', color: null, isBuiltIn: true, deletedAt: null, createdAt: '', updatedAt: '' }
    ],
    projectRequirements: [
      { id: 1, moduleId: 1, reqId: 'SRS-0001', text: 'The system shall thrust', acceptanceCriteria: null, source: null, rationale: null, status: 'Draft', priority: 'Medium', reqType: 'Functional', headingId: null, position: 0, deletedAt: null, createdAt: '', updatedAt: '' }
    ],
    updateElement: mockUpdateElement,
    removeElement: mockRemoveElement,
    addElementLink: mockAddElementLink,
    removeElementLink: mockRemoveElementLink,
    layers: [],
    elementLayers: [],
    toggleElementLayer: vi.fn()
  })
}))

describe('ElementPanel', () => {
  beforeEach(() => {
    mockUpdateElement.mockClear()
    mockRemoveElement.mockClear()
  })

  it('renders block ID read-only', () => {
    render(<ElementPanel />)
    expect(screen.getByText('SYS-001')).toBeInTheDocument()
  })

  it('renders name field with current value', () => {
    render(<ElementPanel />)
    expect(screen.getByDisplayValue('Propulsion')).toBeInTheDocument()
  })

  it('calls updateElement on name field blur', async () => {
    render(<ElementPanel />)
    const field = screen.getByDisplayValue('Propulsion')
    await userEvent.clear(field)
    await userEvent.type(field, 'Engine')
    fireEvent.blur(field)
    await waitFor(() => expect(mockUpdateElement).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'Engine' })))
  })

  it('renders description field', () => {
    render(<ElementPanel />)
    expect(screen.getByDisplayValue('Main engine')).toBeInTheDocument()
  })

  it('renders type dropdown', () => {
    render(<ElementPanel />)
    expect(screen.getByLabelText('Type')).toBeInTheDocument()
  })
})
