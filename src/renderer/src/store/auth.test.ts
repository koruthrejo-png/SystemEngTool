import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStore } from './index'

const USER = { id: 'sb-user-123', email: 'v@example.com', displayName: 'Verified Name' }

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({ session: null, signUpPending: false, sessionLoaded: false, lastError: null })
  ;(window as any).api = {
    ...(window as any).api,
    auth: {
      getSession: vi.fn().mockResolvedValue(USER),
      signIn: vi.fn().mockResolvedValue(USER),
      signUp: vi.fn().mockResolvedValue({ status: 'confirm-email' }),
      signOut: vi.fn().mockResolvedValue(undefined),
      resetPassword: vi.fn().mockResolvedValue(undefined)
    },
    users: { me: vi.fn().mockResolvedValue(null), list: vi.fn().mockResolvedValue([]) }
  }
})

describe('auth store slice', () => {
  it('loadSession fills the session and flips sessionLoaded', async () => {
    await useStore.getState().loadSession()
    expect(useStore.getState().session).toEqual(USER)
    expect(useStore.getState().sessionLoaded).toBe(true)
  })

  it('loadSession still flips sessionLoaded when there is no session', async () => {
    ;(window as any).api.auth.getSession = vi.fn().mockResolvedValue(null)
    await useStore.getState().loadSession()
    expect(useStore.getState().session).toBeNull()
    expect(useStore.getState().sessionLoaded).toBe(true)
  })

  it('signIn sets the session', async () => {
    await useStore.getState().signIn({ email: 'v@example.com', password: 'hunter22' })
    expect(useStore.getState().session).toEqual(USER)
    expect(useStore.getState().lastError).toBeNull()
  })

  it('a failed signIn surfaces via lastError and leaves you signed out', async () => {
    ;(window as any).api.auth.signIn = vi.fn().mockRejectedValue(new Error('Invalid login credentials'))
    await useStore.getState().signIn({ email: 'v@example.com', password: 'wrong' })
    expect(useStore.getState().session).toBeNull()
    expect(useStore.getState().lastError).toBe('Invalid login credentials')
  })

  it('signUp does NOT sign you in — it sets signUpPending', async () => {
    await useStore.getState().signUp({ email: 'v@example.com', password: 'hunter22', displayName: 'Verified Name' })
    expect(useStore.getState().session).toBeNull()
    expect(useStore.getState().signUpPending).toBe(true)
  })

  it('signOut clears the session', async () => {
    await useStore.getState().signIn({ email: 'v@example.com', password: 'hunter22' })
    await useStore.getState().signOut()
    expect(useStore.getState().session).toBeNull()
  })
})
