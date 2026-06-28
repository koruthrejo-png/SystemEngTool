import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase, closeDatabase } from '../db/connection'
import { createProject, getFirstProject } from './projects'

describe('project handlers', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    openDatabase(join(tempDir, 'test.reqarch'))
  })

  afterEach(() => {
    closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('createProject inserts a row and returns a Project', () => {
    const project = createProject('My Project')
    expect(project.id).toBeGreaterThan(0)
    expect(project.name).toBe('My Project')
    expect(project.createdAt).toBeTruthy()
  })

  it('getFirstProject returns the project after creation', () => {
    createProject('Test')
    const fetched = getFirstProject()
    expect(fetched?.name).toBe('Test')
  })
})
