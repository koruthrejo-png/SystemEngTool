import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import type { Layer, LayerState, LayerAssignments } from '../../types'

function now(): string { return new Date().toISOString() }

function rowToLayer(row: any): Layer {
  return {
    id: row.id, architectureId: row.architecture_id, name: row.name, state: row.state as LayerState,
    position: row.position, deletedAt: row.deleted_at ?? null, createdAt: row.created_at, updatedAt: row.updated_at
  }
}

export function listLayers(architectureId: number): Layer[] {
  const db = getDatabase()
  return (db.prepare('SELECT * FROM layers WHERE architecture_id = ? AND deleted_at IS NULL ORDER BY position, id').all(architectureId) as any[]).map(rowToLayer)
}

export function createLayer(architectureId: number, name: string): Layer {
  const db = getDatabase()
  const ts = now()
  const row = db.prepare('SELECT COALESCE(MAX(position), -1) as mp FROM layers WHERE architecture_id = ? AND deleted_at IS NULL').get(architectureId) as any
  const r = db.prepare('INSERT INTO layers (architecture_id, name, state, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(architectureId, name, 'visible', (row.mp as number) + 1, ts, ts)
  return rowToLayer(db.prepare('SELECT * FROM layers WHERE id = ?').get(r.lastInsertRowid))
}

export function renameLayer(id: number, name: string): Layer {
  const db = getDatabase()
  db.prepare('UPDATE layers SET name = ?, updated_at = ? WHERE id = ?').run(name, now(), id)
  return rowToLayer(db.prepare('SELECT * FROM layers WHERE id = ?').get(id))
}

export function setLayerState(id: number, state: LayerState): Layer {
  const db = getDatabase()
  db.prepare('UPDATE layers SET state = ?, updated_at = ? WHERE id = ?').run(state, now(), id)
  return rowToLayer(db.prepare('SELECT * FROM layers WHERE id = ?').get(id))
}

export function deleteLayer(id: number): void {
  const db = getDatabase()
  const ts = now()
  db.transaction(() => {
    db.prepare('DELETE FROM element_layers WHERE layer_id = ?').run(id)
    db.prepare('DELETE FROM connection_layers WHERE layer_id = ?').run(id)
    db.prepare('UPDATE layers SET deleted_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id)
  })()
}

export function getAssignments(architectureId: number): LayerAssignments {
  const db = getDatabase()
  const elementLayers = (db.prepare(
    `SELECT el.element_id, el.layer_id FROM element_layers el
     JOIN layers l ON l.id = el.layer_id
     WHERE l.architecture_id = ? AND l.deleted_at IS NULL`
  ).all(architectureId) as any[]).map((r) => ({ elementId: r.element_id, layerId: r.layer_id }))
  const connectionLayers = (db.prepare(
    `SELECT cl.connection_id, cl.layer_id FROM connection_layers cl
     JOIN layers l ON l.id = cl.layer_id
     WHERE l.architecture_id = ? AND l.deleted_at IS NULL`
  ).all(architectureId) as any[]).map((r) => ({ connectionId: r.connection_id, layerId: r.layer_id }))
  return { elementLayers, connectionLayers }
}

export function assignElementLayer(elementId: number, layerId: number): void {
  getDatabase().prepare('INSERT OR IGNORE INTO element_layers (element_id, layer_id) VALUES (?, ?)').run(elementId, layerId)
}
export function unassignElementLayer(elementId: number, layerId: number): void {
  getDatabase().prepare('DELETE FROM element_layers WHERE element_id = ? AND layer_id = ?').run(elementId, layerId)
}
export function assignConnectionLayer(connectionId: number, layerId: number): void {
  getDatabase().prepare('INSERT OR IGNORE INTO connection_layers (connection_id, layer_id) VALUES (?, ?)').run(connectionId, layerId)
}
export function unassignConnectionLayer(connectionId: number, layerId: number): void {
  getDatabase().prepare('DELETE FROM connection_layers WHERE connection_id = ? AND layer_id = ?').run(connectionId, layerId)
}

export function registerLayerHandlers(): void {
  ipcMain.handle('layers:list', (_e, architectureId: number) => listLayers(architectureId))
  ipcMain.handle('layers:create', (_e, architectureId: number, name: string) => createLayer(architectureId, name))
  ipcMain.handle('layers:rename', (_e, id: number, name: string) => renameLayer(id, name))
  ipcMain.handle('layers:setState', (_e, id: number, state: LayerState) => setLayerState(id, state))
  ipcMain.handle('layers:delete', (_e, id: number) => deleteLayer(id))
  ipcMain.handle('layers:assignments', (_e, architectureId: number) => getAssignments(architectureId))
  ipcMain.handle('layers:assignElement', (_e, elementId: number, layerId: number) => assignElementLayer(elementId, layerId))
  ipcMain.handle('layers:unassignElement', (_e, elementId: number, layerId: number) => unassignElementLayer(elementId, layerId))
  ipcMain.handle('layers:assignConnection', (_e, connectionId: number, layerId: number) => assignConnectionLayer(connectionId, layerId))
  ipcMain.handle('layers:unassignConnection', (_e, connectionId: number, layerId: number) => unassignConnectionLayer(connectionId, layerId))
}
