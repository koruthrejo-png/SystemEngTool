import { describe, it, expect } from 'vitest'
import { buildInterfaceExportRows, interfaceRowsToCsv } from './interfacesCsv'

const el = (id: number, blockId: string, name = '') => ({ id, blockId, name } as any)
const conn = (o: Partial<any>) => ({
  id: 1, connId: 'IF-001', sourceId: 10, targetId: 20, connectionTypeId: null,
  architectureId: null, name: '', description: '', deletedAt: null, ...o
} as any)

describe('buildInterfaceExportRows', () => {
  it('maps a connection to interface_id + from/to blockIds + name/type/description', () => {
    const rows = buildInterfaceExportRows(
      [conn({ connId: 'IF-001', sourceId: 10, targetId: 20, name: 'Power bus', description: '28V', connectionTypeId: 5 })],
      [el(10, 'SYS-001'), el(20, 'SYS-002')],
      [{ id: 5, name: 'Electrical' } as any],
      []
    )
    expect(rows.rows[0]).toMatchObject({
      interfaceId: 'IF-001', from: 'SYS-001', to: 'SYS-002',
      name: 'Power bus', type: 'Electrical', description: '28V'
    })
  })

  it('adds a cf:<Key> column per distinct custom-field key (stable order); missing → empty', () => {
    const rows = buildInterfaceExportRows(
      [conn({ id: 1 }), conn({ id: 2, connId: 'IF-002' })],
      [el(10, 'SYS-001'), el(20, 'SYS-002')],
      [],
      [
        { id: 1, connectionId: 1, key: 'Protocol', value: 'CAN' } as any,
        { id: 2, connectionId: 1, key: 'Rate', value: '1Mbps' } as any,
        { id: 3, connectionId: 2, key: 'Protocol', value: 'SPI' } as any,
        { id: 4, connectionId: 2, key: '', value: 'ignored-blank-key' } as any
      ]
    )
    expect(rows.customKeys).toEqual(['Protocol', 'Rate'])
    expect(rows.rows[0].custom).toEqual({ Protocol: 'CAN', Rate: '1Mbps' })
    expect(rows.rows[1].custom).toEqual({ Protocol: 'SPI' })
  })
})

describe('interfaceRowsToCsv', () => {
  it('writes the header in spec order and one row per interface, RFC-4180 escaped', () => {
    const { rows, customKeys } = buildInterfaceExportRows(
      [conn({ connId: 'IF-001', name: 'A, B', description: 'has "quote"' })],
      [el(10, 'SYS-001'), el(20, 'SYS-002')],
      [],
      [{ id: 1, connectionId: 1, key: 'Protocol', value: 'CAN' } as any]
    )
    const csv = interfaceRowsToCsv(rows, customKeys)
    const lines = csv.split('\n')
    expect(lines[0]).toBe('interface_id,from,to,name,type,description,cf:Protocol')
    // comma + quote fields are quoted/escaped
    expect(lines[1]).toBe('IF-001,SYS-001,SYS-002,"A, B",,"has ""quote""",CAN')
  })
})
