import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import ModuleTree from './index'

const storeState: any = {}

vi.mock('../../store', () => ({
  useStore: () => storeState
}))

const mod = (id: number, parentId: number | null, name: string): any => ({
  id, projectId: 1, parentId, name, idPrefix: 'M', idPadding: 4,
  nextCounter: 1, position: 0, deletedAt: null, createdAt: '', updatedAt: ''
})

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(storeState, {
    project: { id: 1, name: 'Demo' },
    modules: [mod(1, null, 'System'), mod(2, 1, 'Software'), mod(3, null, 'Hardware')],
    selectedModuleId: null,
    selectModule: vi.fn().mockResolvedValue(undefined),
    addModule: vi.fn().mockResolvedValue(undefined),
    updateModule: vi.fn().mockResolvedValue(undefined),
    removeModule: vi.fn().mockResolvedValue(undefined),
    moveModule: vi.fn().mockResolvedValue(undefined)
  })
})

describe('ModuleTree hierarchy', () => {
  it('renders nested modules', () => {
    render(<ModuleTree />)
    expect(screen.getByText('System')).toBeInTheDocument()
    expect(screen.getByText('Software')).toBeInTheDocument()
    expect(screen.getByText('Hardware')).toBeInTheDocument()
  })

  it('opens the add-submodule form scoped to the parent and submits with parentId', async () => {
    render(<ModuleTree />)
    fireEvent.click(screen.getByLabelText('Add submodule to System'))
    fireEvent.change(screen.getByPlaceholderText('Module name'), { target: { value: 'Subsystem' } })
    fireEvent.change(screen.getByPlaceholderText('ID prefix (e.g. SRS)'), { target: { value: 'SUB' } })
    fireEvent.submit(screen.getByPlaceholderText('Module name').closest('form')!)
    expect(storeState.addModule).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 1, name: 'Subsystem', idPrefix: 'SUB' })
    )
  })

  it('move picker excludes self and descendants and calls moveModule', () => {
    render(<ModuleTree />)
    fireEvent.click(screen.getByLabelText('Move System'))
    const select = screen.getByLabelText('Move System to')
    const options = within(select).getAllByRole('option').map((o) => o.textContent)
    expect(options).toContain('(top level)')
    expect(options).toContain('Hardware')
    expect(options).not.toContain('System') // self
    expect(options).not.toContain('Software') // descendant
    fireEvent.change(select, { target: { value: '3' } })
    expect(storeState.moveModule).toHaveBeenCalledWith(1, 3)
  })

  it('move to top level passes null', () => {
    render(<ModuleTree />)
    fireEvent.click(screen.getByLabelText('Move Software'))
    fireEvent.change(screen.getByLabelText('Move Software to'), { target: { value: '' } })
    expect(storeState.moveModule).toHaveBeenCalledWith(2, null)
  })
})
