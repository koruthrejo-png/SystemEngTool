import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import Dashboard from './index'

const storeState: any = {}

vi.mock('../../store', () => ({
  useStore: () => storeState
}))

const req = (id: number, extra: object = {}): any => ({
  id, moduleId: 1, reqId: `SRS-${id}`, text: `Req ${id}`,
  acceptanceCriteria: null, source: null, rationale: null,
  status: 'Draft', priority: 'Medium', reqType: 'Functional',
  headingId: null, position: 0, deletedAt: null, createdAt: '', updatedAt: '2026-01-01', ...extra
})

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(storeState, {
    project: { id: 1, name: 'Demo' },
    projectRequirements: [req(1), req(2)],
    elements: [{ id: 1, projectId: 1, parentId: null, blockId: 'SYS-001', name: '', elementTypeId: null, description: null, color: null, posX: 0, posY: 0, width: 160, height: 80, deletedAt: null, createdAt: '', updatedAt: '' }],
    traceLinks: [{ elementId: 1, requirementId: 1 }],
    loadTraceability: vi.fn().mockResolvedValue(undefined),
    openRequirement: vi.fn().mockResolvedValue(undefined)
  })
})

describe('Dashboard', () => {
  it('renders KPI cards with totals, coverage and unallocated count', () => {
    render(<Dashboard />)
    const kpis = screen.getByTestId('kpi-cards')
    expect(within(kpis).getByText('Requirements')).toBeInTheDocument()
    expect(within(kpis).getByText('50%')).toBeInTheDocument()
    expect(within(kpis).getByText('Unallocated')).toBeInTheDocument()
  })

  it('renders status/priority/type breakdowns', () => {
    render(<Dashboard />)
    expect(screen.getByText('By Status')).toBeInTheDocument()
    expect(screen.getByText('By Priority')).toBeInTheDocument()
    expect(screen.getByText('By Type')).toBeInTheDocument()
  })

  it('lists unallocated requirements and opens one on click', () => {
    render(<Dashboard />)
    // SRS-2 is unallocated → appears in the unallocated card and the recent card
    fireEvent.click(screen.getAllByText('SRS-2')[0].closest('button')!)
    expect(storeState.openRequirement).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }))
  })

  it('loads data on mount and shows empty state without a project', () => {
    render(<Dashboard />)
    expect(storeState.loadTraceability).toHaveBeenCalled()
    storeState.project = null
    render(<Dashboard />)
    expect(screen.getByText(/Open or create a project/)).toBeInTheDocument()
  })
})
