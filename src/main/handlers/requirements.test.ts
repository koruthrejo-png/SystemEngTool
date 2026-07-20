import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase, closeDatabase, getDatabase } from '../db/connection'
import { initIdentity, setMe, currentUserRowId } from '../identity'
import { createProject } from './projects'
import { createModule } from './modules'
import { listRequirements, createRequirement, updateRequirement, deleteRequirement, restoreRequirement } from './requirements'

describe('requirements handler', () => {
  let tempDir: string
  let moduleId: number

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    openDatabase(join(tempDir, 'test.reqarch'))
    const project = createProject('Test')
    moduleId = createModule({ projectId: project.id, parentId: null, kind: 'module', name: 'SRS', idPrefix: 'SRS', idPadding: 4 }).id
  })

  afterEach(() => {
    closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('createRequirement generates req_id from module counter', () => {
    const req = createRequirement({ moduleId, text: 'The system shall do X' })
    expect(req.reqId).toBe('SRS-0001')
    expect(req.text).toBe('The system shall do X')
  })

  it('increments the counter for each new requirement', () => {
    expect(createRequirement({ moduleId, text: 'First' }).reqId).toBe('SRS-0001')
    expect(createRequirement({ moduleId, text: 'Second' }).reqId).toBe('SRS-0002')
  })

  it('counter does not reuse IDs after soft delete', () => {
    const r1 = createRequirement({ moduleId, text: 'First' })
    deleteRequirement(r1.id)
    expect(createRequirement({ moduleId, text: 'Second' }).reqId).toBe('SRS-0002')
  })

  it('afterId inserts the new requirement directly below its target and persists order', () => {
    const a = createRequirement({ moduleId, text: 'A' })
    const b = createRequirement({ moduleId, text: 'B' })
    const c = createRequirement({ moduleId, text: 'C' })
    // insert D below A → order should be A, D, B, C
    const d = createRequirement({ moduleId, text: 'D', afterId: a.id })
    expect(listRequirements(moduleId).map((r) => r.id)).toEqual([a.id, d.id, b.id, c.id])
    // insert E below C (last) → A, D, B, C, E
    const e = createRequirement({ moduleId, text: 'E', afterId: c.id })
    expect(listRequirements(moduleId).map((r) => r.id)).toEqual([a.id, d.id, b.id, c.id, e.id])
  })

  it('afterId inherits the target requirement section', () => {
    const a = createRequirement({ moduleId, text: 'A', headingId: null })
    const b = createRequirement({ moduleId, text: 'B', afterId: a.id })
    expect(b.headingId).toBe(a.headingId)
  })

  it('listRequirements returns only active requirements', () => {
    const r1 = createRequirement({ moduleId, text: 'Keep me' })
    const r2 = createRequirement({ moduleId, text: 'Delete me' })
    deleteRequirement(r2.id)
    const list = listRequirements(moduleId)
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(r1.id)
  })

  it('updateRequirement changes text and optional fields', () => {
    const req = createRequirement({ moduleId, text: 'Original' })
    const updated = updateRequirement(req.id, { text: 'Updated', source: 'Spec v2' })
    expect(updated.text).toBe('Updated')
    expect(updated.source).toBe('Spec v2')
    expect(updated.reqId).toBe(req.reqId)
  })

  it('restoreRequirement makes a deleted requirement visible again', () => {
    const req = createRequirement({ moduleId, text: 'Test' })
    deleteRequirement(req.id)
    expect(listRequirements(moduleId)).toHaveLength(0)
    restoreRequirement(req.id)
    expect(listRequirements(moduleId)).toHaveLength(1)
  })

  it('stores all optional fields', () => {
    const req = createRequirement({
      moduleId, text: 'The system shall...',
      acceptanceCriteria: 'Tested by inspection',
      source: 'Customer spec',
      rationale: 'Safety requirement'
    })
    expect(req.acceptanceCriteria).toBe('Tested by inspection')
    expect(req.source).toBe('Customer spec')
    expect(req.rationale).toBe('Safety requirement')
  })

  it('listRequirementsByProject returns all active requirements across modules', async () => {
    const { listRequirementsByProject } = await import('./requirements')
    const project2 = createProject('Other')
    const mod2 = createModule({ projectId: project2.id, parentId: null, kind: 'module', name: 'HRS', idPrefix: 'HRS', idPadding: 4 })
    createRequirement({ moduleId, text: 'Req A' })
    createRequirement({ moduleId: mod2.id, text: 'Req B' })
    const all = listRequirementsByProject(project2.id)
    expect(all.map((r) => r.text)).toContain('Req B')
    expect(all.map((r) => r.text)).not.toContain('Req A')
  })

  it('new requirements default to Draft / Medium / Functional', () => {
    const req = createRequirement({ moduleId, text: 'X' })
    expect(req.status).toBe('Draft')
    expect(req.priority).toBe('Medium')
    expect(req.reqType).toBe('Functional')
  })

  it('updateRequirement changes status, priority, and type without touching other fields', () => {
    const req = createRequirement({ moduleId, text: 'Keep this text' })
    const updated = updateRequirement(req.id, { status: 'Approved', priority: 'High', reqType: 'Interface' })
    expect(updated.status).toBe('Approved')
    expect(updated.priority).toBe('High')
    expect(updated.reqType).toBe('Interface')
    expect(updated.text).toBe('Keep this text')
  })
})

describe('requirement attribution', () => {
  let tempDir: string
  let identityDir: string
  let moduleId: number

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    identityDir = mkdtempSync(join(tmpdir(), 'reqarch-identity-'))
    initIdentity(identityDir)
    setMe({ displayName: 'Ada' })
    openDatabase(join(tempDir, 'test.reqarch'))
    const project = createProject('Test')
    moduleId = createModule({ projectId: project.id, parentId: null, kind: 'module', name: 'SRS', idPrefix: 'SRS', idPadding: 4 }).id
  })

  afterEach(() => {
    closeDatabase()
    initIdentity('')
    rmSync(tempDir, { recursive: true, force: true })
    rmSync(identityDir, { recursive: true, force: true })
  })

  it('createRequirement stamps both created_by and updated_by', () => {
    const req = createRequirement({ moduleId, text: 'X' })
    const me = currentUserRowId(getDatabase())
    expect(req.createdBy).toBe(me)
    expect(req.updatedBy).toBe(me)
  })

  it('updateRequirement stamps updated_by and never rewrites created_by', () => {
    const req = createRequirement({ moduleId, text: 'X' })

    // A genuinely different person — a second machine's identity, hence a second uuid.
    // (Renaming yourself would not do: same uuid, same roster row, still one person.)
    const otherDir = mkdtempSync(join(tmpdir(), 'reqarch-identity-2-'))
    initIdentity(otherDir)
    setMe({ displayName: 'Grace' })
    const editorId = currentUserRowId(getDatabase())
    expect(editorId).not.toBe(req.createdBy)

    const updated = updateRequirement(req.id, { text: 'Y' })
    expect(updated.updatedBy).toBe(editorId)
    expect(updated.createdBy).toBe(req.createdBy)
    rmSync(otherDir, { recursive: true, force: true })
  })

  it('a rename keeps you the same person in the roster', () => {
    const req = createRequirement({ moduleId, text: 'X' })
    setMe({ displayName: 'Ada Lovelace' })
    const updated = updateRequirement(req.id, { text: 'Y' })
    // Same uuid: renaming yourself must not fork you into a second roster entry.
    expect(updated.updatedBy).toBe(req.createdBy)
  })

  it('ignores an author supplied by the caller — identity is never client-asserted', () => {
    const forged = { moduleId, text: 'X', createdBy: 999, updatedBy: 999 } as any
    const req = createRequirement(forged)
    expect(req.createdBy).toBe(currentUserRowId(getDatabase()))
    expect(req.createdBy).not.toBe(999)

    const updated = updateRequirement(req.id, { text: 'Y', updatedBy: 999 } as any)
    expect(updated.updatedBy).not.toBe(999)
  })

  it('leaves rows written before attribution existed as NULL rather than claiming an author', () => {
    const db = getDatabase()
    const ts = new Date().toISOString()
    // A legacy row: written straight to the table with no attribution, as every row in
    // an existing project is.
    db.prepare(`
      INSERT INTO requirements (module_id, req_id, text, status, priority, req_type, position, created_at, updated_at)
      VALUES (?, 'SRS-9999', 'Legacy', 'Draft', 'Medium', 'Functional', 0, ?, ?)
    `).run(moduleId, ts, ts)
    const legacy = listRequirements(moduleId).find((r) => r.reqId === 'SRS-9999')!
    expect(legacy.createdBy).toBeNull()
    expect(legacy.updatedBy).toBeNull()
  })
})
