import { describe, it, expect } from 'vitest'
import { shouldClearSession, decodeSession } from './session'

describe('shouldClearSession — the offline rule', () => {
  it('clears when the server says the refresh token is dead', () => {
    expect(shouldClearSession({ code: 'refresh_token_not_found', status: 400 })).toBe(true)
    expect(shouldClearSession({ message: 'Invalid Refresh Token: Already Used', status: 401 })).toBe(true)
  })

  it('does NOT clear when the request never reached the server', () => {
    expect(shouldClearSession({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' })).toBe(false)
    expect(shouldClearSession(new TypeError('Failed to fetch'))).toBe(false)
    expect(shouldClearSession({ message: 'ETIMEDOUT' })).toBe(false)
    expect(shouldClearSession({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND' })).toBe(false)
  })

  it('does NOT clear on a server fault or an unrecognised error', () => {
    expect(shouldClearSession({ status: 500, message: 'internal error' })).toBe(false)
    expect(shouldClearSession({ status: 503, message: 'invalid_refresh_token' })).toBe(false)
    expect(shouldClearSession({ message: 'something else went wrong' })).toBe(false)
    expect(shouldClearSession(null)).toBe(false)
    expect(shouldClearSession('boom')).toBe(false)
  })
})

describe('decodeSession', () => {
  const ok = (b: Buffer): string => b.toString('utf8')
  const boom = (): string => { throw new Error('decrypt failed') }

  it('round-trips a stored session', () => {
    const json = JSON.stringify({ access_token: 'a', user: { id: 'u1' } })
    expect(decodeSession(Buffer.from(json, 'utf8'), ok)).toBe(json)
  })

  it('returns null rather than throwing for an absent, empty, corrupt or undecryptable blob', () => {
    expect(decodeSession(null, ok)).toBeNull()
    expect(decodeSession(Buffer.alloc(0), ok)).toBeNull()
    expect(decodeSession(Buffer.from('{"access_to', 'utf8'), ok)).toBeNull()
    expect(decodeSession(Buffer.from('anything', 'utf8'), boom)).toBeNull()
  })
})
