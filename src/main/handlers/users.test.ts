import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openDatabase, closeDatabase, getDatabase } from '../db/connection'
import { createProject } from './projects'
import { initIdentity, getMe, setMe, currentUserRowId } from '../identity'
import { listUsers, updateMe } from './users'

describe('identity + users roster', () => {
  let tempDir: string
  let identityDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'reqarch-'))
    identityDir = mkdtempSync(join(tmpdir(), 'reqarch-identity-'))
    initIdentity(identityDir)
    openDatabase(join(tempDir, 'test.reqarch'))
    createProject('Test')
  })

  afterEach(() => {
    closeDatabase()
    rmSync(tempDir, { recursive: true, force: true })
    rmSync(identityDir, { recursive: true, force: true })
  })

  it('mints an identity with a uuid on first use and persists it', () => {
    const me = getMe()!
    expect(me.uuid).toMatch(/^[0-9a-f-]{36}$/)
    expect(me.displayName).toBeTruthy()
    const onDisk = JSON.parse(readFileSync(join(identityDir, 'identity.json'), 'utf8'))
    expect(onDisk.uuid).toBe(me.uuid)
  })

  it('enrols you in the roster exactly once, however many writes happen', () => {
    const first = currentUserRowId(getDatabase())
    const second = currentUserRowId(getDatabase())
    expect(second).toBe(first)
    expect(listUsers()).toHaveLength(1)
  })

  it('a rename updates the roster row in place rather than adding a person', () => {
    currentUserRowId(getDatabase())
    updateMe({ displayName: 'Renamed Person' })
    const roster = listUsers()
    expect(roster).toHaveLength(1)
    expect(roster[0].displayName).toBe('Renamed Person')
  })

  it('keeps the uuid stable across renames — it is what ties edits together across files', () => {
    const before = getMe()!.uuid
    setMe({ displayName: 'Someone Else', email: 'a@b.com' })
    expect(getMe()!.uuid).toBe(before)
  })

  it('does not enrol you in a project you have only opened', () => {
    // No write happened, so the roster stays empty: opening someone's file must not
    // claim you touched it.
    expect(listUsers()).toHaveLength(0)
  })

  it('stamps NULL rather than guessing when no identity is initialised', () => {
    initIdentity('')
    // Uninitialised identity resolves to "unknown", never to a fabricated author.
    expect(getMe()).toBeNull()
    expect(currentUserRowId(getDatabase())).toBeNull()
  })
})
