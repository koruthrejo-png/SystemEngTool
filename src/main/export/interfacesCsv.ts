import type {
  ArchitectureConnection, ArchitectureElement, ConnectionType, ConnectionCustomField
} from '../../types'
import { toCsv } from './csv'

export interface InterfaceExportRow {
  interfaceId: string
  from: string
  to: string
  name: string
  type: string
  description: string
  custom: Record<string, string>
}

export function buildInterfaceExportRows(
  connections: ArchitectureConnection[],
  elements: ArchitectureElement[],
  connectionTypes: ConnectionType[],
  customFields: ConnectionCustomField[]
): { rows: InterfaceExportRow[]; customKeys: string[] } {
  const blockById = new Map(elements.map((el) => [el.id, el.blockId]))
  const typeById = new Map(connectionTypes.map((t) => [t.id, t.name]))

  const fieldsByConn = new Map<number, ConnectionCustomField[]>()
  const customKeys: string[] = []
  for (const f of customFields) {
    if (f.key.trim() === '') continue
    if (!customKeys.includes(f.key)) customKeys.push(f.key)
    const arr = fieldsByConn.get(f.connectionId) ?? []
    arr.push(f)
    fieldsByConn.set(f.connectionId, arr)
  }

  const rows = connections.map((c) => {
    const custom: Record<string, string> = {}
    for (const f of fieldsByConn.get(c.id) ?? []) custom[f.key] = f.value
    return {
      interfaceId: c.connId,
      from: blockById.get(c.sourceId) ?? '',
      to: blockById.get(c.targetId) ?? '',
      name: c.name ?? '',
      type: (c.connectionTypeId != null ? typeById.get(c.connectionTypeId) : '') ?? '',
      description: c.description ?? '',
      custom
    }
  })
  return { rows, customKeys }
}

const HEADER = ['interface_id', 'from', 'to', 'name', 'type', 'description'] as const

export function interfaceRowsToCsv(rows: InterfaceExportRow[], customKeys: string[]): string {
  const header = [...HEADER, ...customKeys.map((k) => `cf:${k}`)]
  const matrix = [header]
  for (const r of rows) {
    matrix.push([
      r.interfaceId, r.from, r.to, r.name, r.type, r.description,
      ...customKeys.map((k) => r.custom[k] ?? '')
    ])
  }
  return toCsv(matrix)
}
