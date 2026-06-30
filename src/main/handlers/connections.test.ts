import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase, closeDatabase } from '../db/connection'
import { createProject } from './projects'
import { createElement } from './elements'
import { listConnections, createConnection, updateConnection, deleteConnection } from './connections'

describe('connections handler', () => {
  let tempDir: string
  let projectId: number
  let sourceId: number
  let targetId: number

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    openDatabase(join(tempDir, 'test.reqarch'))
    projectId = createProject('Test').id
    sourceId = createElement({ projectId }).id
    targetId = createElement({ projectId }).id
  })

  afterEach(() => {
    closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('createConnection generates connId from project counter', () => {
    const conn = createConnection({ projectId, sourceId, targetId })
    expect(conn.connId).toBe('ICN-0001')
    expect(conn.sourceId).toBe(sourceId)
    expect(conn.targetId).toBe(targetId)
    expect(conn.deletedAt).toBeNull()
  })

  it('counter increments and never reuses IDs', () => {
    const a = createConnection({ projectId, sourceId, targetId })
    deleteConnection(a.id)
    const b = createConnection({ projectId, sourceId, targetId })
    expect(a.connId).toBe('ICN-0001')
    expect(b.connId).toBe('ICN-0002')
  })

  it('listConnections returns only active connections', () => {
    const a = createConnection({ projectId, sourceId, targetId })
    createConnection({ projectId, sourceId, targetId })
    deleteConnection(a.id)
    expect(listConnections(projectId)).toHaveLength(1)
  })

  it('updateConnection changes name and description', () => {
    const conn = createConnection({ projectId, sourceId, targetId })
    const updated = updateConnection(conn.id, { name: 'Power bus', description: 'Main 28V bus' })
    expect(updated.name).toBe('Power bus')
    expect(updated.description).toBe('Main 28V bus')
    expect(updated.connId).toBe(conn.connId)
  })
})
