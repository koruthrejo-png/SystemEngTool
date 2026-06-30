import { contextBridge, ipcRenderer } from 'electron'
import type {
  Project, Module, Requirement,
  CreateModuleInput, UpdateModuleInput,
  CreateRequirementInput, UpdateRequirementInput,
  ElementType, ConnectionType,
  ArchitectureElement, ArchitectureConnection,
  CreateElementTypeInput, CreateConnectionTypeInput,
  CreateElementInput, UpdateElementInput,
  CreateConnectionInput, UpdateConnectionInput
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
    listByProject: (projectId: number): Promise<Requirement[]> => ipcRenderer.invoke('requirements:listByProject', projectId),
    create: (input: CreateRequirementInput): Promise<Requirement> => ipcRenderer.invoke('requirements:create', input),
    update: (id: number, input: UpdateRequirementInput): Promise<Requirement> => ipcRenderer.invoke('requirements:update', id, input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('requirements:delete', id),
    restore: (id: number): Promise<void> => ipcRenderer.invoke('requirements:restore', id)
  },
  elementTypes: {
    list: (projectId: number): Promise<ElementType[]> => ipcRenderer.invoke('elementTypes:list', projectId),
    create: (input: CreateElementTypeInput): Promise<ElementType> => ipcRenderer.invoke('elementTypes:create', input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('elementTypes:delete', id)
  },
  connectionTypes: {
    list: (projectId: number): Promise<ConnectionType[]> => ipcRenderer.invoke('connectionTypes:list', projectId),
    create: (input: CreateConnectionTypeInput): Promise<ConnectionType> => ipcRenderer.invoke('connectionTypes:create', input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('connectionTypes:delete', id)
  },
  elements: {
    list: (projectId: number): Promise<ArchitectureElement[]> => ipcRenderer.invoke('elements:list', projectId),
    create: (input: CreateElementInput): Promise<ArchitectureElement> => ipcRenderer.invoke('elements:create', input),
    update: (id: number, input: UpdateElementInput): Promise<ArchitectureElement> => ipcRenderer.invoke('elements:update', id, input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('elements:delete', id)
  },
  connections: {
    list: (projectId: number): Promise<ArchitectureConnection[]> => ipcRenderer.invoke('connections:list', projectId),
    create: (input: CreateConnectionInput): Promise<ArchitectureConnection> => ipcRenderer.invoke('connections:create', input),
    update: (id: number, input: UpdateConnectionInput): Promise<ArchitectureConnection> => ipcRenderer.invoke('connections:update', id, input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('connections:delete', id)
  },
  elementLinks: {
    list: (elementId: number): Promise<Requirement[]> => ipcRenderer.invoke('elementLinks:list', elementId),
    add: (elementId: number, requirementId: number): Promise<void> => ipcRenderer.invoke('elementLinks:add', elementId, requirementId),
    remove: (elementId: number, requirementId: number): Promise<void> => ipcRenderer.invoke('elementLinks:remove', elementId, requirementId)
  },
  connectionLinks: {
    list: (connectionId: number): Promise<Requirement[]> => ipcRenderer.invoke('connectionLinks:list', connectionId),
    add: (connectionId: number, requirementId: number): Promise<void> => ipcRenderer.invoke('connectionLinks:add', connectionId, requirementId),
    remove: (connectionId: number, requirementId: number): Promise<void> => ipcRenderer.invoke('connectionLinks:remove', connectionId, requirementId)
  }
})
