import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { getDatabase } from '../db/connection'
import type { ElementType, CreateElementTypeInput } from '../../types'

const BUILT_IN_ELEMENT_TYPES = ['System', 'Subsystem', 'Component', 'Function', 'External']

function now(): string { return new Date().toISOString() }

function rowToElementType(row: any): ElementType {
  return {
    id: row.id, projectId: row.project_id, name: row.name,
    color: row.color ?? null, isBuiltIn: row.is_built_in === 1,
    deletedAt: row.deleted_at ?? null, createdAt: row.created_at, updatedAt: row.updated_at
  }
}

export function seedElementTypes(db: Database.Database, projectId: number): void {
  const ts = now()
  const existing = (db
    .prepare('SELECT name FROM element_types WHERE project_id = ? AND is_built_in = 1')
    .all(projectId) as any[]).map((r) => r.name)
  const insert = db.prepare(
    'INSERT INTO element_types (project_id, name, color, is_built_in, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, ?)'
  )
  for (const name of BUILT_IN_ELEMENT_TYPES) {
    if (!existing.includes(name)) insert.run(projectId, name, ts, ts)
  }
}

export function listElementTypes(projectId: number): ElementType[] {
  return (getDatabase()
    .prepare('SELECT * FROM element_types WHERE project_id = ? AND deleted_at IS NULL ORDER BY is_built_in DESC, id')
    .all(projectId) as any[]).map(rowToElementType)
}

export function createElementType(input: CreateElementTypeInput): ElementType {
  const db = getDatabase()
  const ts = now()
  const result = db.prepare(
    'INSERT INTO element_types (project_id, name, color, is_built_in, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)'
  ).run(input.projectId, input.name, input.color ?? null, ts, ts)
  return rowToElementType(db.prepare('SELECT * FROM element_types WHERE id = ?').get(result.lastInsertRowid))
}

export function deleteElementType(id: number): void {
  const ts = now()
  getDatabase().prepare('UPDATE element_types SET deleted_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id)
}

export function registerElementTypeHandlers(): void {
  ipcMain.handle('elementTypes:list', (_e, projectId: number) => listElementTypes(projectId))
  ipcMain.handle('elementTypes:create', (_e, input: CreateElementTypeInput) => createElementType(input))
  ipcMain.handle('elementTypes:delete', (_e, id: number) => deleteElementType(id))
}
