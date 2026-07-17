import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import { rowToRequirement } from './requirements'
import type { Requirement, ElementRequirementLink } from '../../types'

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

export function listElementLinksByProject(projectId: number): ElementRequirementLink[] {
  return getDatabase().prepare(`
    SELECT l.element_id AS elementId, l.requirement_id AS requirementId
    FROM element_requirement_links l
    JOIN architecture_elements e ON e.id = l.element_id
    JOIN requirements r ON r.id = l.requirement_id
    WHERE e.project_id = ? AND e.deleted_at IS NULL AND r.deleted_at IS NULL
  `).all(projectId) as ElementRequirementLink[]
}

export function registerElementLinkHandlers(): void {
  ipcMain.handle('elementLinks:list', (_e, elementId: number) => listElementLinks(elementId))
  ipcMain.handle('elementLinks:add', (_e, elementId: number, requirementId: number) => addElementLink(elementId, requirementId))
  ipcMain.handle('elementLinks:remove', (_e, elementId: number, requirementId: number) => removeElementLink(elementId, requirementId))
  ipcMain.handle('elementLinks:listByProject', (_e, projectId: number) => listElementLinksByProject(projectId))
}
