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

  it('adds metadata columns to requirements table', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    db = new Database(join(tempDir, 'test.reqarch'))
    runMigrations(db)

    const cols = (db
      .prepare("SELECT name FROM pragma_table_info('requirements')")
      .all() as any[]).map((r) => r.name)

    expect(cols).toContain('status')
    expect(cols).toContain('priority')
    expect(cols).toContain('req_type')
  })

  it('collapses a legacy acceptance_criteria child table back into the requirements column, then drops it', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    db = new Database(join(tempDir, 'test.reqarch'))
    runMigrations(db) // schema only — creates requirements, but not the (already-removed) child table

    const ts = '2020-01-01T00:00:00.000Z'
    db.prepare("INSERT INTO projects (id, name, created_at, updated_at) VALUES (1, 'P', ?, ?)").run(ts, ts)
    db.prepare(`
      INSERT INTO modules (id, project_id, parent_id, name, id_prefix, id_padding, next_counter, position, created_at, updated_at)
      VALUES (1, 1, NULL, 'M', 'SRS-', 4, 1, 0, ?, ?)
    `).run(ts, ts)
    db.prepare(`
      INSERT INTO requirements (id, module_id, req_id, text, position, created_at, updated_at)
      VALUES (1, 1, 'SRS-0001', 'some text', 0, ?, ?)
    `).run(ts, ts)

    // Recreate the old child table by hand — runMigrations no longer creates it — and seed
    // two items on the requirement, exactly the shape a pre-upgrade .reqarch file would have.
    db.exec(`
      CREATE TABLE acceptance_criteria (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        requirement_id INTEGER NOT NULL REFERENCES requirements(id),
        text           TEXT    NOT NULL,
        status         TEXT    NOT NULL DEFAULT 'Unverified',
        position       INTEGER NOT NULL,
        created_at     TEXT    NOT NULL,
        updated_at     TEXT    NOT NULL
      );
    `)
    db.prepare('INSERT INTO acceptance_criteria (requirement_id, text, status, position, created_at, updated_at) VALUES (1, ?, ?, 0, ?, ?)')
      .run('first criterion', 'Unverified', ts, ts)
    db.prepare('INSERT INTO acceptance_criteria (requirement_id, text, status, position, created_at, updated_at) VALUES (1, ?, ?, 1, ?, ?)')
      .run('second criterion', 'Passed', ts, ts)

    runMigrations(db)

    const req = db.prepare('SELECT acceptance_criteria, verification_status FROM requirements WHERE id = 1').get() as {
      acceptance_criteria: string
      verification_status: string
    }
    expect(req.acceptance_criteria).toBe('first criterion\nsecond criterion')
    expect(req.verification_status).toBe('Unverified')

    const table = db.prepare("SELECT name FROM sqlite_master WHERE name='acceptance_criteria'").get()
    expect(table).toBeUndefined()
  })

  it('creates the requirement_history table with the expected columns', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    db = new Database(join(tempDir, 'test.reqarch'))
    runMigrations(db)

    const cols = (db
      .prepare("SELECT name FROM pragma_table_info('requirement_history')")
      .all() as any[]).map((r) => r.name)

    expect(cols).toEqual(
      expect.arrayContaining(['id', 'requirement_id', 'field', 'old_value', 'new_value', 'changed_by', 'changed_at'])
    )
  })

  it('creates the requirement_history index', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    db = new Database(join(tempDir, 'test.reqarch'))
    runMigrations(db)

    const idx = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_req_history_req'")
      .get()
    expect(idx).toBeTruthy()
  })

  it('creates the baselines table with the expected columns', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    db = new Database(join(tempDir, 'test.reqarch'))
    runMigrations(db)

    const cols = (db
      .prepare("SELECT name FROM pragma_table_info('baselines')")
      .all() as any[]).map((r) => r.name)

    expect(cols).toEqual(
      expect.arrayContaining(['id', 'project_id', 'label', 'description', 'snapshot', 'created_by', 'created_at'])
    )
  })
})
