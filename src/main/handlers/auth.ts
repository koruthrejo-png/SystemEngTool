import { ipcMain } from 'electron'
import { signUp, signIn, signOut, getSession, resetPassword } from '../auth'
import type { AuthUser } from '../../types'

/** Thin pass-through, matching handlers/app.ts. Every return shape here is token-free by
 *  construction — the auth module never hands one out. */
export function registerAuthHandlers(): void {
  ipcMain.handle('auth:signUp', (_e, input: { email: string; password: string; displayName: string }) => signUp(input))
  ipcMain.handle('auth:signIn', (_e, input: { email: string; password: string }): Promise<AuthUser> => signIn(input))
  ipcMain.handle('auth:signOut', () => signOut())
  ipcMain.handle('auth:getSession', (): AuthUser | null => getSession())
  ipcMain.handle('auth:resetPassword', (_e, email: string) => resetPassword(email))
}
