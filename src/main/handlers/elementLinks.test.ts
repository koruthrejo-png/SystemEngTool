import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase, closeDatabase } from '../db/connection'
import { createProject } from './projects'
import { createModule } from './modules'
import { createRequirement } from './requirements'
import { createElement } from './elements'
import { addElementLink, removeElementLink, listElementLinks } from './elementLinks'

describe('elementLinks handler', () => {
  let tempDir: string
  let elementId: number
  let requirementId: number

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    openDatabase(join(tempDir, 'test.reqarch'))
    const project = createProject('Test')
    const mod = createModule({ projectId: project.id, parentId: null, name: 'SRS', idPrefix: 'SRS', idPadding: 4 })
    requirementId = createRequirement({ moduleId: mod.id, text: 'Req A' }).id
    elementId = createElement({ projectId: project.id }).id
  })

  afterEach(() => {
    closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('addElementLink links a requirement to an element', () => {
    addElementLink(elementId, requirementId)
    const linked = listElementLinks(elementId)
    expect(linked).toHaveLength(1)
    expect(linked[0].id).toBe(requirementId)
  })

  it('removeElementLink unlinks a requirement', () => {
    addElementLink(elementId, requirementId)
    removeElementLink(elementId, requirementId)
    expect(listElementLinks(elementId)).toHaveLength(0)
  })

  it('addElementLink is idempotent — adding twice does not duplicate', () => {
    addElementLink(elementId, requirementId)
    addElementLink(elementId, requirementId)
    expect(listElementLinks(elementId)).toHaveLength(1)
  })
})
