export interface Project {
  id: number
  name: string
  createdAt: string
  updatedAt: string
}

export interface Module {
  id: number
  projectId: number
  parentId: number | null
  name: string
  idPrefix: string
  idPadding: number
  nextCounter: number
  position: number
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Requirement {
  id: number
  moduleId: number
  reqId: string
  text: string
  acceptanceCriteria: string | null
  source: string | null
  rationale: string | null
  position: number
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateModuleInput {
  projectId: number
  parentId: number | null
  name: string
  idPrefix: string
  idPadding: number
}

export interface UpdateModuleInput {
  name: string
}

export interface CreateRequirementInput {
  moduleId: number
  text: string
  acceptanceCriteria?: string
  source?: string
  rationale?: string
}

export interface UpdateRequirementInput {
  text?: string
  acceptanceCriteria?: string
  source?: string
  rationale?: string
}
