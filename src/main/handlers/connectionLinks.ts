import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import { rowToRequirement } from './requirements'
import type { Requirement } from '../../types'

export function listConnectionLinks(connectionId: number): Requirement[] {
  return (getDatabase().prepare(`
    SELECT r.* FROM requirements r
    JOIN connection_requirement_links l ON r.id = l.requirement_id
    WHERE l.connection_id = ? AND r.deleted_at IS NULL
    ORDER BY r.id
  `).all(connectionId) as any[]).map(rowToRequirement)
}

export function addConnectionLink(connectionId: number, requirementId: number): void {
  getDatabase()
    .prepare('INSERT OR IGNORE INTO connection_requirement_links (connection_id, requirement_id) VALUES (?, ?)')
    .run(connectionId, requirementId)
}

export function removeConnectionLink(connectionId: number, requirementId: number): void {
  getDatabase()
    .prepare('DELETE FROM connection_requirement_links WHERE connection_id = ? AND requirement_id = ?')
    .run(connectionId, requirementId)
}

export function registerConnectionLinkHandlers(): void {
  ipcMain.handle('connectionLinks:list', (_e, connectionId: number) => listConnectionLinks(connectionId))
  ipcMain.handle('connectionLinks:add', (_e, connectionId: number, requirementId: number) => addConnectionLink(connectionId, requirementId))
  ipcMain.handle('connectionLinks:remove', (_e, connectionId: number, requirementId: number) => removeConnectionLink(connectionId, requirementId))
}
