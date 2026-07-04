import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button, Input, SectionLabel, Chip } from './index'

describe('ui primitives', () => {
  it('Button defaults to primary variant (solid green)', () => {
    render(<Button>Save</Button>)
    const btn = screen.getByRole('button', { name: 'Save' })
    expect(btn.className).toContain('bg-action')
    expect(btn.className).toContain('text-white')
  })

  it('Button secondary variant is ghost with navy border', () => {
    render(<Button variant="secondary">Open</Button>)
    const btn = screen.getByRole('button', { name: 'Open' })
    expect(btn.className).toContain('border-navy')
    expect(btn.className).toContain('text-navy')
  })

  it('Input renders with focus ring classes', () => {
    render(<Input placeholder="Name" />)
    expect(screen.getByPlaceholderText('Name').className).toContain('focus:ring-action')
  })

  it('SectionLabel renders label-caps text', () => {
    render(<SectionLabel>Modules</SectionLabel>)
    const el = screen.getByText('Modules')
    expect(el.className).toContain('uppercase')
    expect(el.className).toContain('text-[11px]')
  })
})

describe('Chip', () => {
  it('renders the value text', () => {
    render(<Chip value="Approved" />)
    expect(screen.getByText('Approved')).toBeInTheDocument()
  })

  it('applies error styling for Rejected and High', () => {
    render(<Chip value="Rejected" />)
    expect(screen.getByText('Rejected').className).toContain('text-error')
  })

  it('falls back to neutral styling for unknown values', () => {
    render(<Chip value="Whatever" />)
    expect(screen.getByText('Whatever').className).toContain('text-ink-muted')
  })
})
