import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import { userInfo } from 'os'
import { join } from 'path'
import type { LocalIdentity, UpdateMeInput } from '../types'

/**
 * Who you are on this machine. Deliberately NOT in any .reqarch: a project file is a
 * document that can be copied or handed over, while this is you, across every project.
 *
 * The directory is injected (main passes app.getPath('userData')) rather than imported
 * from electron, so handler tests can point it at a temp dir. Uninitialised, getMe()
 * returns null and writes stamp NULL — "unknown", the same as pre-attribution rows.
 */
let dir: string | null = null
let cached: LocalIdentity | null = null

/** Roster row id per open database. Cleared when identity changes; keyed weakly so a
 *  closed database's entry goes away with it. */
let rowIds = new WeakMap<Database.Database, number>()

export function initIdentity(userDataDir: string): void {
  dir = userDataDir
  cached = null
  rowIds = new WeakMap()
}

function identityFile(): string {
  if (!dir) throw new Error('Identity directory not initialised')
  return join(dir, 'identity.json')
}

function now(): string { return new Date().toISOString() }

export function getMe(): LocalIdentity | null {
  if (!dir) return null
  if (cached) return cached
  try {
    const parsed = JSON.parse(readFileSync(identityFile(), 'utf8')) as Partial<LocalIdentity>
    // A file missing its uuid is unusable as an identity — mint a fresh one rather than
    // carry a half-record that can never be reconciled server-side.
    if (parsed.uuid && parsed.displayName) {
      cached = { uuid: parsed.uuid, displayName: parsed.displayName, email: parsed.email ?? null }
      return cached
    }
  } catch { /* absent or unreadable — fall through and mint */ }
  cached = { uuid: randomUUID(), displayName: defaultName(), email: null }
  writeFileSync(identityFile(), JSON.stringify(cached, null, 2))
  return cached
}

/** Seed only — the OS login is a guess at your name, not your identity. */
function defaultName(): string {
  try { return userInfo().username || 'Unknown' } catch { return 'Unknown' }
}

export function setMe(input: UpdateMeInput): LocalIdentity {
  const me = getMe()
  if (!me) throw new Error('Identity directory not initialised')
  // uuid is immutable: it is the only thing tying your edits across files together.
  const next: LocalIdentity = {
    uuid: me.uuid,
    displayName: input.displayName?.trim() || me.displayName,
    email: input.email !== undefined ? (input.email?.trim() || null) : me.email
  }
  writeFileSync(identityFile(), JSON.stringify(next, null, 2))
  cached = next
  rowIds = new WeakMap()
  return next
}

/**
 * Your row id in THIS file's roster, upserting it on first use. Call from write paths
 * only: opening someone else's project shouldn't enrol you in a file you never touched.
 * Returns null when identity is uninitialised, so the write stamps "unknown".
 */
export function currentUserRowId(db: Database.Database): number | null {
  const me = getMe()
  if (!me) return null
  const hit = rowIds.get(db)
  if (hit !== undefined) return hit
  const ts = now()
  db.prepare(`
    INSERT INTO users (uuid, display_name, email, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(uuid) DO UPDATE SET display_name = excluded.display_name, email = excluded.email, updated_at = excluded.updated_at
  `).run(me.uuid, me.displayName, me.email, ts, ts)
  const row = db.prepare('SELECT id FROM users WHERE uuid = ?').get(me.uuid) as { id: number }
  rowIds.set(db, row.id)
  return row.id
}
