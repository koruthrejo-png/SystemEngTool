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

  it('backfills a legacy project where every built-in colour is NULL', () => {
    const db = getDatabase()
    const projectId = createProject('Legacy').id
    seedElementTypes(db, projectId)
    db.prepare('UPDATE element_types SET color = NULL WHERE project_id = ? AND is_built_in = 1').run(projectId)
    runMigrations(db)
    const types = listElementTypes(projectId)
    expect(types.find((t) => t.name === 'System')!.color).toBe(BUILT_IN_TYPE_COLORS.System)
    expect(types.find((t) => t.name === 'Component')!.color).toBe(BUILT_IN_TYPE_COLORS.Component)
  })

  it('does NOT revert a user who cleared one built-in colour (project already partly coloured)', () => {
    const db = getDatabase()
    const projectId = createProject('Managed').id
    seedElementTypes(db, projectId) // seeds all built-ins with palette colours
    db.prepare("UPDATE element_types SET color = NULL WHERE project_id = ? AND name = 'System'").run(projectId)
    runMigrations(db)
    const types = listElementTypes(projectId)
    expect(types.find((t) => t.name === 'System')!.color).toBeNull() // stays cleared
    expect(types.find((t) => t.name === 'Component')!.color).toBe(BUILT_IN_TYPE_COLORS.Component)
  })

  it('is idempotent — a second run changes nothing', () => {
    const db = getDatabase()
    const projectId = createProject('Legacy2').id
    seedElementTypes(db, projectId)
    db.prepare('UPDATE element_types SET color = NULL WHERE project_id = ? AND is_built_in = 1').run(projectId)
    runMigrations(db)
    runMigrations(db)
    expect(listElementTypes(projectId).find((t) => t.name === 'System')!.color).toBe(BUILT_IN_TYPE_COLORS.System)
  })
})
