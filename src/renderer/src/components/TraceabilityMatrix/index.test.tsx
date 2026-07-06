import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import TraceabilityMatrix from './index'

const storeState: any = {}

vi.mock('../../store', () => ({
  useStore: () => storeState
}))

const req = (id: number): any => ({
  id, moduleId: 1, reqId: `SRS-${id}`, text: `Req ${id}`,
  acceptanceCriteria: null, source: null, rationale: null,
  status: 'Draft', priority: 'Medium', reqType: 'Functional',
  headingId: null, position: 0, deletedAt: null, createdAt: '', updatedAt: ''
})

const el = (id: number, name = ''): any => ({
  id, projectId: 1, parentId: null, blockId: `SYS-00${id}`, name,
  elementTypeId: null, description: null, color: null,
  posX: 0, posY: 0, width: 160, height: 80,
  deletedAt: null, createdAt: '', updatedAt: ''
})

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(storeState, {
    project: { id: 1, name: 'P' },
    projectRequirements: [req(1), req(2)],
    elements: [el(1, 'Engine'), el(2)],
    traceLinks: [{ elementId: 1, requirementId: 1 }],
    loadTraceability: vi.fn().mockResolvedValue(undefined),
    toggleTraceLink: vi.fn().mockResolvedValue(undefined)
  })
})

describe('TraceabilityMatrix', () => {
  it('renders requirement rows, object columns, and the coverage summary', () => {
    render(<TraceabilityMatrix />)
    expect(screen.getByText('SRS-1')).toBeInTheDocument()
    expect(screen.getByText(/Engine/)).toBeInTheDocument()
    expect(screen.getByText('SYS-002')).toBeInTheDocument()
    const summary = screen.getByTestId('coverage-summary')
    // 1 of 2 requirements linked → 50%
    expect(within(summary).getByText('50%')).toBeInTheDocument()
    expect(within(summary).getByText('2')).toBeInTheDocument()
  })

  it('shows a linked cell and toggles links on cell click', () => {
    render(<TraceabilityMatrix />)
    const linkedCell = screen.getByLabelText('Unlink SRS-1 and SYS-001')
    fireEvent.click(linkedCell)
    expect(storeState.toggleTraceLink).toHaveBeenCalledWith(1, 1)
    const unlinkedCell = screen.getByLabelText('Link SRS-2 and SYS-002')
    fireEvent.click(unlinkedCell)
    expect(storeState.toggleTraceLink).toHaveBeenCalledWith(2, 2)
  })

  it('shows per-row and per-column totals', () => {
    render(<TraceabilityMatrix />)
    // row for SRS-2 has 0 links; totals row exists
    expect(screen.getByText('Requirements per object')).toBeInTheDocument()
  })

  it('loads traceability data on mount', () => {
    render(<TraceabilityMatrix />)
    expect(storeState.loadTraceability).toHaveBeenCalled()
  })

  it('renders empty state without a project', () => {
    storeState.project = null
    render(<TraceabilityMatrix />)
    expect(screen.getByText(/Open or create a project/)).toBeInTheDocument()
  })
})
