import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import RequirementDetail from './index'
import type { ArchitectureElement, Requirement } from '../../../../types'

const mockLoadTraceability = vi.fn()
const mockToggleTraceLink = vi.fn().mockResolvedValue(undefined)
const mockSelectElement = vi.fn()
const mockSetActiveTab = vi.fn()

const req = {
  id: 5, moduleId: 3, reqId: 'SRS-0005', text: 'The system shall regulate temperature.',
  acceptanceCriteria: null, source: null, rationale: null, position: 0,
  status: 'Draft', priority: 'Medium', reqType: 'Functional', headingId: null,
  deletedAt: null, createdAt: '', updatedAt: ''
} as Requirement

function el(over: Partial<ArchitectureElement>): ArchitectureElement {
  return {
    id: 1, projectId: 1, parentId: null, blockId: 'BLK-001', name: 'Controller',
    elementTypeId: null, posX: 0, posY: 0, width: 160, height: 80,
    createdAt: '', updatedAt: '',
    ...over
  } as ArchitectureElement
}

const storeState: Record<string, unknown> = {}

vi.mock('../../store', () => ({
  useStore: (): Record<string, unknown> => storeState
}))

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(storeState, {
    requirements: [req], selectedRequirementId: 5, customFields: [],
    headings: [], modules: [], projectRequirements: [], reqLinks: [], users: [],
    acItems: [], acSummary: {},
    elements: [
      el({ id: 1, blockId: 'BLK-001', name: 'Controller' }),
      el({ id: 2, blockId: 'BLK-002', name: 'Sensor' })
    ],
    traceLinks: [{ elementId: 1, requirementId: 5 }],
    updateRequirement: vi.fn(), loadCustomFields: vi.fn(),
    addCustomField: vi.fn(), updateCustomField: vi.fn(), removeCustomField: vi.fn(),
    addReqLink: vi.fn(), removeReqLink: vi.fn(), openRequirement: vi.fn(),
    loadAcItems: vi.fn(), addAcItem: vi.fn(), updateAcItem: vi.fn(),
    removeAcItem: vi.fn(), moveAcItem: vi.fn(),
    loadTraceability: mockLoadTraceability,
    toggleTraceLink: mockToggleTraceLink,
    selectElement: mockSelectElement,
    setActiveTab: mockSetActiveTab
  })
})

describe('architecture section', () => {
  it('lists linked elements and excludes unlinked ones', () => {
    render(<RequirementDetail />)
    const section = screen.getByTestId('arch-section')
    expect(within(section).getByText('BLK-001')).toBeInTheDocument()
    expect(within(section).getByText('Controller')).toBeInTheDocument()
    expect(within(section).queryByText('BLK-002')).toBeNull()
  })

  it('row click navigates to the architecture tab with the element selected', () => {
    render(<RequirementDetail />)
    fireEvent.click(within(screen.getByTestId('arch-section')).getByText('BLK-001'))
    expect(mockSetActiveTab).toHaveBeenCalledWith('architecture')
    expect(mockSelectElement).toHaveBeenCalledWith(1)
  })

  it('unlink button toggles the link off', () => {
    render(<RequirementDetail />)
    fireEvent.click(screen.getByLabelText('Unlink BLK-001'))
    expect(mockToggleTraceLink).toHaveBeenCalledWith(1, 5)
  })

  it('picker offers only unlinked elements; Link adds and resets the picker', () => {
    render(<RequirementDetail />)
    const select = screen.getByLabelText('Link element') as HTMLSelectElement
    const optionTexts = Array.from(select.options).map((o) => o.text)
    expect(optionTexts.some((t) => t.includes('BLK-002'))).toBe(true)
    expect(optionTexts.some((t) => t.includes('BLK-001'))).toBe(false)
    const linkBtn = screen.getByRole('button', { name: 'Link' }) as HTMLButtonElement
    expect(linkBtn.disabled).toBe(true)
    fireEvent.change(select, { target: { value: '2' } })
    expect(linkBtn.disabled).toBe(false)
    fireEvent.click(linkBtn)
    expect(mockToggleTraceLink).toHaveBeenCalledWith(2, 5)
    expect(select.value).toBe('')
  })

  it('renders None. when the requirement has no linked elements', () => {
    storeState.traceLinks = []
    render(<RequirementDetail />)
    expect(within(screen.getByTestId('arch-section')).getByText('None.')).toBeInTheDocument()
  })

  it('loads traceability on mount', () => {
    render(<RequirementDetail />)
    expect(mockLoadTraceability).toHaveBeenCalled()
  })
})
