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
  selectedElementId: null, selectedConnectionId: null
}

describe('App', () => {
  beforeEach(() => {
    mockUseStore.mockReturnValue({ ...baseStore, activeTab: 'requirements' as const })
  })

  it('renders 3-panel layout with header', () => {
    render(<App />)
    expect(screen.getByText('ReqArch Suite')).toBeInTheDocument()
    expect(screen.getByTestId('panel-modules')).toBeInTheDocument()
    expect(screen.getByTestId('panel-list')).toBeInTheDocument()
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
