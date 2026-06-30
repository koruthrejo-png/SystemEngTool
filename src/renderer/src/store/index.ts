import { create } from 'zustand'
import type {
  Project, Module, Requirement,
  CreateModuleInput, UpdateModuleInput,
  CreateRequirementInput, UpdateRequirementInput,
  ElementType, ConnectionType,
  ArchitectureElement, ArchitectureConnection,
  CreateElementInput, UpdateElementInput,
  CreateConnectionInput, UpdateConnectionInput
} from '../../../../types'

interface Store {
  // shared
  project: Project | null
  activeTab: 'requirements' | 'architecture'

  // requirements tab
  modules: Module[]
  selectedModuleId: number | null
  requirements: Requirement[]
  selectedRequirementId: number | null

  // architecture tab
  elements: ArchitectureElement[]
  connections: ArchitectureConnection[]
  elementTypes: ElementType[]
  connectionTypes: ConnectionType[]
  selectedElementId: number | null
  selectedConnectionId: number | null
  projectRequirements: Requirement[]

  // actions — shared
  loadProject: () => Promise<void>
  setActiveTab: (tab: 'requirements' | 'architecture') => void

  // actions — requirements
  selectModule: (id: number | null) => Promise<void>
  selectRequirement: (id: number | null) => void
  addModule: (input: CreateModuleInput) => Promise<void>
  updateModule: (id: number, input: UpdateModuleInput) => Promise<void>
  removeModule: (id: number) => Promise<void>
  addRequirement: (input: CreateRequirementInput) => Promise<void>
  updateRequirement: (id: number, input: UpdateRequirementInput) => Promise<void>
  removeRequirement: (id: number) => Promise<void>

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
  elements: [], connections: [], elementTypes: [], connectionTypes: [],
  selectedElementId: null, selectedConnectionId: null, projectRequirements: [],

  loadProject: async () => {
    const project = await window.api.project.getCurrent()
    if (!project) return
    const modules = await window.api.modules.list(project.id)
    set({ project, modules })
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  selectModule: async (id) => {
    set({ selectedModuleId: id, requirements: [], selectedRequirementId: null })
    if (id === null) return
    const requirements = await window.api.requirements.list(id)
    set({ requirements })
  },

  selectRequirement: (id) => set({ selectedRequirementId: id }),

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
    set((s) => ({
      modules: s.modules.filter((m) => m.id !== id),
      selectedModuleId: s.selectedModuleId === id ? null : s.selectedModuleId
    }))
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
      selectedRequirementId: s.selectedRequirementId === id ? null : s.selectedRequirementId
    }))
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
    set((s) => ({
      elements: s.elements.filter((e) => e.id !== id),
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
