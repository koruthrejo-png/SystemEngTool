import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

// Mock architecture components to avoid React Flow provider requirement
vi.mock('./components/ArchitectureCanvas', () => ({
  default: () => <div data-testid="architecture-canvas" />
}))
vi.mock('./components/ElementPanel', () => ({
  default: () => <div data-testid="element-panel" />
}))
vi.mock('./components/ConnectionPanel', () => ({
  default: () => <div data-testid="connection-panel" />
}))
vi.mock('./components/TraceabilityMatrix', () => ({
  default: () => <div data-testid="traceability-matrix" />
}))
vi.mock('./components/Dashboard', () => ({
  default: () => <div data-testid="dashboard" />
}))

// mockUseStore is hoisted above vi.mock by Vitest (mock* prefix rule)
const mockUseStore = vi.fn()

vi.mock('./store', () => ({
  useStore: (...args: unknown[]) => mockUseStore(...args)
}))

const baseStore = {
  project: null, modules: [], selectedModuleId: null,
  requirements: [], selectedRequirementId: null,
  setActiveTab: vi.fn(),
  loadProject: vi.fn(),
  loadArchitecture: vi.fn(),
  elements: [], connections: [],
  selectedElementId: null, selectedConnectionId: null,
  customFields: [],
  loadCustomFields: vi.fn(),
  addCustomField: vi.fn(),
  updateCustomField: vi.fn(),
  removeCustomField: vi.fn(),
  acItems: [],
  acSummary: {},
  loadAcItems: vi.fn(),
  addAcItem: vi.fn(),
  updateAcItem: vi.fn(),
  removeAcItem: vi.fn(),
  moveAcItem: vi.fn()
}

describe('App', () => {
  beforeEach(() => {
    mockUseStore.mockReturnValue({ ...baseStore, activeTab: 'requirements' as const })
  })

  it('renders modules and list panels with header; detail hidden when nothing selected', () => {
    render(<App />)
    expect(screen.getByText('ReqArch Suite')).toBeInTheDocument()
    expect(screen.getByTestId('panel-modules')).toBeInTheDocument()
    expect(screen.getByTestId('panel-list')).toBeInTheDocument()
    expect(screen.queryByTestId('panel-detail')).not.toBeInTheDocument()
  })

  it('renders the detail panel when a requirement is selected', () => {
    mockUseStore.mockReturnValue({ ...baseStore, activeTab: 'requirements' as const, selectedRequirementId: 1 })
    render(<App />)
    expect(screen.getByTestId('panel-detail')).toBeInTheDocument()
  })

  it('shows New Project and Open buttons', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open/i })).toBeInTheDocument()
  })

  it('renders tab bar with Requirements and Architecture tabs', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /requirements/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /architecture/i })).toBeInTheDocument()
  })

  it('shows requirements panels when Requirements tab is active', () => {
    render(<App />)
    expect(screen.getByTestId('panel-modules')).toBeInTheDocument()
  })
})

describe('App — architecture tab', () => {
  beforeEach(() => {
    mockUseStore.mockReturnValue({ ...baseStore, activeTab: 'architecture' as const })
  })

  it('renders architecture panel when tab is architecture', () => {
    render(<App />)
    expect(screen.getByTestId('panel-architecture')).toBeInTheDocument()
  })
})

describe('App — traceability tab', () => {
  it('shows the traceability tab and renders the matrix when selected', () => {
    mockUseStore.mockReturnValue({ ...baseStore, activeTab: 'traceability' as const })
    render(<App />)
    expect(screen.getByTestId('panel-traceability')).toBeInTheDocument()
  })
})

describe('App — dashboard tab', () => {
  it('shows the dashboard tab and renders it when selected', () => {
    mockUseStore.mockReturnValue({ ...baseStore, activeTab: 'dashboard' as const })
    render(<App />)
    expect(screen.getByTestId('panel-dashboard')).toBeInTheDocument()
  })
})
