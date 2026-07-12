import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ArchitectureNav from './ArchitectureNav'
import { useStore } from '../../store'

vi.mock('../../store')

const arch = (id: number, name: string) => ({ id, projectId: 1, name, position: id, deletedAt: null, createdAt: '', updatedAt: '' })

beforeEach(() => {
  ;(useStore as any).mockReturnValue({
    architectures: [arch(10, 'Default'), arch(11, 'Comms')], activeArchitectureId: 10,
    setActiveArchitecture: vi.fn(), addArchitecture: vi.fn(), renameArchitecture: vi.fn(), removeArchitecture: vi.fn()
  })
})

it('renders a row per architecture and switches on click', () => {
  const setActive = vi.fn()
  ;(useStore as any).mockReturnValue({
    architectures: [arch(10, 'Default'), arch(11, 'Comms')], activeArchitectureId: 10,
    setActiveArchitecture: setActive, addArchitecture: vi.fn(), renameArchitecture: vi.fn(), removeArchitecture: vi.fn()
  })
  render(<ArchitectureNav />)
  expect(screen.getByText('Default')).toBeInTheDocument()
  fireEvent.click(screen.getByText('Comms'))
  expect(setActive).toHaveBeenCalledWith(11)
})

it('creates a new architecture via the + New affordance', () => {
  const addArchitecture = vi.fn()
  ;(useStore as any).mockReturnValue({
    architectures: [arch(10, 'Default')], activeArchitectureId: 10,
    setActiveArchitecture: vi.fn(), addArchitecture, renameArchitecture: vi.fn(), removeArchitecture: vi.fn()
  })
  render(<ArchitectureNav />)
  fireEvent.click(screen.getByLabelText('New architecture'))
  const input = screen.getByPlaceholderText('Architecture name')
  fireEvent.change(input, { target: { value: 'Power' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(addArchitecture).toHaveBeenCalledWith('Power')
})

it('hides delete when only one architecture exists', () => {
  ;(useStore as any).mockReturnValue({
    architectures: [arch(10, 'Default')], activeArchitectureId: 10,
    setActiveArchitecture: vi.fn(), addArchitecture: vi.fn(), renameArchitecture: vi.fn(), removeArchitecture: vi.fn()
  })
  render(<ArchitectureNav />)
  expect(screen.queryByLabelText('Delete Default')).toBeNull()
})
