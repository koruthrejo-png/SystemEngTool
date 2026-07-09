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
const mockReq = { id: 1, moduleId: 1, reqId: 'SRS-0001', text: 'Req text', acceptanceCriteria: null, source: null, rationale: null, status: 'Draft' as const, priority: 'High' as const, reqType: 'Functional' as const, headingId: null, position: 0, deletedAt: null, createdAt: '', updatedAt: '' }
const mockElement: ArchitectureElement = {
  id: 1, projectId: 1, parentId: null, blockId: 'SYS-001', name: '',
  elementTypeId: null, description: null, color: null,
  posX: 100, posY: 100, width: 160, height: 80,
  deletedAt: null, createdAt: '', updatedAt: ''
}
const mockConn: ArchitectureConnection = {
  id: 1, projectId: 1, connId: 'ICN-0001', sourceId: 1, targetId: 2,
  sourceHandle: null, targetHandle: null,
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
      delete: vi.fn().mockResolvedValue(undefined),
      move: vi.fn().mockResolvedValue({ ...mockModule, parentId: 2 })
    },
    requirements: {
      list: vi.fn().mockResolvedValue([mockReq]),
      create: vi.fn().mockResolvedValue(mockReq),
      update: vi.fn().mockResolvedValue({ ...mockReq, text: 'Updated' }),
      delete: vi.fn().mockResolvedValue(undefined),
      listByProject: vi.fn().mockResolvedValue([mockReq])
    },
    headings: { list: vi.fn().mockResolvedValue([]) },
    elementTypes: { list: vi.fn().mockResolvedValue([]) },
    connectionTypes: { list: vi.fn().mockResolvedValue([]) },
    elements: {
      list: vi.fn().mockResolvedValue([mockElement]),
      create: vi.fn().mockResolvedValue(mockElement),
      update: vi.fn().mockResolvedValue({ ...mockElement, name: 'Updated' }),
      delete: vi.fn().mockResolvedValue(undefined),
      restore: vi.fn().mockResolvedValue(mockElement)
    },
    connections: {
      list: vi.fn().mockResolvedValue([mockConn]),
      create: vi.fn().mockResolvedValue(mockConn),
      update: vi.fn().mockResolvedValue(mockConn),
      delete: vi.fn().mockResolvedValue(undefined),
      restore: vi.fn().mockResolvedValue(mockConn)
    },
    elementLinks: {
      list: vi.fn().mockResolvedValue([]),
      add: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      listByProject: vi.fn().mockResolvedValue([])
    },
    connectionLinks: {
      list: vi.fn().mockResolvedValue([]),
      add: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined)
    },
    reqLinks: {
      add: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      listByProject: vi.fn().mockResolvedValue([{ parentReqId: 1, childReqId: 2 }])
    },
    acceptanceCriteria: {
      list: vi.fn().mockResolvedValue([]),
      listByModule: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      move: vi.fn().mockResolvedValue(undefined)
    }
  }
})

describe('store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    ;(window.api.modules.list as any).mockResolvedValueOnce([])
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

  it('toggleChecked adds then removes an id', () => {
    useStore.setState({ checkedIds: [] })
    useStore.getState().toggleChecked(1)
    expect(useStore.getState().checkedIds).toEqual([1])
    useStore.getState().toggleChecked(2)
    expect(useStore.getState().checkedIds).toEqual([1, 2])
    useStore.getState().toggleChecked(1)
    expect(useStore.getState().checkedIds).toEqual([2])
  })

  it('setChecked replaces the checked set', () => {
    useStore.setState({ checkedIds: [1] })
    useStore.getState().setChecked([2, 3])
    expect(useStore.getState().checkedIds).toEqual([2, 3])
    useStore.getState().setChecked([])
    expect(useStore.getState().checkedIds).toEqual([])
  })

  it('filter setters and selectModule clear checkedIds', async () => {
    useStore.setState({ checkedIds: [1] })
    useStore.getState().setStatusFilter('Approved')
    expect(useStore.getState().checkedIds).toEqual([])

    useStore.setState({ checkedIds: [1] })
    useStore.getState().setPriorityFilter('High')
    expect(useStore.getState().checkedIds).toEqual([])

    useStore.setState({ checkedIds: [1] })
    useStore.getState().setTypeFilter('Functional')
    expect(useStore.getState().checkedIds).toEqual([])

    useStore.setState({ checkedIds: [1] })
    await useStore.getState().selectModule(1)
    expect(useStore.getState().checkedIds).toEqual([])
  })

  it('updateRequirements patches each id, reloads the list, clears checked', async () => {
    useStore.setState({ selectedModuleId: 1, checkedIds: [1], requirements: [mockReq] })
    await useStore.getState().updateRequirements([1], { status: 'Approved' })
    expect(window.api.requirements.update).toHaveBeenCalledWith(1, { status: 'Approved' })
    expect(window.api.requirements.list).toHaveBeenCalledWith(1)
    expect(useStore.getState().checkedIds).toEqual([])
  })

  it('removeRequirements deletes each id, removes rows locally, clears checked and selection', async () => {
    useStore.setState({
      selectedModuleId: 1, checkedIds: [1],
      requirements: [mockReq], selectedRequirementId: 1
    })
    await useStore.getState().removeRequirements([1])
    expect(window.api.requirements.delete).toHaveBeenCalledWith(1)
    expect(useStore.getState().requirements).toEqual([])
    expect(useStore.getState().checkedIds).toEqual([])
    expect(useStore.getState().selectedRequirementId).toBeNull()
  })

  it('removeRequirement prunes the deleted id from checkedIds', async () => {
    useStore.setState({ requirements: [mockReq], checkedIds: [1, 2], selectedRequirementId: null })
    await useStore.getState().removeRequirement(1)
    expect(useStore.getState().checkedIds).toEqual([2])
  })

  it('moveModule calls the api and re-syncs the module list', async () => {
    await useStore.getState().loadProject()
    await useStore.getState().moveModule(1, 2)
    expect(window.api.modules.move).toHaveBeenCalledWith(1, 2)
    expect(window.api.modules.list).toHaveBeenCalledTimes(2) // loadProject + re-sync
  })

  it('removeModule re-syncs modules from the DB (reparented children)', async () => {
    await useStore.getState().loadProject()
    ;(window.api.modules.list as any).mockResolvedValueOnce([])
    await useStore.getState().removeModule(1)
    expect(window.api.modules.delete).toHaveBeenCalledWith(1)
    expect(useStore.getState().modules).toEqual([]) // state comes from the re-fetch, not a local filter
  })

  it('loadTraceability also loads requirement links', async () => {
    await useStore.getState().loadProject()
    await useStore.getState().loadTraceability()
    expect(window.api.reqLinks.listByProject).toHaveBeenCalledWith(1)
    expect(useStore.getState().reqLinks).toEqual([{ parentReqId: 1, childReqId: 2 }])
  })

  it('addReqLink and removeReqLink call the api and refetch links', async () => {
    await useStore.getState().loadProject()
    await useStore.getState().addReqLink(1, 2)
    expect(window.api.reqLinks.add).toHaveBeenCalledWith(1, 2)
    expect(useStore.getState().reqLinks).toEqual([{ parentReqId: 1, childReqId: 2 }])
    await useStore.getState().removeReqLink(1, 2)
    expect(window.api.reqLinks.remove).toHaveBeenCalledWith(1, 2)
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
    ;(window.api.elements.list as any).mockResolvedValueOnce([])
    ;(window.api.connections.list as any).mockResolvedValueOnce([])
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

  it('removeElement re-syncs elements and connections from the DB (reparented children)', async () => {
    const child = { ...mockElement, id: 2, parentId: null, posX: 320, posY: 320 }
    ;(window.api.elements.list as any).mockResolvedValue([child])
    ;(window.api.connections.list as any).mockResolvedValue([])
    useStore.setState({
      project: { id: 1 } as any,
      elements: [mockElement, { ...mockElement, id: 2, parentId: mockElement.id, posX: 20, posY: 20 }],
      connections: [mockConn],
      selectedElementId: mockElement.id
    })
    await useStore.getState().removeElement(mockElement.id)
    expect(window.api.elements.delete).toHaveBeenCalledWith(mockElement.id)
    expect(useStore.getState().elements).toEqual([child])
    expect(useStore.getState().connections).toEqual([])
    expect(useStore.getState().selectedElementId).toBeNull()
  })
})

describe('undo/redo — create', () => {
  beforeEach(async () => {
    useStore.setState({ project: mockProject as any, elements: [], connections: [], undoStack: [], redoStack: [] })
    vi.clearAllMocks()
  })

  it('addElement pushes an undo command; undo deletes, redo restores', async () => {
    await useStore.getState().addElement({ projectId: 1 })
    expect(useStore.getState().undoStack).toHaveLength(1)

    await useStore.getState().undo()
    expect(window.api.elements.delete).toHaveBeenCalledWith(1)
    expect(useStore.getState().undoStack).toHaveLength(0)
    expect(useStore.getState().redoStack).toHaveLength(1)

    await useStore.getState().redo()
    expect(window.api.elements.restore).toHaveBeenCalledWith(1)
    expect(useStore.getState().undoStack).toHaveLength(1)
    expect(useStore.getState().redoStack).toHaveLength(0)
  })

  it('a new action clears the redo stack', async () => {
    await useStore.getState().addElement({ projectId: 1 })
    await useStore.getState().undo()
    expect(useStore.getState().redoStack).toHaveLength(1)
    await useStore.getState().addConnection({ projectId: 1, sourceId: 1, targetId: 2, sourceHandle: null, targetHandle: null })
    expect(useStore.getState().redoStack).toHaveLength(0)
  })
})

describe('undo/redo — delete', () => {
  const child = { ...mockElement, id: 2, parentId: 1, posX: 10, posY: 20 }
  const conn = { ...mockConn, id: 5, sourceId: 1, targetId: 3 }

  beforeEach(() => {
    useStore.setState({
      project: mockProject as any,
      elements: [mockElement, child],
      connections: [conn],
      undoStack: [], redoStack: []
    })
    vi.clearAllMocks()
  })

  it('removeElement undo restores the element, its connections, and reparents children back', async () => {
    await useStore.getState().removeElement(1)
    expect(window.api.elements.delete).toHaveBeenCalledWith(1)
    expect(useStore.getState().undoStack).toHaveLength(1)

    await useStore.getState().undo()
    expect(window.api.elements.restore).toHaveBeenCalledWith(1)
    expect(window.api.connections.restore).toHaveBeenCalledWith(5)
    expect(window.api.elements.update).toHaveBeenCalledWith(2, { parentId: 1, posX: 10, posY: 20 })
  })

  it('removeConnection undo restores, redo re-deletes', async () => {
    await useStore.getState().removeConnection(5)
    await useStore.getState().undo()
    expect(window.api.connections.restore).toHaveBeenCalledWith(5)
    await useStore.getState().redo()
    expect(window.api.connections.delete).toHaveBeenCalledWith(5)
  })
})

describe('undo/redo — edit', () => {
  beforeEach(() => {
    useStore.setState({
      project: mockProject as any,
      elements: [{ ...mockElement, name: 'Old' }],
      connections: [{ ...mockConn, name: 'OldConn' }],
      undoStack: [], redoStack: []
    })
    vi.clearAllMocks()
  })

  it('updateElement with a name change pushes an edit command; undo restores the old name', async () => {
    await useStore.getState().updateElement(1, { name: 'New' })
    expect(useStore.getState().undoStack).toHaveLength(1)
    await useStore.getState().undo()
    expect(window.api.elements.update).toHaveBeenLastCalledWith(1, { name: 'Old' })
  })

  it('updateElement with only position does NOT push a command', async () => {
    await useStore.getState().updateElement(1, { posX: 5, posY: 6 })
    expect(useStore.getState().undoStack).toHaveLength(0)
  })

  it('updateConnection with a name change pushes an edit command', async () => {
    await useStore.getState().updateConnection(1, { name: 'NewConn' })
    expect(useStore.getState().undoStack).toHaveLength(1)
    await useStore.getState().undo()
    expect(window.api.connections.update).toHaveBeenLastCalledWith(1, { name: 'OldConn' })
  })
})
