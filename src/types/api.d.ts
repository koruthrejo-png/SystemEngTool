import type {
  Project, Module, Requirement,
  CreateModuleInput, UpdateModuleInput,
  CreateRequirementInput, UpdateRequirementInput
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
        create(input: CreateRequirementInput): Promise<Requirement>
        update(id: number, input: UpdateRequirementInput): Promise<Requirement>
        delete(id: number): Promise<void>
        restore(id: number): Promise<void>
      }
    }
  }
}
