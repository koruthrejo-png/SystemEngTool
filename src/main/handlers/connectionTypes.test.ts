import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase, closeDatabase, getDatabase } from '../db/connection'
import { createProject } from './projects'
import { seedConnectionTypes, listConnectionTypes, createConnectionType, deleteConnectionType } from './connectionTypes'

describe('connectionTypes handler', () => {
  let tempDir: string
  let projectId: number

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    openDatabase(join(tempDir, 'test.reqarch'))
    projectId = createProject('Test').id
  })

  afterEach(() => {
    closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('seedConnectionTypes inserts 6 built-in types', () => {
    seedConnectionTypes(getDatabase(), projectId)
    const types = listConnectionTypes(projectId)
    expect(types).toHaveLength(6)
    expect(types.map((t) => t.name)).toEqual(
      expect.arrayContaining(['Data', 'Power', 'Mechanical', 'Thermal', 'Control', 'Software'])
    )
  })

  it('createConnectionType adds a user type', () => {
    const t = createConnectionType({ projectId, name: 'Optical', color: '#00ff00' })
    expect(t.name).toBe('Optical')
    expect(t.isBuiltIn).toBe(false)
  })

  it('listConnectionTypes excludes soft-deleted types', () => {
    seedConnectionTypes(getDatabase(), projectId)
    const all = listConnectionTypes(projectId)
    deleteConnectionType(all[0].id)
    expect(listConnectionTypes(projectId)).toHaveLength(5)
  })

  it('seedConnectionTypes is idempotent', () => {
    const db = getDatabase()
    seedConnectionTypes(db, projectId)
    seedConnectionTypes(db, projectId)
    expect(listConnectionTypes(projectId)).toHaveLength(6)
  })
})
