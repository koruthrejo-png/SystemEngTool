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

export const MODULE_KINDS = ['folder', 'module'] as const
export type ModuleKind = (typeof MODULE_KINDS)[number]

export interface Module {
  id: number
  projectId: number
  parentId: number | null
  kind: ModuleKind
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

export const AC_STATUSES = ['Unverified', 'Passed', 'Failed'] as const
export type AcStatus = (typeof AC_STATUSES)[number]

export interface AcceptanceCriterion {
  id: number
  requirementId: number
  text: string
  status: AcStatus
  position: number
  createdAt: string
  updatedAt: string
}

export interface UpdateAcceptanceCriterionInput {
  text?: string
  status?: AcStatus
}

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
  kind: ModuleKind
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

export interface ConnectionCustomField {
  id: number
  connectionId: number
  key: string
  value: string
  position: number
  createdAt: string
  updatedAt: string
}
export interface UpdateConnectionCustomFieldInput {
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
  architectureId: number | null
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

export const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const
export type LineStyle = (typeof LINE_STYLES)[number]

export const EDGE_MARKERS = ['none', 'arrow', 'arrowclosed'] as const
export type EdgeMarker = (typeof EDGE_MARKERS)[number]

export interface ArchitectureConnection {
  id: number
  projectId: number
  architectureId: number | null
  connId: string
  sourceId: number
  targetId: number
  sourceHandle: string | null
  targetHandle: string | null
  name: string | null
  connectionTypeId: number | null
  lineStyle: LineStyle | null
  markerStart: EdgeMarker | null
  markerEnd: EdgeMarker | null
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
  architectureId?: number | null
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
  architectureId?: number | null
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
  lineStyle?: LineStyle
  markerStart?: EdgeMarker
  markerEnd?: EdgeMarker
}

export interface ElementRequirementLink {
  elementId: number
  requirementId: number
}

export const LAYER_STATES = ['visible', 'faded', 'hidden'] as const
export type LayerState = (typeof LAYER_STATES)[number]

export interface Layer {
  id: number
  architectureId: number
  name: string
  state: LayerState
  position: number
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ElementLayerLink { elementId: number; layerId: number }
export interface ConnectionLayerLink { connectionId: number; layerId: number }
export interface LayerAssignments {
  elementLayers: ElementLayerLink[]
  connectionLayers: ConnectionLayerLink[]
}

// Derivation link: child requirement derives from parent requirement.
export interface RequirementLink {
  parentReqId: number
  childReqId: number
}

export interface Architecture {
  id: number
  projectId: number
  name: string
  position: number
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}
export interface CreateArchitectureInput {
  projectId: number
  name: string
}

export interface SearchResults {
  requirements: Requirement[]
  modules: Module[]
  headings: ReqHeading[]
}
