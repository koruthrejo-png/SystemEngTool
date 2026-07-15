import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { runMigrations } from './migrations'

// Regression tests for backlog item 21's folder-split migration (migrations.ts, end of
// runMigrations): "modules nested inside modules" became "folders contain modules".
// A module with live children becomes a folder; if it also owns requirements or headings,
// those move to a NEW same-name module inside it that inherits the prefix and counter —
// which is what keeps already-minted requirement IDs byte-identical.
//
// Mandated by the item-21 design spec's Testing section, deferred at the time because the
// whole main-process suite was dark (item 23), and written now that item 23 is fixed.
//
// These build a LEGACY shape the way reality does: run the migrations once (creating the
// schema), insert rows that look like the old model, then run them again — exactly what
// happens when an existing project file is opened, since openDatabase re-runs runMigrations.

type Row = Record<string, any>

describe('folder-split migration (item 21)', () => {
  let tempDir: string
  let db: Database.Database
  const TS = '2020-01-01T00:00:00.000Z'

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-split-'))
    db = new Database(join(tempDir, 'test.reqarch'))
    runMigrations(db) // schema only; there is nothing to convert yet
    db.prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (1, ?, ?, ?)')
      .run('P', TS, TS)
  })

  afterEach(() => {
    db?.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  /** Insert a legacy-shaped module (kind defaults to 'module'). */
  function addModule(
    id: number,
    name: string,
    parentId: number | null,
    over: Partial<{ idPrefix: string; idPadding: number; nextCounter: number; deletedAt: string | null }> = {}
  ): number {
    const { idPrefix = 'SRS-', idPadding = 4, nextCounter = 1, deletedAt = null } = over
    db.prepare(`
      INSERT INTO modules (id, project_id, parent_id, name, id_prefix, id_padding, next_counter, position, deleted_at, created_at, updated_at)
      VALUES (?, 1, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(id, parentId, name, idPrefix, idPadding, nextCounter, deletedAt, TS, TS)
    return id
  }

  function addRequirement(moduleId: number, reqId: string, deletedAt: string | null = null): void {
    db.prepare(`
      INSERT INTO requirements (module_id, req_id, text, position, deleted_at, created_at, updated_at)
      VALUES (?, ?, ?, 0, ?, ?, ?)
    `).run(moduleId, reqId, 'some text', deletedAt, TS, TS)
  }

  function addHeading(moduleId: number, title: string): void {
    db.prepare(`
      INSERT INTO req_headings (module_id, title, position, created_at, updated_at)
      VALUES (?, ?, 0, ?, ?)
    `).run(moduleId, title, TS, TS)
  }

  const module = (id: number): Row => db.prepare('SELECT * FROM modules WHERE id = ?').get(id) as Row
  const childrenOf = (id: number): Row[] =>
    db.prepare('SELECT * FROM modules WHERE parent_id = ? ORDER BY id').all(id) as Row[]
  const moduleCount = (): number =>
    (db.prepare('SELECT COUNT(*) AS n FROM modules').get() as { n: number }).n

  it('splits a parent that owns requirements: folder keeps the children, a new module keeps the IDs', () => {
    addModule(1, 'Test', null, { idPrefix: 'SRS-TRS-', idPadding: 4, nextCounter: 8 })
    addModule(2, 'Child', 1)
    addRequirement(1, 'SRS-TRS-0001')
    addRequirement(1, 'SRS-TRS-0007')
    addHeading(1, 'Section 1')
    const idsBefore = db.prepare('SELECT req_id FROM requirements ORDER BY id').all()

    runMigrations(db)

    // The original row is now a folder, stripped of ID-minting state — a folder mints nothing.
    const folder = module(1)
    expect(folder.kind).toBe('folder')
    expect(folder.id_prefix).toBe('')
    expect(folder.next_counter).toBe(1)

    // A new same-name module appeared inside it, inheriting the minting state verbatim.
    const kids = childrenOf(1)
    expect(kids).toHaveLength(2) // the pre-existing child + the new module
    const created = kids.find((m) => m.id !== 2) as Row
    expect(created).toMatchObject({
      kind: 'module',
      name: 'Test',
      parent_id: 1,
      id_prefix: 'SRS-TRS-',
      id_padding: 4,
      next_counter: 8 // inherited, so the next mint continues the sequence
    })

    // Everything the folder owned moved to it; the folder owns nothing.
    const owned = db.prepare('SELECT module_id FROM requirements').all() as Row[]
    expect(owned.every((r) => r.module_id === created.id)).toBe(true)
    expect((db.prepare('SELECT module_id FROM req_headings').get() as Row).module_id).toBe(created.id)

    // The load-bearing promise of the whole migration: no requirement ID changes.
    expect(db.prepare('SELECT req_id FROM requirements ORDER BY id').all()).toEqual(idsBefore)

    // The original child is untouched and still parented to the folder.
    expect(module(2)).toMatchObject({ kind: 'module', parent_id: 1 })
  })

  it('flips a parent that owns nothing, without inventing a module', () => {
    addModule(1, 'Container', null, { idPrefix: 'ABC-', nextCounter: 5 })
    addModule(2, 'Child', 1)

    runMigrations(db)

    expect(module(1)).toMatchObject({ kind: 'folder', id_prefix: '', next_counter: 1 })
    // The split branch must NOT fire: with nothing to carry, a same-name module would be litter.
    expect(moduleCount()).toBe(2)
    expect(childrenOf(1).map((m) => m.id)).toEqual([2])
  })

  it('is idempotent — a second run splits nothing further', () => {
    addModule(1, 'Test', null, { idPrefix: 'SRS-TRS-', nextCounter: 8 })
    addModule(2, 'Child', 1)
    addRequirement(1, 'SRS-TRS-0001')

    runMigrations(db)
    const afterFirst = db.prepare('SELECT id, parent_id, kind, name, id_prefix, next_counter FROM modules ORDER BY id').all()
    const idsAfterFirst = db.prepare('SELECT req_id, module_id FROM requirements ORDER BY id').all()

    runMigrations(db)
    runMigrations(db) // a third, for good measure — openDatabase re-runs on every launch

    // Idempotence is not version-gated; it falls out of the rule itself. After one run no
    // kind='module' row has children, so the selection query matches nothing on a re-run.
    expect(db.prepare('SELECT id, parent_id, kind, name, id_prefix, next_counter FROM modules ORDER BY id').all())
      .toEqual(afterFirst)
    expect(db.prepare('SELECT req_id, module_id FROM requirements ORDER BY id').all()).toEqual(idsAfterFirst)
  })

  it('converts every level of a 3-deep tree, leaving only the leaf a module', () => {
    // The gap item 21's review called out: live-verify only ever exercised a 2-level tree.
    addModule(1, 'Grandparent', null, { idPrefix: 'GP-', nextCounter: 3 })
    addModule(2, 'Parent', 1, { idPrefix: 'PA-', nextCounter: 4 })
    addModule(3, 'Leaf', 2, { idPrefix: 'LF-', nextCounter: 5 })
    addRequirement(2, 'PA-0003') // only the middle level owns anything

    runMigrations(db)

    expect(module(1).kind).toBe('folder') // has children
    expect(module(2).kind).toBe('folder') // has children
    expect(module(3)).toMatchObject({ kind: 'module', id_prefix: 'LF-', next_counter: 5 }) // leaf: untouched

    // Only the middle level owned a requirement, so exactly one module was created.
    expect(moduleCount()).toBe(4)
    const created = childrenOf(2).find((m) => m.id !== 3) as Row
    expect(created).toMatchObject({ kind: 'module', name: 'Parent', id_prefix: 'PA-', next_counter: 4 })
    expect((db.prepare('SELECT module_id FROM requirements').get() as Row).module_id).toBe(created.id)
  })

  it('ignores a parent whose only child is soft-deleted', () => {
    // The selection query requires a LIVE child (c.deleted_at IS NULL). A module whose only
    // child is deleted is a leaf in every sense that matters, and must keep minting IDs.
    addModule(1, 'Test', null, { idPrefix: 'SRS-', nextCounter: 8 })
    addModule(2, 'DeadChild', 1, { deletedAt: TS })
    addRequirement(1, 'SRS-0007')

    runMigrations(db)

    expect(module(1)).toMatchObject({ kind: 'module', id_prefix: 'SRS-', next_counter: 8 })
    expect(moduleCount()).toBe(2)
  })

  it('carries soft-deleted requirements to the new module, so a restore lands somewhere real', () => {
    addModule(1, 'Test', null, { idPrefix: 'SRS-', nextCounter: 8 })
    addModule(2, 'Child', 1)
    addRequirement(1, 'SRS-0001')
    addRequirement(1, 'SRS-0002', TS) // soft-deleted

    runMigrations(db)

    const created = childrenOf(1).find((m) => m.id !== 2) as Row
    const rows = db.prepare('SELECT req_id, module_id FROM requirements ORDER BY req_id').all() as Row[]
    // Both move. A deleted requirement left on the folder would restore onto a row that can
    // no longer own requirements.
    expect(rows.every((r) => r.module_id === created.id)).toBe(true)
    expect(rows.map((r) => r.req_id)).toEqual(['SRS-0001', 'SRS-0002'])
  })
})
