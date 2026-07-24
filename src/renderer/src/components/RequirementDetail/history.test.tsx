import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RequirementDetail from './index'

const baseReq = {
  id: 1, moduleId: 1, reqId: 'SRS-0001', text: 'The system shall boot',
  acceptanceCriteria: null, source: null, rationale: null, verificationStatus: 'Unverified',
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
  users: [{ id: 7, displayName: 'Grace' }],
  reqLinks: [], projectRequirements: [], modules: [],
  loadTraceability: vi.fn(), addReqLink: vi.fn(), removeReqLink: vi.fn(), openRequirement: vi.fn(),
  traceLinks: [], elements: [], selectElement: vi.fn(), setActiveTab: vi.fn(), toggleTraceLink: vi.fn()
}

let storeState: Record<string, unknown> = { ...commonStore, headings: [], history: [] }

vi.mock('../../store', () => ({ useStore: () => storeState }))

describe('RequirementDetail history timeline', () => {
  it('renders grouped history events with author and field labels', () => {
    storeState = {
      ...commonStore, headings: [],
      history: [
        { id: 2, requirementId: 1, field: 'priority', oldValue: 'Medium', newValue: 'High', changedBy: 7, changedAt: '2026-07-24T10:00:00.000Z' },
        { id: 1, requirementId: 1, field: 'status', oldValue: 'Draft', newValue: 'Approved', changedBy: 7, changedAt: '2026-07-24T10:00:00.000Z' }
      ]
    }
    render(<RequirementDetail />)
    fireEvent.click(screen.getByText(/^History/))
    // history field labels render as <strong>, disambiguating them from the metadata labels;
    // scope value assertions to the change-line div so they don't match the Select <option>s
    const statusLine = screen.getByText('Status', { selector: 'strong' }).closest('div')!
    expect(statusLine).toHaveTextContent('Draft → Approved')
    const priorityLine = screen.getByText('Priority', { selector: 'strong' }).closest('div')!
    expect(priorityLine).toHaveTextContent('Medium → High')
    expect(screen.getByText(/Grace/)).toBeInTheDocument()
  })

  it('shows the empty state when there is no history', () => {
    storeState = { ...commonStore, headings: [], history: [] }
    render(<RequirementDetail />)
    fireEvent.click(screen.getByText(/^History/))
    expect(screen.getByText('No changes recorded yet.')).toBeInTheDocument()
  })

  it('resolves heading_id changes to section titles', () => {
    storeState = {
      ...commonStore,
      headings: [{ id: 5, moduleId: 1, parentId: null, title: 'Power', position: 0, deletedAt: null, createdAt: '', updatedAt: '' }],
      history: [
        { id: 1, requirementId: 1, field: 'heading_id', oldValue: null, newValue: '5', changedBy: 7, changedAt: '2026-07-24T10:00:00.000Z' }
      ]
    }
    render(<RequirementDetail />)
    fireEvent.click(screen.getByText(/^History/))
    const sectionLine = screen.getByText('Section', { selector: 'strong' }).closest('div')!
    expect(sectionLine).toHaveTextContent('Power')
  })
})
