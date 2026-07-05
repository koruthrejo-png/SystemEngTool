import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RequirementsList from './index'

const storeState: any = {}

vi.mock('../../store', () => ({
  useStore: () => storeState
}))

const req1 = {
  id: 1, moduleId: 1, reqId: 'SRS-0001', text: 'The system shall respond within 2s',
  acceptanceCriteria: null, source: null, rationale: null,
  status: 'Approved', priority: 'High', reqType: 'Functional', headingId: null,
  position: 0, deletedAt: null, createdAt: '', updatedAt: ''
}
const req2 = {
  id: 2, moduleId: 1, reqId: 'SRS-0002', text: 'The system shall log all faults',
  acceptanceCriteria: null, source: null, rationale: null,
  status: 'Draft', priority: 'Low', reqType: 'Non-Functional', headingId: null,
  position: 1, deletedAt: null, createdAt: '', updatedAt: ''
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
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
    setTypeFilter: vi.fn(),
    checkedIds: [],
    toggleChecked: vi.fn(),
    setChecked: vi.fn(),
    updateRequirements: vi.fn().mockResolvedValue(undefined),
    removeRequirements: vi.fn().mockResolvedValue(undefined)
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

  it('renders a checkbox per row and a select-all in the header', () => {
    render(<RequirementsList />)
    expect(screen.getByLabelText('Select SRS-0001')).toBeInTheDocument()
    expect(screen.getByLabelText('Select SRS-0002')).toBeInTheDocument()
    expect(screen.getByLabelText('Select all')).toBeInTheDocument()
  })

  it('row checkbox calls toggleChecked without selecting the row', async () => {
    render(<RequirementsList />)
    await userEvent.click(screen.getByLabelText('Select SRS-0001'))
    expect(storeState.toggleChecked).toHaveBeenCalledWith(1)
    expect(storeState.selectRequirement).not.toHaveBeenCalled()
  })

  it('select-all checks all displayed rows, unchecks when all checked', async () => {
    render(<RequirementsList />)
    await userEvent.click(screen.getByLabelText('Select all'))
    expect(storeState.setChecked).toHaveBeenCalledWith([1, 2])

    storeState.setChecked.mockClear()
    storeState.checkedIds = [1, 2]
    render(<RequirementsList />)
    await userEvent.click(screen.getAllByLabelText('Select all')[1])
    expect(storeState.setChecked).toHaveBeenCalledWith([])
  })

  it('bulk bar hidden when nothing checked, shows count when checked', () => {
    render(<RequirementsList />)
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()

    storeState.checkedIds = [1]
    render(<RequirementsList />)
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('bulk set-status applies to checked ids', async () => {
    storeState.checkedIds = [1, 2]
    render(<RequirementsList />)
    await userEvent.selectOptions(screen.getByLabelText('Set status'), 'Approved')
    expect(storeState.updateRequirements).toHaveBeenCalledWith([1, 2], { status: 'Approved' })
  })

  it('bulk set-priority applies to checked ids', async () => {
    storeState.checkedIds = [1]
    render(<RequirementsList />)
    await userEvent.selectOptions(screen.getByLabelText('Set priority'), 'Low')
    expect(storeState.updateRequirements).toHaveBeenCalledWith([1], { priority: 'Low' })
  })

  it('Delete selected and Clear act on the checked set', async () => {
    storeState.checkedIds = [1, 2]
    render(<RequirementsList />)
    await userEvent.click(screen.getByText('Delete selected'))
    expect(storeState.removeRequirements).toHaveBeenCalledWith([1, 2])
    await userEvent.click(screen.getByText('Clear'))
    expect(storeState.setChecked).toHaveBeenCalledWith([])
  })

  it('no checkboxes or bulk bar in the deleted view', () => {
    storeState.showDeleted = true
    storeState.checkedIds = [1]
    storeState.deletedRequirements = [{ ...req1, id: 9, reqId: 'SRS-0009', deletedAt: '2026-07-04' }]
    render(<RequirementsList />)
    expect(screen.queryByLabelText(/Select /)).not.toBeInTheDocument()
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
  })

  it('table scrolls horizontally instead of clipping columns', () => {
    render(<RequirementsList />)
    expect(screen.getByTestId('req-table-scroll').className).toContain('overflow-auto')
  })

  it('renders resize handles on data column headers only', () => {
    render(<RequirementsList />)
    expect(screen.getByLabelText('Resize ID column')).toBeInTheDocument()
    expect(screen.getByLabelText('Resize Requirement column')).toBeInTheDocument()
    expect(screen.getByLabelText('Resize Priority column')).toBeInTheDocument()
    expect(screen.queryAllByLabelText(/Resize .* column/)).toHaveLength(8)
  })

  it('dragging a handle resizes the column and persists the widths', () => {
    render(<RequirementsList />)
    const header = screen.getByTestId('req-grid-header')
    const idBefore = header.style.gridTemplateColumns.split(' ')[1]
    const handle = screen.getByLabelText('Resize ID column')
    fireEvent.mouseDown(handle, { clientX: 100 })
    fireEvent.mouseMove(window, { clientX: 160 })
    fireEvent.mouseUp(window)
    const cols = header.style.gridTemplateColumns.split(' ')
    expect(cols[1]).toBe(`${parseInt(idBefore) + 60}px`)
    const saved = JSON.parse(localStorage.getItem('reqarch.reqTable.colWidths.v1')!)
    expect(saved[1]).toBe(parseInt(idBefore) + 60)
  })

  it('a resize never shrinks a column below the minimum', () => {
    render(<RequirementsList />)
    const handle = screen.getByLabelText('Resize ID column')
    fireEvent.mouseDown(handle, { clientX: 500 })
    fireEvent.mouseMove(window, { clientX: 0 })
    fireEvent.mouseUp(window)
    const header = screen.getByTestId('req-grid-header')
    expect(header.style.gridTemplateColumns.split(' ')[1]).toBe('48px')
  })
})
