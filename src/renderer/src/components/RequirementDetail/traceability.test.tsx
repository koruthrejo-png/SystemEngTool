import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import RequirementDetail from './index'

const storeState: any = {}

vi.mock('../../store', () => ({
  useStore: () => storeState
}))

const req = (id: number, moduleId: number, text: string): any => ({
  id, moduleId, reqId: `R-${id}`, text,
  acceptanceCriteria: null, source: null, rationale: null,
  status: 'Draft', priority: 'Medium', reqType: 'Functional',
  headingId: null, position: 0, deletedAt: null, createdAt: '', updatedAt: ''
})

const mod = (id: number, parentId: number | null, name: string): any => ({
  id, projectId: 1, parentId, kind: 'module', name, idPrefix: 'M', idPadding: 4,
  nextCounter: 1, position: 0, deletedAt: null, createdAt: '', updatedAt: ''
})

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(storeState, {
    selectedRequirementId: 2,
    requirements: [req(2, 2, 'Low level req')],
    projectRequirements: [req(1, 1, 'High level req'), req(2, 2, 'Low level req'), req(3, 1, 'Unlinked high')],
    modules: [mod(1, null, 'System'), mod(2, 1, 'Software')],
    headings: [], users: [],
    customFields: [],
    reqLinks: [{ parentReqId: 1, childReqId: 2 }],
    loadCustomFields: vi.fn().mockResolvedValue(undefined),
    addCustomField: vi.fn(), updateCustomField: vi.fn(), removeCustomField: vi.fn(),
    updateRequirement: vi.fn().mockResolvedValue(undefined),
    loadTraceability: vi.fn().mockResolvedValue(undefined),
    addReqLink: vi.fn().mockResolvedValue(undefined),
    removeReqLink: vi.fn().mockResolvedValue(undefined),
    openRequirement: vi.fn().mockResolvedValue(undefined),
    acItems: [],
    loadAcItems: vi.fn(),
    addAcItem: vi.fn(),
    updateAcItem: vi.fn(),
    removeAcItem: vi.fn(),
    moveAcItem: vi.fn(),
    traceLinks: [],
    elements: [],
    selectElement: vi.fn(),
    setActiveTab: vi.fn(),
    toggleTraceLink: vi.fn()
  })
})

describe('RequirementDetail traceability section', () => {
  it('loads links on mount and lists linked reqs (both directions) with remove + navigate', () => {
    render(<RequirementDetail />)
    expect(storeState.loadTraceability).toHaveBeenCalled()
    const linked = screen.getByTestId('linked-requirements')
    expect(within(linked).getByText('R-1')).toBeInTheDocument()
    fireEvent.click(within(linked).getByText('R-1').closest('button')!)
    expect(storeState.openRequirement).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
    // R-1 is a parent of the current req (2) → removeReqLink(parent, child)
    fireEvent.click(within(linked).getByLabelText('Remove link to R-1'))
    expect(storeState.removeReqLink).toHaveBeenCalledWith(1, 2)
  })

  it('adds a link via the + Link picker (current req stored as parent)', () => {
    render(<RequirementDetail />)
    const section = screen.getByTestId('traceability-section')
    fireEvent.click(within(section).getByText('+ Link'))
    fireEvent.change(within(section).getByLabelText('Link module'), { target: { value: '1' } })
    fireEvent.change(within(section).getByLabelText('Link requirement'), { target: { value: '3' } })
    fireEvent.click(within(section).getByText('Add link'))
    expect(storeState.addReqLink).toHaveBeenCalledWith(2, 3) // parent = current, child = picked
    // picker closes after add — the + Link button is back
    expect(within(section).getByText('+ Link')).toBeInTheDocument()
  })

  it('Cancel closes the picker without linking', () => {
    render(<RequirementDetail />)
    const section = screen.getByTestId('traceability-section')
    fireEvent.click(within(section).getByText('+ Link'))
    fireEvent.click(within(section).getByText('Cancel'))
    expect(storeState.addReqLink).not.toHaveBeenCalled()
    expect(within(section).getByText('+ Link')).toBeInTheDocument()
  })

  it('picker excludes self and already-linked requirements', () => {
    render(<RequirementDetail />)
    const section = screen.getByTestId('traceability-section')
    fireEvent.click(within(section).getByText('+ Link'))
    fireEvent.change(within(section).getByLabelText('Link module'), { target: { value: '1' } })
    const options = within(within(section).getByLabelText('Link requirement') as HTMLElement)
      .getAllByRole('option').map((o) => o.textContent)
    expect(options.join()).toContain('R-3')
    expect(options.join()).not.toContain('R-1') // already linked
  })

  it('lists child-direction links too', () => {
    storeState.selectedRequirementId = 1
    storeState.requirements = [req(1, 1, 'High level req')]
    render(<RequirementDetail />)
    const linked = screen.getByTestId('linked-requirements')
    expect(within(linked).getByText('R-2')).toBeInTheDocument()
  })
})
