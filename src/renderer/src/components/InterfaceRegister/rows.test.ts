import { describe, it, expect, beforeEach } from 'vitest'
import { buildInterfaceRows, customFieldKeys, loadColumnVisibility, saveColumnVisibility } from './rows'
import type { ArchitectureConnection, ArchitectureElement, ConnectionType, ConnectionCustomField, Architecture } from '../../../../types'

const el = (id: number, blockId: string): ArchitectureElement => ({
  id, projectId: 1, architectureId: null, parentId: null, blockId, name: `El ${blockId}`, elementTypeId: null,
  description: null, color: null, posX: 0, posY: 0, width: 140, height: 60,
  deletedAt: null, createdAt: '', updatedAt: ''
})
const conn = (id: number, connId: string, s: number, t: number, extra: Partial<ArchitectureConnection> = {}): ArchitectureConnection => ({
  id, projectId: 1, architectureId: null, connId, sourceId: s, targetId: t, sourceHandle: null, targetHandle: null,
  name: null, connectionTypeId: null, description: null, deletedAt: null, createdAt: '', updatedAt: '', ...extra
})
const ccf = (id: number, connectionId: number, key: string, value: string, position = 0): ConnectionCustomField => ({
  id, connectionId, key, value, position, createdAt: '', updatedAt: ''
})

describe('buildInterfaceRows', () => {
  it('maps source/target element blockIds and type name and custom values', () => {
    const elements = [el(10, 'SYS-001'), el(20, 'SYS-002')]
    const types: ConnectionType[] = [{ id: 5, projectId: 1, name: 'Data', color: '#0af', createdAt: '', updatedAt: '' } as ConnectionType]
    const connections = [conn(1, 'ICN-0001', 10, 20, { name: 'CAN', connectionTypeId: 5, description: 'bus' })]
    const fields = [ccf(1, 1, 'Protocol', 'CAN 2.0'), ccf(2, 1, '', 'ignored-empty-key')]
    const rows = buildInterfaceRows(connections, elements, types, fields, [])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      connectionId: 1, interfaceId: 'ICN-0001', fromId: 'SYS-001', toId: 'SYS-002',
      name: 'CAN', typeName: 'Data', description: 'bus'
    })
    expect(rows[0].customValues['Protocol']).toBe('CAN 2.0')
  })

  it('falls back to empty strings for missing elements/type/null fields', () => {
    const rows = buildInterfaceRows([conn(1, 'ICN-0002', 99, 98)], [], [], [], [])
    expect(rows[0]).toMatchObject({ fromId: '', toId: '', name: '', typeName: '', description: '' })
  })

  it('maps fromName and toName from the source/target elements', () => {
    const elements = [el(10, 'SYS-001'), el(20, 'SYS-002')]
    const rows = buildInterfaceRows([conn(1, 'ICN-0001', 10, 20)], elements, [], [], [])
    expect(rows[0].fromName).toBe('El SYS-001')
    expect(rows[0].toName).toBe('El SYS-002')
  })

  it('leaves fromName/toName empty when the element is missing', () => {
    const rows = buildInterfaceRows([conn(1, 'ICN-0002', 99, 98)], [], [], [], [])
    expect(rows[0].fromName).toBe('')
    expect(rows[0].toName).toBe('')
  })

  it('maps architectureName from the architectures list', () => {
    const elements = [] as any[]
    const architectures: Architecture[] = [{ id: 7, projectId: 1, name: 'Comms', position: 0, deletedAt: null, createdAt: '', updatedAt: '' }]
    const connections = [{ id: 1, projectId: 1, architectureId: 7, connId: 'ICN-0001', sourceId: 0, targetId: 0, sourceHandle: null, targetHandle: null, name: null, connectionTypeId: null, description: null, deletedAt: null, createdAt: '', updatedAt: '' }] as any[]
    const rows = buildInterfaceRows(connections, elements, [], [], architectures)
    expect(rows[0].architectureName).toBe('Comms')
  })
})

describe('customFieldKeys', () => {
  it('returns distinct non-empty keys in first-seen order', () => {
    const keys = customFieldKeys([ccf(1, 1, 'B', 'x'), ccf(2, 2, 'A', 'y'), ccf(3, 3, 'B', 'z'), ccf(4, 4, '', 'w')])
    expect(keys).toEqual(['B', 'A'])
  })
})

describe('column visibility persistence', () => {
  beforeEach(() => localStorage.clear())
  it('defaults unknown columns to visible', () => {
    const vis = loadColumnVisibility(['Protocol'])
    expect(vis).toEqual({ name: true, type: true, description: true, architecture: true, Protocol: true })
  })
  it('round-trips saved visibility', () => {
    saveColumnVisibility({ name: false, type: true, description: true, architecture: true, Protocol: false })
    const vis = loadColumnVisibility(['Protocol'])
    expect(vis.name).toBe(false)
    expect(vis.Protocol).toBe(false)
    expect(vis.type).toBe(true)
  })
})
