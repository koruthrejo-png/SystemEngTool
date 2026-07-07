import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import type { ReqHeading, CreateHeadingInput, UpdateHeadingInput } from '../../types'

function now(): string { return new Date().toISOString() }

export function rowToHeading(row: any): ReqHeading {
  return {
    id: row.id, moduleId: row.module_id, parentId: row.parent_id ?? null,
    title: row.title, position: row.position,
    deletedAt: row.deleted_at ?? null, createdAt: row.created_at, updatedAt: row.updated_at
  }
}

export function listHeadings(moduleId: number): ReqHeading[] {
  return (getDatabase()
    .prepare('SELECT * FROM req_headings WHERE module_id = ? AND deleted_at IS NULL ORDER BY position, id')
    .all(moduleId) as any[]).map(rowToHeading)
}

export function createHeading(input: CreateHeadingInput): ReqHeading {
  const db = getDatabase()
  const ts = now()
  // Enforce 2-level depth limit: parentId must be either null (top-level) or a top-level heading's id
  if (input.parentId != null) {
    const parent = db.prepare(
      'SELECT parent_id FROM req_headings WHERE id = ? AND deleted_at IS NULL'
    ).get(input.parentId) as any
    if (!parent) throw new Error(`Heading ${input.parentId} not found`)
    if (parent.parent_id != null) throw new Error('Subheadings cannot have their own subheadings')
  }
  const max = db.prepare(
    'SELECT COALESCE(MAX(position), -1) AS p FROM req_headings WHERE module_id = ? AND deleted_at IS NULL AND parent_id IS ?'
  ).get(input.moduleId, input.parentId ?? null) as any
  const r = db.prepare(`
    INSERT INTO req_headings (module_id, parent_id, title, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(input.moduleId, input.parentId ?? null, input.title ?? '', max.p + 1, ts, ts)
  return rowToHeading(db.prepare('SELECT * FROM req_headings WHERE id = ?').get(r.lastInsertRowid))
}

export function updateHeading(id: number, input: UpdateHeadingInput): ReqHeading {
  const db = getDatabase()
  const existing = db.prepare('SELECT * FROM req_headings WHERE id = ?').get(id) as any
  if (!existing) throw new Error(`Heading ${id} not found`)
  db.prepare('UPDATE req_headings SET title = ?, updated_at = ? WHERE id = ?')
    .run(input.title ?? existing.title, now(), id)
  return rowToHeading(db.prepare('SELECT * FROM req_headings WHERE id = ?').get(id))
}

// Swap position with the nearest sibling in the given direction (same parent level).
export function moveHeading(id: number, direction: 'up' | 'down'): void {
  const db = getDatabase()
  db.transaction(() => {
    const h = db.prepare('SELECT * FROM req_headings WHERE id = ?').get(id) as any
    if (!h) throw new Error(`Heading ${id} not found`)
    const neighbor = db.prepare(`
      SELECT * FROM req_headings
      WHERE module_id = ? AND deleted_at IS NULL AND parent_id IS ?
        AND position ${direction === 'up' ? '<' : '>'} ?
      ORDER BY position ${direction === 'up' ? 'DESC' : 'ASC'} LIMIT 1
    `).get(h.module_id, h.parent_id ?? null, h.position) as any
    if (!neighbor) return
    const ts = now()
    db.prepare('UPDATE req_headings SET position = ?, updated_at = ? WHERE id = ?').run(neighbor.position, ts, h.id)
    db.prepare('UPDATE req_headings SET position = ?, updated_at = ? WHERE id = ?').run(h.position, ts, neighbor.id)
  })()
}

// Soft delete; requirements and subheadings under it move up to the deleted heading's parent.
export function deleteHeading(id: number): void {
  const db = getDatabase()
  db.transaction(() => {
    const h = db.prepare('SELECT * FROM req_headings WHERE id = ?').get(id) as any
    if (!h) return
    const ts = now()
    db.prepare('UPDATE requirements SET heading_id = ?, updated_at = ? WHERE heading_id = ?')
      .run(h.parent_id ?? null, ts, id)
    db.prepare('UPDATE req_headings SET parent_id = ?, updated_at = ? WHERE parent_id = ? AND deleted_at IS NULL')
      .run(h.parent_id ?? null, ts, id)
    db.prepare('UPDATE req_headings SET deleted_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id)
  })()
}

export function registerHeadingHandlers(): void {
  ipcMain.handle('headings:list', (_e, moduleId: number) => listHeadings(moduleId))
  ipcMain.handle('headings:create', (_e, input: CreateHeadingInput) => createHeading(input))
  ipcMain.handle('headings:update', (_e, id: number, input: UpdateHeadingInput) => updateHeading(id, input))
  ipcMain.handle('headings:move', (_e, id: number, direction: 'up' | 'down') => moveHeading(id, direction))
  ipcMain.handle('headings:delete', (_e, id: number) => deleteHeading(id))
}
