import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase, closeDatabase } from '../db/connection'
import { createProject } from './projects'
import { createModule } from './modules'
import { createRequirement } from './requirements'
import { createElement } from './elements'
import { createConnection } from './connections'
import { addConnectionLink, removeConnectionLink, listConnectionLinks } from './connectionLinks'

describe('connectionLinks handler', () => {
  let tempDir: string
  let connectionId: number
  let requirementId: number

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    openDatabase(join(tempDir, 'test.reqarch'))
    const project = createProject('Test')
    const mod = createModule({ projectId: project.id, parentId: null, kind: 'module', name: 'SRS', idPrefix: 'SRS', idPadding: 4 })
    requirementId = createRequirement({ moduleId: mod.id, text: 'Req A' }).id
    const src = createElement({ projectId: project.id })
    const tgt = createElement({ projectId: project.id })
    connectionId = createConnection({ projectId: project.id, sourceId: src.id, targetId: tgt.id }).id
  })

  afterEach(() => {
    closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('addConnectionLink links a requirement to a connection', () => {
    addConnectionLink(connectionId, requirementId)
    expect(listConnectionLinks(connectionId)).toHaveLength(1)
  })

  it('removeConnectionLink unlinks a requirement', () => {
    addConnectionLink(connectionId, requirementId)
    removeConnectionLink(connectionId, requirementId)
    expect(listConnectionLinks(connectionId)).toHaveLength(0)
  })

  it('addConnectionLink is idempotent', () => {
    addConnectionLink(connectionId, requirementId)
    addConnectionLink(connectionId, requirementId)
    expect(listConnectionLinks(connectionId)).toHaveLength(1)
  })
})
