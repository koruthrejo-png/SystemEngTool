import type {
  Project, Module, Requirement,
  ReqHeading, CreateHeadingInput, UpdateHeadingInput,
  CreateModuleInput, UpdateModuleInput,
  CreateRequirementInput, UpdateRequirementInput,
  RequirementCustomField, UpdateCustomFieldInput,
  AcceptanceCriterion, UpdateAcceptanceCriterionInput,
  ElementType, ConnectionType,
  Architecture, ArchitectureElement, ArchitectureConnection,
  CreateElementTypeInput, CreateConnectionTypeInput,
  CreateElementInput, UpdateElementInput,
  CreateConnectionInput, UpdateConnectionInput,
  ElementRequirementLink, RequirementLink, SearchResults,
  ConnectionCustomField, UpdateConnectionCustomFieldInput,
  Layer, LayerState, LayerAssignments
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
        move(id: number, newParentId: number | null): Promise<Module>
      }
      requirements: {
        list(moduleId: number): Promise<Requirement[]>
        listDeleted(moduleId: number): Promise<Requirement[]>
        listByProject(projectId: number): Promise<Requirement[]>
        create(input: CreateRequirementInput): Promise<Requirement>
        update(id: number, input: UpdateRequirementInput): Promise<Requirement>
        delete(id: number): Promise<void>
        restore(id: number): Promise<void>
      }
      headings: {
        list(moduleId: number): Promise<ReqHeading[]>
        create(input: CreateHeadingInput): Promise<ReqHeading>
        update(id: number, input: UpdateHeadingInput): Promise<ReqHeading>
        move(id: number, direction: 'up' | 'down'): Promise<void>
        delete(id: number): Promise<void>
      }
      customFields: {
        list(requirementId: number): Promise<RequirementCustomField[]>
        create(requirementId: number): Promise<RequirementCustomField>
        update(id: number, patch: UpdateCustomFieldInput): Promise<RequirementCustomField>
        delete(id: number): Promise<void>
      }
      acceptanceCriteria: {
        list(requirementId: number): Promise<AcceptanceCriterion[]>
        listByModule(moduleId: number): Promise<AcceptanceCriterion[]>
        create(requirementId: number, text: string): Promise<AcceptanceCriterion>
        update(id: number, patch: UpdateAcceptanceCriterionInput): Promise<AcceptanceCriterion>
        remove(id: number): Promise<void>
        move(id: number, direction: 'up' | 'down'): Promise<void>
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
      architectures: {
        list(projectId: number): Promise<Architecture[]>
        create(projectId: number, name: string): Promise<Architecture>
        rename(id: number, name: string): Promise<Architecture>
        delete(id: number): Promise<void>
      }
      layers: {
        list(architectureId: number): Promise<Layer[]>
        create(architectureId: number, name: string): Promise<Layer>
        rename(id: number, name: string): Promise<Layer>
        setState(id: number, state: LayerState): Promise<Layer>
        delete(id: number): Promise<void>
        assignments(architectureId: number): Promise<LayerAssignments>
        assignElement(elementId: number, layerId: number): Promise<void>
        unassignElement(elementId: number, layerId: number): Promise<void>
        assignConnection(connectionId: number, layerId: number): Promise<void>
        unassignConnection(connectionId: number, layerId: number): Promise<void>
      }
      elements: {
        list(projectId: number, architectureId?: number | null): Promise<ArchitectureElement[]>
        create(input: CreateElementInput): Promise<ArchitectureElement>
        update(id: number, input: UpdateElementInput): Promise<ArchitectureElement>
        delete(id: number): Promise<void>
        restore(id: number): Promise<ArchitectureElement>
      }
      connections: {
        list(projectId: number, architectureId?: number | null): Promise<ArchitectureConnection[]>
        create(input: CreateConnectionInput): Promise<ArchitectureConnection>
        update(id: number, input: UpdateConnectionInput): Promise<ArchitectureConnection>
        delete(id: number): Promise<void>
        restore(id: number): Promise<ArchitectureConnection>
      }
      elementLinks: {
        list(elementId: number): Promise<Requirement[]>
        add(elementId: number, requirementId: number): Promise<void>
        remove(elementId: number, requirementId: number): Promise<void>
        listByProject(projectId: number): Promise<ElementRequirementLink[]>
      }
      connectionLinks: {
        list(connectionId: number): Promise<Requirement[]>
        add(connectionId: number, requirementId: number): Promise<void>
        remove(connectionId: number, requirementId: number): Promise<void>
      }
      connectionCustomFields: {
        list: (connectionId: number) => Promise<ConnectionCustomField[]>
        listByProject: (projectId: number) => Promise<ConnectionCustomField[]>
        create: (connectionId: number) => Promise<ConnectionCustomField>
        update: (id: number, patch: UpdateConnectionCustomFieldInput) => Promise<ConnectionCustomField>
        delete: (id: number) => Promise<void>
      }
      reqLinks: {
        add(parentReqId: number, childReqId: number): Promise<void>
        remove(parentReqId: number, childReqId: number): Promise<void>
        listByProject(projectId: number): Promise<RequirementLink[]>
      }
      search: {
        query(projectId: number, term: string): Promise<SearchResults>
      }
    }
  }
}
