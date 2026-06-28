import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import type { Module, CreateModuleInput, UpdateModuleInput } from '../../types'

function now(): string { return new Date().toISOString() }

function rowToModule(row: any): Module {
  return {
    id: row.id, projectId: row.project_id, parentId: row.parent_id ?? null,
    name: row.name, idPrefix: row.id_prefix, idPadding: row.id_padding,
    nextCounter: row.next_counter, position: row.position,
    deletedAt: row.deleted_at ?? null, createdAt: row.created_at, updatedAt: row.updated_at
  }
}

export function listModules(projectId: number): Module[] {
  return (getDatabase()
    .prepare('SELECT * FROM modules WHERE project_id = ? AND deleted_at IS NULL ORDER BY position, id')
    .all(projectId) as any[]).map(rowToModule)
}

export function createModule(input: CreateModuleInput): Module {
  const db = getDatabase()
  const ts = now()
  const result = db.prepare(`
    INSERT INTO modules (project_id, parent_id, name, id_prefix, id_padding, next_counter, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)
  `).run(input.projectId, input.parentId ?? null, input.name, input.idPrefix, input.idPadding, ts, ts)
  return rowToModule(db.prepare('SELECT * FROM modules WHERE id = ?').get(result.lastInsertRowid))
}

export function updateModule(id: number, input: UpdateModuleInput): Module {
  const db = getDatabase()
  db.prepare('UPDATE modules SET name = ?, updated_at = ? WHERE id = ?').run(input.name, now(), id)
  return rowToModule(db.prepare('SELECT * FROM modules WHERE id = ?').get(id))
}

export function deleteModule(id: number): void {
  const ts = now()
  getDatabase().prepare('UPDATE modules SET deleted_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id)
}

export function restoreModule(id: number): void {
  getDatabase().prepare('UPDATE modules SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(now(), id)
}

export function registerModuleHandlers(): void {
  ipcMain.handle('modules:list', (_e, projectId: number) => listModules(projectId))
  ipcMain.handle('modules:create', (_e, input: CreateModuleInput) => createModule(input))
  ipcMain.handle('modules:update', (_e, id: number, input: UpdateModuleInput) => updateModule(id, input))
  ipcMain.handle('modules:delete', (_e, id: number) => deleteModule(id))
  ipcMain.handle('modules:restore', (_e, id: number) => restoreModule(id))
}
