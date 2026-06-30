import type {
  Project, Module, Requirement,
  CreateModuleInput, UpdateModuleInput,
  CreateRequirementInput, UpdateRequirementInput,
  ElementType, ConnectionType,
  ArchitectureElement, ArchitectureConnection,
  CreateElementTypeInput, CreateConnectionTypeInput,
  CreateElementInput, UpdateElementInput,
  CreateConnectionInput, UpdateConnectionInput
} from './index'

declare global {
  interface Window {
    api: {
      project: {
        create(name: string): Promise<Project | null>
        open(): Promise<Project | null>
        getCurrent(): Promise<Project | null>
      }
      modules: {
        list(projectId: number): Promise<Module[]>
        create(input: CreateModuleInput): Promise<Module>
        update(id: number, input: UpdateModuleInput): Promise<Module>
        delete(id: number): Promise<void>
        restore(id: number): Promise<void>
      }
      requirements: {
        list(moduleId: number): Promise<Requirement[]>
        listByProject(projectId: number): Promise<Requirement[]>
        create(input: CreateRequirementInput): Promise<Requirement>
        update(id: number, input: UpdateRequirementInput): Promise<Requirement>
        delete(id: number): Promise<void>
        restore(id: number): Promise<void>
      }
      elementTypes: {
        list(projectId: number): Promise<ElementType[]>
        create(input: CreateElementTypeInput): Promise<ElementType>
        delete(id: number): Promise<void>
      }
      connectionTypes: {
        list(projectId: number): Promise<ConnectionType[]>
        create(input: CreateConnectionTypeInput): Promise<ConnectionType>
        delete(id: number): Promise<void>
      }
      elements: {
        list(projectId: number): Promise<ArchitectureElement[]>
        create(input: CreateElementInput): Promise<ArchitectureElement>
        update(id: number, input: UpdateElementInput): Promise<ArchitectureElement>
        delete(id: number): Promise<void>
      }
      connections: {
        list(projectId: number): Promise<ArchitectureConnection[]>
        create(input: CreateConnectionInput): Promise<ArchitectureConnection>
        update(id: number, input: UpdateConnectionInput): Promise<ArchitectureConnection>
        delete(id: number): Promise<void>
      }
      elementLinks: {
        list(elementId: number): Promise<Requirement[]>
        add(elementId: number, requirementId: number): Promise<void>
        remove(elementId: number, requirementId: number): Promise<void>
      }
      connectionLinks: {
        list(connectionId: number): Promise<Requirement[]>
        add(connectionId: number, requirementId: number): Promise<void>
        remove(connectionId: number, requirementId: number): Promise<void>
      }
    }
  }
}
