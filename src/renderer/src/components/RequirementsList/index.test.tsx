import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RequirementsList from './index'

const storeState: any = {}

vi.mock('../../store', () => ({
  useStore: () => storeState
}))

const req1 = {
  id: 1, moduleId: 1, reqId: 'SRS-0001', text: 'The system shall respond within 2s',
  acceptanceCriteria: null, source: null, rationale: null, verificationStatus: 'Unverified',
  status: 'Approved', priority: 'High', reqType: 'Functional', entryType: 'Requirement', headingId: null,
  position: 0, deletedAt: null, createdAt: '', updatedAt: '', verificationMethod: null
}
const req2 = {
  id: 2, moduleId: 1, reqId: 'SRS-0002', text: 'The system shall log all faults',
  acceptanceCriteria: null, source: null, rationale: null, verificationStatus: 'Unverified',
  status: 'Draft', priority: 'Low', reqType: 'Non-Functional', entryType: 'Requirement', headingId: null,
  position: 1, deletedAt: null, createdAt: '', updatedAt: '', verificationMethod: null
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  // portal target for the File ▾ / More Filters nav tools (lives in App's top nav at runtime)
  const slot = document.createElement('div')
  slot.id = 'req-nav-tools'
  document.body.appendChild(slot)
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

afterEach(() => {
  document.getElementById('req-nav-tools')?.remove()
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

  it('renders the verification method column (— when unset)', () => {
    Object.assign(storeState, {
      requirements: [
        { ...req1, id: 1, reqId: 'R-1', verificationMethod: 'Test' },
        { ...req2, id: 2, reqId: 'R-2', verificationMethod: null }
      ]
    })
    render(<RequirementsList />)
    expect(screen.getByText('Test')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
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
    await userEvent.click(screen.getByRole('button', { name: /More Filters/ }))
    await userEvent.click(screen.getByText('+ Add filter'))
    expect(storeState.setFilterRules).toHaveBeenCalledWith([
      expect.objectContaining({ attr: 'text', op: 'contains', value: '' })
    ])
  })

  it('show-deleted checkbox calls setShowDeleted', async () => {
    render(<RequirementsList />)
    await userEvent.click(screen.getByText('File'))
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
    expect(screen.queryAllByLabelText(/Resize .* column/)).toHaveLength(10)
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
    const saved = JSON.parse(localStorage.getItem('reqarch.reqTable.columns.v3')!)
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
    await userEvent.click(screen.getByText('File'))
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

  it('editing the AC cell inline saves via updateRequirement on blur', () => {
    Object.assign(storeState, { requirements: [{ ...req1, acceptanceCriteria: 'boots in 2s' }, req2] })
    render(<RequirementsList />)
    const field = screen.getByDisplayValue('boots in 2s')
    fireEvent.change(field, { target: { value: 'boots in 1s' } })
    fireEvent.blur(field)
    expect(storeState.updateRequirement).toHaveBeenCalledWith(1, { acceptanceCriteria: 'boots in 1s' })
  })

  it('editing a Text cell inline saves via updateRequirement on blur', () => {
    render(<RequirementsList />)
    const field = screen.getByDisplayValue('The system shall respond within 2s')
    fireEvent.change(field, { target: { value: 'The system shall respond within 1s' } })
    fireEvent.blur(field)
    expect(storeState.updateRequirement).toHaveBeenCalledWith(1, { text: 'The system shall respond within 1s' })
  })

  it('hides a column via its header menu, restores it from the Columns menu', async () => {
    render(<RequirementsList />)
    expect(screen.getByLabelText('Resize Source column')).toBeInTheDocument()
    // header label click → Hide column
    await userEvent.click(screen.getByText('Source'))
    await userEvent.click(screen.getByText('Hide column'))
    expect(screen.queryByLabelText('Resize Source column')).toBeNull()
    // toolbar File ▾ menu → Columns section → re-check Source
    await userEvent.click(screen.getByText('File'))
    const sourceToggle = screen.getByRole('checkbox', { name: 'Source' })
    expect(sourceToggle).not.toBeChecked()
    await userEvent.click(sourceToggle)
    expect(screen.getByLabelText('Resize Source column')).toBeInTheDocument()
  })

  // Context menu tests (item 43)
  const baseReq = {
    id: 1, moduleId: 1, reqId: 'R-1', text: 'Test requirement',
    acceptanceCriteria: null, source: null, rationale: null, verificationStatus: 'Unverified',
    status: 'Draft', priority: 'Low', reqType: 'Functional', entryType: 'Requirement', headingId: null,
    position: 0, deletedAt: null, createdAt: '', updatedAt: '', verificationMethod: null
  }

  function renderList(reqs: typeof baseReq[] = [], overrides: any = {}): void {
    Object.assign(storeState, {
      selectedModuleId: 1,
      modules: [{ id: 1, projectId: 1, parentId: null, name: 'Test', idPrefix: 'R', idPadding: 1, nextCounter: 2, position: 0, deletedAt: null, createdAt: '', updatedAt: '' }],
      requirements: reqs,
      deletedRequirements: [],
      showDeleted: false,
      filterRules: [], filterCombine: 'AND',
      selectedRequirementId: null,
      selectRequirement: vi.fn(),
      addRequirement: vi.fn().mockResolvedValue(undefined),
      addRequirementBelow: vi.fn().mockResolvedValue(undefined),
      duplicateRequirement: vi.fn().mockResolvedValue(undefined),
      updateRequirement: vi.fn().mockResolvedValue(undefined),
      removeRequirement: vi.fn().mockResolvedValue(undefined),
      restoreRequirement: vi.fn().mockResolvedValue(undefined),
      setShowDeleted: vi.fn().mockResolvedValue(undefined),
      setFilterRules: vi.fn(),
      setFilterCombine: vi.fn(),
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
      removeHeading: vi.fn().mockResolvedValue(undefined),
      ...overrides
    })
    render(<RequirementsList />)
  }

  function openCtxMenu(): void {
    const idCell = screen.getByText('R-1')
    fireEvent.contextMenu(idCell)
  }

  it('context menu shows Duplicate, Copy ID and Delete', () => {
    renderList([{ ...baseReq, id: 1, reqId: 'R-1' }])
    openCtxMenu()
    expect(screen.getByRole('menuitem', { name: 'Duplicate' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Copy ID' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
  })

  it('Duplicate calls duplicateRequirement with the row id and closes the menu', () => {
    const duplicateRequirement = vi.fn()
    renderList([{ ...baseReq, id: 1, reqId: 'R-1' }], { duplicateRequirement })
    openCtxMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }))
    expect(duplicateRequirement).toHaveBeenCalledWith(1)
    expect(screen.queryByRole('menuitem', { name: 'Duplicate' })).not.toBeInTheDocument()
  })

  it('Copy ID writes the reqId string to the clipboard', () => {
    const writeText = vi.fn()
    Object.assign(navigator, { clipboard: { writeText } })
    renderList([{ ...baseReq, id: 1, reqId: 'R-1' }])
    openCtxMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy ID' }))
    expect(writeText).toHaveBeenCalledWith('R-1')
  })

  it('Delete calls removeRequirement with the row id', () => {
    const removeRequirement = vi.fn()
    renderList([{ ...baseReq, id: 1, reqId: 'R-1' }], { removeRequirement })
    openCtxMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(removeRequirement).toHaveBeenCalledWith(1)
  })

  it('Move to section opens a section picker listing headings and (none)', () => {
    renderList([{ ...baseReq, id: 1, reqId: 'R-1' }], { headings: [{ id: 5, moduleId: 7, parentId: null, title: 'Intro', position: 0, deletedAt: null, createdAt: '', updatedAt: '' }] })
    fireEvent.contextMenu(screen.getByText('R-1'))
    fireEvent.click(screen.getByRole('menuitem', { name: /Move to section/ }))
    expect(screen.getByRole('menuitem', { name: /Intro/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '(none)' })).toBeInTheDocument()
  })

  it('picking a section calls updateRequirement with that headingId and closes', () => {
    const updateRequirement = vi.fn()
    renderList([{ ...baseReq, id: 1, reqId: 'R-1' }], {
      updateRequirement,
      headings: [{ id: 5, moduleId: 7, parentId: null, title: 'Intro', position: 0, deletedAt: null, createdAt: '', updatedAt: '' }]
    })
    fireEvent.contextMenu(screen.getByText('R-1'))
    fireEvent.click(screen.getByRole('menuitem', { name: /Move to section/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Intro/ }))
    expect(updateRequirement).toHaveBeenCalledWith(1, { headingId: 5 })
    expect(screen.queryByRole('menuitem', { name: /Intro/ })).not.toBeInTheDocument()
  })

  it('picking (none) clears the section (headingId null)', () => {
    const updateRequirement = vi.fn()
    renderList([{ ...baseReq, id: 1, reqId: 'R-1' }], {
      updateRequirement,
      headings: [{ id: 5, moduleId: 7, parentId: null, title: 'Intro', position: 0, deletedAt: null, createdAt: '', updatedAt: '' }]
    })
    fireEvent.contextMenu(screen.getByText('R-1'))
    fireEvent.click(screen.getByRole('menuitem', { name: /Move to section/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: '(none)' }))
    expect(updateRequirement).toHaveBeenCalledWith(1, { headingId: null })
  })
})
