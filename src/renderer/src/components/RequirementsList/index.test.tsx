import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RequirementsList from './index'

const mockSelectRequirement = vi.fn()
const mockAddRequirement = vi.fn().mockResolvedValue(undefined)

vi.mock('../../store', () => ({
  useStore: () => ({
    selectedModuleId: 1,
    modules: [{ id: 1, projectId: 1, parentId: null, name: 'SRS', idPrefix: 'SRS', idPadding: 4, nextCounter: 2, position: 0, deletedAt: null, createdAt: '', updatedAt: '' }],
    requirements: [{ id: 1, moduleId: 1, reqId: 'SRS-0001', text: 'The system shall respond within 2s', acceptanceCriteria: null, source: null, rationale: null, position: 0, deletedAt: null, createdAt: '', updatedAt: '' }],
    selectedRequirementId: null,
    selectRequirement: mockSelectRequirement,
    addRequirement: mockAddRequirement
  })
}))

describe('RequirementsList', () => {
  it('renders requirement ID and text', () => {
    render(<RequirementsList />)
    expect(screen.getByText('SRS-0001')).toBeInTheDocument()
    expect(screen.getByText(/The system shall respond/)).toBeInTheDocument()
  })

  it('calls selectRequirement when a row is clicked', async () => {
    render(<RequirementsList />)
    await userEvent.click(screen.getByText('SRS-0001'))
    expect(mockSelectRequirement).toHaveBeenCalledWith(1)
  })

  it('shows + New Requirement button', () => {
    render(<RequirementsList />)
    expect(screen.getByText('+ New Requirement')).toBeInTheDocument()
  })
})
