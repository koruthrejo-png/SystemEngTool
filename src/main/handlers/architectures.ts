import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { getDatabase } from '../db/connection'
import type { Architecture } from '../../types'

function now(): string { return new Date().toISOString() }

function rowToArchitecture(row: any): Architecture {
  return {
    id: row.id, projectId: row.project_id, name: row.name, position: row.position,
    deletedAt: row.deleted_at ?? null, createdAt: row.created_at, updatedAt: row.updated_at
  }
}

// Returns the project's first architecture id, creating a "Default" one if none exist.
export function getOrCreateDefaultArchitecture(db: Database.Database, projectId: number): number {
  const existing = db.prepare('SELECT id FROM architectures WHERE project_id = ? AND deleted_at IS NULL ORDER BY position, id LIMIT 1').get(projectId) as { id: number } | undefined
  if (existing) return existing.id
  const ts = now()
  const r = db.prepare('INSERT INTO architectures (project_id, name, position, created_at, updated_at) VALUES (?, ?, 0, ?, ?)').run(projectId, 'Default', ts, ts)
  return Number(r.lastInsertRowid)
}

export function listArchitectures(projectId: number): Architecture[] {
  const db = getDatabase()
  getOrCreateDefaultArchitecture(db, projectId) // guarantee ≥1
  return (db.prepare('SELECT * FROM architectures WHERE project_id = ? AND deleted_at IS NULL ORDER BY position, id').all(projectId) as any[]).map(rowToArchitecture)
}

export function createArchitecture(projectId: number, name: string): Architecture {
  const db = getDatabase()
  const ts = now()
  const row = db.prepare('SELECT COALESCE(MAX(position), -1) as mp FROM architectures WHERE project_id = ? AND deleted_at IS NULL').get(projectId) as any
  const r = db.prepare('INSERT INTO architectures (project_id, name, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(projectId, name, (row.mp as number) + 1, ts, ts)
  return rowToArchitecture(db.prepare('SELECT * FROM architectures WHERE id = ?').get(r.lastInsertRowid))
}

export function renameArchitecture(id: number, name: string): Architecture {
  const db = getDatabase()
  db.prepare('UPDATE architectures SET name = ?, updated_at = ? WHERE id = ?').run(name, now(), id)
  return rowToArchitecture(db.prepare('SELECT * FROM architectures WHERE id = ?').get(id))
}

export function deleteArchitecture(id: number): void {
  const db = getDatabase()
  const ts = now()
  const arch = db.prepare('SELECT project_id FROM architectures WHERE id = ?').get(id) as { project_id: number } | undefined
  if (!arch) throw new Error(`Architecture ${id} not found`)
  const count = db.prepare('SELECT COUNT(*) as c FROM architectures WHERE project_id = ? AND deleted_at IS NULL').get(arch.project_id) as { c: number }
  if (count.c <= 1) throw new Error('Cannot delete the last architecture in a project')
  db.transaction(() => {
    db.prepare('UPDATE architecture_elements SET deleted_at = ?, updated_at = ? WHERE architecture_id = ? AND deleted_at IS NULL').run(ts, ts, id)
    db.prepare('UPDATE architecture_connections SET deleted_at = ?, updated_at = ? WHERE architecture_id = ? AND deleted_at IS NULL').run(ts, ts, id)
    db.prepare('UPDATE architectures SET deleted_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id)
  })()
}

export function registerArchitectureHandlers(): void {
  ipcMain.handle('architectures:list', (_e, projectId: number) => listArchitectures(projectId))
  ipcMain.handle('architectures:create', (_e, projectId: number, name: string) => createArchitecture(projectId, name))
  ipcMain.handle('architectures:rename', (_e, id: number, name: string) => renameArchitecture(id, name))
  ipcMain.handle('architectures:delete', (_e, id: number) => deleteArchitecture(id))
}
