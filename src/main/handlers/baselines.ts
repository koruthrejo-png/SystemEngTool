import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import { currentUserRowId } from '../identity'
import { listRequirementsByProject } from './requirements'
import type {
  Baseline, CreateBaselineInput, BaselineSnapshot, BaselineReqSnapshot,
  BaselineElementSnapshot, BaselineConnectionSnapshot, BaselineLinkSnapshot,
  BaselineDiff, BaselineEntityDiff, BaselineEntityModified, BaselineFieldChange, BaselinePairDiff
} from '../../types'

function now(): string { return new Date().toISOString() }

const REQ_DIFF_FIELDS: (keyof BaselineReqSnapshot)[] = [
  'text', 'status', 'priority', 'reqType', 'entryType', 'verificationStatus', 'source', 'rationale', 'acceptanceCriteria'
]
const ELEM_DIFF_FIELDS: (keyof BaselineElementSnapshot)[] = ['name', 'typeName', 'description']
const CONN_DIFF_FIELDS: (keyof BaselineConnectionSnapshot)[] = ['name', 'typeName', 'sourceBlockId', 'targetBlockId', 'description']

export function diffByKey<T>(current: T[], baseline: T[], keyOf: (t: T) => string, fields: (keyof T)[]): BaselineEntityDiff<T> {
  const curMap = new Map(current.map((t) => [keyOf(t), t]))
  const baseMap = new Map(baseline.map((t) => [keyOf(t), t]))
  const added = current.filter((t) => !baseMap.has(keyOf(t)))
  const removed = baseline.filter((t) => !curMap.has(keyOf(t)))
  const modified: BaselineEntityModified[] = []
  for (const [key, cur] of curMap) {
    const base = baseMap.get(key)
    if (!base) continue
    const changes: BaselineFieldChange[] = []
    for (const f of fields) {
      const before = (base[f] ?? null) as string | null
      const after = (cur[f] ?? null) as string | null
      if (before !== after) changes.push({ field: String(f), before, after })
    }
    if (changes.length) modified.push({ key, changes })
  }
  return { added, removed, modified }
}

export function diffPairs(current: BaselineLinkSnapshot[], baseline: BaselineLinkSnapshot[]): BaselinePairDiff {
  const k = (p: BaselineLinkSnapshot): string => `${p.left} ${p.reqId}`
  const curSet = new Set(current.map(k))
  const baseSet = new Set(baseline.map(k))
  return {
    added: current.filter((p) => !baseSet.has(k(p))),
    removed: baseline.filter((p) => !curSet.has(k(p)))
  }
}

export function diffSnapshots(current: BaselineSnapshot, baseline: BaselineSnapshot): BaselineDiff {
  return {
    requirements: diffByKey(current.requirements, baseline.requirements, (r) => r.reqId, REQ_DIFF_FIELDS),
    elements: diffByKey(current.elements, baseline.elements, (e) => e.blockId, ELEM_DIFF_FIELDS),
    connections: diffByKey(current.connections, baseline.connections, (c) => c.connId, CONN_DIFF_FIELDS),
    elementLinks: diffPairs(current.elementLinks, baseline.elementLinks),
    connectionLinks: diffPairs(current.connectionLinks, baseline.connectionLinks)
  }
}

function rowToBaseline(row: any): Baseline {
  return {
    id: row.id, projectId: row.project_id, label: row.label,
    description: row.description ?? null, createdBy: row.created_by ?? null, createdAt: row.created_at
  }
}

export function serializeProject(projectId: number): BaselineSnapshot {
  const db = getDatabase()
  const uuidOf = new Map(
    (db.prepare('SELECT id, uuid FROM users').all() as { id: number; uuid: string }[]).map((u) => [u.id, u.uuid])
  )
  const modName = new Map(
    (db.prepare('SELECT id, name FROM modules').all() as { id: number; name: string }[]).map((m) => [m.id, m.name])
  )
  const requirements: BaselineReqSnapshot[] = listRequirementsByProject(projectId).map((r) => ({
    reqId: r.reqId, moduleName: modName.get(r.moduleId) ?? '', text: r.text,
    status: r.status, priority: r.priority, reqType: r.reqType, entryType: r.entryType,
    verificationStatus: r.verificationStatus, source: r.source, rationale: r.rationale,
    acceptanceCriteria: r.acceptanceCriteria,
    createdByUuid: r.createdBy != null ? uuidOf.get(r.createdBy) ?? null : null,
    updatedByUuid: r.updatedBy != null ? uuidOf.get(r.updatedBy) ?? null : null
  }))
  const elements = db.prepare(`
    SELECT e.block_id AS blockId, e.name AS name, et.name AS typeName, e.description AS description
    FROM architecture_elements e LEFT JOIN element_types et ON e.element_type_id = et.id
    WHERE e.project_id = ? AND e.deleted_at IS NULL ORDER BY e.block_id
  `).all(projectId) as BaselineElementSnapshot[]
  const connections = db.prepare(`
    SELECT c.conn_id AS connId, c.name AS name, ct.name AS typeName,
           se.block_id AS sourceBlockId, te.block_id AS targetBlockId, c.description AS description
    FROM architecture_connections c
    LEFT JOIN connection_types ct ON c.connection_type_id = ct.id
    JOIN architecture_elements se ON c.source_id = se.id
    JOIN architecture_elements te ON c.target_id = te.id
    WHERE c.project_id = ? AND c.deleted_at IS NULL ORDER BY c.conn_id
  `).all(projectId) as BaselineConnectionSnapshot[]
  const elementLinks = db.prepare(`
    SELECT e.block_id AS left, r.req_id AS reqId
    FROM element_requirement_links l
    JOIN architecture_elements e ON l.element_id = e.id
    JOIN requirements r ON l.requirement_id = r.id
    WHERE e.project_id = ? AND e.deleted_at IS NULL AND r.deleted_at IS NULL
    ORDER BY e.block_id, r.req_id
  `).all(projectId) as BaselineLinkSnapshot[]
  const connectionLinks = db.prepare(`
    SELECT c.conn_id AS left, r.req_id AS reqId
    FROM connection_requirement_links l
    JOIN architecture_connections c ON l.connection_id = c.id
    JOIN requirements r ON l.requirement_id = r.id
    WHERE c.project_id = ? AND c.deleted_at IS NULL AND r.deleted_at IS NULL
    ORDER BY c.conn_id, r.req_id
  `).all(projectId) as BaselineLinkSnapshot[]
  return { version: 2, takenAt: now(), requirements, elements, connections, elementLinks, connectionLinks }
}

export function createBaseline(input: CreateBaselineInput): Baseline {
  const db = getDatabase()
  const snapshot = serializeProject(input.projectId)
  const info = db.prepare(`
    INSERT INTO baselines (project_id, label, description, snapshot, created_by, created_at)
    VALUES (?,?,?,?,?,?)
  `).run(input.projectId, input.label, input.description ?? null, JSON.stringify(snapshot), currentUserRowId(db), now())
  return rowToBaseline(
    db.prepare('SELECT id, project_id, label, description, created_by, created_at FROM baselines WHERE id = ?').get(info.lastInsertRowid)
  )
}

export function listBaselines(projectId: number): Baseline[] {
  return (getDatabase().prepare(`
    SELECT id, project_id, label, description, created_by, created_at
    FROM baselines WHERE project_id = ? ORDER BY created_at DESC, id DESC
  `).all(projectId) as any[]).map(rowToBaseline)
}

export function diffBaseline(baselineId: number): BaselineDiff {
  const db = getDatabase()
  const row = db.prepare('SELECT project_id, snapshot FROM baselines WHERE id = ?').get(baselineId) as any
  if (!row) throw new Error(`Baseline ${baselineId} not found`)
  const baseline = JSON.parse(row.snapshot) as BaselineSnapshot
  return diffSnapshots(serializeProject(row.project_id), baseline)
}

export function deleteBaseline(id: number): void {
  getDatabase().prepare('DELETE FROM baselines WHERE id = ?').run(id)
}

export function registerBaselineHandlers(): void {
  ipcMain.handle('baselines:create', (_e, input: CreateBaselineInput) => createBaseline(input))
  ipcMain.handle('baselines:list', (_e, projectId: number) => listBaselines(projectId))
  ipcMain.handle('baselines:diff', (_e, baselineId: number) => diffBaseline(baselineId))
  ipcMain.handle('baselines:delete', (_e, id: number) => deleteBaseline(id))
}
