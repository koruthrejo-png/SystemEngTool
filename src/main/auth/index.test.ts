import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// safeStorage is Electron's; in tests "encryption" is a reversible byte flip, which is
// enough to prove the blob is not stored as plaintext JSON.
const flip = (s: string): Buffer => Buffer.from([...Buffer.from(s, 'utf8')].map((b) => b ^ 0x5a))
const unflip = (b: Buffer): string => Buffer.from([...b].map((x) => x ^ 0x5a)).toString('utf8')
let encryptionAvailable = true
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => encryptionAvailable,
    encryptString: (s: string) => flip(s),
    decryptString: (b: Buffer) => unflip(b)
  }
}))

import { initAuth, signUp, signIn, signOut, getSession, resetPassword, refreshInBackground } from './index'
import { initIdentity, getMe } from '../identity'

const USER = { id: 'sb-user-123', email: 'v@example.com', user_metadata: { display_name: 'Verified Name' } }
const SESSION = { access_token: 'at', refresh_token: 'rt', expires_at: 99, user: USER }

/** A stand-in for the supabase client: records calls, returns what each test needs. */
function stubClient(overrides: Record<string, any> = {}): { client: any; storage: any; calls: any[] } {
  const calls: any[] = []
  let storage: any = null
  const client = {
    auth: {
      signUp: vi.fn(async (a: any) => { calls.push(['signUp', a]); return { data: { user: USER, session: null }, error: null } }),
      signInWithPassword: vi.fn(async (a: any) => {
        calls.push(['signInWithPassword', a])
        storage?.setItem('k', JSON.stringify(SESSION))
        return { data: { user: USER, session: SESSION }, error: null }
      }),
      signOut: vi.fn(async () => { calls.push(['signOut']); storage?.removeItem('k'); return { error: null } }),
      resetPasswordForEmail: vi.fn(async (e: string, o: any) => { calls.push(['reset', e, o]); return { data: {}, error: null } }),
      refreshSession: vi.fn(async () => ({ data: { session: SESSION }, error: null })),
      ...overrides
    }
  }
  const factory = (_url: string, _key: string, opts: any): any => { storage = opts.auth.storage; return client }
  return { client, storage: () => storage, calls, factory } as any
}

describe('auth module', () => {
  let dir: string
  let identityDir: string
  let stub: any

  beforeEach(() => {
    encryptionAvailable = true
    dir = mkdtempSync(join(tmpdir(), 'reqarch-auth-'))
    identityDir = mkdtempSync(join(tmpdir(), 'reqarch-identity-'))
    initIdentity(identityDir)
    stub = stubClient()
    initAuth(dir, stub.factory)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    rmSync(identityDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('signUp asks for email confirmation and does not create a session', async () => {
    const result = await signUp({ email: 'v@example.com', password: 'hunter22', displayName: 'Verified Name' })
    expect(result).toEqual({ status: 'confirm-email' })
    expect(getSession()).toBeNull()
    expect(existsSync(join(dir, 'session.bin'))).toBe(false)
    const [, args] = stub.calls.find((c: any[]) => c[0] === 'signUp')
    expect(args.options.emailRedirectTo).toBe('https://koruthrejo-png.github.io/SystemEngTool/')
    expect(args.options.data.display_name).toBe('Verified Name')
  })

  it('signIn returns the user, persists an encrypted session, and updates identity', async () => {
    const user = await signIn({ email: 'v@example.com', password: 'hunter22' })
    expect(user).toEqual({ id: 'sb-user-123', email: 'v@example.com', displayName: 'Verified Name' })
    // no tokens in the returned shape
    expect(Object.keys(user).sort()).toEqual(['displayName', 'email', 'id'])
    expect(JSON.stringify(user)).not.toMatch(/access_token|refresh_token/)
    const raw = readFileSync(join(dir, 'session.bin'))
    expect(raw.toString('utf8')).not.toContain('refresh_token') // encrypted, not plaintext
    const me = getMe()!
    expect(me.displayName).toBe('Verified Name')
    expect(me.email).toBe('v@example.com')
    expect(me.externalId).toBe('sb-user-123')
    expect(me.uuid).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('getSession reads the cached user with no client call at all', async () => {
    await signIn({ email: 'v@example.com', password: 'hunter22' })
    vi.clearAllMocks()
    const cached = getSession()
    expect(cached).toEqual({ id: 'sb-user-123', email: 'v@example.com', displayName: 'Verified Name' })
    expect(stub.client.auth.refreshSession).not.toHaveBeenCalled()
    expect(stub.client.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('signOut clears the cache and externalId but keeps the uuid', async () => {
    await signIn({ email: 'v@example.com', password: 'hunter22' })
    const uuidBefore = getMe()!.uuid
    await signOut()
    expect(getSession()).toBeNull()
    expect(existsSync(join(dir, 'session.bin'))).toBe(false)
    const me = getMe()!
    expect(me.externalId).toBeNull()
    expect(me.uuid).toBe(uuidBefore)
    expect(me.displayName).toBe('Verified Name')
  })

  it('a failed refresh while offline leaves you signed in', async () => {
    await signIn({ email: 'v@example.com', password: 'hunter22' })
    stub.client.auth.refreshSession = vi.fn(async () => ({
      data: { session: null }, error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch' }
    }))
    await refreshInBackground()
    expect(getSession()).not.toBeNull()
    expect(getMe()!.externalId).toBe('sb-user-123')
  })

  it('supabase deleting the session on its own does not sign you out', async () => {
    await signIn({ email: 'v@example.com', password: 'hunter22' })
    stub.storage().removeItem('k') // supabase-js clearing storage of its own accord
    expect(getSession()).not.toBeNull()
  })

  it('a genuinely dead refresh token does clear the session', async () => {
    await signIn({ email: 'v@example.com', password: 'hunter22' })
    stub.client.auth.refreshSession = vi.fn(async () => ({
      data: { session: null }, error: { code: 'refresh_token_not_found', status: 400, message: 'Refresh Token Not Found' }
    }))
    await refreshInBackground()
    expect(getSession()).toBeNull()
    expect(getMe()!.externalId).toBeNull()
  })

  it('never writes a plaintext session when the OS keyring is unavailable', async () => {
    encryptionAvailable = false
    await signIn({ email: 'v@example.com', password: 'hunter22' })
    expect(existsSync(join(dir, 'session.bin'))).toBe(false)
    expect(getSession()).toBeNull()
  })

  it('surfaces a sign-in failure as an error', async () => {
    stub.client.auth.signInWithPassword = vi.fn(async () => ({ data: { user: null, session: null }, error: { message: 'Invalid login credentials' } }))
    await expect(signIn({ email: 'v@example.com', password: 'wrong' })).rejects.toThrow('Invalid login credentials')
  })

  it('resetPassword points the recovery email at the static page', async () => {
    await resetPassword('v@example.com')
    const [, email, opts] = stub.calls.find((c: any[]) => c[0] === 'reset')
    expect(email).toBe('v@example.com')
    expect(opts.redirectTo).toBe('https://koruthrejo-png.github.io/SystemEngTool/')
  })

  it('treats a corrupt session file as signed out rather than crashing', () => {
    writeFileSync(join(dir, 'session.bin'), Buffer.from('not a session'))
    expect(getSession()).toBeNull()
  })
})
