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
  // Headings nest to any depth; parentId must reference an existing heading (or be null for top-level).
  if (input.parentId != null) {
    const parent = db.prepare(
      'SELECT id FROM req_headings WHERE id = ? AND deleted_at IS NULL'
    ).get(input.parentId) as any
    if (!parent) throw new Error(`Heading ${input.parentId} not found`)
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

// Re-parent a heading (drag & drop); newParentId null = top level. Descendants need no update:
// subheadings and requirements point at `id` via parent_id/heading_id, so they follow it.
// The heading is appended last among its new siblings, matching createHeading.
export function reparentHeading(id: number, newParentId: number | null): ReqHeading {
  const db = getDatabase()
  return db.transaction(() => {
    const h = db.prepare('SELECT * FROM req_headings WHERE id = ?').get(id) as any
    if (!h) throw new Error(`Heading ${id} not found`)
    if (newParentId != null) {
      // Cycle guard: walk up from the target; hitting `id` means target is self or a descendant.
      let cur: number | null = newParentId
      while (cur != null) {
        if (cur === id) throw new Error('Cannot move a section into itself or its descendants')
        const row = db.prepare('SELECT parent_id FROM req_headings WHERE id = ?').get(cur) as any
        if (!row) throw new Error(`Heading ${cur} not found`)
        cur = row.parent_id ?? null
      }
    }
    // id != ? so a heading re-parented within its current parent doesn't count itself.
    const max = db.prepare(
      'SELECT COALESCE(MAX(position), -1) AS p FROM req_headings WHERE module_id = ? AND deleted_at IS NULL AND parent_id IS ? AND id != ?'
    ).get(h.module_id, newParentId, id) as any
    db.prepare('UPDATE req_headings SET parent_id = ?, position = ?, updated_at = ? WHERE id = ?')
      .run(newParentId, max.p + 1, now(), id)
    return rowToHeading(db.prepare('SELECT * FROM req_headings WHERE id = ?').get(id))
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
  ipcMain.handle('headings:reparent', (_e, id: number, newParentId: number | null) => reparentHeading(id, newParentId))
  ipcMain.handle('headings:delete', (_e, id: number) => deleteHeading(id))
}
