import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import type { Requirement } from '../../types'

function rowToRequirement(row: any): Requirement {
  return {
    id: row.id, moduleId: row.module_id, reqId: row.req_id, text: row.text,
    acceptanceCriteria: row.acceptance_criteria ?? null,
    source: row.source ?? null, rationale: row.rationale ?? null,
    status: row.status, priority: row.priority, reqType: row.req_type,
    headingId: row.heading_id ?? null,
    position: row.position, deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at, updatedAt: row.updated_at
  }
}

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
