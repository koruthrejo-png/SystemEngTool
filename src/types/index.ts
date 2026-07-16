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
  lineStyle: LineStyle | null
  fillColor: string | null
  posX: number
  posY: number
  width: number
  height: number
  // size this container had before its first child grew it; null when it has
  // never been nested into, or when a manual resize took over (see nodes.ts)
  preNestWidth: number | null
  preNestHeight: number | null
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const
export type LineStyle = (typeof LINE_STYLES)[number]

// Canonical border hexes — single source shared by the renderer swatch pickers
// (ArchitectureCanvas/swatches.ts) and the main-side seed + backfill migration.
export const NAVY = '#1a365d'
export const TYPE_BORDER_COLORS = {
  Navy: NAVY,
  Slate: '#475569',
  Teal: '#0f766e',
  Green: '#3f6212',
  Amber: '#a16207',
  Red: '#9f1239',
  Purple: '#6b21a8',
  Grey: '#3f3f46'
} as const

// Colour each built-in element type seeds/backfills to. Names must match
// BUILT_IN_ELEMENT_TYPES in handlers/elementTypes.ts.
export const BUILT_IN_TYPE_COLORS: Record<string, string> = {
  System: TYPE_BORDER_COLORS.Navy,
  Subsystem: TYPE_BORDER_COLORS.Teal,
  Component: TYPE_BORDER_COLORS.Slate,
  Function: TYPE_BORDER_COLORS.Green,
  External: TYPE_BORDER_COLORS.Amber
}

export interface UpdateElementTypeInput {
  name?: string
  color?: string | null
}

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
  // Style/size/description are optional and default to a plain block (see createElement).
  // `+ Object` passes none of them; duplicate (Cmd+D) passes all of them, which is what
  // lets a duplicate be created in ONE call — and therefore one undo entry.
  description?: string | null
  color?: string | null
  fillColor?: string | null
  lineStyle?: LineStyle | null
  width?: number
  height?: number
}

export interface UpdateElementInput {
  parentId?: number | null
  blockId?: string
  name?: string
  elementTypeId?: number | null
  description?: string | null
  color?: string | null
  lineStyle?: LineStyle | null
  fillColor?: string | null
  posX?: number
  posY?: number
  width?: number
  height?: number
  preNestWidth?: number | null
  preNestHeight?: number | null
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
  lineStyle?: LineStyle | null
  markerStart?: EdgeMarker | null
  markerEnd?: EdgeMarker | null
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
