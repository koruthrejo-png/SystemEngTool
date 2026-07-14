import { create } from 'zustand'
import type {
  Project, Module, Requirement,
  CreateModuleInput, UpdateModuleInput,
  CreateRequirementInput, UpdateRequirementInput,
  ElementType, ConnectionType,
  Architecture,
  ArchitectureElement, ArchitectureConnection,
  CreateElementInput, UpdateElementInput,
  CreateConnectionInput, UpdateConnectionInput,
  RequirementCustomField, UpdateCustomFieldInput,
  ConnectionCustomField, UpdateConnectionCustomFieldInput,
  RequirementStatus, RequirementPriority, RequirementType,
  ReqHeading, CreateHeadingInput,
  ElementRequirementLink, RequirementLink,
  AcceptanceCriterion, UpdateAcceptanceCriterionInput,
  Layer, LayerState, ElementLayerLink, ConnectionLayerLink
} from '../../../types'
import { summarize, type AcSummaryEntry } from './acSummary'

const ELEMENT_PROP_KEYS = ['name', 'color', 'elementTypeId', 'description', 'blockId'] as const
const CONNECTION_PROP_KEYS = ['name', 'connectionTypeId', 'description', 'connId'] as const

interface UndoCommand {
  undo: () => Promise<void>
  redo: () => Promise<void>
}

interface Store {
  // shared
  project: Project | null
  activeTab: 'requirements' | 'architecture' | 'traceability' | 'dashboard' | 'interfaces'

  // requirements tab
  modules: Module[]
  selectedModuleId: number | null
  requirements: Requirement[]
  selectedRequirementId: number | null
  headings: ReqHeading[]
  collapsedHeadingIds: number[]

  // architecture tab
  architectures: Architecture[]
  activeArchitectureId: number | null
  elements: ArchitectureElement[]
  connections: ArchitectureConnection[]
  elementTypes: ElementType[]
  connectionTypes: ConnectionType[]
  selectedElementId: number | null
  selectedConnectionId: number | null
  interfaceArchFilter: number | 'all'
  projectRequirements: Requirement[]
  customFields: RequirementCustomField[]
  connectionCustomFields: ConnectionCustomField[]
  projectConnectionCustomFields: ConnectionCustomField[]
  acItems: AcceptanceCriterion[]
  acSummary: Record<number, AcSummaryEntry>
  showDeleted: boolean
  deletedRequirements: Requirement[]
  statusFilter: RequirementStatus | 'All'
  priorityFilter: RequirementPriority | 'All'
  typeFilter: RequirementType | 'All'
  checkedIds: number[]
  traceLinks: ElementRequirementLink[]
  reqLinks: RequirementLink[]
  layers: Layer[]
  elementLayers: ElementLayerLink[]
  connectionLayers: ConnectionLayerLink[]
  undoStack: UndoCommand[]
  redoStack: UndoCommand[]
  undo: () => Promise<void>
  redo: () => Promise<void>
  clearHistory: () => void

  // actions — shared
  loadProject: () => Promise<void>
  setActiveTab: (tab: 'requirements' | 'architecture' | 'traceability' | 'dashboard' | 'interfaces') => void
  loadTraceability: () => Promise<void>
  toggleTraceLink: (elementId: number, requirementId: number) => Promise<void>
  addReqLink: (parentReqId: number, childReqId: number) => Promise<void>
  removeReqLink: (parentReqId: number, childReqId: number) => Promise<void>

  // actions — requirements
  selectModule: (id: number | null) => Promise<void>
  selectRequirement: (id: number | null) => void
  openRequirement: (req: Requirement) => Promise<void>
  addModule: (input: CreateModuleInput) => Promise<void>
  updateModule: (id: number, input: UpdateModuleInput) => Promise<void>
  removeModule: (id: number) => Promise<void>
  moveModule: (id: number, newParentId: number | null) => Promise<void>
  addRequirement: (input: CreateRequirementInput) => Promise<void>
  updateRequirement: (id: number, input: UpdateRequirementInput) => Promise<void>
  removeRequirement: (id: number) => Promise<void>
  restoreRequirement: (id: number) => Promise<void>
  addHeading: (input: CreateHeadingInput) => Promise<void>
  renameHeading: (id: number, title: string) => Promise<void>
  moveHeading: (id: number, direction: 'up' | 'down') => Promise<void>
  removeHeading: (id: number) => Promise<void>
  toggleHeadingCollapsed: (id: number) => void
  setShowDeleted: (show: boolean) => Promise<void>
  setStatusFilter: (f: RequirementStatus | 'All') => void
  setPriorityFilter: (f: RequirementPriority | 'All') => void
  setTypeFilter: (f: RequirementType | 'All') => void
  toggleChecked: (id: number) => void
  setChecked: (ids: number[]) => void
  updateRequirements: (ids: number[], patch: UpdateRequirementInput) => Promise<void>
  removeRequirements: (ids: number[]) => Promise<void>
  loadCustomFields: (requirementId: number) => Promise<void>
  addCustomField: (requirementId: number) => Promise<void>
  updateCustomField: (id: number, patch: UpdateCustomFieldInput) => Promise<void>
  removeCustomField: (id: number) => Promise<void>
  loadInterfaces: () => Promise<void>
  loadConnectionCustomFields: (connectionId: number) => Promise<void>
  addConnectionCustomField: (connectionId: number) => Promise<void>
  updateConnectionCustomField: (id: number, patch: UpdateConnectionCustomFieldInput) => Promise<void>
  removeConnectionCustomField: (id: number) => Promise<void>
  loadAcItems: (requirementId: number) => Promise<void>
  addAcItem: (requirementId: number, text: string) => Promise<void>
  updateAcItem: (id: number, patch: UpdateAcceptanceCriterionInput, requirementId: number) => Promise<void>
  removeAcItem: (id: number, requirementId: number) => Promise<void>
  moveAcItem: (id: number, direction: 'up' | 'down', requirementId: number) => Promise<void>

  // actions — architecture
  loadArchitecture: () => Promise<void>
  loadArchitectures: () => Promise<void>
  setActiveArchitecture: (id: number) => Promise<void>
  addArchitecture: (name: string) => Promise<void>
  renameArchitecture: (id: number, name: string) => Promise<void>
  removeArchitecture: (id: number) => Promise<void>
  loadLayers: () => Promise<void>
  addLayer: (name: string) => Promise<void>
  renameLayer: (id: number, name: string) => Promise<void>
  cycleLayerState: (id: number) => Promise<void>
  removeLayer: (id: number) => Promise<void>
  toggleElementLayer: (elementId: number, layerId: number) => Promise<void>
  toggleConnectionLayer: (connectionId: number, layerId: number) => Promise<void>
  selectElement: (id: number | null) => void
  selectConnection: (id: number | null) => void
  setInterfaceArchFilter: (f: number | 'all') => void
  addElement: (input: CreateElementInput) => Promise<void>
  updateElement: (id: number, input: UpdateElementInput) => Promise<void>
  removeElement: (id: number) => Promise<void>
  addConnection: (input: CreateConnectionInput) => Promise<void>
  updateConnection: (id: number, input: UpdateConnectionInput) => Promise<void>
  removeConnection: (id: number) => Promise<void>
  addElementLink: (elementId: number, requirementId: number) => Promise<void>
  removeElementLink: (elementId: number, requirementId: number) => Promise<void>
  addConnectionLink: (connectionId: number, requirementId: number) => Promise<void>
  removeConnectionLink: (connectionId: number, requirementId: number) => Promise<void>
}

export const useStore = create<Store>((set, get) => ({
  project: null, activeTab: 'requirements',
  modules: [], selectedModuleId: null, requirements: [], selectedRequirementId: null,
  headings: [], collapsedHeadingIds: [],
  architectures: [], activeArchitectureId: null,
  elements: [], connections: [], elementTypes: [], connectionTypes: [],
  selectedElementId: null, selectedConnectionId: null, interfaceArchFilter: 'all', projectRequirements: [],
  customFields: [], connectionCustomFields: [], projectConnectionCustomFields: [],
  acItems: [], acSummary: {}, showDeleted: false, deletedRequirements: [],
  statusFilter: 'All', priorityFilter: 'All', typeFilter: 'All', checkedIds: [],
  traceLinks: [], reqLinks: [],
  layers: [], elementLayers: [], connectionLayers: [],
  undoStack: [], redoStack: [],

  loadProject: async () => {
    const project = await window.api.project.getCurrent()
    if (!project) return
    const modules = await window.api.modules.list(project.id)
    set({ project, modules, undoStack: [], redoStack: [], interfaceArchFilter: 'all' })
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  selectModule: async (id) => {
    set({ selectedModuleId: id, requirements: [], headings: [], collapsedHeadingIds: [], selectedRequirementId: null, showDeleted: false, deletedRequirements: [], customFields: [], acItems: [], acSummary: {}, statusFilter: 'All', priorityFilter: 'All', typeFilter: 'All', checkedIds: [] })
    if (id === null) return
    const [requirements, headings, moduleAcItems] = await Promise.all([
      window.api.requirements.list(id),
      window.api.headings.list(id),
      window.api.acceptanceCriteria.listByModule(id)
    ])
    set({ requirements, headings, acSummary: summarize(moduleAcItems) })
  },

  selectRequirement: (id) => set({ selectedRequirementId: id, customFields: [], acItems: [] }),

  openRequirement: async (req) => {
    set({ activeTab: 'requirements' })
    await get().selectModule(req.moduleId)
    set({ selectedRequirementId: req.id })
  },

  addModule: async (input) => {
    const mod = await window.api.modules.create(input)
    set((s) => ({ modules: [...s.modules, mod] }))
  },

  updateModule: async (id, input) => {
    const updated = await window.api.modules.update(id, input)
    set((s) => ({ modules: s.modules.map((m) => (m.id === id ? updated : m)) }))
  },

  removeModule: async (id) => {
    await window.api.modules.delete(id)
    const { project } = get()
    const modules = project ? await window.api.modules.list(project.id) : []
    set((s) => ({ modules, selectedModuleId: s.selectedModuleId === id ? null : s.selectedModuleId }))
  },

  moveModule: async (id, newParentId) => {
    await window.api.modules.move(id, newParentId)
    const { project } = get()
    if (!project) return
    set({ modules: await window.api.modules.list(project.id) })
  },

  addRequirement: async (input) => {
    const req = await window.api.requirements.create(input)
    set((s) => ({ requirements: [...s.requirements, req], selectedRequirementId: req.id }))
  },

  updateRequirement: async (id, input) => {
    const updated = await window.api.requirements.update(id, input)
    set((s) => ({ requirements: s.requirements.map((r) => (r.id === id ? updated : r)) }))
  },

  removeRequirement: async (id) => {
    await window.api.requirements.delete(id)
    set((s) => ({
      requirements: s.requirements.filter((r) => r.id !== id),
      selectedRequirementId: s.selectedRequirementId === id ? null : s.selectedRequirementId,
      checkedIds: s.checkedIds.filter((c) => c !== id)
    }))
  },

  restoreRequirement: async (id) => {
    await window.api.requirements.restore(id)
    const { selectedModuleId } = get()
    if (!selectedModuleId) return
    const [requirements, deletedRequirements] = await Promise.all([
      window.api.requirements.list(selectedModuleId),
      window.api.requirements.listDeleted(selectedModuleId)
    ])
    set({ requirements, deletedRequirements, selectedRequirementId: null, customFields: [] })
  },

  addHeading: async (input) => {
    const heading = await window.api.headings.create(input)
    set((s) => ({ headings: [...s.headings, heading] }))
  },

  renameHeading: async (id, title) => {
    const updated = await window.api.headings.update(id, { title })
    set((s) => ({ headings: s.headings.map((h) => (h.id === id ? updated : h)) }))
  },

  moveHeading: async (id, direction) => {
    await window.api.headings.move(id, direction)
    const { selectedModuleId } = get()
    if (!selectedModuleId) return
    set({ headings: await window.api.headings.list(selectedModuleId) })
  },

  removeHeading: async (id) => {
    await window.api.headings.delete(id)
    const { selectedModuleId } = get()
    if (!selectedModuleId) return
    // requirements re-fetched too: their heading_id was reassigned in the DB
    const [headings, requirements] = await Promise.all([
      window.api.headings.list(selectedModuleId),
      window.api.requirements.list(selectedModuleId)
    ])
    set((s) => ({ headings, requirements, collapsedHeadingIds: s.collapsedHeadingIds.filter((c) => c !== id) }))
  },

  toggleHeadingCollapsed: (id) => set((s) => ({
    collapsedHeadingIds: s.collapsedHeadingIds.includes(id)
      ? s.collapsedHeadingIds.filter((c) => c !== id)
      : [...s.collapsedHeadingIds, id]
  })),

  setShowDeleted: async (show) => {
    set({ showDeleted: show, selectedRequirementId: null, customFields: [], checkedIds: [] })
    if (show) {
      const { selectedModuleId } = get()
      if (!selectedModuleId) return
      const deletedRequirements = await window.api.requirements.listDeleted(selectedModuleId)
      set({ deletedRequirements })
    }
  },

  setStatusFilter: (f) => set({ statusFilter: f, checkedIds: [] }),
  setPriorityFilter: (f) => set({ priorityFilter: f, checkedIds: [] }),
  setTypeFilter: (f) => set({ typeFilter: f, checkedIds: [] }),

  toggleChecked: (id) => set((s) => ({
    checkedIds: s.checkedIds.includes(id)
      ? s.checkedIds.filter((c) => c !== id)
      : [...s.checkedIds, id]
  })),

  setChecked: (ids) => set({ checkedIds: ids }),

  updateRequirements: async (ids, patch) => {
    await Promise.all(ids.map((id) => window.api.requirements.update(id, patch)))
    const { selectedModuleId } = get()
    if (!selectedModuleId) return
    const requirements = await window.api.requirements.list(selectedModuleId)
    set({ requirements, checkedIds: [] })
  },

  removeRequirements: async (ids) => {
    await Promise.all(ids.map((id) => window.api.requirements.delete(id)))
    set((s) => ({
      requirements: s.requirements.filter((r) => !ids.includes(r.id)),
      checkedIds: [],
      selectedRequirementId:
        s.selectedRequirementId !== null && ids.includes(s.selectedRequirementId)
          ? null
          : s.selectedRequirementId
    }))
  },

  loadCustomFields: async (requirementId) => {
    const customFields = await window.api.customFields.list(requirementId)
    set({ customFields })
  },

  addCustomField: async (requirementId) => {
    const field = await window.api.customFields.create(requirementId)
    set((s) => ({ customFields: [...s.customFields, field] }))
  },

  updateCustomField: async (id, patch) => {
    const updated = await window.api.customFields.update(id, patch)
    set((s) => ({ customFields: s.customFields.map((f) => (f.id === id ? updated : f)) }))
  },

  removeCustomField: async (id) => {
    await window.api.customFields.delete(id)
    set((s) => ({ customFields: s.customFields.filter((f) => f.id !== id) }))
  },

  loadInterfaces: async () => {
    const { project } = get()
    if (!project) return
    const [elements, connections, elementTypes, connectionTypes, projectConnectionCustomFields, architectures] = await Promise.all([
      window.api.elements.list(project.id),
      window.api.connections.list(project.id),
      window.api.elementTypes.list(project.id),
      window.api.connectionTypes.list(project.id),
      window.api.connectionCustomFields.listByProject(project.id),
      window.api.architectures.list(project.id)
    ])
    set({ elements, connections, elementTypes, connectionTypes, projectConnectionCustomFields, architectures })
  },

  loadConnectionCustomFields: async (connectionId) => {
    const connectionCustomFields = await window.api.connectionCustomFields.list(connectionId)
    set({ connectionCustomFields })
  },

  addConnectionCustomField: async (connectionId) => {
    const field = await window.api.connectionCustomFields.create(connectionId)
    set((s) => ({
      connectionCustomFields: [...s.connectionCustomFields, field],
      projectConnectionCustomFields: [...s.projectConnectionCustomFields, field]
    }))
  },

  updateConnectionCustomField: async (id, patch) => {
    const updated = await window.api.connectionCustomFields.update(id, patch)
    set((s) => ({
      connectionCustomFields: s.connectionCustomFields.map((f) => (f.id === id ? updated : f)),
      projectConnectionCustomFields: s.projectConnectionCustomFields.map((f) => (f.id === id ? updated : f))
    }))
  },

  removeConnectionCustomField: async (id) => {
    await window.api.connectionCustomFields.delete(id)
    set((s) => ({
      connectionCustomFields: s.connectionCustomFields.filter((f) => f.id !== id),
      projectConnectionCustomFields: s.projectConnectionCustomFields.filter((f) => f.id !== id)
    }))
  },

  loadAcItems: async (requirementId) => {
    const acItems = await window.api.acceptanceCriteria.list(requirementId)
    set({ acItems })
  },

  addAcItem: async (requirementId, text) => {
    await window.api.acceptanceCriteria.create(requirementId, text)
    await refreshAc(requirementId)
  },

  updateAcItem: async (id, patch, requirementId) => {
    await window.api.acceptanceCriteria.update(id, patch)
    await refreshAc(requirementId)
  },

  removeAcItem: async (id, requirementId) => {
    await window.api.acceptanceCriteria.remove(id)
    await refreshAc(requirementId)
  },

  moveAcItem: async (id, direction, requirementId) => {
    await window.api.acceptanceCriteria.move(id, direction)
    await refreshAc(requirementId)
  },

  loadArchitecture: async () => {
    const { project, activeArchitectureId } = get()
    if (!project) return
    const [elements, connections, elementTypes, connectionTypes, projectRequirements] = await Promise.all([
      window.api.elements.list(project.id, activeArchitectureId),
      window.api.connections.list(project.id, activeArchitectureId),
      window.api.elementTypes.list(project.id),
      window.api.connectionTypes.list(project.id),
      window.api.requirements.listByProject(project.id)
    ])
    set({ elements, connections, elementTypes, connectionTypes, projectRequirements })
    await get().loadLayers()
  },

  loadArchitectures: async () => {
    const { project } = get()
    if (!project) return
    const architectures = await window.api.architectures.list(project.id)
    const persisted = Number(localStorage.getItem(`reqarch.activeArchitecture.${project.id}`))
    const active = architectures.some((a) => a.id === persisted) ? persisted : (architectures[0]?.id ?? null)
    set({ architectures, activeArchitectureId: active })
    await get().loadArchitecture()
  },

  setActiveArchitecture: async (id) => {
    const { project } = get()
    if (project) localStorage.setItem(`reqarch.activeArchitecture.${project.id}`, String(id))
    set({ activeArchitectureId: id, selectedElementId: null, selectedConnectionId: null, undoStack: [], redoStack: [] })
    await get().loadArchitecture()
  },

  addArchitecture: async (name) => {
    const { project } = get()
    if (!project) return
    const created = await window.api.architectures.create(project.id, name)
    set((s) => ({ architectures: [...s.architectures, created] }))
    await get().setActiveArchitecture(created.id)
  },

  renameArchitecture: async (id, name) => {
    const updated = await window.api.architectures.rename(id, name)
    set((s) => ({ architectures: s.architectures.map((a) => (a.id === id ? updated : a)) }))
  },

  removeArchitecture: async (id) => {
    const { project, activeArchitectureId } = get()
    if (!project) return
    await window.api.architectures.delete(id)
    const architectures = await window.api.architectures.list(project.id)
    set({ architectures })
    if (activeArchitectureId === id) {
      await get().setActiveArchitecture(architectures[0].id)
    }
  },

  loadLayers: async () => {
    const { activeArchitectureId } = get()
    if (activeArchitectureId == null) { set({ layers: [], elementLayers: [], connectionLayers: [] }); return }
    const [layers, assignments] = await Promise.all([
      window.api.layers.list(activeArchitectureId),
      window.api.layers.assignments(activeArchitectureId)
    ])
    set({ layers, elementLayers: assignments.elementLayers, connectionLayers: assignments.connectionLayers })
  },

  addLayer: async (name) => {
    const { activeArchitectureId } = get()
    if (activeArchitectureId == null) return
    await window.api.layers.create(activeArchitectureId, name)
    await get().loadLayers()
  },

  renameLayer: async (id, name) => {
    await window.api.layers.rename(id, name)
    await get().loadLayers()
  },

  cycleLayerState: async (id) => {
    const layer = get().layers.find((l) => l.id === id)
    if (!layer) return
    const next: LayerState = layer.state === 'visible' ? 'faded' : layer.state === 'faded' ? 'hidden' : 'visible'
    await window.api.layers.setState(id, next)
    await get().loadLayers()
  },

  removeLayer: async (id) => {
    await window.api.layers.delete(id)
    await get().loadLayers()
  },

  toggleElementLayer: async (elementId, layerId) => {
    const member = get().elementLayers.some((l) => l.elementId === elementId && l.layerId === layerId)
    if (member) await window.api.layers.unassignElement(elementId, layerId)
    else await window.api.layers.assignElement(elementId, layerId)
    await get().loadLayers()
  },

  toggleConnectionLayer: async (connectionId, layerId) => {
    const member = get().connectionLayers.some((l) => l.connectionId === connectionId && l.layerId === layerId)
    if (member) await window.api.layers.unassignConnection(connectionId, layerId)
    else await window.api.layers.assignConnection(connectionId, layerId)
    await get().loadLayers()
  },

  loadTraceability: async () => {
    const { project } = get()
    if (!project) return
    const [projectRequirements, elements, traceLinks, reqLinks] = await Promise.all([
      window.api.requirements.listByProject(project.id),
      window.api.elements.list(project.id),
      window.api.elementLinks.listByProject(project.id),
      window.api.reqLinks.listByProject(project.id)
    ])
    set({ projectRequirements, elements, traceLinks, reqLinks })
  },

  toggleTraceLink: async (elementId, requirementId) => {
    const { traceLinks, project } = get()
    const exists = traceLinks.some((l) => l.elementId === elementId && l.requirementId === requirementId)
    if (exists) await window.api.elementLinks.remove(elementId, requirementId)
    else await window.api.elementLinks.add(elementId, requirementId)
    if (!project) return
    set({ traceLinks: await window.api.elementLinks.listByProject(project.id) })
  },

  addReqLink: async (parentReqId, childReqId) => {
    await window.api.reqLinks.add(parentReqId, childReqId)
    const { project } = get()
    if (!project) return
    set({ reqLinks: await window.api.reqLinks.listByProject(project.id) })
  },

  removeReqLink: async (parentReqId, childReqId) => {
    await window.api.reqLinks.remove(parentReqId, childReqId)
    const { project } = get()
    if (!project) return
    set({ reqLinks: await window.api.reqLinks.listByProject(project.id) })
  },

  undo: async () => {
    const { undoStack, redoStack } = get()
    if (undoStack.length === 0) return
    const cmd = undoStack[undoStack.length - 1]
    try {
      await cmd.undo()
    } finally {
      set({ undoStack: undoStack.slice(0, -1), redoStack: [...redoStack, cmd] })
      // ponytail: full re-fetch keeps the store in sync with the DB after undo; cheap at diagram scale
      await get().loadArchitecture()
    }
  },

  redo: async () => {
    const { undoStack, redoStack } = get()
    if (redoStack.length === 0) return
    const cmd = redoStack[redoStack.length - 1]
    try {
      await cmd.redo()
    } finally {
      set({ redoStack: redoStack.slice(0, -1), undoStack: [...undoStack, cmd] })
      // ponytail: full re-fetch keeps the store in sync with the DB after undo; cheap at diagram scale
      await get().loadArchitecture()
    }
  },

  clearHistory: () => set({ undoStack: [], redoStack: [] }),

  selectElement: (id) => set({ selectedElementId: id, selectedConnectionId: null }),

  selectConnection: (id) => set({ selectedConnectionId: id, selectedElementId: null }),

  setInterfaceArchFilter: (f) => set({ interfaceArchFilter: f }),

  addElement: async (input) => {
    const el = await window.api.elements.create({ ...input, architectureId: get().activeArchitectureId })
    set((s) => ({ elements: [...s.elements, el], selectedElementId: el.id, selectedConnectionId: null }))
    pushUndo({
      undo: async () => { await window.api.elements.delete(el.id) },
      redo: async () => { await window.api.elements.restore(el.id) }
    })
  },

  updateElement: async (id, input) => {
    const before = get().elements.find((e) => e.id === id)
    const editKeys = ELEMENT_PROP_KEYS.filter((k) => k in input)
    const updated = await window.api.elements.update(id, input)
    set((s) => ({ elements: s.elements.map((e) => (e.id === id ? updated : e)) }))
    const changed = editKeys.some((k) => (before as Record<string, unknown> | undefined)?.[k] !== (input as Record<string, unknown>)[k])
    if (before && changed) {
      const prev: UpdateElementInput = {}
      for (const k of editKeys) (prev as Record<string, unknown>)[k] = (before as unknown as Record<string, unknown>)[k]
      pushUndo({
        undo: async () => { await window.api.elements.update(id, prev) },
        redo: async () => { await window.api.elements.update(id, input) }
      })
    }
  },

  removeElement: async (id) => {
    const state = get()
    const childSnaps = state.elements
      .filter((e) => e.parentId === id)
      .map((e) => ({ id: e.id, parentId: e.parentId, posX: e.posX, posY: e.posY }))
    const connIds = state.connections
      .filter((c) => c.sourceId === id || c.targetId === id)
      .map((c) => c.id)

    await window.api.elements.delete(id)
    const { project } = get()
    if (!project) return
    const [elements, connections] = await Promise.all([
      window.api.elements.list(project.id, get().activeArchitectureId),
      window.api.connections.list(project.id, get().activeArchitectureId)
    ])
    set((s) => ({
      elements,
      connections,
      selectedElementId: s.selectedElementId === id ? null : s.selectedElementId
    }))

    pushUndo({
      undo: async () => {
        await window.api.elements.restore(id)
        for (const cid of connIds) await window.api.connections.restore(cid)
        for (const c of childSnaps) {
          await window.api.elements.update(c.id, { parentId: c.parentId, posX: c.posX, posY: c.posY })
        }
      },
      redo: async () => { await window.api.elements.delete(id) }
    })
  },

  addConnection: async (input) => {
    const conn = await window.api.connections.create({ ...input, architectureId: get().activeArchitectureId })
    set((s) => ({ connections: [...s.connections, conn], selectedConnectionId: conn.id, selectedElementId: null }))
    pushUndo({
      undo: async () => { await window.api.connections.delete(conn.id) },
      redo: async () => { await window.api.connections.restore(conn.id) }
    })
  },

  updateConnection: async (id, input) => {
    const before = get().connections.find((c) => c.id === id)
    const editKeys = CONNECTION_PROP_KEYS.filter((k) => k in input)
    const updated = await window.api.connections.update(id, input)
    set((s) => ({ connections: s.connections.map((c) => (c.id === id ? updated : c)) }))
    const changed = editKeys.some((k) => (before as Record<string, unknown> | undefined)?.[k] !== (input as Record<string, unknown>)[k])
    if (before && changed) {
      const prev: UpdateConnectionInput = {}
      for (const k of editKeys) (prev as Record<string, unknown>)[k] = (before as unknown as Record<string, unknown>)[k]
      pushUndo({
        undo: async () => { await window.api.connections.update(id, prev) },
        redo: async () => { await window.api.connections.update(id, input) }
      })
    }
  },

  removeConnection: async (id) => {
    await window.api.connections.delete(id)
    set((s) => ({
      connections: s.connections.filter((c) => c.id !== id),
      selectedConnectionId: s.selectedConnectionId === id ? null : s.selectedConnectionId
    }))
    pushUndo({
      undo: async () => { await window.api.connections.restore(id) },
      redo: async () => { await window.api.connections.delete(id) }
    })
  },

  addElementLink: async (elementId, requirementId) => {
    await window.api.elementLinks.add(elementId, requirementId)
  },

  removeElementLink: async (elementId, requirementId) => {
    await window.api.elementLinks.remove(elementId, requirementId)
  },

  addConnectionLink: async (connectionId, requirementId) => {
    await window.api.connectionLinks.add(connectionId, requirementId)
  },

  removeConnectionLink: async (connectionId, requirementId) => {
    await window.api.connectionLinks.remove(connectionId, requirementId)
  }
}))

function pushUndo(cmd: UndoCommand): void {
  useStore.setState((s) => ({ undoStack: [...s.undoStack, cmd], redoStack: [] }))
}

async function refreshAc(requirementId: number): Promise<void> {
  // Only this requirement's items changed, so derive its summary entry from the same
  // list we already fetch and merge it in — no whole-module re-query, and no chance of a
  // late resolve overwriting another module's summary (we only touch this req's key).
  const acItems = await window.api.acceptanceCriteria.list(requirementId)
  const entry = summarize(acItems)[requirementId]
  useStore.setState((s) => {
    const acSummary = { ...s.acSummary }
    if (entry) acSummary[requirementId] = entry
    else delete acSummary[requirementId]
    // A late-resolving refetch must not clobber acItems after the user switched requirements.
    return s.selectedRequirementId === requirementId ? { acItems, acSummary } : { acSummary }
  })
}
