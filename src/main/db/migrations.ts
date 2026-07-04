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

    CREATE TABLE IF NOT EXISTS requirement_custom_fields (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      requirement_id INTEGER NOT NULL REFERENCES requirements(id),
      key            TEXT    NOT NULL DEFAULT '',
      value          TEXT    NOT NULL DEFAULT '',
      position       INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT    NOT NULL,
      updated_at     TEXT    NOT NULL
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
}
