import Database from 'better-sqlite3'
import { runMigrations } from './migrations'

let _db: Database.Database | null = null

export function openDatabase(filePath: string): Database.Database {
  if (_db) _db.close()
  _db = new Database(filePath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  runMigrations(_db)
  return _db
}

export function getDatabase(): Database.Database {
  if (!_db) throw new Error('No database is open')
  return _db
}

export function hasDatabase(): boolean {
  return _db !== null
}

export function closeDatabase(): void {
  _db?.close()
  _db = null
}
