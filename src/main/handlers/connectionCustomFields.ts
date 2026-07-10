import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import type { ConnectionCustomField, UpdateConnectionCustomFieldInput } from '../../types'

function now(): string { return new Date().toISOString() }

function rowToField(row: any): ConnectionCustomField {
  return {
    id: row.id,
    connectionId: row.connection_id,
    key: row.key,
    value: row.value,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function registerConnectionCustomFieldHandlers(): void {
  ipcMain.handle('connectionCustomFields:list', (_e, connectionId: number) => {
    return (getDatabase()
      .prepare('SELECT * FROM connection_custom_fields WHERE connection_id = ? ORDER BY position, id')
      .all(connectionId) as any[]).map(rowToField)
  })

  ipcMain.handle('connectionCustomFields:listByProject', (_e, projectId: number) => {
    return (getDatabase()
      .prepare(`
        SELECT ccf.* FROM connection_custom_fields ccf
        JOIN architecture_connections ac ON ac.id = ccf.connection_id
        WHERE ac.project_id = ? AND ac.deleted_at IS NULL
        ORDER BY ccf.connection_id, ccf.position, ccf.id
      `)
      .all(projectId) as any[]).map(rowToField)
  })

  ipcMain.handle('connectionCustomFields:create', (_e, connectionId: number) => {
    const db = getDatabase()
    const ts = now()
    const row = db.prepare('SELECT COALESCE(MAX(position), -1) as mp FROM connection_custom_fields WHERE connection_id = ?').get(connectionId) as any
    const nextPos = (row.mp as number) + 1
    const result = db
      .prepare('INSERT INTO connection_custom_fields (connection_id, key, value, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(connectionId, '', '', nextPos, ts, ts)
    return rowToField(db.prepare('SELECT * FROM connection_custom_fields WHERE id = ?').get(result.lastInsertRowid))
  })

  ipcMain.handle('connectionCustomFields:update', (_e, id: number, patch: UpdateConnectionCustomFieldInput) => {
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM connection_custom_fields WHERE id = ?').get(id) as any
    if (!existing) throw new Error(`Connection custom field ${id} not found`)
    db.prepare('UPDATE connection_custom_fields SET key = ?, value = ?, updated_at = ? WHERE id = ?')
      .run(patch.key ?? existing.key, patch.value ?? existing.value, now(), id)
    return rowToField(db.prepare('SELECT * FROM connection_custom_fields WHERE id = ?').get(id))
  })

  ipcMain.handle('connectionCustomFields:delete', (_e, id: number) => {
    getDatabase().prepare('DELETE FROM connection_custom_fields WHERE id = ?').run(id)
  })
}
