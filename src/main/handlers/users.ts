import { ipcMain } from 'electron'
import { getDatabase, hasDatabase } from '../db/connection'
import { getMe, setMe, currentUserRowId } from '../identity'
import type { User, LocalIdentity, UpdateMeInput } from '../../types'

function rowToUser(row: any): User {
  return {
    id: row.id, uuid: row.uuid, displayName: row.display_name,
    email: row.email ?? null, externalId: row.external_id ?? null,
    createdAt: row.created_at, updatedAt: row.updated_at
  }
}

/** The roster of this project: everyone who has edited the open file. */
export function listUsers(): User[] {
  return (getDatabase().prepare('SELECT * FROM users ORDER BY display_name, id').all() as any[]).map(rowToUser)
}

export function updateMe(input: UpdateMeInput): LocalIdentity {
  const me = setMe(input)
  // Push the new name straight into the open file's roster, so People reflects the
  // rename immediately rather than waiting for the next edit to upsert it.
  if (hasDatabase()) currentUserRowId(getDatabase())
  return me
}

export function registerUserHandlers(): void {
  ipcMain.handle('users:me', () => getMe())
  ipcMain.handle('users:setMe', (_e, input: UpdateMeInput) => updateMe(input))
  ipcMain.handle('users:list', () => listUsers())
}
