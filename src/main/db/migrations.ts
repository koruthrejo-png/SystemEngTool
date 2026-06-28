import Database from 'better-sqlite3'

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
  `)
}
