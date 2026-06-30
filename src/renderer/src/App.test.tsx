import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

vi.mock('./store', () => ({
  useStore: () => ({
    project: null, modules: [], selectedModuleId: null,
    requirements: [], selectedRequirementId: null,
    activeTab: 'requirements' as const,
    setActiveTab: vi.fn(),
    loadProject: vi.fn(),
    loadArchitecture: vi.fn()
  })
}))

describe('App', () => {
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
