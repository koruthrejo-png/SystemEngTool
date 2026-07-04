import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import type { ArchitectureElement, CreateElementInput, UpdateElementInput } from '../../types'

function now(): string { return new Date().toISOString() }

function rowToElement(row: any): ArchitectureElement {
  return {
    id: row.id, projectId: row.project_id, parentId: row.parent_id ?? null,
    blockId: row.block_id, name: row.name, elementTypeId: row.element_type_id ?? null,
    description: row.description ?? null, color: row.color ?? null,
    posX: row.pos_x, posY: row.pos_y, width: row.width, height: row.height,
    deletedAt: row.deleted_at ?? null, createdAt: row.created_at, updatedAt: row.updated_at
  }
}

export function listElements(projectId: number): ArchitectureElement[] {
  return (getDatabase()
    .prepare('SELECT * FROM architecture_elements WHERE project_id = ? AND deleted_at IS NULL ORDER BY id')
    .all(projectId) as any[]).map(rowToElement)
}

export function createElement(input: CreateElementInput): ArchitectureElement {
  const db = getDatabase()
  const ts = now()

  const row = db.transaction(() => {
    const proj = db.prepare(
      'SELECT elem_id_prefix, elem_id_padding, elem_next_counter FROM projects WHERE id = ?'
    ).get(input.projectId) as any
    if (!proj) throw new Error(`Project ${input.projectId} not found`)

    const blockId = `${proj.elem_id_prefix}-${String(proj.elem_next_counter).padStart(proj.elem_id_padding, '0')}`
    db.prepare('UPDATE projects SET elem_next_counter = ?, updated_at = ? WHERE id = ?')
      .run(proj.elem_next_counter + 1, ts, input.projectId)

    const r = db.prepare(`
      INSERT INTO architecture_elements
        (project_id, parent_id, block_id, name, element_type_id, pos_x, pos_y, width, height, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 160, 80, ?, ?)
    `).run(
      input.projectId, input.parentId ?? null, blockId,
      input.name ?? '', input.elementTypeId ?? null,
      input.posX ?? 100, input.posY ?? 100, ts, ts
    )
    return db.prepare('SELECT * FROM architecture_elements WHERE id = ?').get(r.lastInsertRowid)
  })()

  return rowToElement(row)
}

export function updateElement(id: number, input: UpdateElementInput): ArchitectureElement {
  const db = getDatabase()
  const existing = db.prepare('SELECT * FROM architecture_elements WHERE id = ?').get(id) as any
  if (!existing) throw new Error(`Element ${id} not found`)

  db.prepare(`
    UPDATE architecture_elements SET
      parent_id = ?, block_id = ?, name = ?, element_type_id = ?,
      description = ?, color = ?, pos_x = ?, pos_y = ?, width = ?, height = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    'parentId' in input ? (input.parentId ?? null) : existing.parent_id,
    input.blockId ?? existing.block_id,
    input.name ?? existing.name,
    'elementTypeId' in input ? (input.elementTypeId ?? null) : existing.element_type_id,
    'description' in input ? (input.description ?? null) : existing.description,
    'color' in input ? (input.color ?? null) : existing.color,
    input.posX ?? existing.pos_x,
    input.posY ?? existing.pos_y,
    input.width ?? existing.width,
    input.height ?? existing.height,
    now(), id
  )
  return rowToElement(db.prepare('SELECT * FROM architecture_elements WHERE id = ?').get(id))
}

export function deleteElement(id: number): void {
  const ts = now()
  const db = getDatabase()
  db.transaction(() => {
    const parent = db.prepare(
      'SELECT parent_id, pos_x, pos_y FROM architecture_elements WHERE id = ?'
    ).get(id) as any
    if (parent) {
      // children become siblings of the deleted element; positions stay
      // geometrically fixed because both are relative to the same grandparent
      db.prepare(`
        UPDATE architecture_elements
        SET parent_id = ?, pos_x = pos_x + ?, pos_y = pos_y + ?, updated_at = ?
        WHERE parent_id = ? AND deleted_at IS NULL
      `).run(parent.parent_id ?? null, parent.pos_x, parent.pos_y, ts, id)
    }
    db.prepare(
      'UPDATE architecture_connections SET deleted_at = ?, updated_at = ? WHERE (source_id = ? OR target_id = ?) AND deleted_at IS NULL'
    ).run(ts, ts, id, id)
    db.prepare(
      'UPDATE architecture_elements SET deleted_at = ?, updated_at = ? WHERE id = ?'
    ).run(ts, ts, id)
  })()
}

export function registerElementHandlers(): void {
  ipcMain.handle('elements:list', (_e, projectId: number) => listElements(projectId))
  ipcMain.handle('elements:create', (_e, input: CreateElementInput) => createElement(input))
  ipcMain.handle('elements:update', (_e, id: number, input: UpdateElementInput) => updateElement(id, input))
  ipcMain.handle('elements:delete', (_e, id: number) => deleteElement(id))
}
