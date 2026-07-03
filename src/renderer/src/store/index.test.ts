import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStore } from './index'
import type { ArchitectureElement, ArchitectureConnection } from '../../../types'

const mockProject = {
  id: 1, name: 'Test',
  elemIdPrefix: 'ELEM', elemIdPadding: 4, elemNextCounter: 1,
  connIdPrefix: 'CONN', connIdPadding: 4, connNextCounter: 1,
  createdAt: '', updatedAt: ''
}
const mockModule = { id: 1, projectId: 1, parentId: null, name: 'SRS', idPrefix: 'SRS', idPadding: 4, nextCounter: 1, position: 0, deletedAt: null, createdAt: '', updatedAt: '' }
const mockReq = { id: 1, moduleId: 1, reqId: 'SRS-0001', text: 'Req text', acceptanceCriteria: null, source: null, rationale: null, position: 0, deletedAt: null, createdAt: '', updatedAt: '' }
const mockElement: ArchitectureElement = {
  id: 1, projectId: 1, parentId: null, blockId: 'SYS-001', name: '',
  elementTypeId: null, description: null, color: null,
  posX: 100, posY: 100, width: 160, height: 80,
  deletedAt: null, createdAt: '', updatedAt: ''
}
const mockConn: ArchitectureConnection = {
  id: 1, projectId: 1, connId: 'ICN-0001', sourceId: 1, targetId: 2,
  name: null, connectionTypeId: null, description: null,
  deletedAt: null, createdAt: '', updatedAt: ''
}

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
      delete: vi.fn().mockResolvedValue(undefined),
      listByProject: vi.fn().mockResolvedValue([mockReq])
    },
    elementTypes: { list: vi.fn().mockResolvedValue([]) },
    connectionTypes: { list: vi.fn().mockResolvedValue([]) },
    elements: {
      list: vi.fn().mockResolvedValue([mockElement]),
      create: vi.fn().mockResolvedValue(mockElement),
      update: vi.fn().mockResolvedValue({ ...mockElement, name: 'Updated' }),
      delete: vi.fn().mockResolvedValue(undefined)
    },
    connections: {
      list: vi.fn().mockResolvedValue([mockConn]),
      delete: vi.fn().mockResolvedValue(undefined)
    },
    elementLinks: {
      list: vi.fn().mockResolvedValue([]),
      add: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined)
    },
    connectionLinks: {
      list: vi.fn().mockResolvedValue([]),
      add: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined)
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

  it('filter setters update filter state', () => {
    useStore.getState().setStatusFilter('Approved')
    useStore.getState().setPriorityFilter('High')
    useStore.getState().setTypeFilter('Functional')
    expect(useStore.getState().statusFilter).toBe('Approved')
    expect(useStore.getState().priorityFilter).toBe('High')
    expect(useStore.getState().typeFilter).toBe('Functional')
  })

  it('selectModule resets filters to All', async () => {
    useStore.setState({ statusFilter: 'Approved', priorityFilter: 'High', typeFilter: 'Functional' })
    await useStore.getState().selectModule(1)
    expect(useStore.getState().statusFilter).toBe('All')
    expect(useStore.getState().priorityFilter).toBe('All')
    expect(useStore.getState().typeFilter).toBe('All')
  })
})

describe('architecture store', () => {
  beforeEach(() => {
    useStore.setState({
      project: mockProject, activeTab: 'requirements',
      elements: [], connections: [], elementTypes: [], connectionTypes: [],
      selectedElementId: null, selectedConnectionId: null, projectRequirements: []
    })
  })

  it('setActiveTab switches the active tab', () => {
    useStore.getState().setActiveTab('architecture')
    expect(useStore.getState().activeTab).toBe('architecture')
  })

  it('loadArchitecture loads elements, connections, and types', async () => {
    await useStore.getState().loadArchitecture()
    expect(useStore.getState().elements).toHaveLength(1)
    expect(useStore.getState().connections).toHaveLength(1)
  })

  it('addElement appends to elements list', async () => {
    await useStore.getState().addElement({ projectId: 1 })
    expect(useStore.getState().elements).toHaveLength(1)
    expect(useStore.getState().selectedElementId).toBe(1)
  })

  it('removeElement removes from list and clears selection', async () => {
    useStore.setState({ elements: [mockElement], selectedElementId: 1 })
    await useStore.getState().removeElement(1)
    expect(useStore.getState().elements).toHaveLength(0)
    expect(useStore.getState().selectedElementId).toBeNull()
  })

  it('selectElement sets selectedElementId and clears connection selection', () => {
    useStore.setState({ selectedConnectionId: 1 })
    useStore.getState().selectElement(42)
    expect(useStore.getState().selectedElementId).toBe(42)
    expect(useStore.getState().selectedConnectionId).toBeNull()
  })
})
