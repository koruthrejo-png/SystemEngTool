import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase, closeDatabase } from '../db/connection'
import { createProject } from './projects'
import { listElements, createElement, updateElement, deleteElement } from './elements'

describe('elements handler', () => {
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

  it('createElement generates blockId from project prefix and counter', () => {
    const el = createElement({ projectId })
    expect(el.blockId).toBe('SYS-001')
    expect(el.projectId).toBe(projectId)
    expect(el.parentId).toBeNull()
    expect(el.deletedAt).toBeNull()
  })

  it('counter increments and never reuses IDs', () => {
    const a = createElement({ projectId })
    deleteElement(a.id)
    const b = createElement({ projectId })
    expect(a.blockId).toBe('SYS-001')
    expect(b.blockId).toBe('SYS-002')
  })

  it('listElements returns only active elements', () => {
    const a = createElement({ projectId })
    createElement({ projectId })
    deleteElement(a.id)
    expect(listElements(projectId)).toHaveLength(1)
  })

  it('updateElement changes fields', () => {
    const el = createElement({ projectId })
    const updated = updateElement(el.id, { name: 'Propulsion', posX: 200, posY: 300 })
    expect(updated.name).toBe('Propulsion')
    expect(updated.posX).toBe(200)
    expect(updated.posY).toBe(300)
    expect(updated.blockId).toBe(el.blockId)
  })

  it('updateElement can set parentId for nesting', () => {
    const parent = createElement({ projectId })
    const child = createElement({ projectId })
    const updated = updateElement(child.id, { parentId: parent.id })
    expect(updated.parentId).toBe(parent.id)
  })

  it('updateElement can clear parentId to un-nest', () => {
    const parent = createElement({ projectId })
    const child = createElement({ projectId })
    updateElement(child.id, { parentId: parent.id })
    const unnested = updateElement(child.id, { parentId: null })
    expect(unnested.parentId).toBeNull()
  })
})
