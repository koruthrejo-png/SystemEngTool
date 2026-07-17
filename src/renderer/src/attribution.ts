import type { User } from '../../types'

/**
 * Name for an author id, for display only.
 *
 * A null id means the row predates attribution — genuinely unknown, not "nobody". An id
 * with no roster match means the same thing from the other direction (a file whose roster
 * lost the row). Both render as "—": showing an id, or guessing, would assert something
 * about who edited a requirement that we cannot actually support.
 */
export function userName(users: User[], id: number | null): string {
  if (id === null) return '—'
  return users.find((u) => u.id === id)?.displayName ?? '—'
}
