import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ComponentLibrary from './ComponentLibrary'

const addElement = vi.fn()

let project: any = { id: 7 }
let elementTypes: any[] = [
  { id: 1, projectId: 7, name: 'System', color: null, isBuiltIn: true, deletedAt: null, createdAt: '', updatedAt: '' },
  { id: 2, projectId: 7, name: 'Component', color: '#42682d', isBuiltIn: true, deletedAt: null, createdAt: '', updatedAt: '' }
]

vi.mock('../../store', () => ({
  useStore: () => ({
    project,
    elementTypes,
    addElement
  })
}))

describe('ComponentLibrary', () => {
  beforeEach(() => {
    addElement.mockReset()
    project = { id: 7 }
    elementTypes = [
      { id: 1, projectId: 7, name: 'System', color: null, isBuiltIn: true, deletedAt: null, createdAt: '', updatedAt: '' },
      { id: 2, projectId: 7, name: 'Component', color: '#42682d', isBuiltIn: true, deletedAt: null, createdAt: '', updatedAt: '' }
    ]
  })

  it('renders one row per element type', () => {
    render(<ComponentLibrary />)
    expect(screen.getByRole('button', { name: 'Add System' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Component' })).toBeInTheDocument()
  })

  it('clicking a type adds an element of that type', () => {
    render(<ComponentLibrary />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Component' }))
    expect(addElement).toHaveBeenCalledTimes(1)
    const arg = addElement.mock.calls[0][0]
    expect(arg.projectId).toBe(7)
    expect(arg.elementTypeId).toBe(2)
    expect(typeof arg.posX).toBe('number')
    expect(typeof arg.posY).toBe('number')
  })
})
