import Database from 'better-sqlite3'

function addColumnIfMissing(db: Database.Database, table: string, column: string, definition: string): void {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  } catch { /* column already exists — safe to ignore */ }
}

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      created_at  TEXT    NOT NULL,
      updated_at  TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS modules (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id      INTEGER NOT NULL REFERENCES projects(id),
      parent_id       INTEGER REFERENCES modules(id),
      name            TEXT    NOT NULL,
      id_prefix       TEXT    NOT NULL,
      id_padding      INTEGER NOT NULL DEFAULT 4,
      next_counter    INTEGER NOT NULL DEFAULT 1,
      position        INTEGER NOT NULL DEFAULT 0,
      deleted_at      TEXT,
      created_at      TEXT    NOT NULL,
      updated_at      TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS requirements (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id           INTEGER NOT NULL REFERENCES modules(id),
      req_id              TEXT    NOT NULL,
      text                TEXT    NOT NULL,
      acceptance_criteria TEXT,
      source              TEXT,
      rationale           TEXT,
      position            INTEGER NOT NULL DEFAULT 0,
      deleted_at          TEXT,
      created_at          TEXT    NOT NULL,
      updated_at          TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS element_types (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  INTEGER NOT NULL REFERENCES projects(id),
      name        TEXT    NOT NULL,
      color       TEXT,
      is_built_in INTEGER NOT NULL DEFAULT 0,
      deleted_at  TEXT,
      created_at  TEXT    NOT NULL,
      updated_at  TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS connection_types (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  INTEGER NOT NULL REFERENCES projects(id),
      name        TEXT    NOT NULL,
      color       TEXT,
      is_built_in INTEGER NOT NULL DEFAULT 0,
      deleted_at  TEXT,
      created_at  TEXT    NOT NULL,
      updated_at  TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS architecture_elements (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id      INTEGER NOT NULL REFERENCES projects(id),
      parent_id       INTEGER REFERENCES architecture_elements(id),
      block_id        TEXT    NOT NULL,
      name            TEXT    NOT NULL DEFAULT '',
      element_type_id INTEGER REFERENCES element_types(id),
      description     TEXT,
      color           TEXT,
      pos_x           REAL    NOT NULL DEFAULT 100,
      pos_y           REAL    NOT NULL DEFAULT 100,
      width           REAL    NOT NULL DEFAULT 160,
      height          REAL    NOT NULL DEFAULT 80,
      deleted_at      TEXT,
      created_at      TEXT    NOT NULL,
      updated_at      TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS architecture_connections (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id         INTEGER NOT NULL REFERENCES projects(id),
      conn_id            TEXT    NOT NULL,
      source_id          INTEGER NOT NULL REFERENCES architecture_elements(id),
      target_id          INTEGER NOT NULL REFERENCES architecture_elements(id),
      name               TEXT,
      connection_type_id INTEGER REFERENCES connection_types(id),
      description        TEXT,
      deleted_at         TEXT,
      created_at         TEXT    NOT NULL,
      updated_at         TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS element_requirement_links (
      element_id     INTEGER NOT NULL REFERENCES architecture_elements(id),
      requirement_id INTEGER NOT NULL REFERENCES requirements(id),
      PRIMARY KEY (element_id, requirement_id)
    );

    CREATE TABLE IF NOT EXISTS connection_requirement_links (
      connection_id  INTEGER NOT NULL REFERENCES architecture_connections(id),
      requirement_id INTEGER NOT NULL REFERENCES requirements(id),
      PRIMARY KEY (connection_id, requirement_id)
    );

    CREATE TABLE IF NOT EXISTS layers (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      architecture_id INTEGER NOT NULL REFERENCES architectures(id),
      name            TEXT    NOT NULL,
      state           TEXT    NOT NULL DEFAULT 'visible',
      position        INTEGER NOT NULL DEFAULT 0,
      deleted_at      TEXT,
      created_at      TEXT    NOT NULL,
      updated_at      TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS element_layers (
      element_id INTEGER NOT NULL REFERENCES architecture_elements(id),
      layer_id   INTEGER NOT NULL REFERENCES layers(id),
      PRIMARY KEY (element_id, layer_id)
    );

    CREATE TABLE IF NOT EXISTS connection_layers (
      connection_id INTEGER NOT NULL REFERENCES architecture_connections(id),
      layer_id      INTEGER NOT NULL REFERENCES layers(id),
      PRIMARY KEY (connection_id, layer_id)
    );

    CREATE TABLE IF NOT EXISTS requirement_custom_fields (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      requirement_id INTEGER NOT NULL REFERENCES requirements(id),
      key            TEXT    NOT NULL DEFAULT '',
      value          TEXT    NOT NULL DEFAULT '',
      position       INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT    NOT NULL,
      updated_at     TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS req_headings (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id  INTEGER NOT NULL REFERENCES modules(id),
      parent_id  INTEGER REFERENCES req_headings(id),
      title      TEXT    NOT NULL DEFAULT '',
      position   INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      created_at TEXT    NOT NULL,
      updated_at TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS requirement_links (
      parent_req_id INTEGER NOT NULL REFERENCES requirements(id),
      child_req_id  INTEGER NOT NULL REFERENCES requirements(id),
      PRIMARY KEY (parent_req_id, child_req_id)
    );

    CREATE TABLE IF NOT EXISTS acceptance_criteria (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      requirement_id INTEGER NOT NULL REFERENCES requirements(id),
      text           TEXT    NOT NULL,
      status         TEXT    NOT NULL DEFAULT 'Unverified',
      position       INTEGER NOT NULL,
      created_at     TEXT    NOT NULL,
      updated_at     TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS connection_custom_fields (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      connection_id INTEGER NOT NULL REFERENCES architecture_connections(id),
      key           TEXT    NOT NULL DEFAULT '',
      value         TEXT    NOT NULL DEFAULT '',
      position      INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT    NOT NULL,
      updated_at    TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS architectures (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      name       TEXT    NOT NULL,
      position   INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      created_at TEXT    NOT NULL,
      updated_at TEXT    NOT NULL
    );
  `)

  addColumnIfMissing(db, 'projects', 'elem_id_prefix',    "TEXT NOT NULL DEFAULT 'SYS'")
  addColumnIfMissing(db, 'projects', 'elem_id_padding',   'INTEGER NOT NULL DEFAULT 3')
  addColumnIfMissing(db, 'projects', 'elem_next_counter', 'INTEGER NOT NULL DEFAULT 1')
  addColumnIfMissing(db, 'projects', 'conn_id_prefix',    "TEXT NOT NULL DEFAULT 'ICN'")
  addColumnIfMissing(db, 'projects', 'conn_id_padding',   'INTEGER NOT NULL DEFAULT 4')
  addColumnIfMissing(db, 'projects', 'conn_next_counter', 'INTEGER NOT NULL DEFAULT 1')
  addColumnIfMissing(db, 'requirements', 'status',   "TEXT NOT NULL DEFAULT 'Draft'")
  addColumnIfMissing(db, 'requirements', 'priority', "TEXT NOT NULL DEFAULT 'Medium'")
  addColumnIfMissing(db, 'requirements', 'req_type', "TEXT NOT NULL DEFAULT 'Functional'")
  addColumnIfMissing(db, 'architecture_connections', 'source_handle', 'TEXT')
  addColumnIfMissing(db, 'architecture_connections', 'target_handle', 'TEXT')
  addColumnIfMissing(db, 'architecture_connections', 'line_style', 'TEXT')
  addColumnIfMissing(db, 'architecture_connections', 'marker_start', 'TEXT')
  addColumnIfMissing(db, 'architecture_connections', 'marker_end', 'TEXT')
  addColumnIfMissing(db, 'requirements', 'heading_id', 'INTEGER REFERENCES req_headings(id)')
  addColumnIfMissing(db, 'architecture_elements', 'architecture_id', 'INTEGER REFERENCES architectures(id)')
  addColumnIfMissing(db, 'architecture_connections', 'architecture_id', 'INTEGER REFERENCES architectures(id)')

  // One-time conversion: split legacy free-text acceptance_criteria into checklist items.
  // Per-row idempotent — each converted row is set to NULL, so re-runs are no-ops.
  const legacyRows = db
    .prepare("SELECT id, acceptance_criteria FROM requirements WHERE acceptance_criteria IS NOT NULL AND TRIM(acceptance_criteria) != ''")
    .all() as { id: number; acceptance_criteria: string }[]
  if (legacyRows.length > 0) {
    const ts = new Date().toISOString()
    const insert = db.prepare(
      'INSERT INTO acceptance_criteria (requirement_id, text, status, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    const clear = db.prepare('UPDATE requirements SET acceptance_criteria = NULL WHERE id = ?')
    db.transaction(() => {
      for (const row of legacyRows) {
        const lines = row.acceptance_criteria.split('\n').map((l) => l.trim()).filter((l) => l !== '')
        lines.forEach((line, i) => insert.run(row.id, line, 'Unverified', i, ts, ts))
        clear.run(row.id)
      }
    })()
  }

  // One-time: assign pre-existing elements/connections to a per-project "Default" architecture.
  // Idempotent — only rows with NULL architecture_id are touched.
  const projectsNeedingDefault = db
    .prepare(`
      SELECT DISTINCT project_id FROM (
        SELECT project_id FROM architecture_elements WHERE architecture_id IS NULL AND deleted_at IS NULL
        UNION
        SELECT project_id FROM architecture_connections WHERE architecture_id IS NULL AND deleted_at IS NULL
      )
    `)
    .all() as { project_id: number }[]
  if (projectsNeedingDefault.length > 0) {
    const mts = new Date().toISOString()
    db.transaction(() => {
      for (const { project_id } of projectsNeedingDefault) {
        let arch = db.prepare('SELECT id FROM architectures WHERE project_id = ? AND deleted_at IS NULL ORDER BY position, id LIMIT 1').get(project_id) as { id: number } | undefined
        if (!arch) {
          const r = db.prepare('INSERT INTO architectures (project_id, name, position, created_at, updated_at) VALUES (?, ?, 0, ?, ?)').run(project_id, 'Default', mts, mts)
          arch = { id: Number(r.lastInsertRowid) }
        }
        db.prepare('UPDATE architecture_elements SET architecture_id = ? WHERE project_id = ? AND architecture_id IS NULL').run(arch.id, project_id)
        db.prepare('UPDATE architecture_connections SET architecture_id = ? WHERE project_id = ? AND architecture_id IS NULL').run(arch.id, project_id)
      }
    })()
  }
}
