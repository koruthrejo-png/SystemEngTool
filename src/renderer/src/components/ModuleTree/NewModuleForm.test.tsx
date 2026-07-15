import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import NewModuleForm from './NewModuleForm'

const setup = () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<NewModuleForm projectId={1} parentId={null} onSubmit={onSubmit} onCancel={vi.fn()} />)
  return onSubmit
}

describe('NewModuleForm', () => {
  it('submits a module with a prefix by default', () => {
    const onSubmit = setup()
    fireEvent.change(screen.getByPlaceholderText('Module name'), { target: { value: 'Chassis' } })
    fireEvent.change(screen.getByPlaceholderText('ID prefix (e.g. SRS)'), { target: { value: 'chs' } })
    fireEvent.submit(screen.getByPlaceholderText('Module name').closest('form')!)
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'module', name: 'Chassis', idPrefix: 'CHS', parentId: null })
    )
  })

  it('hides the prefix inputs for a folder and submits an empty prefix', () => {
    const onSubmit = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Folder' }))
    expect(screen.queryByPlaceholderText('ID prefix (e.g. SRS)')).not.toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Folder name'), { target: { value: 'Vehicle' } })
    fireEvent.submit(screen.getByPlaceholderText('Folder name').closest('form')!)
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'folder', name: 'Vehicle', idPrefix: '' })
    )
  })

  it('does not submit a module without a prefix', () => {
    const onSubmit = setup()
    fireEvent.change(screen.getByPlaceholderText('Module name'), { target: { value: 'Chassis' } })
    fireEvent.submit(screen.getByPlaceholderText('Module name').closest('form')!)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('defaults the digit count to 1', () => {
    setup()
    expect(screen.getByTitle(/ID digit count/)).toHaveValue(1)
  })

  it('previews the first ID from the typed prefix and digit count', () => {
    setup()
    fireEvent.change(screen.getByPlaceholderText('ID prefix (e.g. SRS)'), { target: { value: 'srs' } })
    expect(screen.getByText('SRS-1')).toBeInTheDocument()
    fireEvent.change(screen.getByTitle(/ID digit count/), { target: { value: '3' } })
    expect(screen.getByText('SRS-001')).toBeInTheDocument()
  })

  it('uppercases the prefix in the preview, matching what the backend mints', () => {
    setup()
    fireEvent.change(screen.getByPlaceholderText('ID prefix (e.g. SRS)'), { target: { value: 'chs' } })
    expect(screen.getByText('CHS-1')).toBeInTheDocument()
    expect(screen.queryByText('chs-1')).not.toBeInTheDocument()
  })

  it('previews the double hyphen a trailing-hyphen prefix really mints', () => {
    setup()
    fireEvent.change(screen.getByPlaceholderText('ID prefix (e.g. SRS)'), { target: { value: 'SRS-TRS-' } })
    expect(screen.getByText('SRS-TRS--1')).toBeInTheDocument()
  })

  it('shows no preview for a folder', () => {
    setup()
    fireEvent.change(screen.getByPlaceholderText('ID prefix (e.g. SRS)'), { target: { value: 'srs' } })
    expect(screen.getByText('SRS-1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Folder' }))
    expect(screen.queryByText('SRS-1')).not.toBeInTheDocument()
    expect(screen.queryByText(/First ID/)).not.toBeInTheDocument()
  })
})
