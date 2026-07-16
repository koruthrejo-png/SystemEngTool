import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Settings from './index'
import { useStore } from '../../store'

describe('Settings', () => {
  beforeEach(() => {
    useStore.setState({
      colourByType: false,
      elementTypes: [{ id: 1, projectId: 1, name: 'System', color: null, isBuiltIn: true, deletedAt: null, createdAt: '', updatedAt: '' }]
    } as never)
  })

  it('renders nothing when closed', () => {
    const { container } = render(<Settings open={false} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('toggles the colour-by-type preference', () => {
    const spy = vi.spyOn(useStore.getState(), 'setColourByType')
    render(<Settings open onClose={() => {}} />)
    fireEvent.click(screen.getByLabelText('Colour objects by type'))
    expect(spy).toHaveBeenCalledWith(true)
  })

  it('sets a type colour from a swatch', () => {
    const spy = vi.spyOn(useStore.getState(), 'updateElementType')
    render(<Settings open onClose={() => {}} />)
    fireEvent.click(screen.getByLabelText('System Teal'))
    expect(spy).toHaveBeenCalledWith(1, { color: '#0f766e' })
  })
})
