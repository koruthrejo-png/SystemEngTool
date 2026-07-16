import { contextBridge, ipcRenderer } from 'electron'
import type {
  Project, Module, Requirement,
  ReqHeading, CreateHeadingInput, UpdateHeadingInput,
  CreateModuleInput, UpdateModuleInput,
  CreateRequirementInput, UpdateRequirementInput,
  RequirementCustomField, UpdateCustomFieldInput,
  AcceptanceCriterion, UpdateAcceptanceCriterionInput,
  ElementType, ConnectionType,
  Architecture, ArchitectureElement, ArchitectureConnection,
  CreateElementTypeInput, UpdateElementTypeInput, CreateConnectionTypeInput,
  CreateElementInput, UpdateElementInput,
  CreateConnectionInput, UpdateConnectionInput,
  ElementRequirementLink, RequirementLink, SearchResults,
  ConnectionCustomField, UpdateConnectionCustomFieldInput,
  Layer, LayerState, LayerAssignments
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
    restore: (id: number): Promise<void> => ipcRenderer.invoke('modules:restore', id),
    move: (id: number, newParentId: number | null): Promise<Module> => ipcRenderer.invoke('modules:move', id, newParentId)
  },
  requirements: {
    list: (moduleId: number): Promise<Requirement[]> => ipcRenderer.invoke('requirements:list', moduleId),
    listDeleted: (moduleId: number): Promise<Requirement[]> => ipcRenderer.invoke('requirements:listDeleted', moduleId),
    listByProject: (projectId: number): Promise<Requirement[]> => ipcRenderer.invoke('requirements:listByProject', projectId),
    create: (input: CreateRequirementInput): Promise<Requirement> => ipcRenderer.invoke('requirements:create', input),
    update: (id: number, input: UpdateRequirementInput): Promise<Requirement> => ipcRenderer.invoke('requirements:update', id, input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('requirements:delete', id),
    restore: (id: number): Promise<void> => ipcRenderer.invoke('requirements:restore', id)
  },
  headings: {
    list: (moduleId: number): Promise<ReqHeading[]> => ipcRenderer.invoke('headings:list', moduleId),
    create: (input: CreateHeadingInput): Promise<ReqHeading> => ipcRenderer.invoke('headings:create', input),
    update: (id: number, input: UpdateHeadingInput): Promise<ReqHeading> => ipcRenderer.invoke('headings:update', id, input),
    move: (id: number, direction: 'up' | 'down'): Promise<void> => ipcRenderer.invoke('headings:move', id, direction),
    reparent: (id: number, newParentId: number | null): Promise<ReqHeading> => ipcRenderer.invoke('headings:reparent', id, newParentId),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('headings:delete', id)
  },
  customFields: {
    list: (requirementId: number): Promise<RequirementCustomField[]> => ipcRenderer.invoke('customFields:list', requirementId),
    create: (requirementId: number): Promise<RequirementCustomField> => ipcRenderer.invoke('customFields:create', requirementId),
    update: (id: number, patch: UpdateCustomFieldInput): Promise<RequirementCustomField> => ipcRenderer.invoke('customFields:update', id, patch),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('customFields:delete', id)
  },
  acceptanceCriteria: {
    list: (requirementId: number): Promise<AcceptanceCriterion[]> => ipcRenderer.invoke('acceptanceCriteria:list', requirementId),
    listByModule: (moduleId: number): Promise<AcceptanceCriterion[]> => ipcRenderer.invoke('acceptanceCriteria:listByModule', moduleId),
    create: (requirementId: number, text: string): Promise<AcceptanceCriterion> => ipcRenderer.invoke('acceptanceCriteria:create', requirementId, text),
    update: (id: number, patch: UpdateAcceptanceCriterionInput): Promise<AcceptanceCriterion> => ipcRenderer.invoke('acceptanceCriteria:update', id, patch),
    remove: (id: number): Promise<void> => ipcRenderer.invoke('acceptanceCriteria:delete', id),
    move: (id: number, direction: 'up' | 'down'): Promise<void> => ipcRenderer.invoke('acceptanceCriteria:move', id, direction)
  },
  elementTypes: {
    list: (projectId: number): Promise<ElementType[]> => ipcRenderer.invoke('elementTypes:list', projectId),
    create: (input: CreateElementTypeInput): Promise<ElementType> => ipcRenderer.invoke('elementTypes:create', input),
    update: (id: number, input: UpdateElementTypeInput): Promise<ElementType> =>
      ipcRenderer.invoke('elementTypes:update', id, input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('elementTypes:delete', id)
  },
  connectionTypes: {
    list: (projectId: number): Promise<ConnectionType[]> => ipcRenderer.invoke('connectionTypes:list', projectId),
    create: (input: CreateConnectionTypeInput): Promise<ConnectionType> => ipcRenderer.invoke('connectionTypes:create', input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('connectionTypes:delete', id)
  },
  architectures: {
    list: (projectId: number): Promise<Architecture[]> => ipcRenderer.invoke('architectures:list', projectId),
    create: (projectId: number, name: string): Promise<Architecture> => ipcRenderer.invoke('architectures:create', projectId, name),
    rename: (id: number, name: string): Promise<Architecture> => ipcRenderer.invoke('architectures:rename', id, name),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('architectures:delete', id)
  },
  layers: {
    list: (architectureId: number): Promise<Layer[]> => ipcRenderer.invoke('layers:list', architectureId),
    create: (architectureId: number, name: string): Promise<Layer> => ipcRenderer.invoke('layers:create', architectureId, name),
    rename: (id: number, name: string): Promise<Layer> => ipcRenderer.invoke('layers:rename', id, name),
    setState: (id: number, state: LayerState): Promise<Layer> => ipcRenderer.invoke('layers:setState', id, state),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('layers:delete', id),
    assignments: (architectureId: number): Promise<LayerAssignments> => ipcRenderer.invoke('layers:assignments', architectureId),
    assignElement: (elementId: number, layerId: number): Promise<void> => ipcRenderer.invoke('layers:assignElement', elementId, layerId),
    unassignElement: (elementId: number, layerId: number): Promise<void> => ipcRenderer.invoke('layers:unassignElement', elementId, layerId),
    assignConnection: (connectionId: number, layerId: number): Promise<void> => ipcRenderer.invoke('layers:assignConnection', connectionId, layerId),
    unassignConnection: (connectionId: number, layerId: number): Promise<void> => ipcRenderer.invoke('layers:unassignConnection', connectionId, layerId)
  },
  elements: {
    list: (projectId: number, architectureId?: number | null): Promise<ArchitectureElement[]> => ipcRenderer.invoke('elements:list', projectId, architectureId),
    create: (input: CreateElementInput): Promise<ArchitectureElement> => ipcRenderer.invoke('elements:create', input),
    update: (id: number, input: UpdateElementInput): Promise<ArchitectureElement> => ipcRenderer.invoke('elements:update', id, input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('elements:delete', id),
    restore: (id: number): Promise<ArchitectureElement> => ipcRenderer.invoke('elements:restore', id)
  },
  connections: {
    list: (projectId: number, architectureId?: number | null): Promise<ArchitectureConnection[]> => ipcRenderer.invoke('connections:list', projectId, architectureId),
    create: (input: CreateConnectionInput): Promise<ArchitectureConnection> => ipcRenderer.invoke('connections:create', input),
    update: (id: number, input: UpdateConnectionInput): Promise<ArchitectureConnection> => ipcRenderer.invoke('connections:update', id, input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('connections:delete', id),
    restore: (id: number): Promise<ArchitectureConnection> => ipcRenderer.invoke('connections:restore', id)
  },
  elementLinks: {
    list: (elementId: number): Promise<Requirement[]> => ipcRenderer.invoke('elementLinks:list', elementId),
    add: (elementId: number, requirementId: number): Promise<void> => ipcRenderer.invoke('elementLinks:add', elementId, requirementId),
    remove: (elementId: number, requirementId: number): Promise<void> => ipcRenderer.invoke('elementLinks:remove', elementId, requirementId),
    listByProject: (projectId: number): Promise<ElementRequirementLink[]> => ipcRenderer.invoke('elementLinks:listByProject', projectId)
  },
  connectionLinks: {
    list: (connectionId: number): Promise<Requirement[]> => ipcRenderer.invoke('connectionLinks:list', connectionId),
    add: (connectionId: number, requirementId: number): Promise<void> => ipcRenderer.invoke('connectionLinks:add', connectionId, requirementId),
    remove: (connectionId: number, requirementId: number): Promise<void> => ipcRenderer.invoke('connectionLinks:remove', connectionId, requirementId)
  },
  connectionCustomFields: {
    list: (connectionId: number): Promise<ConnectionCustomField[]> => ipcRenderer.invoke('connectionCustomFields:list', connectionId),
    listByProject: (projectId: number): Promise<ConnectionCustomField[]> => ipcRenderer.invoke('connectionCustomFields:listByProject', projectId),
    create: (connectionId: number): Promise<ConnectionCustomField> => ipcRenderer.invoke('connectionCustomFields:create', connectionId),
    update: (id: number, patch: UpdateConnectionCustomFieldInput): Promise<ConnectionCustomField> => ipcRenderer.invoke('connectionCustomFields:update', id, patch),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('connectionCustomFields:delete', id)
  },
  reqLinks: {
    add: (parentReqId: number, childReqId: number): Promise<void> => ipcRenderer.invoke('reqLinks:add', parentReqId, childReqId),
    remove: (parentReqId: number, childReqId: number): Promise<void> => ipcRenderer.invoke('reqLinks:remove', parentReqId, childReqId),
    listByProject: (projectId: number): Promise<RequirementLink[]> => ipcRenderer.invoke('reqLinks:listByProject', projectId)
  },
  search: {
    query: (projectId: number, term: string): Promise<SearchResults> => ipcRenderer.invoke('search:query', projectId, term)
  }
})
