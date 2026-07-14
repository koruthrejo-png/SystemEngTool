import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase, closeDatabase } from '../db/connection'
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
