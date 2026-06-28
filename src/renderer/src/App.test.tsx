import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

vi.mock('./store', () => ({
  useStore: () => ({
    project: null, modules: [], selectedModuleId: null,
    requirements: [], selectedRequirementId: null,
    loadProject: vi.fn()
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
})
