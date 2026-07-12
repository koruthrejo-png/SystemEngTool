import type { ArchitectureConnection, ArchitectureElement, ConnectionType, ConnectionCustomField, Architecture } from '../../../../types'

export interface InterfaceRow {
  connectionId: number
  interfaceId: string
  fromId: string
  toId: string
  name: string
  typeName: string
  description: string
  architectureName: string
  customValues: Record<string, string>
}

export const BUILTIN_OPTIONAL_COLUMNS = ['name', 'type', 'description', 'architecture'] as const

const COLUMN_VIS_KEY = 'reqarch.interfaceRegister.columns.v1'

export function buildInterfaceRows(
  connections: ArchitectureConnection[],
  elements: ArchitectureElement[],
  connectionTypes: ConnectionType[],
  customFields: ConnectionCustomField[],
  architectures: Architecture[]
): InterfaceRow[] {
  const elemById = new Map(elements.map((e) => [e.id, e]))
  const typeById = new Map(connectionTypes.map((t) => [t.id, t]))
  const archById = new Map(architectures.map((a) => [a.id, a]))
  const fieldsByConn = new Map<number, ConnectionCustomField[]>()
  for (const f of customFields) {
    const arr = fieldsByConn.get(f.connectionId) ?? []
    arr.push(f)
    fieldsByConn.set(f.connectionId, arr)
  }
  return connections.map((c) => {
    const customValues: Record<string, string> = {}
    for (const f of fieldsByConn.get(c.id) ?? []) {
      if (f.key.trim() !== '') customValues[f.key] = f.value
    }
    return {
      connectionId: c.id,
      interfaceId: c.connId,
      fromId: elemById.get(c.sourceId)?.blockId ?? '',
      toId: elemById.get(c.targetId)?.blockId ?? '',
      name: c.name ?? '',
      typeName: (c.connectionTypeId != null ? typeById.get(c.connectionTypeId)?.name : '') ?? '',
      description: c.description ?? '',
      architectureName: (c.architectureId != null ? archById.get(c.architectureId)?.name : '') ?? '',
      customValues
    }
  })
}

export function customFieldKeys(customFields: ConnectionCustomField[]): string[] {
  const seen: string[] = []
  for (const f of customFields) {
    if (f.key.trim() !== '' && !seen.includes(f.key)) seen.push(f.key)
  }
  return seen
}

export function loadColumnVisibility(customKeys: string[]): Record<string, boolean> {
  let saved: Record<string, boolean> = {}
  try {
    saved = JSON.parse(localStorage.getItem(COLUMN_VIS_KEY) ?? '{}')
  } catch { saved = {} }
  const vis: Record<string, boolean> = {}
  for (const col of [...BUILTIN_OPTIONAL_COLUMNS, ...customKeys]) {
    vis[col] = saved[col] ?? true
  }
  return vis
}

export function saveColumnVisibility(vis: Record<string, boolean>): void {
  localStorage.setItem(COLUMN_VIS_KEY, JSON.stringify(vis))
}
