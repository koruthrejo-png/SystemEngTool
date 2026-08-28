import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { setMe } from '../identity'
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, AUTH_REDIRECT_URL } from './config'
import { decodeSession, shouldClearSession } from './session'
import type { AuthUser } from '../../types'

type ClientFactory = (url: string, key: string, opts: any) => SupabaseClient

let dir: string | null = null
let client: SupabaseClient | null = null

/** Closed by default. supabase-js deletes stored sessions on its own initiative, and its
 *  idea of "the token is dead" includes cases we refuse to sign out on. The cache is only
 *  ever erased through this gate, and only when WE opened it. */
let allowClear = false

function sessionFile(): string {
  if (!dir) throw new Error('Auth directory not initialised')
  return join(dir, 'session.bin')
}

function encryptionOk(): boolean {
  try { return safeStorage.isEncryptionAvailable() } catch { return false }
}

function readStored(): string | null {
  if (!dir || !existsSync(sessionFile()) || !encryptionOk()) return null
  return decodeSession(readFileSync(sessionFile()), (b) => safeStorage.decryptString(b))
}

function clearStored(): void {
  if (dir) rmSync(sessionFile(), { force: true })
}

/**
 * One session per install, so the storage key is ignored.
 * ponytail: single-file store; give it a key-indexed directory only if this app ever holds
 * more than one Supabase session at a time.
 */
const storage = {
  getItem: (_key: string): string | null => readStored(),
  setItem: (_key: string, value: string): void => {
    // No OS keyring (headless Linux): sign in each launch rather than leave a refresh token
    // in a world-readable file. A login prompt is a better outcome than a leaked token.
    if (!encryptionOk()) {
      console.warn('[auth] safeStorage unavailable — session will not be persisted on this machine')
      return
    }
    writeFileSync(sessionFile(), safeStorage.encryptString(value), { mode: 0o600 })
  },
  removeItem: (_key: string): void => { if (allowClear) clearStored() }
}

export function initAuth(userDataDir: string, factory: ClientFactory = createClient as ClientFactory): void {
  dir = userDataDir
  allowClear = false
  client = factory(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage,
      storageKey: 'reqarch-session',
      persistSession: true,
      autoRefreshToken: true,
      // There is no URL to detect a session in: this is a desktop app, and the email links
      // land on the static web page, never in here.
      detectSessionInUrl: false
    }
  })
}

function must(): SupabaseClient {
  if (!client) throw new Error('Auth not initialised')
  return client
}

function toAuthUser(u: { id: string; email?: string | null; user_metadata?: { display_name?: string } }): AuthUser {
  const email = u.email ?? ''
  return { id: u.id, email, displayName: u.user_metadata?.display_name || email.split('@')[0] || 'You' }
}

export async function signUp(input: { email: string; password: string; displayName: string }): Promise<{ status: 'confirm-email' }> {
  const { error } = await must().auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { display_name: input.displayName }, emailRedirectTo: AUTH_REDIRECT_URL }
  })
  if (error) throw new Error(error.message)
  // Confirmation is required, so there is no session yet. Sign-up is NOT sign-in.
  return { status: 'confirm-email' }
}

export async function signIn(input: { email: string; password: string }): Promise<AuthUser> {
  const { data, error } = await must().auth.signInWithPassword({ email: input.email, password: input.password })
  if (error) throw new Error(error.message)
  if (!data.user) throw new Error('Sign-in returned no user')
  const user = toAuthUser(data.user)
  // The verified name and email replace the local guess. uuid is untouched — setMe enforces it.
  setMe({ displayName: user.displayName, email: user.email, externalId: user.id })
  return user
}

export async function signOut(): Promise<void> {
  allowClear = true
  try {
    await must().auth.signOut()
  } catch {
    // A sign-out that cannot reach the server still signs you out on this machine.
  } finally {
    clearStored()
    allowClear = false
  }
  setMe({ externalId: null })
}

/**
 * The launch path. Reads the encrypted cache and returns — no network call, ever, so a
 * signed-in user on a plane still gets their app. Refresh is refreshInBackground's job.
 */
export function getSession(): AuthUser | null {
  const raw = readStored()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    const u = parsed?.user ?? parsed?.currentSession?.user
    return u ? toAuthUser(u) : null
  } catch {
    return null
  }
}

/**
 * Fire-and-forget after the window opens: renew the token if we happen to be online. The
 * ONLY place a cached session is discarded for a server reason, and only when the server
 * actually said the refresh token is dead. Offline, timeouts and 5xx leave you signed in.
 */
export async function refreshInBackground(): Promise<void> {
  if (!client || !readStored()) return
  try {
    const { error } = await client.auth.refreshSession()
    if (error && shouldClearSession(error)) {
      allowClear = true
      clearStored()
      allowClear = false
      setMe({ externalId: null })
    }
  } catch (err) {
    if (shouldClearSession(err)) {
      allowClear = true
      clearStored()
      allowClear = false
      setMe({ externalId: null })
    }
  }
}

export async function resetPassword(email: string): Promise<void> {
  const { error } = await must().auth.resetPasswordForEmail(email, { redirectTo: AUTH_REDIRECT_URL })
  if (error) throw new Error(error.message)
}
