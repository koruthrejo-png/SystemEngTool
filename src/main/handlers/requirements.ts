import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import { currentUserRowId } from '../identity'
import type { Requirement, CreateRequirementInput, UpdateRequirementInput } from '../../types'

function now(): string { return new Date().toISOString() }

export function rowToRequirement(row: any): Requirement {
  return {
    id: row.id, moduleId: row.module_id, reqId: row.req_id, text: row.text,
    acceptanceCriteria: row.acceptance_criteria ?? null,
    source: row.source ?? null, rationale: row.rationale ?? null,
    status: row.status, priority: row.priority, reqType: row.req_type,
    headingId: row.heading_id ?? null,
    position: row.position, deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at, updatedAt: row.updated_at,
    createdBy: row.created_by ?? null, updatedBy: row.updated_by ?? null
  }
}

export function listRequirements(moduleId: number): Requirement[] {
  return (getDatabase()
    .prepare('SELECT * FROM requirements WHERE module_id = ? AND deleted_at IS NULL ORDER BY position, id')
    .all(moduleId) as any[]).map(rowToRequirement)
}

export function listDeletedRequirements(moduleId: number): Requirement[] {
  return (getDatabase()
    .prepare('SELECT * FROM requirements WHERE module_id = ? AND deleted_at IS NOT NULL ORDER BY updated_at DESC')
    .all(moduleId) as any[]).map(rowToRequirement)
}

export function createRequirement(input: CreateRequirementInput): Requirement {
  const db = getDatabase()
  const ts = now()

  // Attribution comes from the process that owns the identity, never from `input` — the
  // renderer must not be able to name who made an edit. Same rule the server will need.
  const author = currentUserRowId(db)

  const row = db.transaction(() => {
    const mod = db.prepare('SELECT id_prefix, id_padding, next_counter, kind FROM modules WHERE id = ?').get(input.moduleId) as any
    if (!mod) throw new Error(`Module ${input.moduleId} not found`)
    if ((mod.kind ?? 'module') === 'folder') throw new Error('Folders cannot own requirements')
    const reqId = `${mod.id_prefix}-${String(mod.next_counter).padStart(mod.id_padding, '0')}`
    db.prepare('UPDATE modules SET next_counter = ?, updated_at = ? WHERE id = ?')
      .run(mod.next_counter + 1, ts, input.moduleId)

    // When inserting below a specific requirement, the new row inherits that row's section
    // (unless a heading was passed explicitly) and its order is made durable by renumbering
    // below. Otherwise append to the end of the module.
    const target = input.afterId != null
      ? db.prepare('SELECT id, heading_id FROM requirements WHERE id = ? AND module_id = ? AND deleted_at IS NULL').get(input.afterId, input.moduleId) as any
      : null
    const headingId = input.headingId !== undefined ? input.headingId : (target ? target.heading_id ?? null : null)
    const nextPos = (db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM requirements WHERE module_id = ? AND deleted_at IS NULL').get(input.moduleId) as any).p

    const r = db.prepare(`
      INSERT INTO requirements (module_id, req_id, text, acceptance_criteria, source, rationale, heading_id, position, created_at, updated_at, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(input.moduleId, reqId, input.text, input.acceptanceCriteria ?? null, input.source ?? null, input.rationale ?? null, headingId, nextPos, ts, ts, author, author)
    const newId = Number(r.lastInsertRowid)

    // Insert-below: rewrite the whole module's positions into a dense 0..n sequence with the
    // new row placed immediately after its target, so (position, id) ordering is stable on
    // reload even though legacy rows all share position 0.
    if (target) {
      const others = (db.prepare('SELECT id FROM requirements WHERE module_id = ? AND deleted_at IS NULL AND id != ? ORDER BY position, id')
        .all(input.moduleId, newId) as any[]).map((x) => x.id)
      const order: number[] = []
      for (const id of others) { order.push(id); if (id === target.id) order.push(newId) }
      if (!order.includes(newId)) order.push(newId)
      const setPos = db.prepare('UPDATE requirements SET position = ? WHERE id = ?')
      order.forEach((id, i) => setPos.run(i, id))
    }

    return db.prepare('SELECT * FROM requirements WHERE id = ?').get(newId)
  })()

  return rowToRequirement(row)
}

export function updateRequirement(id: number, input: UpdateRequirementInput): Requirement {
  const db = getDatabase()
  const existing = db.prepare('SELECT * FROM requirements WHERE id = ?').get(id) as any
  if (!existing) throw new Error(`Requirement ${id} not found`)
  // `created_by` is deliberately absent from the SET list — who wrote it first never changes.
  db.prepare(`
    UPDATE requirements SET text = ?, acceptance_criteria = ?, source = ?, rationale = ?, status = ?, priority = ?, req_type = ?, heading_id = ?, updated_at = ?, updated_by = ? WHERE id = ?
  `).run(
    // nullable text fields coerce '' → null; NOT NULL enum fields have no empty state, so plain ??
    input.text ?? existing.text,
    input.acceptanceCriteria !== undefined ? (input.acceptanceCriteria || null) : existing.acceptance_criteria,
    input.source !== undefined ? (input.source || null) : existing.source,
    input.rationale !== undefined ? (input.rationale || null) : existing.rationale,
    input.status ?? existing.status,
    input.priority ?? existing.priority,
    input.reqType ?? existing.req_type,
    input.headingId !== undefined ? input.headingId : existing.heading_id,
    now(), currentUserRowId(db), id
  )
  return rowToRequirement(db.prepare('SELECT * FROM requirements WHERE id = ?').get(id))
}

export function deleteRequirement(id: number): void {
  const ts = now()
  getDatabase().prepare('UPDATE requirements SET deleted_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id)
}

export function restoreRequirement(id: number): void {
  getDatabase().prepare('UPDATE requirements SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(now(), id)
}

export function listRequirementsByProject(projectId: number): Requirement[] {
  return (getDatabase()
    .prepare(`
      SELECT r.* FROM requirements r
      JOIN modules m ON r.module_id = m.id
      WHERE m.project_id = ? AND r.deleted_at IS NULL
      ORDER BY m.id, r.position, r.id
    `)
    .all(projectId) as any[]).map(rowToRequirement)
}

export function registerRequirementHandlers(): void {
  ipcMain.handle('requirements:list', (_e, moduleId: number) => listRequirements(moduleId))
  ipcMain.handle('requirements:create', (_e, input: CreateRequirementInput) => createRequirement(input))
  ipcMain.handle('requirements:update', (_e, id: number, input: UpdateRequirementInput) => updateRequirement(id, input))
  ipcMain.handle('requirements:delete', (_e, id: number) => deleteRequirement(id))
  ipcMain.handle('requirements:restore', (_e, id: number) => restoreRequirement(id))
  ipcMain.handle('requirements:listDeleted', (_e, moduleId: number) => listDeletedRequirements(moduleId))
  ipcMain.handle('requirements:listByProject', (_e, projectId: number) => listRequirementsByProject(projectId))
}
