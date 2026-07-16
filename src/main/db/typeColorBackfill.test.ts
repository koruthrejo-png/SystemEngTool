import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase, closeDatabase, getDatabase } from './connection'
import { runMigrations } from './migrations'
import { createProject } from '../handlers/projects'
import { seedElementTypes, listElementTypes } from '../handlers/elementTypes'
import { BUILT_IN_TYPE_COLORS } from '../../types'

describe('built-in type colour backfill', () => {
  let tempDir: string
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    openDatabase(join(tempDir, 'test.reqarch'))
  })
  afterEach(() => {
    closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('backfills NULL built-in colours, preserves user colours, is idempotent', () => {
    const db = getDatabase()
    const projectId = createProject('Legacy').id
    seedElementTypes(db, projectId) // matches project:create flow, which seeds after createProject
    // Simulate pre-B1 state: built-ins seeded with color NULL, one hand-set by a user.
    db.prepare('UPDATE element_types SET color = NULL WHERE project_id = ? AND is_built_in = 1').run(projectId)
    db.prepare("UPDATE element_types SET color = '#123456' WHERE project_id = ? AND name = 'Component'").run(projectId)

    runMigrations(db)
    let types = listElementTypes(projectId)
    expect(types.find((t) => t.name === 'System')!.color).toBe(BUILT_IN_TYPE_COLORS.System)
    expect(types.find((t) => t.name === 'Component')!.color).toBe('#123456') // user colour untouched

    runMigrations(db) // idempotent — second run changes nothing
    types = listElementTypes(projectId)
    expect(types.find((t) => t.name === 'System')!.color).toBe(BUILT_IN_TYPE_COLORS.System)
    expect(types.find((t) => t.name === 'Component')!.color).toBe('#123456')
  })
})
