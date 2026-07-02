import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ModuleTree from './index'

const mockSelectModule = vi.fn()
const mockAddModule = vi.fn().mockResolvedValue(undefined)

vi.mock('../../store', () => ({
  useStore: () => ({
    project: { id: 1, name: 'Test', createdAt: '', updatedAt: '' },
    modules: [
      { id: 1, projectId: 1, parentId: null, name: 'SRS', idPrefix: 'SRS', idPadding: 4, nextCounter: 1, position: 0, deletedAt: null, createdAt: '', updatedAt: '' },
      { id: 2, projectId: 1, parentId: 1, name: 'Subsystem', idPrefix: 'SUB', idPadding: 4, nextCounter: 1, position: 0, deletedAt: null, createdAt: '', updatedAt: '' }
    ],
    selectedModuleId: null,
    selectModule: mockSelectModule,
    addModule: mockAddModule,
    updateModule: vi.fn(),
    removeModule: vi.fn()
  })
}))

describe('ModuleTree', () => {
  it('renders all module names', () => {
    render(<ModuleTree />)
    expect(screen.getByText('SRS')).toBeInTheDocument()
    expect(screen.getByText('Subsystem')).toBeInTheDocument()
  })

  it('calls selectModule when a module name is clicked', async () => {
    render(<ModuleTree />)
    await userEvent.click(screen.getByText('SRS'))
    expect(mockSelectModule).toHaveBeenCalledWith(1)
  })

  it('shows New Module form when + New Module is clicked', async () => {
    render(<ModuleTree />)
    await userEvent.click(screen.getByText('+ New Module'))
    expect(screen.getByPlaceholderText(/module name/i)).toBeInTheDocument()
  })
})
