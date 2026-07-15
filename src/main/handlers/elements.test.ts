import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase, closeDatabase } from '../db/connection'
import { createProject } from './projects'
import { listElements, createElement, updateElement, deleteElement, restoreElement } from './elements'
import { createConnection, listConnections } from './connections'

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

  it('deleteElement also soft-deletes connections referencing the element', () => {
    const src = createElement({ projectId })
    const tgt = createElement({ projectId })
    createConnection({ projectId, sourceId: src.id, targetId: tgt.id })
    deleteElement(src.id)
    expect(listConnections(projectId)).toHaveLength(0)
  })

  it('restoreElement clears deleted_at and returns the row to the list', () => {
    const a = createElement({ projectId })
    deleteElement(a.id)
    expect(listElements(projectId)).toHaveLength(0)
    const restored = restoreElement(a.id)
    expect(restored.deletedAt).toBeNull()
    expect(listElements(projectId)).toHaveLength(1)
  })

  // B3 (duplicate object) is the first caller to pass style at create time. Before it,
  // CreateElementInput carried no style fields and createElement silently ignored them —
  // recorded as a known nit when item 22 shipped the same gap on connections.
  it('createElement persists style, size, description and parent when supplied', () => {
    const parent = createElement({ projectId, name: 'Container' })
    const el = createElement({
      projectId,
      parentId: parent.id,
      name: 'Pump',
      description: 'a pump',
      color: '#0f766e',
      fillColor: '#e3f3f1',
      lineStyle: 'dashed',
      width: 220,
      height: 120,
      posX: 40,
      posY: 60
    })

    expect(el).toMatchObject({
      parentId: parent.id,
      name: 'Pump',
      description: 'a pump',
      color: '#0f766e',
      fillColor: '#e3f3f1',
      lineStyle: 'dashed',
      width: 220,
      height: 120,
      posX: 40,
      posY: 60
    })
    // It round-trips out of the DB, not just out of the return value.
    expect(listElements(projectId).find((e) => e.id === el.id)).toMatchObject({
      color: '#0f766e',
      fillColor: '#e3f3f1',
      lineStyle: 'dashed',
      width: 220,
      height: 120
    })
  })

  it('createElement still defaults style to null and size to 160x80 when omitted', () => {
    // The + Object path passes none of these; it must keep producing a plain block.
    const el = createElement({ projectId, name: 'Plain' })
    expect(el).toMatchObject({
      color: null, fillColor: null, lineStyle: null, description: null,
      width: 160, height: 80
    })
  })
})
