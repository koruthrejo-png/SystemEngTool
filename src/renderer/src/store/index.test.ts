import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStore } from './index'

const mockProject = { id: 1, name: 'Test', createdAt: '', updatedAt: '' }
const mockModule = { id: 1, projectId: 1, parentId: null, name: 'SRS', idPrefix: 'SRS', idPadding: 4, nextCounter: 1, position: 0, deletedAt: null, createdAt: '', updatedAt: '' }
const mockReq = { id: 1, moduleId: 1, reqId: 'SRS-0001', text: 'Req text', acceptanceCriteria: null, source: null, rationale: null, position: 0, deletedAt: null, createdAt: '', updatedAt: '' }

vi.stubGlobal('window', {
  api: {
    project: { getCurrent: vi.fn().mockResolvedValue(mockProject) },
    modules: {
      list: vi.fn().mockResolvedValue([mockModule]),
      create: vi.fn().mockResolvedValue(mockModule),
      update: vi.fn().mockResolvedValue({ ...mockModule, name: 'Renamed' }),
      delete: vi.fn().mockResolvedValue(undefined)
    },
    requirements: {
      list: vi.fn().mockResolvedValue([mockReq]),
      create: vi.fn().mockResolvedValue(mockReq),
      update: vi.fn().mockResolvedValue({ ...mockReq, text: 'Updated' }),
      delete: vi.fn().mockResolvedValue(undefined)
    }
  }
})

describe('store', () => {
  beforeEach(() => {
    useStore.setState({ project: null, modules: [], selectedModuleId: null, requirements: [], selectedRequirementId: null })
  })

  it('loadProject sets project and modules', async () => {
    await useStore.getState().loadProject()
    expect(useStore.getState().project?.name).toBe('Test')
    expect(useStore.getState().modules).toHaveLength(1)
  })

  it('selectModule sets id and loads requirements', async () => {
    useStore.setState({ project: mockProject, modules: [mockModule] })
    await useStore.getState().selectModule(1)
    expect(useStore.getState().selectedModuleId).toBe(1)
    expect(useStore.getState().requirements).toHaveLength(1)
  })

  it('addModule appends to modules list', async () => {
    useStore.setState({ project: mockProject, modules: [] })
    await useStore.getState().addModule({ projectId: 1, parentId: null, name: 'SRS', idPrefix: 'SRS', idPadding: 4 })
    expect(useStore.getState().modules).toHaveLength(1)
  })

  it('removeModule removes from list and clears selection if selected', async () => {
    useStore.setState({ project: mockProject, modules: [mockModule], selectedModuleId: 1 })
    await useStore.getState().removeModule(1)
    expect(useStore.getState().modules).toHaveLength(0)
    expect(useStore.getState().selectedModuleId).toBeNull()
  })
})
