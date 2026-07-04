import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RequirementDetail from './index'

const mockUpdateRequirement = vi.fn().mockResolvedValue(undefined)

const storeState = {
  selectedRequirementId: 1,
  requirements: [{
    id: 1, moduleId: 1, reqId: 'SRS-0001',
    text: 'The system shall respond within 2s',
    acceptanceCriteria: 'Measured under load',
    source: 'Customer spec', rationale: 'Performance SLA',
    status: 'Draft', priority: 'Medium', reqType: 'Functional',
    position: 0, deletedAt: null, createdAt: '', updatedAt: ''
  }],
  updateRequirement: mockUpdateRequirement,
  customFields: [],
  loadCustomFields: vi.fn(),
  addCustomField: vi.fn(),
  updateCustomField: vi.fn(),
  removeCustomField: vi.fn()
}

vi.mock('../../store', () => ({
  useStore: () => storeState
}))

describe('RequirementDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all 4 fields with current values', () => {
    render(<RequirementDetail />)
    expect(screen.getByDisplayValue('The system shall respond within 2s')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Measured under load')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Customer spec')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Performance SLA')).toBeInTheDocument()
  })

  it('shows req_id read-only', () => {
    render(<RequirementDetail />)
    expect(screen.getByText('SRS-0001')).toBeInTheDocument()
  })

  it('calls updateRequirement on blur with changed value', async () => {
    render(<RequirementDetail />)
    const field = screen.getByDisplayValue('The system shall respond within 2s')
    await userEvent.clear(field)
    await userEvent.type(field, 'New requirement text')
    fireEvent.blur(field)
    await waitFor(() => {
      expect(mockUpdateRequirement).toHaveBeenCalledWith(1, expect.objectContaining({ text: 'New requirement text' }))
    })
  })

  it('renders metadata selects with current values', () => {
    render(<RequirementDetail />)
    expect(screen.getByLabelText('Type')).toHaveValue('Functional')
    expect(screen.getByLabelText('Status')).toHaveValue('Draft')
    expect(screen.getByLabelText('Priority')).toHaveValue('Medium')
  })

  it('changing status saves immediately', async () => {
    render(<RequirementDetail />)
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Approved')
    expect(mockUpdateRequirement).toHaveBeenCalledWith(1, { status: 'Approved' })
  })

  it('changing priority saves immediately', async () => {
    render(<RequirementDetail />)
    await userEvent.selectOptions(screen.getByLabelText('Priority'), 'High')
    expect(mockUpdateRequirement).toHaveBeenCalledWith(1, { priority: 'High' })
  })
})
