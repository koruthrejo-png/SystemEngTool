import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { getDatabase } from '../db/connection'
import type { Module, ModuleKind, CreateModuleInput, UpdateModuleInput } from '../../types'

function now(): string { return new Date().toISOString() }

// Invariant: only a folder may contain folders or modules. Guarded here, not by the schema.
function assertFolderParent(db: Database.Database, parentId: number | null): void {
  if (parentId == null) return
  const parent = db.prepare('SELECT kind FROM modules WHERE id = ?').get(parentId) as any
  if (!parent) throw new Error(`Module ${parentId} not found`)
  if ((parent.kind ?? 'module') !== 'folder') throw new Error('Only folders can contain folders or modules')
}

export function rowToModule(row: any): Module {
  return {
    id: row.id, projectId: row.project_id, parentId: row.parent_id ?? null,
    kind: (row.kind ?? 'module') as ModuleKind,
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
  assertFolderParent(db, input.parentId ?? null)
  const result = db.prepare(`
    INSERT INTO modules (project_id, parent_id, kind, name, id_prefix, id_padding, next_counter, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
  `).run(input.projectId, input.parentId ?? null, input.kind, input.name, input.idPrefix, input.idPadding, ts, ts)
  return rowToModule(db.prepare('SELECT * FROM modules WHERE id = ?').get(result.lastInsertRowid))
}

export function updateModule(id: number, input: UpdateModuleInput): Module {
  const db = getDatabase()
  db.prepare('UPDATE modules SET name = ?, updated_at = ? WHERE id = ?').run(input.name, now(), id)
  return rowToModule(db.prepare('SELECT * FROM modules WHERE id = ?').get(id))
}

export function moveModule(id: number, newParentId: number | null): Module {
  const db = getDatabase()
  if (newParentId != null) {
    // Cycle guard: walk up from the target; hitting `id` means target is self or a descendant.
    let cur: number | null = newParentId
    while (cur != null) {
      if (cur === id) throw new Error('Cannot move a module into itself or its descendants')
      const row = db.prepare('SELECT parent_id FROM modules WHERE id = ?').get(cur) as any
      if (!row) throw new Error(`Module ${cur} not found`)
      cur = row.parent_id ?? null
    }
  }
  assertFolderParent(db, newParentId)
  db.prepare('UPDATE modules SET parent_id = ?, updated_at = ? WHERE id = ?').run(newParentId, now(), id)
  return rowToModule(db.prepare('SELECT * FROM modules WHERE id = ?').get(id))
}

export function deleteModule(id: number): void {
  const db = getDatabase()
  db.transaction(() => {
    const mod = db.prepare('SELECT parent_id FROM modules WHERE id = ?').get(id) as any
    const ts = now()
    db.prepare('UPDATE modules SET parent_id = ?, updated_at = ? WHERE parent_id = ? AND deleted_at IS NULL')
      .run(mod?.parent_id ?? null, ts, id)
    db.prepare('UPDATE modules SET deleted_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id)
  })()
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
  ipcMain.handle('modules:move', (_e, id: number, newParentId: number | null) => moveModule(id, newParentId))
}
