import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import HelpMenu from './HelpMenu'

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as any).api = { ...(window as any).api, app: { getVersion: vi.fn().mockResolvedValue('1.2.3') } }
})

describe('HelpMenu', () => {
  it('opens the keyboard shortcuts modal listing a real shortcut', () => {
    render(<HelpMenu />)
    fireEvent.click(screen.getByLabelText('Help'))
    fireEvent.click(screen.getByText('Keyboard shortcuts'))
    expect(screen.getByText('Keyboard shortcuts', { selector: 'h2, [role="heading"], *' })).toBeInTheDocument()
    expect(screen.getByText(/Focus global search/)).toBeInTheDocument()
  })

  it('opens the About modal showing the app version', async () => {
    render(<HelpMenu />)
    fireEvent.click(screen.getByLabelText('Help'))
    fireEvent.click(screen.getByText('About ReqArch'))
    await waitFor(() => expect(screen.getByText(/1\.2\.3/)).toBeInTheDocument())
  })
})
