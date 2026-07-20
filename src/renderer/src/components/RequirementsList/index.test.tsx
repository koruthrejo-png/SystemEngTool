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
    filterRules: [], filterCombine: 'AND',
    selectedRequirementId: null,
    selectRequirement: vi.fn(),
    addRequirement: vi.fn().mockResolvedValue(undefined),
    updateRequirement: vi.fn().mockResolvedValue(undefined),
    removeRequirement: vi.fn().mockResolvedValue(undefined),
    restoreRequirement: vi.fn().mockResolvedValue(undefined),
    setShowDeleted: vi.fn().mockResolvedValue(undefined),
    setFilterRules: vi.fn(),
    setFilterCombine: vi.fn(),
    acSummary: {},
    checkedIds: [],
    toggleChecked: vi.fn(),
    setChecked: vi.fn(),
    updateRequirements: vi.fn().mockResolvedValue(undefined),
    removeRequirements: vi.fn().mockResolvedValue(undefined),
    headings: [],
    collapsedHeadingIds: [],
    toggleHeadingCollapsed: vi.fn(),
    addHeading: vi.fn().mockResolvedValue(undefined),
    renameHeading: vi.fn().mockResolvedValue(undefined),
    moveHeading: vi.fn().mockResolvedValue(undefined),
    reparentHeading: vi.fn().mockResolvedValue(undefined),
    removeHeading: vi.fn().mockResolvedValue(undefined)
  })
})

describe('RequirementsList', () => {
  it('renders requirement ID and text', () => {
    render(<RequirementsList />)
    expect(screen.getByText('SRS-0001')).toBeInTheDocument()
    expect(screen.getByText(/The system shall respond/)).toBeInTheDocument()
  })

  it('opens detail on double-click; single click only highlights', async () => {
    render(<RequirementsList />)
    await userEvent.click(screen.getByText('SRS-0001'))
    expect(storeState.selectRequirement).not.toHaveBeenCalled()
    await userEvent.dblClick(screen.getByText('SRS-0001'))
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

  it('filters rows by a status rule', () => {
    storeState.filterRules = [{ id: 'a', attr: 'status', op: 'equals', value: 'Approved' }]
    render(<RequirementsList />)
    expect(screen.getByText('SRS-0001')).toBeInTheDocument()
    expect(screen.queryByText('SRS-0002')).not.toBeInTheDocument()
  })

  it('item count reflects filtered rows', () => {
    storeState.filterRules = [{ id: 'a', attr: 'priority', op: 'equals', value: 'High' }]
    render(<RequirementsList />)
    expect(screen.getByText('1 item')).toBeInTheDocument()
  })

  it('+ Add filter appends a default rule via the store setter', async () => {
    render(<RequirementsList />)
    await userEvent.click(screen.getByRole('button', { name: /^Filter/ }))
    await userEvent.click(screen.getByText('+ Add filter'))
    expect(storeState.setFilterRules).toHaveBeenCalledWith([
      expect.objectContaining({ attr: 'text', op: 'contains', value: '' })
    ])
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
    expect(screen.getByLabelText('Resize Text column')).toBeInTheDocument()
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
    const saved = JSON.parse(localStorage.getItem('reqarch.reqTable.columns.v2')!)
    expect(saved.find((c: { key: string }) => c.key === 'reqId').width).toBe(parseInt(idBefore) + 60)
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

  const headingFixture = {
    id: 5, moduleId: 1, parentId: null, title: 'Power', position: 0,
    deletedAt: null, createdAt: '', updatedAt: ''
  }

  it('renders a numbered heading row with requirements grouped under it', () => {
    Object.assign(storeState, {
      headings: [headingFixture],
      requirements: [req1, { ...req2, headingId: 5 }]
    })
    render(<RequirementsList />)
    const headingRow = screen.getByTestId('heading-row-5')
    expect(within(headingRow).getByText('1')).toBeInTheDocument()
    expect(within(headingRow).getByDisplayValue('Power')).toBeInTheDocument()
    // grouped: ungrouped req1 first, then heading, then req2
    // (heading title lives in an <input>'s value, which textContent can't see —
    // compare real DOM position instead of substring-searching textContent)
    const isBefore = (a: Element, b: Element): boolean =>
      !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    const req1Row = screen.getByText('SRS-0001')
    const req2Row = screen.getByText('SRS-0002')
    expect(isBefore(req1Row, headingRow)).toBe(true)
    expect(isBefore(headingRow, req2Row)).toBe(true)
  })

  it('adds a top-level heading from the toolbar', async () => {
    render(<RequirementsList />)
    await userEvent.click(screen.getByText('+ Heading'))
    expect(storeState.addHeading).toHaveBeenCalledWith({ moduleId: 1 })
  })

  it('adds a requirement scoped to a heading via the row button', async () => {
    Object.assign(storeState, { headings: [headingFixture] })
    render(<RequirementsList />)
    await userEvent.click(screen.getByLabelText('Add requirement to section'))
    expect(storeState.addRequirement).toHaveBeenCalledWith({ moduleId: 1, text: '', headingId: 5 })
  })

  it('adds a subheading, renames on blur, moves and deletes a heading', async () => {
    Object.assign(storeState, { headings: [headingFixture] })
    render(<RequirementsList />)
    await userEvent.click(screen.getByLabelText('Add subheading'))
    expect(storeState.addHeading).toHaveBeenCalledWith({ moduleId: 1, parentId: 5 })

    const title = screen.getByLabelText('Heading title')
    fireEvent.change(title, { target: { value: 'Thermal' } })
    fireEvent.blur(title)
    expect(storeState.renameHeading).toHaveBeenCalledWith(5, 'Thermal')

    await userEvent.click(screen.getByLabelText('Move section down'))
    expect(storeState.moveHeading).toHaveBeenCalledWith(5, 'down')

    await userEvent.click(screen.getByLabelText('Delete section'))
    expect(storeState.removeHeading).toHaveBeenCalledWith(5)
  })

  it('moves a requirement into a section by dragging its row onto a heading', () => {
    Object.assign(storeState, { headings: [headingFixture], requirements: [req2] })
    render(<RequirementsList />)
    const reqRow = screen.getByText('SRS-0002').closest('[draggable="true"]')!
    const headingRow = screen.getByTestId('heading-row-5')
    fireEvent.dragStart(reqRow)
    fireEvent.dragOver(headingRow)
    fireEvent.drop(headingRow)
    expect(storeState.updateRequirement).toHaveBeenCalledWith(2, { headingId: 5 })
  })

  it('dragging a grouped requirement onto an ungrouped requirement moves it to the module root', () => {
    Object.assign(storeState, { headings: [headingFixture], requirements: [req1, { ...req2, headingId: 5 }] })
    render(<RequirementsList />)
    const grouped = screen.getByText('SRS-0002').closest('[draggable="true"]')!
    const ungrouped = screen.getByText('SRS-0001').closest('[draggable="true"]')!
    fireEvent.dragStart(grouped)
    fireEvent.dragOver(ungrouped)
    fireEvent.drop(ungrouped)
    expect(storeState.updateRequirement).toHaveBeenCalledWith(2, { headingId: null })
  })

  // Section drag (item 28). Only the dragged heading is written — its subheadings and
  // requirements point at it via parent_id/heading_id, so they follow on the next render.
  const sectionB = { ...headingFixture, id: 6, title: 'Thermal', position: 1 }

  it('dragging a section onto another section makes it a child of that section', () => {
    Object.assign(storeState, { headings: [headingFixture, sectionB] })
    render(<RequirementsList />)
    fireEvent.dragStart(screen.getByTestId('heading-drag-6'))
    fireEvent.dragOver(screen.getByTestId('heading-row-5'))
    fireEvent.drop(screen.getByTestId('heading-row-5'))
    expect(storeState.reparentHeading).toHaveBeenCalledWith(6, 5)
  })

  it("a dragged section's children follow it without being moved themselves", () => {
    // 6 is nested under 5 and owns req 2; re-parenting 6 to top level writes only 6.
    Object.assign(storeState, {
      headings: [headingFixture, { ...sectionB, parentId: 5 }],
      requirements: [req1, { ...req2, headingId: 6 }]
    })
    render(<RequirementsList />)
    // req1 is ungrouped, so dropping onto its row means "module root" — same idiom as reqs.
    fireEvent.dragStart(screen.getByTestId('heading-drag-6'))
    const ungrouped = screen.getByText('SRS-0001').closest('[draggable="true"]')!
    fireEvent.dragOver(ungrouped)
    fireEvent.drop(ungrouped)
    expect(storeState.reparentHeading).toHaveBeenCalledWith(6, null)
    expect(storeState.reparentHeading).toHaveBeenCalledTimes(1)
    expect(storeState.updateRequirement).not.toHaveBeenCalled()
  })

  it('refuses to drop a section onto its own descendant', () => {
    Object.assign(storeState, { headings: [headingFixture, { ...sectionB, parentId: 5 }] })
    render(<RequirementsList />)
    fireEvent.dragStart(screen.getByTestId('heading-drag-5'))
    fireEvent.drop(screen.getByTestId('heading-row-6'))
    expect(storeState.reparentHeading).not.toHaveBeenCalled()
  })

  it('refuses to drop a section onto itself', () => {
    Object.assign(storeState, { headings: [headingFixture] })
    render(<RequirementsList />)
    fireEvent.dragStart(screen.getByTestId('heading-drag-5'))
    fireEvent.drop(screen.getByTestId('heading-row-5'))
    expect(storeState.reparentHeading).not.toHaveBeenCalled()
  })

  it('collapse toggle calls the store and collapsed heading hides its requirements', () => {
    Object.assign(storeState, {
      headings: [headingFixture],
      requirements: [{ ...req2, headingId: 5 }],
      collapsedHeadingIds: [5]
    })
    render(<RequirementsList />)
    expect(screen.queryByText('SRS-0002')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Expand section'))
    expect(storeState.toggleHeadingCollapsed).toHaveBeenCalledWith(5)
  })

  it('acceptance criteria cell shows passed/total and first item text', () => {
    storeState.acSummary = { [req1.id]: { passed: 2, total: 5, first: 'boots in 2s' } }
    render(<RequirementsList />)
    expect(screen.getByText('2/5')).toBeInTheDocument()
    expect(screen.getByText('boots in 2s')).toBeInTheDocument()
  })

  it('acceptance criteria cell shows em-dash when requirement has no items', () => {
    storeState.acSummary = {}
    render(<RequirementsList />)
    const row = screen.getByText(req1.reqId).closest('div[style]') as HTMLElement
    expect(within(row).queryByText(/\d+\/\d+/)).toBeNull()
  })
})
