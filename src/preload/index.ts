import { contextBridge, ipcRenderer } from 'electron'
import type {
  Project, Module, Requirement,
  CreateModuleInput, UpdateModuleInput,
  CreateRequirementInput, UpdateRequirementInput
} from '../types'

contextBridge.exposeInMainWorld('api', {
  project: {
    create: (name: string): Promise<Project | null> => ipcRenderer.invoke('project:create', name),
    open: (): Promise<Project | null> => ipcRenderer.invoke('project:open'),
    getCurrent: (): Promise<Project | null> => ipcRenderer.invoke('project:getCurrent')
  },
  modules: {
    list: (projectId: number): Promise<Module[]> => ipcRenderer.invoke('modules:list', projectId),
    create: (input: CreateModuleInput): Promise<Module> => ipcRenderer.invoke('modules:create', input),
    update: (id: number, input: UpdateModuleInput): Promise<Module> => ipcRenderer.invoke('modules:update', id, input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('modules:delete', id),
    restore: (id: number): Promise<void> => ipcRenderer.invoke('modules:restore', id)
  },
  requirements: {
    list: (moduleId: number): Promise<Requirement[]> => ipcRenderer.invoke('requirements:list', moduleId),
    create: (input: CreateRequirementInput): Promise<Requirement> => ipcRenderer.invoke('requirements:create', input),
    update: (id: number, input: UpdateRequirementInput): Promise<Requirement> => ipcRenderer.invoke('requirements:update', id, input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('requirements:delete', id),
    restore: (id: number): Promise<void> => ipcRenderer.invoke('requirements:restore', id)
  }
})
