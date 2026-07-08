import { create } from 'zustand'
import type {
  Project, Module, Requirement,
  CreateModuleInput, UpdateModuleInput,
  CreateRequirementInput, UpdateRequirementInput,
  ElementType, ConnectionType,
  ArchitectureElement, ArchitectureConnection,
  CreateElementInput, UpdateElementInput,
  CreateConnectionInput, UpdateConnectionInput,
  RequirementCustomField, UpdateCustomFieldInput,
  RequirementStatus, RequirementPriority, RequirementType,
  ReqHeading, CreateHeadingInput,
  ElementRequirementLink, RequirementLink,
  AcceptanceCriterion, UpdateAcceptanceCriterionInput
} from '../../../types'
import { summarize, type AcSummaryEntry } from './acSummary'

interface Store {
  // shared
  project: Project | null
  activeTab: 'requirements' | 'architecture' | 'traceability' | 'dashboard'

  // requirements tab
  modules: Module[]
  selectedModuleId: number | null
  requirements: Requirement[]
  selectedRequirementId: number | null
  headings: ReqHeading[]
  collapsedHeadingIds: number[]

  // architecture tab
  elements: ArchitectureElement[]
  connections: ArchitectureConnection[]
  elementTypes: ElementType[]
  connectionTypes: ConnectionType[]
  selectedElementId: number | null
  selectedConnectionId: number | null
  projectRequirements: Requirement[]
  customFields: RequirementCustomField[]
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

  // actions — shared
  loadProject: () => Promise<void>
  setActiveTab: (tab: 'requirements' | 'architecture' | 'traceability' | 'dashboard') => void
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
  loadAcItems: (requirementId: number) => Promise<void>
  addAcItem: (requirementId: number, text: string) => Promise<void>
  updateAcItem: (id: number, patch: UpdateAcceptanceCriterionInput, requirementId: number) => Promise<void>
  removeAcItem: (id: number, requirementId: number) => Promise<void>
  moveAcItem: (id: number, direction: 'up' | 'down', requirementId: number) => Promise<void>

  // actions — architecture
  loadArchitecture: () => Promise<void>
  selectElement: (id: number | null) => void
  selectConnection: (id: number | null) => void
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
  elements: [], connections: [], elementTypes: [], connectionTypes: [],
  selectedElementId: null, selectedConnectionId: null, projectRequirements: [],
  customFields: [], acItems: [], acSummary: {}, showDeleted: false, deletedRequirements: [],
  statusFilter: 'All', priorityFilter: 'All', typeFilter: 'All', checkedIds: [],
  traceLinks: [], reqLinks: [],

  loadProject: async () => {
    const project = await window.api.project.getCurrent()
    if (!project) return
    const modules = await window.api.modules.list(project.id)
    set({ project, modules })
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
    const { project } = get()
    if (!project) return
    const [elements, connections, elementTypes, connectionTypes, projectRequirements] = await Promise.all([
      window.api.elements.list(project.id),
      window.api.connections.list(project.id),
      window.api.elementTypes.list(project.id),
      window.api.connectionTypes.list(project.id),
      window.api.requirements.listByProject(project.id)
    ])
    set({ elements, connections, elementTypes, connectionTypes, projectRequirements })
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

  selectElement: (id) => set({ selectedElementId: id, selectedConnectionId: null }),

  selectConnection: (id) => set({ selectedConnectionId: id, selectedElementId: null }),

  addElement: async (input) => {
    const el = await window.api.elements.create(input)
    set((s) => ({ elements: [...s.elements, el], selectedElementId: el.id, selectedConnectionId: null }))
  },

  updateElement: async (id, input) => {
    const updated = await window.api.elements.update(id, input)
    set((s) => ({ elements: s.elements.map((e) => (e.id === id ? updated : e)) }))
  },

  removeElement: async (id) => {
    await window.api.elements.delete(id)
    const { project } = get()
    if (!project) return
    const [elements, connections] = await Promise.all([
      window.api.elements.list(project.id),
      window.api.connections.list(project.id)
    ])
    set((s) => ({
      elements,
      connections,
      selectedElementId: s.selectedElementId === id ? null : s.selectedElementId
    }))
  },

  addConnection: async (input) => {
    const conn = await window.api.connections.create(input)
    set((s) => ({ connections: [...s.connections, conn], selectedConnectionId: conn.id, selectedElementId: null }))
  },

  updateConnection: async (id, input) => {
    const updated = await window.api.connections.update(id, input)
    set((s) => ({ connections: s.connections.map((c) => (c.id === id ? updated : c)) }))
  },

  removeConnection: async (id) => {
    await window.api.connections.delete(id)
    set((s) => ({
      connections: s.connections.filter((c) => c.id !== id),
      selectedConnectionId: s.selectedConnectionId === id ? null : s.selectedConnectionId
    }))
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
