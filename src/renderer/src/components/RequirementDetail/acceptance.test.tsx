import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import RequirementDetail from './index'
import type { AcceptanceCriterion, Requirement } from '../../../../types'

const mockLoadAcItems = vi.fn()
const mockAddAcItem = vi.fn().mockResolvedValue(undefined)
const mockUpdateAcItem = vi.fn().mockResolvedValue(undefined)
const mockRemoveAcItem = vi.fn().mockResolvedValue(undefined)
const mockMoveAcItem = vi.fn().mockResolvedValue(undefined)

const req: Requirement = {
  id: 5, moduleId: 3, reqId: 'SRS-0001', text: 'The system shall X.',
  acceptanceCriteria: null, source: null, rationale: null, position: 0,
  status: 'Draft', priority: 'Medium', reqType: 'Functional', headingId: null,
  deletedAt: null, createdAt: '', updatedAt: ''
} as Requirement

function item(over: Partial<AcceptanceCriterion>): AcceptanceCriterion {
  return {
    id: 1, requirementId: 5, text: 'c1', status: 'Unverified', position: 0,
    createdAt: '', updatedAt: '', ...over
  }
}

const storeState: Record<string, unknown> = {}

vi.mock('../../store', () => ({
  useStore: (): Record<string, unknown> => storeState
}))

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(storeState, {
    requirements: [req], selectedRequirementId: 5, customFields: [],
    headings: [], modules: [], projectRequirements: [], reqLinks: [],
    acItems: [
      item({ id: 1, text: 'boots in 2s', status: 'Passed', position: 0 }),
      item({ id: 2, text: 'logs errors', status: 'Unverified', position: 1 })
    ],
    updateRequirement: vi.fn(), loadCustomFields: vi.fn(),
    addCustomField: vi.fn(), updateCustomField: vi.fn(), removeCustomField: vi.fn(),
    loadTraceability: vi.fn(), addReqLink: vi.fn(), removeReqLink: vi.fn(),
    openRequirement: vi.fn(),
    loadAcItems: mockLoadAcItems, addAcItem: mockAddAcItem,
    updateAcItem: mockUpdateAcItem, removeAcItem: mockRemoveAcItem,
    moveAcItem: mockMoveAcItem
  })
})

describe('acceptance criteria checklist', () => {
  it('renders items in order with status chips', () => {
    render(<RequirementDetail />)
    const section = screen.getByTestId('ac-section')
    const inputs = within(section).getAllByLabelText('Criterion text') as HTMLInputElement[]
    expect(inputs.map((i) => i.value)).toEqual(['boots in 2s', 'logs errors'])
    expect(within(section).getByText('Passed')).toBeInTheDocument()
    expect(within(section).getByText('Unverified')).toBeInTheDocument()
  })

  it('chip click cycles status Passed -> Failed', () => {
    render(<RequirementDetail />)
    const chips = within(screen.getByTestId('ac-section')).getAllByLabelText('Criterion status')
    fireEvent.click(chips[0])
    expect(mockUpdateAcItem).toHaveBeenCalledWith(1, { status: 'Failed' }, 5)
  })

  it('text blur saves the edited text', () => {
    render(<RequirementDetail />)
    const inputs = within(screen.getByTestId('ac-section')).getAllByLabelText('Criterion text')
    fireEvent.change(inputs[1], { target: { value: 'logs errors to file' } })
    fireEvent.blur(inputs[1])
    expect(mockUpdateAcItem).toHaveBeenCalledWith(2, { text: 'logs errors to file' }, 5)
  })

  it('add button creates an empty criterion', () => {
    render(<RequirementDetail />)
    fireEvent.click(screen.getByText('+ Add criterion'))
    expect(mockAddAcItem).toHaveBeenCalledWith(5, '')
  })

  it('move and remove buttons call the store with the item id', () => {
    render(<RequirementDetail />)
    const section = screen.getByTestId('ac-section')
    fireEvent.click(within(section).getAllByLabelText('Move criterion down')[0])
    expect(mockMoveAcItem).toHaveBeenCalledWith(1, 'down', 5)
    fireEvent.click(within(section).getAllByLabelText('Remove criterion')[1])
    expect(mockRemoveAcItem).toHaveBeenCalledWith(2, 5)
  })

  it('loads items when the requirement changes', () => {
    render(<RequirementDetail />)
    expect(mockLoadAcItems).toHaveBeenCalledWith(5)
  })

  it('does not steal focus in the new requirement when acItems land after a requirement switch', () => {
    const { rerender } = render(<RequirementDetail />)
    // Sets focusNewAc.current = true for requirement 5, before its acItems update lands.
    fireEvent.click(screen.getByText('+ Add criterion'))

    // User switches to requirement 6 before that update arrives.
    const req2: Requirement = { ...req, id: 6, reqId: 'SRS-0002' }
    Object.assign(storeState, { selectedRequirementId: 6, requirements: [req2] })
    rerender(<RequirementDetail />)

    // Requirement 6's acItems now load (different length triggers the focus effect).
    Object.assign(storeState, {
      acItems: [
        item({ id: 10, requirementId: 6, text: 'starts up', status: 'Unverified', position: 0 }),
        item({ id: 11, requirementId: 6, text: 'shuts down', status: 'Unverified', position: 1 }),
        item({ id: 12, requirementId: 6, text: 'stays up', status: 'Unverified', position: 2 })
      ]
    })
    rerender(<RequirementDetail />)

    const section = screen.getByTestId('ac-section')
    const inputs = within(section).getAllByLabelText('Criterion text')
    const newest = inputs[inputs.length - 1]
    expect(document.activeElement).not.toBe(newest)
  })
})
