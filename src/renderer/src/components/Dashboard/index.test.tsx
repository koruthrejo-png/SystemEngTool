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
  headingId: null, position: 0, deletedAt: null,
  createdAt: '2026-01-01', updatedAt: '2026-01-01', ...extra
})

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(storeState, {
    project: { id: 1, name: 'Demo' },
    projectRequirements: [
      req(1, { status: 'Approved' }),
      req(2, { priority: 'High', updatedAt: '2026-01-02' })
    ],
    elements: [
      { id: 1, projectId: 1, parentId: null, blockId: 'SYS-001', name: '', elementTypeId: null, description: null, color: null, posX: 0, posY: 0, width: 160, height: 80, deletedAt: null, createdAt: '', updatedAt: '' },
      { id: 2, projectId: 1, parentId: 1, blockId: 'SYS-002', name: '', elementTypeId: null, description: null, color: null, posX: 0, posY: 0, width: 160, height: 80, deletedAt: null, createdAt: '', updatedAt: '' }
    ],
    modules: [{ id: 1, name: 'SRS', position: 0 }],
    traceLinks: [{ elementId: 1, requirementId: 1 }],
    loadTraceability: vi.fn().mockResolvedValue(undefined),
    openRequirement: vi.fn().mockResolvedValue(undefined),
    setActiveTab: vi.fn()
  })
})

describe('Dashboard (executive layout)', () => {
  it('renders the four KPI cards with real values', () => {
    render(<Dashboard />)
    const kpis = screen.getByTestId('kpi-cards')
    expect(within(kpis).getByText('Total Requirements')).toBeInTheDocument()
    expect(within(kpis).getByText('Allocation Coverage')).toBeInTheDocument()
    expect(within(kpis).getByText('50%')).toBeInTheDocument()
    expect(within(kpis).getByText('Trace Gaps')).toBeInTheDocument()
    // SRS-2 is High priority and unallocated → 1 gap
    expect(within(within(kpis).getByText('Trace Gaps').closest('div')!.parentElement!).getByText('1')).toBeInTheDocument()
    expect(within(kpis).getByText('1 subsystems')).toBeInTheDocument()
  })

  it('renders the status donut with a legend entry per status', () => {
    render(<Dashboard />)
    const donut = screen.getByTestId('status-donut')
    expect(within(donut).getByText('Approved')).toBeInTheDocument()
    expect(within(donut).getByText('Draft')).toBeInTheDocument()
    expect(within(donut).getAllByText(/50%/).length).toBeGreaterThanOrEqual(1)
  })

  it('renders per-module coverage bars', () => {
    render(<Dashboard />)
    const bars = screen.getByTestId('module-bars')
    expect(within(bars).getByText('SRS')).toBeInTheDocument()
    expect(within(bars).getByText('50% linked')).toBeInTheDocument()
  })

  it('renders recent activity with badges and opens a requirement on click', () => {
    render(<Dashboard />)
    const activity = screen.getByTestId('recent-activity')
    expect(within(activity).getAllByText('CREATED').length).toBe(1) // SRS-1: createdAt === updatedAt
    expect(within(activity).getAllByText('EDITED').length).toBe(1) // SRS-2: differs
    fireEvent.click(within(activity).getByText('SRS-1').closest('button')!)
    expect(storeState.openRequirement).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  })

  it('renders critical gaps and the traceability shortcut', () => {
    render(<Dashboard />)
    const gaps = screen.getByTestId('critical-gaps')
    expect(within(gaps).getByText('SRS-2')).toBeInTheDocument()
    fireEvent.click(within(gaps).getByText('SRS-2').closest('button')!)
    expect(storeState.openRequirement).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }))
    fireEvent.click(screen.getByText('Open Traceability Matrix'))
    expect(storeState.setActiveTab).toHaveBeenCalledWith('traceability')
  })

  it('loads data on mount and shows empty state without a project', () => {
    render(<Dashboard />)
    expect(storeState.loadTraceability).toHaveBeenCalled()
    storeState.project = null
    render(<Dashboard />)
    expect(screen.getByText(/Open or create a project/)).toBeInTheDocument()
  })
})
