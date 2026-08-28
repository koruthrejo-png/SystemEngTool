import { describe, it, expect, beforeEach, vi } from 'vitest'

const handlers = new Map<string, (...a: any[]) => any>()
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, fn: any) => handlers.set(channel, fn) }
}))

// vi.hoisted, because vi.mock is hoisted above this declaration and its factory
// dereferences the object immediately — a plain const would still be in its TDZ.
const authModule = vi.hoisted(() => ({
  signUp: vi.fn(async () => ({ status: 'confirm-email' as const })),
  signIn: vi.fn(async () => ({ id: 'sb-user-123', email: 'v@example.com', displayName: 'Verified Name' })),
  signOut: vi.fn(async () => undefined),
  getSession: vi.fn(() => ({ id: 'sb-user-123', email: 'v@example.com', displayName: 'Verified Name' })),
  resetPassword: vi.fn(async () => undefined)
}))
vi.mock('../auth', () => authModule)

import { registerAuthHandlers } from './auth'

describe('auth IPC', () => {
  beforeEach(() => {
    handlers.clear()
    vi.clearAllMocks()
    registerAuthHandlers()
  })

  it('registers exactly the five auth channels', () => {
    expect([...handlers.keys()].sort()).toEqual(
      ['auth:getSession', 'auth:resetPassword', 'auth:signIn', 'auth:signOut', 'auth:signUp']
    )
  })

  it('passes credentials through and returns shapes with no tokens in them', async () => {
    const signedUp = await handlers.get('auth:signUp')!({}, { email: 'v@example.com', password: 'hunter22', displayName: 'Verified Name' })
    expect(signedUp).toEqual({ status: 'confirm-email' })

    const signedIn = await handlers.get('auth:signIn')!({}, { email: 'v@example.com', password: 'hunter22' })
    expect(signedIn).toEqual({ id: 'sb-user-123', email: 'v@example.com', displayName: 'Verified Name' })

    const cached = await handlers.get('auth:getSession')!({})
    for (const shape of [signedUp, signedIn, cached]) {
      expect(JSON.stringify(shape)).not.toMatch(/access_token|refresh_token/)
    }
    expect(authModule.signIn).toHaveBeenCalledWith({ email: 'v@example.com', password: 'hunter22' })
  })

  it('forwards signOut and resetPassword', async () => {
    await handlers.get('auth:signOut')!({})
    expect(authModule.signOut).toHaveBeenCalled()
    await handlers.get('auth:resetPassword')!({}, 'v@example.com')
    expect(authModule.resetPassword).toHaveBeenCalledWith('v@example.com')
  })
})
