import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RequirementsList from './index'

const storeState: any = {}

vi.mock('../../store', () => ({
  useStore: () => storeState
}))

const req1 = {
  id: 1, moduleId: 1, reqId: 'SRS-0001', text: 'The system shall respond within 2s',
  acceptanceCriteria: null, source: null, rationale: null,
  status: 'Approved', priority: 'High', reqType: 'Functional',
  position: 0, deletedAt: null, createdAt: '', updatedAt: ''
}
const req2 = {
  id: 2, moduleId: 1, reqId: 'SRS-0002', text: 'The system shall log all faults',
  acceptanceCriteria: null, source: null, rationale: null,
  status: 'Draft', priority: 'Low', reqType: 'Non-Functional',
  position: 1, deletedAt: null, createdAt: '', updatedAt: ''
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(storeState, {
    selectedModuleId: 1,
    modules: [{ id: 1, projectId: 1, parentId: null, name: 'SRS', idPrefix: 'SRS', idPadding: 4, nextCounter: 3, position: 0, deletedAt: null, createdAt: '', updatedAt: '' }],
    requirements: [req1, req2],
    deletedRequirements: [],
    showDeleted: false,
    statusFilter: 'All', priorityFilter: 'All', typeFilter: 'All',
    selectedRequirementId: null,
    selectRequirement: vi.fn(),
    addRequirement: vi.fn().mockResolvedValue(undefined),
    removeRequirement: vi.fn().mockResolvedValue(undefined),
    restoreRequirement: vi.fn().mockResolvedValue(undefined),
    setShowDeleted: vi.fn().mockResolvedValue(undefined),
    setStatusFilter: vi.fn(),
    setPriorityFilter: vi.fn(),
    setTypeFilter: vi.fn()
  })
})

describe('RequirementsList', () => {
  it('renders requirement ID and text', () => {
    render(<RequirementsList />)
    expect(screen.getByText('SRS-0001')).toBeInTheDocument()
    expect(screen.getByText(/The system shall respond/)).toBeInTheDocument()
  })

  it('calls selectRequirement when a row is clicked', async () => {
    render(<RequirementsList />)
    await userEvent.click(screen.getByText('SRS-0001'))
    expect(storeState.selectRequirement).toHaveBeenCalledWith(1)
  })

  it('shows + New Requirement button', () => {
    render(<RequirementsList />)
    expect(screen.getByText('+ New Requirement')).toBeInTheDocument()
  })

  it('renders status and priority chips and type text in the row', () => {
    render(<RequirementsList />)
    const row = screen.getByText('SRS-0001').closest('.grid') as HTMLElement
    expect(within(row).getByText('Approved')).toBeInTheDocument()
    expect(within(row).getByText('High')).toBeInTheDocument()
    expect(within(row).getByText('Functional')).toBeInTheDocument()
  })

  it('filters rows by status', () => {
    storeState.statusFilter = 'Approved'
    render(<RequirementsList />)
    expect(screen.getByText('SRS-0001')).toBeInTheDocument()
    expect(screen.queryByText('SRS-0002')).not.toBeInTheDocument()
  })

  it('item count reflects filtered rows', () => {
    storeState.priorityFilter = 'High'
    render(<RequirementsList />)
    expect(screen.getByText('1 item')).toBeInTheDocument()
  })

  it('filter selects call store setters', async () => {
    render(<RequirementsList />)
    await userEvent.selectOptions(screen.getByLabelText('Filter by status'), 'Approved')
    expect(storeState.setStatusFilter).toHaveBeenCalledWith('Approved')
    await userEvent.selectOptions(screen.getByLabelText('Filter by priority'), 'Low')
    expect(storeState.setPriorityFilter).toHaveBeenCalledWith('Low')
    await userEvent.selectOptions(screen.getByLabelText('Filter by type'), 'Interface')
    expect(storeState.setTypeFilter).toHaveBeenCalledWith('Interface')
  })

  it('show-deleted checkbox calls setShowDeleted', async () => {
    render(<RequirementsList />)
    await userEvent.click(screen.getByLabelText(/show deleted/i))
    expect(storeState.setShowDeleted).toHaveBeenCalledWith(true)
  })

  it('deleted view shows Restore and calls restoreRequirement', async () => {
    storeState.showDeleted = true
    storeState.deletedRequirements = [{ ...req1, id: 9, reqId: 'SRS-0009', deletedAt: '2026-07-03' }]
    render(<RequirementsList />)
    await userEvent.click(screen.getByText('Restore'))
    expect(storeState.restoreRequirement).toHaveBeenCalledWith(9)
  })

  it('row delete button calls removeRequirement', async () => {
    render(<RequirementsList />)
    await userEvent.click(screen.getAllByLabelText('Delete requirement')[0])
    expect(storeState.removeRequirement).toHaveBeenCalledWith(1)
  })
})
