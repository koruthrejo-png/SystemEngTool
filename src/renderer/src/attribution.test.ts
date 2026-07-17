import { describe, it, expect } from 'vitest'
import { userName } from './attribution'
import type { User } from '../../types'

const users: User[] = [
  { id: 1, uuid: 'u-1', displayName: 'Ada', email: null, externalId: null, createdAt: '', updatedAt: '' }
]

describe('userName', () => {
  it('names a known author', () => {
    expect(userName(users, 1)).toBe('Ada')
  })

  it('shows unknown for a row that predates attribution', () => {
    expect(userName(users, null)).toBe('—')
  })

  it('shows unknown for an author missing from the roster, rather than the raw id', () => {
    expect(userName(users, 42)).toBe('—')
  })
})
