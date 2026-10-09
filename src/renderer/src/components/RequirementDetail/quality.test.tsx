import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RequirementDetail from './index'

const baseReq = {
  id: 1, moduleId: 1, reqId: 'SRS-0001', text: 'It should go',
  acceptanceCriteria: null, source: null, rationale: null, verificationStatus: 'Unverified',
  verificationMethod: null,
  status: 'Approved', priority: 'High', reqType: 'Functional', entryType: 'Requirement', headingId: null,
  position: 0, deletedAt: null, createdAt: '', updatedAt: ''
}

const commonStore = {
  selectedRequirementId: 1,
  requirements: [baseReq],
  updateRequirement: vi.fn().mockResolvedValue(undefined),
  customFields: [], loadCustomFields: vi.fn(), addCustomField: vi.fn(),
  updateCustomField: vi.fn(), removeCustomField: vi.fn(),
  loadHistory: vi.fn(),
  users: [], headings: [], history: [],
  reqLinks: [], projectRequirements: [], modules: [],
  loadTraceability: vi.fn(), addReqLink: vi.fn(), removeReqLink: vi.fn(), openRequirement: vi.fn(),
  traceLinks: [], elements: [], selectElement: vi.fn(), setActiveTab: vi.fn(), toggleTraceLink: vi.fn()
}

let storeState: Record<string, unknown> = { ...commonStore }

vi.mock('../../store', () => ({ useStore: () => storeState }))

describe('RequirementDetail quality section', () => {
  it('renders lint findings for a problematic requirement', () => {
    storeState = { ...commonStore, requirements: [baseReq] }
    render(<RequirementDetail />)
    fireEvent.click(screen.getByText(/^Quality/))
    expect(screen.getByText(/No requirement keyword/)).toBeInTheDocument()
    expect(screen.getByText(/Weak\/ambiguous word: 'should'/)).toBeInTheDocument()
    expect(screen.getByText(/No acceptance criteria\./)).toBeInTheDocument()
    expect(screen.getByText(/No verification method assigned\./)).toBeInTheDocument()
    expect(screen.getByText(/too short to be testable/)).toBeInTheDocument()
  })

  it('shows the empty state for a clean requirement', () => {
    storeState = {
      ...commonStore,
      requirements: [{
        ...baseReq,
        text: 'The system shall record the brake pressure.',
        acceptanceCriteria: 'Pressure is logged every 100ms.',
        verificationMethod: 'Test'
      }]
    }
    render(<RequirementDetail />)
    fireEvent.click(screen.getByText(/^Quality/))
    expect(screen.getByText('No quality issues.')).toBeInTheDocument()
  })
})
