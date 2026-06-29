import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { runMigrations } from './migrations'

describe('runMigrations', () => {
  let tempDir: string
  let db: Database.Database

  afterEach(() => {
    db?.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('creates projects, modules, and requirements tables', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    db = new Database(join(tempDir, 'test.reqarch'))
    runMigrations(db)

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name)

    expect(tables).toContain('projects')
    expect(tables).toContain('modules')
    expect(tables).toContain('requirements')
  })

  it('is idempotent — running twice does not throw', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    db = new Database(join(tempDir, 'test.reqarch'))
    expect(() => { runMigrations(db); runMigrations(db) }).not.toThrow()
  })

  it('creates architecture tables', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    db = new Database(join(tempDir, 'test.reqarch'))
    runMigrations(db)

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name)

    expect(tables).toContain('element_types')
    expect(tables).toContain('connection_types')
    expect(tables).toContain('architecture_elements')
    expect(tables).toContain('architecture_connections')
    expect(tables).toContain('element_requirement_links')
    expect(tables).toContain('connection_requirement_links')
  })

  it('adds architecture columns to projects table', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    db = new Database(join(tempDir, 'test.reqarch'))
    runMigrations(db)

    const cols = (db
      .prepare("SELECT name FROM pragma_table_info('projects')")
      .all() as any[]).map((r) => r.name)

    expect(cols).toContain('elem_id_prefix')
    expect(cols).toContain('elem_id_padding')
    expect(cols).toContain('elem_next_counter')
    expect(cols).toContain('conn_id_prefix')
    expect(cols).toContain('conn_id_padding')
    expect(cols).toContain('conn_next_counter')
  })
})
