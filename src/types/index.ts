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

export const REQUIREMENT_STATUSES = ['Draft', 'Review', 'Approved', 'Rejected'] as const
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number]

export const REQUIREMENT_PRIORITIES = ['High', 'Medium', 'Low'] as const
export type RequirementPriority = (typeof REQUIREMENT_PRIORITIES)[number]

export const REQUIREMENT_TYPES = ['Functional', 'Non-Functional', 'Interface', 'Performance', 'Constraint'] as const
export type RequirementType = (typeof REQUIREMENT_TYPES)[number]

export interface Requirement {
  id: number
  moduleId: number
  reqId: string
  text: string
  acceptanceCriteria: string | null
  source: string | null
  rationale: string | null
  status: RequirementStatus
  priority: RequirementPriority
  reqType: RequirementType
  headingId: number | null
  position: number
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ReqHeading {
  id: number
  moduleId: number
  parentId: number | null
  title: string
  position: number
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateHeadingInput {
  moduleId: number
  parentId?: number | null
  title?: string
}

export interface UpdateHeadingInput {
  title?: string
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
  headingId?: number | null
}

export interface UpdateRequirementInput {
  text?: string
  acceptanceCriteria?: string
  source?: string
  rationale?: string
  status?: RequirementStatus
  priority?: RequirementPriority
  reqType?: RequirementType
  headingId?: number | null
}

export interface RequirementCustomField {
  id: number
  requirementId: number
  key: string
  value: string
  position: number
  createdAt: string
  updatedAt: string
}

export interface UpdateCustomFieldInput {
  key?: string
  value?: string
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
  sourceHandle: string | null
  targetHandle: string | null
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
  sourceHandle?: string | null
  targetHandle?: string | null
  name?: string | null
  connectionTypeId?: number | null
}

export interface UpdateConnectionInput {
  connId?: string
  name?: string | null
  connectionTypeId?: number | null
  description?: string | null
}

export interface ElementRequirementLink {
  elementId: number
  requirementId: number
}
