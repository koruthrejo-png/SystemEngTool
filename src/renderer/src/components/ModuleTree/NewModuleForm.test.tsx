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
})
