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

export function listElementLinks(elementId: number): Requirement[] {
  return (getDatabase().prepare(`
    SELECT r.* FROM requirements r
    JOIN element_requirement_links l ON r.id = l.requirement_id
    WHERE l.element_id = ? AND r.deleted_at IS NULL
    ORDER BY r.id
  `).all(elementId) as any[]).map(rowToRequirement)
}

export function addElementLink(elementId: number, requirementId: number): void {
  getDatabase()
    .prepare('INSERT OR IGNORE INTO element_requirement_links (element_id, requirement_id) VALUES (?, ?)')
    .run(elementId, requirementId)
}

export function removeElementLink(elementId: number, requirementId: number): void {
  getDatabase()
    .prepare('DELETE FROM element_requirement_links WHERE element_id = ? AND requirement_id = ?')
    .run(elementId, requirementId)
}

export function registerElementLinkHandlers(): void {
  ipcMain.handle('elementLinks:list', (_e, elementId: number) => listElementLinks(elementId))
  ipcMain.handle('elementLinks:add', (_e, elementId: number, requirementId: number) => addElementLink(elementId, requirementId))
  ipcMain.handle('elementLinks:remove', (_e, elementId: number, requirementId: number) => removeElementLink(elementId, requirementId))
}
