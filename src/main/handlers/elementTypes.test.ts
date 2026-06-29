import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase, closeDatabase, getDatabase } from '../db/connection'
import { createProject } from './projects'
import { seedElementTypes, listElementTypes, createElementType, deleteElementType } from './elementTypes'

describe('elementTypes handler', () => {
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

  it('seedElementTypes inserts 5 built-in types', () => {
    seedElementTypes(getDatabase(), projectId)
    const types = listElementTypes(projectId)
    expect(types).toHaveLength(5)
    expect(types.map((t) => t.name)).toEqual(
      expect.arrayContaining(['System', 'Subsystem', 'Component', 'Function', 'External'])
    )
    expect(types.every((t) => t.isBuiltIn)).toBe(true)
  })

  it('createElementType adds a user type', () => {
    const t = createElementType({ projectId, name: 'Sensor', color: '#ff0000' })
    expect(t.name).toBe('Sensor')
    expect(t.color).toBe('#ff0000')
    expect(t.isBuiltIn).toBe(false)
  })

  it('listElementTypes excludes soft-deleted types', () => {
    seedElementTypes(getDatabase(), projectId)
    const all = listElementTypes(projectId)
    deleteElementType(all[0].id)
    expect(listElementTypes(projectId)).toHaveLength(4)
  })

  it('seedElementTypes is idempotent — calling twice does not duplicate', () => {
    const db = getDatabase()
    seedElementTypes(db, projectId)
    seedElementTypes(db, projectId)
    expect(listElementTypes(projectId)).toHaveLength(5)
  })
})
