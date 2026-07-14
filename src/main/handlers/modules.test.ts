import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase, closeDatabase } from '../db/connection'
import { createProject } from './projects'
import { listModules, createModule, updateModule, deleteModule, restoreModule, moveModule } from './modules'
import { createRequirement } from './requirements'

describe('modules handler', () => {
  let tempDir: string
  let projectId: number

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    openDatabase(join(tempDir, 'test.reqarch'))
    projectId = createProject('Test Project').id
  })

  afterEach(() => {
    closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('createModule returns a module with correct fields', () => {
    const mod = createModule({ projectId, parentId: null, kind: 'module', name: 'SRS', idPrefix: 'SRS', idPadding: 4 })
    expect(mod.id).toBeGreaterThan(0)
    expect(mod.name).toBe('SRS')
    expect(mod.idPrefix).toBe('SRS')
    expect(mod.idPadding).toBe(4)
    expect(mod.nextCounter).toBe(1)
    expect(mod.deletedAt).toBeNull()
  })

  it('listModules returns only active modules', () => {
    createModule({ projectId, parentId: null, kind: 'module', name: 'SRS', idPrefix: 'SRS', idPadding: 4 })
    const m2 = createModule({ projectId, parentId: null, kind: 'module', name: 'HRS', idPrefix: 'HRS', idPadding: 4 })
    deleteModule(m2.id)
    const modules = listModules(projectId)
    expect(modules).toHaveLength(1)
    expect(modules[0].name).toBe('SRS')
  })

  it('updateModule changes the name', () => {
    const mod = createModule({ projectId, parentId: null, kind: 'module', name: 'SRS', idPrefix: 'SRS', idPadding: 4 })
    const updated = updateModule(mod.id, { name: 'System Requirements' })
    expect(updated.name).toBe('System Requirements')
  })

  it('restoreModule makes a deleted module active again', () => {
    const mod = createModule({ projectId, parentId: null, kind: 'module', name: 'SRS', idPrefix: 'SRS', idPadding: 4 })
    deleteModule(mod.id)
    expect(listModules(projectId)).toHaveLength(0)
    restoreModule(mod.id)
    expect(listModules(projectId)).toHaveLength(1)
  })

  it('createModule defaults a folder to no prefix and reports its kind', () => {
    const folder = createModule({ projectId, parentId: null, kind: 'folder', name: 'Vehicle', idPrefix: '', idPadding: 4 })
    expect(folder.kind).toBe('folder')
    const mod = createModule({ projectId, parentId: folder.id, kind: 'module', name: 'Chassis', idPrefix: 'CHS', idPadding: 4 })
    expect(mod.kind).toBe('module')
    expect(mod.parentId).toBe(folder.id)
  })

  it('createModule rejects a module as parent', () => {
    const mod = createModule({ projectId, parentId: null, kind: 'module', name: 'System', idPrefix: 'SYS', idPadding: 4 })
    expect(() =>
      createModule({ projectId, parentId: mod.id, kind: 'module', name: 'Nested', idPrefix: 'NST', idPadding: 4 })
    ).toThrow(/Only folders/)
  })

  it('moveModule rejects a module as the new parent', () => {
    const folder = createModule({ projectId, parentId: null, kind: 'folder', name: 'Vehicle', idPrefix: '', idPadding: 4 })
    const a = createModule({ projectId, parentId: folder.id, kind: 'module', name: 'A', idPrefix: 'AAA', idPadding: 4 })
    const b = createModule({ projectId, parentId: folder.id, kind: 'module', name: 'B', idPrefix: 'BBB', idPadding: 4 })
    expect(() => moveModule(a.id, b.id)).toThrow(/Only folders/)
    expect(() => moveModule(a.id, folder.id)).not.toThrow()
  })

  it('createRequirement rejects a folder', () => {
    const folder = createModule({ projectId, parentId: null, kind: 'folder', name: 'Vehicle', idPrefix: '', idPadding: 4 })
    expect(() => createRequirement({ moduleId: folder.id, text: 'nope' })).toThrow(/Folders cannot own requirements/)
  })
})
