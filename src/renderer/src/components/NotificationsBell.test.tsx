import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import NotificationsBell from './NotificationsBell'
import type { Requirement } from '../../../types'

const mockOpenRequirement = vi.fn()
const storeState: Record<string, unknown> = {}
vi.mock('../store', () => ({ useStore: (): Record<string, unknown> => storeState }))

function req(over: Partial<Requirement>): Requirement {
  return {
    id: 1, moduleId: 1, reqId: 'R-1', text: 'x', acceptanceCriteria: null, source: null,
    rationale: null, position: 0, status: 'Draft', priority: 'Medium', reqType: 'Functional',
    entryType: 'Requirement', verificationStatus: 'Unverified', verificationMethod: null, headingId: null, deletedAt: null,
    createdAt: '', updatedAt: '', createdBy: null, updatedBy: null, ...over
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(storeState, {
    project: { id: 1, name: 'P' },
    projectRequirements: [],
    traceLinks: [],
    openRequirement: mockOpenRequirement
  })
})

describe('NotificationsBell', () => {
  it('hides the badge when nothing needs attention', () => {
    render(<NotificationsBell />)
    expect(screen.queryByTestId('bell-badge')).toBeNull()
  })

  it('shows the distinct attention count on the badge', () => {
    storeState.projectRequirements = [
      req({ id: 1, reqId: 'R-1', priority: 'High' }),
      req({ id: 2, reqId: 'R-2', status: 'Review' })
    ]
    render(<NotificationsBell />)
    expect(screen.getByTestId('bell-badge')).toHaveTextContent('2')
  })

  it('renders groups and navigates on row click', () => {
    const gap = req({ id: 1, reqId: 'R-1', text: 'unlinked high', priority: 'High' })
    storeState.projectRequirements = [gap]
    render(<NotificationsBell />)
    fireEvent.click(screen.getByLabelText('Notifications'))
    expect(screen.getByText('Trace gaps')).toBeInTheDocument()
    fireEvent.click(screen.getByText(/R-1/))
    expect(mockOpenRequirement).toHaveBeenCalledWith(gap)
  })

  it('shows the empty state when opened with nothing pending', () => {
    render(<NotificationsBell />)
    fireEvent.click(screen.getByLabelText('Notifications'))
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument()
  })
})
