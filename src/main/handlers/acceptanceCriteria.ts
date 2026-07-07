import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import type { AcceptanceCriterion, UpdateAcceptanceCriterionInput } from '../../types'

function now(): string { return new Date().toISOString() }

function rowToCriterion(row: any): AcceptanceCriterion {
  return {
    id: row.id,
    requirementId: row.requirement_id,
    text: row.text,
    status: row.status,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function registerAcceptanceCriteriaHandlers(): void {
  ipcMain.handle('acceptanceCriteria:list', (_e, requirementId: number) => {
    return (getDatabase()
      .prepare('SELECT * FROM acceptance_criteria WHERE requirement_id = ? ORDER BY position, id')
      .all(requirementId) as any[]).map(rowToCriterion)
  })

  ipcMain.handle('acceptanceCriteria:listByModule', (_e, moduleId: number) => {
    return (getDatabase()
      .prepare(`
        SELECT ac.* FROM acceptance_criteria ac
        JOIN requirements r ON r.id = ac.requirement_id
        WHERE r.module_id = ? AND r.deleted_at IS NULL
        ORDER BY ac.requirement_id, ac.position, ac.id
      `)
      .all(moduleId) as any[]).map(rowToCriterion)
  })

  ipcMain.handle('acceptanceCriteria:create', (_e, requirementId: number, text: string) => {
    const db = getDatabase()
    const ts = now()
    const row = db.prepare('SELECT COALESCE(MAX(position), -1) as mp FROM acceptance_criteria WHERE requirement_id = ?').get(requirementId) as any
    const result = db
      .prepare('INSERT INTO acceptance_criteria (requirement_id, text, status, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(requirementId, text, 'Unverified', (row.mp as number) + 1, ts, ts)
    return rowToCriterion(db.prepare('SELECT * FROM acceptance_criteria WHERE id = ?').get(result.lastInsertRowid))
  })

  ipcMain.handle('acceptanceCriteria:update', (_e, id: number, patch: UpdateAcceptanceCriterionInput) => {
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM acceptance_criteria WHERE id = ?').get(id) as any
    if (!existing) throw new Error(`Acceptance criterion ${id} not found`)
    db.prepare('UPDATE acceptance_criteria SET text = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(patch.text ?? existing.text, patch.status ?? existing.status, now(), id)
    return rowToCriterion(db.prepare('SELECT * FROM acceptance_criteria WHERE id = ?').get(id))
  })

  ipcMain.handle('acceptanceCriteria:delete', (_e, id: number) => {
    getDatabase().prepare('DELETE FROM acceptance_criteria WHERE id = ?').run(id)
  })

  ipcMain.handle('acceptanceCriteria:move', (_e, id: number, direction: 'up' | 'down') => {
    const db = getDatabase()
    db.transaction(() => {
      const item = db.prepare('SELECT * FROM acceptance_criteria WHERE id = ?').get(id) as any
      if (!item) throw new Error(`Acceptance criterion ${id} not found`)
      const neighbor = db.prepare(`
        SELECT * FROM acceptance_criteria
        WHERE requirement_id = ?
          AND position ${direction === 'up' ? '<' : '>'} ?
        ORDER BY position ${direction === 'up' ? 'DESC' : 'ASC'} LIMIT 1
      `).get(item.requirement_id, item.position) as any
      if (!neighbor) return
      const ts = now()
      db.prepare('UPDATE acceptance_criteria SET position = ?, updated_at = ? WHERE id = ?').run(neighbor.position, ts, item.id)
      db.prepare('UPDATE acceptance_criteria SET position = ?, updated_at = ? WHERE id = ?').run(item.position, ts, neighbor.id)
    })()
  })
}
