import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import { getOrCreateDefaultArchitecture } from './architectures'
import type { ArchitectureConnection, CreateConnectionInput, UpdateConnectionInput } from '../../types'

function now(): string { return new Date().toISOString() }

function rowToConnection(row: any): ArchitectureConnection {
  return {
    id: row.id, projectId: row.project_id, architectureId: row.architecture_id ?? null, connId: row.conn_id,
    sourceId: row.source_id, targetId: row.target_id,
    sourceHandle: row.source_handle ?? null, targetHandle: row.target_handle ?? null,
    name: row.name ?? null, connectionTypeId: row.connection_type_id ?? null,
    description: row.description ?? null, deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at, updatedAt: row.updated_at
  }
}

export function listConnections(projectId: number, architectureId?: number | null): ArchitectureConnection[] {
  const db = getDatabase()
  if (architectureId != null) {
    return (db.prepare('SELECT * FROM architecture_connections WHERE project_id = ? AND architecture_id = ? AND deleted_at IS NULL ORDER BY id').all(projectId, architectureId) as any[]).map(rowToConnection)
  }
  return (db.prepare('SELECT * FROM architecture_connections WHERE project_id = ? AND deleted_at IS NULL ORDER BY id').all(projectId) as any[]).map(rowToConnection)
}

export function createConnection(input: CreateConnectionInput): ArchitectureConnection {
  const db = getDatabase()
  const ts = now()

  const row = db.transaction(() => {
    const proj = db.prepare(
      'SELECT conn_id_prefix, conn_id_padding, conn_next_counter FROM projects WHERE id = ?'
    ).get(input.projectId) as any
    if (!proj) throw new Error(`Project ${input.projectId} not found`)

    const connId = `${proj.conn_id_prefix}-${String(proj.conn_next_counter).padStart(proj.conn_id_padding, '0')}`
    db.prepare('UPDATE projects SET conn_next_counter = ?, updated_at = ? WHERE id = ?')
      .run(proj.conn_next_counter + 1, ts, input.projectId)

    let architectureId = input.architectureId ?? null
    if (architectureId == null) {
      const src = db.prepare('SELECT architecture_id FROM architecture_elements WHERE id = ?').get(input.sourceId) as { architecture_id: number | null } | undefined
      architectureId = src?.architecture_id ?? getOrCreateDefaultArchitecture(db, input.projectId)
    }

    const r = db.prepare(`
      INSERT INTO architecture_connections
        (project_id, architecture_id, conn_id, source_id, target_id, source_handle, target_handle, name, connection_type_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.projectId, architectureId, connId, input.sourceId, input.targetId,
      input.sourceHandle ?? null, input.targetHandle ?? null,
      input.name ?? null, input.connectionTypeId ?? null, ts, ts
    )
    return db.prepare('SELECT * FROM architecture_connections WHERE id = ?').get(r.lastInsertRowid)
  })()

  return rowToConnection(row)
}

export function updateConnection(id: number, input: UpdateConnectionInput): ArchitectureConnection {
  const db = getDatabase()
  const existing = db.prepare('SELECT * FROM architecture_connections WHERE id = ?').get(id) as any
  if (!existing) throw new Error(`Connection ${id} not found`)

  db.prepare(`
    UPDATE architecture_connections SET
      conn_id = ?, name = ?, connection_type_id = ?, description = ?, updated_at = ?
    WHERE id = ?
  `).run(
    input.connId ?? existing.conn_id,
    'name' in input ? (input.name ?? null) : existing.name,
    'connectionTypeId' in input ? (input.connectionTypeId ?? null) : existing.connection_type_id,
    'description' in input ? (input.description ?? null) : existing.description,
    now(), id
  )
  return rowToConnection(db.prepare('SELECT * FROM architecture_connections WHERE id = ?').get(id))
}

export function deleteConnection(id: number): void {
  const ts = now()
  getDatabase().prepare('UPDATE architecture_connections SET deleted_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id)
}

export function restoreConnection(id: number): ArchitectureConnection {
  const db = getDatabase()
  db.prepare('UPDATE architecture_connections SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(now(), id)
  return rowToConnection(db.prepare('SELECT * FROM architecture_connections WHERE id = ?').get(id))
}

export function registerConnectionHandlers(): void {
  ipcMain.handle('connections:list', (_e, projectId: number, architectureId?: number | null) => listConnections(projectId, architectureId))
  ipcMain.handle('connections:create', (_e, input: CreateConnectionInput) => createConnection(input))
  ipcMain.handle('connections:update', (_e, id: number, input: UpdateConnectionInput) => updateConnection(id, input))
  ipcMain.handle('connections:delete', (_e, id: number) => deleteConnection(id))
  ipcMain.handle('connections:restore', (_e, id: number) => restoreConnection(id))
}
