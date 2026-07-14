import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import GlobalSearch from './index'
import type { SearchResults, Requirement, Module, ReqHeading } from '../../../../types'

const mockOpenRequirement = vi.fn()
const mockSelectModule = vi.fn()
const mockSetActiveTab = vi.fn()
const mockQuery = vi.fn()

const storeState: Record<string, unknown> = {}

vi.mock('../../store', () => ({
  useStore: (): Record<string, unknown> => storeState
}))

function results(over: Partial<SearchResults>): SearchResults {
  return { requirements: [], modules: [], headings: [], ...over }
}

const req: Requirement = {
  id: 7, moduleId: 3, reqId: 'SRS-0007', text: 'The system shall search.',
  acceptanceCriteria: null, source: null, rationale: null, position: 0,
  status: 'Draft', priority: 'Medium', reqType: 'Functional', headingId: null,
  deletedAt: null, createdAt: '', updatedAt: ''
}
const mod: Module = { id: 3, projectId: 1, parentId: null, kind: 'module', name: 'SRS', idPrefix: 'SRS', idPadding: 4, nextCounter: 1, position: 0, deletedAt: null, createdAt: '', updatedAt: '' }
const heading: ReqHeading = { id: 9, moduleId: 3, parentId: null, title: 'Performance', position: 0, deletedAt: null, createdAt: '', updatedAt: '' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  mockQuery.mockResolvedValue(results({}))
  ;(window as any).api = { ...(window as any).api, search: { query: mockQuery } }
  Object.assign(storeState, {
    project: { id: 1, name: 'P' },
    modules: [mod],
    openRequirement: mockOpenRequirement,
    selectModule: mockSelectModule,
    setActiveTab: mockSetActiveTab
  })
})

afterEach(() => {
  vi.useRealTimers()
})

async function typeAndSettle(value: string): Promise<void> {
  fireEvent.change(screen.getByLabelText('Global search'), { target: { value } })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250)
  })
}

describe('GlobalSearch', () => {
  it('does not query below 2 characters', async () => {
    render(<GlobalSearch />)
    await typeAndSettle('a')
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('debounces and queries once with the trimmed term', async () => {
    render(<GlobalSearch />)
    await typeAndSettle('  audit ')
    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(mockQuery).toHaveBeenCalledWith(1, 'audit')
  })

  it('renders grouped results and omits empty groups', async () => {
    mockQuery.mockResolvedValue(results({ requirements: [req], headings: [heading] }))
    render(<GlobalSearch />)
    await typeAndSettle('perf')
    const panel = screen.getByTestId('search-results')
    expect(within(panel).getByText('Requirements')).toBeInTheDocument()
    expect(within(panel).getByText('SRS-0007')).toBeInTheDocument()
    expect(within(panel).getByText('Sections')).toBeInTheDocument()
    expect(within(panel).getByText('Performance')).toBeInTheDocument()
    expect(within(panel).queryByText('Modules')).toBeNull()
  })

  it('shows No matches when all groups are empty', async () => {
    mockQuery.mockResolvedValue(results({}))
    render(<GlobalSearch />)
    await typeAndSettle('zzz')
    expect(within(screen.getByTestId('search-results')).getByText('No matches.')).toBeInTheDocument()
  })

  it('requirement row navigates via openRequirement and clears the input', async () => {
    mockQuery.mockResolvedValue(results({ requirements: [req] }))
    render(<GlobalSearch />)
    await typeAndSettle('search')
    fireEvent.click(screen.getByText('SRS-0007'))
    expect(mockOpenRequirement).toHaveBeenCalledWith(req)
    expect((screen.getByLabelText('Global search') as HTMLInputElement).value).toBe('')
    expect(screen.queryByTestId('search-results')).toBeNull()
  })

  it('module row switches tab and selects the module', async () => {
    mockQuery.mockResolvedValue(results({ modules: [mod] }))
    render(<GlobalSearch />)
    await typeAndSettle('srs')
    fireEvent.click(within(screen.getByTestId('search-results')).getByText('SRS'))
    expect(mockSetActiveTab).toHaveBeenCalledWith('requirements')
    expect(mockSelectModule).toHaveBeenCalledWith(3)
  })

  it('heading row switches tab and selects its module', async () => {
    mockQuery.mockResolvedValue(results({ headings: [heading] }))
    render(<GlobalSearch />)
    await typeAndSettle('perf')
    fireEvent.click(screen.getByText('Performance'))
    expect(mockSetActiveTab).toHaveBeenCalledWith('requirements')
    expect(mockSelectModule).toHaveBeenCalledWith(3)
  })

  it('Escape closes the dropdown', async () => {
    mockQuery.mockResolvedValue(results({ requirements: [req] }))
    render(<GlobalSearch />)
    await typeAndSettle('search')
    expect(screen.getByTestId('search-results')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByLabelText('Global search'), { key: 'Escape' })
    expect(screen.queryByTestId('search-results')).toBeNull()
  })

  it('Cmd+K focuses the input', () => {
    render(<GlobalSearch />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(document.activeElement).toBe(screen.getByLabelText('Global search'))
  })
})
