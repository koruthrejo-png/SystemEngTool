import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BaselinesCard, BaselineDiffModal } from './index'

const store: any = {
  baselines: [
    { id: 1, projectId: 1, label: 'Rev A', description: 'PDR', createdBy: 7, createdAt: '2026-07-25T10:00:00.000Z' }
  ],
  users: [{ id: 7, displayName: 'Grace' }],
  loadBaselines: vi.fn(), createBaseline: vi.fn().mockResolvedValue(undefined),
  removeBaseline: vi.fn(), loadBaselineDiff: vi.fn(), clearBaselineDiff: vi.fn(),
  baselineDiff: null
}
vi.mock('../../store', () => ({ useStore: () => store }))

describe('BaselinesCard', () => {
  it('lists baselines with label and author', () => {
    render(<BaselinesCard />)
    expect(screen.getByText('Rev A')).toBeInTheDocument()
    expect(screen.getByText(/Grace/)).toBeInTheDocument()
  })

  it('diff button triggers loadBaselineDiff', () => {
    render(<BaselinesCard />)
    fireEvent.click(screen.getByRole('button', { name: /diff/i }))
    expect(store.loadBaselineDiff).toHaveBeenCalledWith(1)
  })
})

describe('BaselineDiffModal', () => {
  it('renders section counts from a diff', () => {
    store.baselineDiff = {
      requirements: { added: [{ reqId: 'B' }], removed: [], modified: [{ key: 'A', changes: [{ field: 'status', before: 'Draft', after: 'Approved' }] }] },
      elements: { added: [], removed: [], modified: [] },
      connections: { added: [], removed: [], modified: [] },
      elementLinks: { added: [], removed: [] },
      connectionLinks: { added: [], removed: [] }
    }
    render(<BaselineDiffModal />)
    expect(screen.getByText(/Requirements/)).toBeInTheDocument()
    expect(screen.getByText(/1 added/)).toBeInTheDocument()
    expect(screen.getByText(/1 changed/)).toBeInTheDocument()
  })
})
