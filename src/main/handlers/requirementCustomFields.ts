import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import type { RequirementCustomField, UpdateCustomFieldInput } from '../../types'

function now(): string { return new Date().toISOString() }

function rowToField(row: any): RequirementCustomField {
  return {
    id: row.id,
    requirementId: row.requirement_id,
    key: row.key,
    value: row.value,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function registerCustomFieldHandlers(): void {
  ipcMain.handle('customFields:list', (_e, requirementId: number) => {
    return (getDatabase()
      .prepare('SELECT * FROM requirement_custom_fields WHERE requirement_id = ? ORDER BY position, id')
      .all(requirementId) as any[]).map(rowToField)
  })

  ipcMain.handle('customFields:create', (_e, requirementId: number) => {
    const db = getDatabase()
    const ts = now()
    const row = db.prepare('SELECT COALESCE(MAX(position), -1) as mp FROM requirement_custom_fields WHERE requirement_id = ?').get(requirementId) as any
    const nextPos = (row.mp as number) + 1
    const result = db
      .prepare('INSERT INTO requirement_custom_fields (requirement_id, key, value, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(requirementId, '', '', nextPos, ts, ts)
    return rowToField(db.prepare('SELECT * FROM requirement_custom_fields WHERE id = ?').get(result.lastInsertRowid))
  })

  ipcMain.handle('customFields:update', (_e, id: number, patch: UpdateCustomFieldInput) => {
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM requirement_custom_fields WHERE id = ?').get(id) as any
    if (!existing) throw new Error(`Custom field ${id} not found`)
    db.prepare('UPDATE requirement_custom_fields SET key = ?, value = ?, updated_at = ? WHERE id = ?')
      .run(patch.key ?? existing.key, patch.value ?? existing.value, now(), id)
    return rowToField(db.prepare('SELECT * FROM requirement_custom_fields WHERE id = ?').get(id))
  })

  ipcMain.handle('customFields:delete', (_e, id: number) => {
    getDatabase().prepare('DELETE FROM requirement_custom_fields WHERE id = ?').run(id)
  })
}
