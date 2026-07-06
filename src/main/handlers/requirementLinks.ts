import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import type { RequirementLink } from '../../types'

export function addRequirementLink(parentReqId: number, childReqId: number): void {
  const db = getDatabase()
  if (parentReqId === childReqId) throw new Error('A requirement cannot derive from itself')
  // Cycle guard: walk ancestors of parentReqId; reaching childReqId means this link closes a cycle.
  const parentsOf = db.prepare('SELECT parent_req_id FROM requirement_links WHERE child_req_id = ?')
  const seen = new Set<number>()
  const stack = [parentReqId]
  while (stack.length > 0) {
    const cur = stack.pop() as number
    if (cur === childReqId) throw new Error('Link would create a derivation cycle')
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const row of parentsOf.all(cur) as any[]) stack.push(row.parent_req_id)
  }
  db.prepare('INSERT OR IGNORE INTO requirement_links (parent_req_id, child_req_id) VALUES (?, ?)')
    .run(parentReqId, childReqId)
}

export function removeRequirementLink(parentReqId: number, childReqId: number): void {
  getDatabase()
    .prepare('DELETE FROM requirement_links WHERE parent_req_id = ? AND child_req_id = ?')
    .run(parentReqId, childReqId)
}

export function listRequirementLinksByProject(projectId: number): RequirementLink[] {
  return getDatabase().prepare(`
    SELECT l.parent_req_id AS parentReqId, l.child_req_id AS childReqId
    FROM requirement_links l
    JOIN requirements p ON p.id = l.parent_req_id
    JOIN modules pm ON pm.id = p.module_id
    JOIN requirements c ON c.id = l.child_req_id
    JOIN modules cm ON cm.id = c.module_id
    WHERE pm.project_id = ? AND cm.project_id = ?
      AND p.deleted_at IS NULL AND c.deleted_at IS NULL
  `).all(projectId, projectId) as RequirementLink[]
}

export function registerRequirementLinkHandlers(): void {
  ipcMain.handle('reqLinks:add', (_e, parentReqId: number, childReqId: number) => addRequirementLink(parentReqId, childReqId))
  ipcMain.handle('reqLinks:remove', (_e, parentReqId: number, childReqId: number) => removeRequirementLink(parentReqId, childReqId))
  ipcMain.handle('reqLinks:listByProject', (_e, projectId: number) => listRequirementLinksByProject(projectId))
}
