export interface Project {
  id: number
  name: string
  elemIdPrefix: string
  elemIdPadding: number
  elemNextCounter: number
  connIdPrefix: string
  connIdPadding: number
  connNextCounter: number
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

export interface ElementType {
  id: number
  projectId: number
  name: string
  color: string | null
  isBuiltIn: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ConnectionType {
  id: number
  projectId: number
  name: string
  color: string | null
  isBuiltIn: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ArchitectureElement {
  id: number
  projectId: number
  parentId: number | null
  blockId: string
  name: string
  elementTypeId: number | null
  description: string | null
  color: string | null
  posX: number
  posY: number
  width: number
  height: number
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ArchitectureConnection {
  id: number
  projectId: number
  connId: string
  sourceId: number
  targetId: number
  name: string | null
  connectionTypeId: number | null
  description: string | null
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateElementTypeInput {
  projectId: number
  name: string
  color?: string | null
}

export interface CreateConnectionTypeInput {
  projectId: number
  name: string
  color?: string | null
}

export interface CreateElementInput {
  projectId: number
  parentId?: number | null
  name?: string
  elementTypeId?: number | null
  posX?: number
  posY?: number
}

export interface UpdateElementInput {
  parentId?: number | null
  blockId?: string
  name?: string
  elementTypeId?: number | null
  description?: string | null
  color?: string | null
  posX?: number
  posY?: number
  width?: number
  height?: number
}

export interface CreateConnectionInput {
  projectId: number
  sourceId: number
  targetId: number
  name?: string | null
  connectionTypeId?: number | null
}

export interface UpdateConnectionInput {
  connId?: string
  name?: string | null
  connectionTypeId?: number | null
  description?: string | null
}
