/** Pure session rules. No Electron, no network, no fs — so they run in the normal suite. */

const DEAD_TOKEN = /invalid[ _]refresh[ _]token|refresh[ _]token[ _]not[ _]found/i

/**
 * Is this error the server actually telling us the refresh token is dead?
 *
 * Only two things ever clear a cached session: an explicit sign-out, and a `true` from
 * here. Everything else — offline, DNS failure, timeout, 5xx, anything unrecognised —
 * leaves the user signed in, because a desktop document editor that ejects you from your
 * own local files on a plane is a broken document editor.
 */
export function shouldClearSession(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: unknown; message?: unknown; status?: unknown; name?: unknown }
  // A fetch that never reached the server can never prove a token dead.
  if (e.name === 'AuthRetryableFetchError' || e.name === 'TypeError') return false
  // A server fault is not a verdict on our credentials.
  if (typeof e.status === 'number' && e.status >= 500) return false
  const text = `${typeof e.code === 'string' ? e.code : ''} ${typeof e.message === 'string' ? e.message : ''}`
  return DEAD_TOKEN.test(text)
}

/**
 * Read a stored session blob back to its JSON text, or null. `decrypt` is injected so this
 * stays free of Electron's safeStorage. Anything unreadable — truncated file, rotated OS
 * key, a copy from another machine — is "no session", never a throw: a corrupt cache must
 * cost you a login, not the launch.
 */
export function decodeSession(buf: Buffer | null, decrypt: (b: Buffer) => string): string | null {
  if (!buf || buf.length === 0) return null
  try {
    const text = decrypt(buf)
    JSON.parse(text) // supabase stores JSON; unparseable means garbage, not a session
    return text
  } catch {
    return null
  }
}
