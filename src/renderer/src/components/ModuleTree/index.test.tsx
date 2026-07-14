import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import ModuleTree from './index'

const storeState: any = {}

vi.mock('../../store', () => ({
  useStore: () => storeState
}))

const mod = (id: number, parentId: number | null, name: string, kind: 'folder' | 'module' = 'module'): any => ({
  id, projectId: 1, parentId, kind, name,
  idPrefix: kind === 'folder' ? '' : 'M', idPadding: 4,
  nextCounter: 1, position: 0, deletedAt: null, createdAt: '', updatedAt: ''
})

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(storeState, {
    project: { id: 1, name: 'Demo' },
    modules: [
      mod(1, null, 'System', 'folder'),
      mod(2, 1, 'Software'),
      mod(3, null, 'Hardware', 'folder'),
      mod(4, null, 'Payload')
    ],
    selectedModuleId: null,
    selectModule: vi.fn().mockResolvedValue(undefined),
    addModule: vi.fn().mockResolvedValue(undefined),
    updateModule: vi.fn().mockResolvedValue(undefined),
    removeModule: vi.fn().mockResolvedValue(undefined),
    moveModule: vi.fn().mockResolvedValue(undefined)
  })
})

describe('ModuleTree hierarchy', () => {
  it('renders modules nested inside folders', () => {
    render(<ModuleTree />)
    expect(screen.getByText('System')).toBeInTheDocument()
    expect(screen.getByText('Software')).toBeInTheDocument()
    expect(screen.getByText('Hardware')).toBeInTheDocument()
  })

  it('clicking a folder toggles it and never selects', () => {
    render(<ModuleTree />)
    fireEvent.click(screen.getByText('System'))
    expect(storeState.selectModule).not.toHaveBeenCalled()
    expect(screen.queryByText('Software')).not.toBeInTheDocument() // collapsed
    fireEvent.click(screen.getByText('System'))
    expect(screen.getByText('Software')).toBeInTheDocument()
  })

  it('calls selectModule when a module row is clicked', () => {
    render(<ModuleTree />)
    fireEvent.click(screen.getByText('Software'))
    expect(storeState.selectModule).toHaveBeenCalledWith(2)
  })

  it('offers the add-child form on folders only', () => {
    render(<ModuleTree />)
    expect(screen.getByLabelText('Add to System')).toBeInTheDocument()
    expect(screen.queryByLabelText('Add to Software')).not.toBeInTheDocument()
  })

  it('opens the add-child form scoped to the folder and submits with parentId', () => {
    render(<ModuleTree />)
    fireEvent.click(screen.getByLabelText('Add to System'))
    fireEvent.change(screen.getByPlaceholderText('Module name'), { target: { value: 'Subsystem' } })
    fireEvent.change(screen.getByPlaceholderText('ID prefix (e.g. SRS)'), { target: { value: 'SUB' } })
    fireEvent.submit(screen.getByPlaceholderText('Module name').closest('form')!)
    expect(storeState.addModule).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 1, kind: 'module', name: 'Subsystem', idPrefix: 'SUB' })
    )
  })

  it('move picker lists folders only, excluding self and descendants', () => {
    render(<ModuleTree />)
    fireEvent.click(screen.getByLabelText('Move System'))
    const select = screen.getByLabelText('Move System to')
    const options = within(select).getAllByRole('option').map((o) => o.textContent)
    expect(options).toContain('(top level)')
    expect(options).toContain('Hardware')
    expect(options).not.toContain('System') // self
    expect(options).not.toContain('Software') // descendant, and a module
    expect(options).not.toContain('Payload') // a module can never be a parent
    fireEvent.change(select, { target: { value: '3' } })
    expect(storeState.moveModule).toHaveBeenCalledWith(1, 3)
  })

  it('move to top level passes null', () => {
    render(<ModuleTree />)
    fireEvent.click(screen.getByLabelText('Move Software'))
    fireEvent.change(screen.getByLabelText('Move Software to'), { target: { value: '' } })
    expect(storeState.moveModule).toHaveBeenCalledWith(2, null)
  })

  it('shows the new-item form when + New is clicked', () => {
    render(<ModuleTree />)
    fireEvent.click(screen.getByText('+ New'))
    expect(screen.getByPlaceholderText('Module name')).toBeInTheDocument()
  })
})
