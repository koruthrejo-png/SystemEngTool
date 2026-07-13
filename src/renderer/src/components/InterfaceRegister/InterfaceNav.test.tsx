import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import InterfaceNav from './InterfaceNav'
import { useStore } from '../../store'

vi.mock('../../store')

const arch = (id: number, name: string): any => ({ id, projectId: 1, name, position: id, deletedAt: null, createdAt: '', updatedAt: '' })

beforeEach(() => {
  ;(useStore as any).mockReturnValue({
    architectures: [arch(10, 'Default'), arch(11, 'Comms')],
    interfaceArchFilter: 'all', setInterfaceArchFilter: vi.fn()
  })
})

it('renders All architectures plus one entry per architecture', () => {
  render(<InterfaceNav />)
  expect(screen.getByText('All architectures')).toBeInTheDocument()
  expect(screen.getByText('Default')).toBeInTheDocument()
  expect(screen.getByText('Comms')).toBeInTheDocument()
})

it('sets the filter to an architecture id on click', () => {
  const setFilter = vi.fn()
  ;(useStore as any).mockReturnValue({
    architectures: [arch(10, 'Default'), arch(11, 'Comms')],
    interfaceArchFilter: 'all', setInterfaceArchFilter: setFilter
  })
  render(<InterfaceNav />)
  fireEvent.click(screen.getByText('Comms'))
  expect(setFilter).toHaveBeenCalledWith(11)
})

it('sets the filter back to all', () => {
  const setFilter = vi.fn()
  ;(useStore as any).mockReturnValue({
    architectures: [arch(10, 'Default')],
    interfaceArchFilter: 10, setInterfaceArchFilter: setFilter
  })
  render(<InterfaceNav />)
  fireEvent.click(screen.getByText('All architectures'))
  expect(setFilter).toHaveBeenCalledWith('all')
})
