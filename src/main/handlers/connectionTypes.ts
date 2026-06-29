import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { getDatabase } from '../db/connection'
import type { ConnectionType, CreateConnectionTypeInput } from '../../types'

const BUILT_IN_CONNECTION_TYPES = ['Data', 'Power', 'Mechanical', 'Thermal', 'Control', 'Software']

function now(): string { return new Date().toISOString() }

function rowToConnectionType(row: any): ConnectionType {
  return {
    id: row.id, projectId: row.project_id, name: row.name,
    color: row.color ?? null, isBuiltIn: row.is_built_in === 1,
    deletedAt: row.deleted_at ?? null, createdAt: row.created_at, updatedAt: row.updated_at
  }
}

export function seedConnectionTypes(db: Database.Database, projectId: number): void {
  const ts = now()
  const existing = (db
    .prepare('SELECT name FROM connection_types WHERE project_id = ? AND is_built_in = 1')
    .all(projectId) as any[]).map((r) => r.name)
  const insert = db.prepare(
    'INSERT INTO connection_types (project_id, name, color, is_built_in, created_at, updated_at) VALUES (?, ?, NULL, 1, ?, ?)'
  )
  for (const name of BUILT_IN_CONNECTION_TYPES) {
    if (!existing.includes(name)) insert.run(projectId, name, ts, ts)
  }
}

export function listConnectionTypes(projectId: number): ConnectionType[] {
  return (getDatabase()
    .prepare('SELECT * FROM connection_types WHERE project_id = ? AND deleted_at IS NULL ORDER BY is_built_in DESC, id')
    .all(projectId) as any[]).map(rowToConnectionType)
}

export function createConnectionType(input: CreateConnectionTypeInput): ConnectionType {
  const db = getDatabase()
  const ts = now()
  const result = db.prepare(
    'INSERT INTO connection_types (project_id, name, color, is_built_in, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)'
  ).run(input.projectId, input.name, input.color ?? null, ts, ts)
  return rowToConnectionType(db.prepare('SELECT * FROM connection_types WHERE id = ?').get(result.lastInsertRowid))
}

export function deleteConnectionType(id: number): void {
  const ts = now()
  getDatabase().prepare('UPDATE connection_types SET deleted_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id)
}

export function registerConnectionTypeHandlers(): void {
  ipcMain.handle('connectionTypes:list', (_e, projectId: number) => listConnectionTypes(projectId))
  ipcMain.handle('connectionTypes:create', (_e, input: CreateConnectionTypeInput) => createConnectionType(input))
  ipcMain.handle('connectionTypes:delete', (_e, id: number) => deleteConnectionType(id))
}
