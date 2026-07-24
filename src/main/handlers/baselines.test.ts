import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase, closeDatabase, getDatabase } from '../db/connection'
import { initIdentity, setMe, currentUserRowId } from '../identity'
import { createProject } from './projects'
import { createModule } from './modules'
import { createRequirement, updateRequirement, deleteRequirement } from './requirements'
import {
  diffByKey, diffPairs, diffSnapshots,
  serializeProject, createBaseline, listBaselines, diffBaseline, deleteBaseline
} from './baselines'
import type { BaselineReqSnapshot, BaselineSnapshot, BaselineLinkSnapshot } from '../../types'

const req = (reqId: string, over: Partial<BaselineReqSnapshot> = {}): BaselineReqSnapshot => ({
  reqId, moduleName: 'SRS', text: 'T', status: 'Draft', priority: 'Medium', reqType: 'Functional',
  entryType: 'Requirement', verificationStatus: 'Unverified', source: null, rationale: null,
  acceptanceCriteria: null, createdByUuid: null, updatedByUuid: null, ...over
})

const REQ_FIELDS = ['text', 'status', 'priority', 'reqType', 'entryType', 'verificationStatus', 'source', 'rationale', 'acceptanceCriteria'] as const

describe('diffByKey', () => {
  it('detects added and removed by key', () => {
    const d = diffByKey([req('A'), req('B')], [req('A'), req('C')], (r) => r.reqId, REQ_FIELDS as any)
    expect(d.added.map((r) => r.reqId)).toEqual(['B'])
    expect(d.removed.map((r) => r.reqId)).toEqual(['C'])
    expect(d.modified).toEqual([])
  })

  it('reports per-field modifications for matched keys', () => {
    const d = diffByKey(
      [req('A', { status: 'Approved', priority: 'High' })],
      [req('A', { status: 'Draft', priority: 'High' })],
      (r) => r.reqId, REQ_FIELDS as any
    )
    expect(d.modified).toEqual([
      { key: 'A', changes: [{ field: 'status', before: 'Draft', after: 'Approved' }] }
    ])
  })

  it('identical inputs yield an empty diff', () => {
    const d = diffByKey([req('A')], [req('A')], (r) => r.reqId, REQ_FIELDS as any)
    expect(d).toEqual({ added: [], removed: [], modified: [] })
  })

  it('keys by reqId, not array position', () => {
    const d = diffByKey([req('A'), req('B')], [req('B'), req('A')], (r) => r.reqId, REQ_FIELDS as any)
    expect(d.added).toEqual([]); expect(d.removed).toEqual([]); expect(d.modified).toEqual([])
  })
})

describe('diffPairs', () => {
  it('detects added and removed link pairs', () => {
    const cur: BaselineLinkSnapshot[] = [{ left: 'SYS-001', reqId: 'A' }, { left: 'SYS-002', reqId: 'B' }]
    const base: BaselineLinkSnapshot[] = [{ left: 'SYS-001', reqId: 'A' }, { left: 'SYS-003', reqId: 'C' }]
    const d = diffPairs(cur, base)
    expect(d.added).toEqual([{ left: 'SYS-002', reqId: 'B' }])
    expect(d.removed).toEqual([{ left: 'SYS-003', reqId: 'C' }])
  })
})

describe('diffSnapshots', () => {
  const empty = (): BaselineSnapshot => ({
    version: 2, takenAt: '', requirements: [], elements: [], connections: [], elementLinks: [], connectionLinks: []
  })
  it('composes entity + pair diffs across all sections', () => {
    const base = empty(); base.requirements = [req('A')]
    const cur = empty(); cur.requirements = [req('A', { status: 'Approved' })]
    cur.elements = [{ blockId: 'SYS-001', name: 'CPU', typeName: 'Component', description: null }]
    cur.elementLinks = [{ left: 'SYS-001', reqId: 'A' }]
    const d = diffSnapshots(cur, base)
    expect(d.requirements.modified).toHaveLength(1)
    expect(d.elements.added.map((e) => e.blockId)).toEqual(['SYS-001'])
    expect(d.elementLinks.added).toHaveLength(1)
    expect(d.connections.added).toEqual([])
  })
})

describe('baselines handler', () => {
  let tempDir: string
  let identityDir: string
  let projectId: number
  let moduleId: number

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    identityDir = mkdtempSync(join(tmpdir(), 'reqarch-identity-'))
    initIdentity(identityDir)
    setMe({ displayName: 'Grace' })
    openDatabase(join(tempDir, 'test.reqarch'))
    const p = createProject('Test'); projectId = p.id
    moduleId = createModule({ projectId, parentId: null, kind: 'module', name: 'SRS', idPrefix: 'SRS', idPadding: 4 }).id
  })
  afterEach(() => {
    closeDatabase(); initIdentity('')
    rmSync(tempDir, { recursive: true, force: true })
    rmSync(identityDir, { recursive: true, force: true })
  })

  it('serializeProject resolves author integer ids to uuids', () => {
    createRequirement({ moduleId, text: 'X' })
    const snap = serializeProject(projectId)
    expect(snap.requirements).toHaveLength(1)
    const uuid = (getDatabase().prepare('SELECT uuid FROM users WHERE id = ?').get(currentUserRowId(getDatabase())) as any).uuid
    expect(snap.requirements[0].createdByUuid).toBe(uuid)
    expect(typeof snap.requirements[0].createdByUuid).toBe('string')
  })

  it('createBaseline stores the row and returns metadata without the blob', () => {
    createRequirement({ moduleId, text: 'X' })
    const b = createBaseline({ projectId, label: 'Rev A', description: 'PDR' })
    expect(b.label).toBe('Rev A')
    expect(b.createdBy).toBe(currentUserRowId(getDatabase()))
    expect((b as any).snapshot).toBeUndefined()
  })

  it('baselines:list omits the snapshot blob', () => {
    createBaseline({ projectId, label: 'Rev A' })
    const rows = listBaselines(projectId)
    expect(rows).toHaveLength(1)
    expect((rows[0] as any).snapshot).toBeUndefined()
  })

  it('a frozen snapshot is a stable copy — later edits do not mutate it, and diff reflects them', () => {
    const keep = createRequirement({ moduleId, text: 'keep' })
    const edit = createRequirement({ moduleId, text: 'edit', status: 'Draft' } as any)
    const gone = createRequirement({ moduleId, text: 'gone' })
    const b = createBaseline({ projectId, label: 'Rev A' })

    createRequirement({ moduleId, text: 'brand new' })
    updateRequirement(edit.id, { status: 'Approved' })
    deleteRequirement(gone.id)

    const stored = JSON.parse((getDatabase().prepare('SELECT snapshot FROM baselines WHERE id = ?').get(b.id) as any).snapshot)
    const editSnap = stored.requirements.find((r: any) => r.reqId === edit.reqId)
    expect(editSnap.status).toBe('Draft')
    expect(stored.requirements.some((r: any) => r.reqId === gone.reqId)).toBe(true)

    const d = diffBaseline(b.id)
    expect(d.requirements.added.map((r) => r.text)).toEqual(['brand new'])
    expect(d.requirements.removed.map((r) => r.reqId)).toEqual([gone.reqId])
    expect(d.requirements.modified).toEqual([
      { key: edit.reqId, changes: [{ field: 'status', before: 'Draft', after: 'Approved' }] }
    ])
    expect(d.requirements.added.some((r) => r.reqId === keep.reqId)).toBe(false)
  })

  it('deleteBaseline hard-deletes', () => {
    const b = createBaseline({ projectId, label: 'Rev A' })
    deleteBaseline(b.id)
    expect(listBaselines(projectId)).toHaveLength(0)
  })
})
