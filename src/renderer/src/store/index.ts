import { create } from 'zustand'
import type { Project, Module, Requirement, CreateModuleInput, UpdateModuleInput, CreateRequirementInput, UpdateRequirementInput } from '../../../../types'

interface Store {
  project: Project | null
  modules: Module[]
  selectedModuleId: number | null
  requirements: Requirement[]
  selectedRequirementId: number | null
  loadProject: () => Promise<void>
  selectModule: (id: number | null) => Promise<void>
  selectRequirement: (id: number | null) => void
  addModule: (input: CreateModuleInput) => Promise<void>
  updateModule: (id: number, input: UpdateModuleInput) => Promise<void>
  removeModule: (id: number) => Promise<void>
  addRequirement: (input: CreateRequirementInput) => Promise<void>
  updateRequirement: (id: number, input: UpdateRequirementInput) => Promise<void>
  removeRequirement: (id: number) => Promise<void>
}

export const useStore = create<Store>((set, get) => ({
  project: null, modules: [], selectedModuleId: null, requirements: [], selectedRequirementId: null,

  loadProject: async () => {
    const project = await window.api.project.getCurrent()
    if (!project) return
    const modules = await window.api.modules.list(project.id)
    set({ project, modules })
  },

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
  }
}))
