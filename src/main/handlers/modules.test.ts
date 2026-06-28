import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase, closeDatabase } from '../db/connection'
import { createProject } from './projects'
import { listModules, createModule, updateModule, deleteModule, restoreModule } from './modules'

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
    const mod = createModule({ projectId, parentId: null, name: 'SRS', idPrefix: 'SRS', idPadding: 4 })
    expect(mod.id).toBeGreaterThan(0)
    expect(mod.name).toBe('SRS')
    expect(mod.idPrefix).toBe('SRS')
    expect(mod.idPadding).toBe(4)
    expect(mod.nextCounter).toBe(1)
    expect(mod.deletedAt).toBeNull()
  })

  it('listModules returns only active modules', () => {
    createModule({ projectId, parentId: null, name: 'SRS', idPrefix: 'SRS', idPadding: 4 })
    const m2 = createModule({ projectId, parentId: null, name: 'HRS', idPrefix: 'HRS', idPadding: 4 })
    deleteModule(m2.id)
    const modules = listModules(projectId)
    expect(modules).toHaveLength(1)
    expect(modules[0].name).toBe('SRS')
  })

  it('updateModule changes the name', () => {
    const mod = createModule({ projectId, parentId: null, name: 'SRS', idPrefix: 'SRS', idPadding: 4 })
    const updated = updateModule(mod.id, { name: 'System Requirements' })
    expect(updated.name).toBe('System Requirements')
  })

  it('restoreModule makes a deleted module active again', () => {
    const mod = createModule({ projectId, parentId: null, name: 'SRS', idPrefix: 'SRS', idPadding: 4 })
    deleteModule(mod.id)
    expect(listModules(projectId)).toHaveLength(0)
    restoreModule(mod.id)
    expect(listModules(projectId)).toHaveLength(1)
  })

  it('supports nested modules via parentId', () => {
    const parent = createModule({ projectId, parentId: null, name: 'System', idPrefix: 'SYS', idPadding: 4 })
    const child = createModule({ projectId, parentId: parent.id, name: 'SRS', idPrefix: 'SRS', idPadding: 4 })
    expect(child.parentId).toBe(parent.id)
  })
})
