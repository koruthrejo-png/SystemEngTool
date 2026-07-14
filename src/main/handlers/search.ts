import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import { rowToRequirement } from './requirements'
import { rowToModule } from './modules'
import { rowToHeading } from './headings'
import type { SearchResults } from '../../types'

// % and _ are LIKE wildcards; escape them (and the escape char itself) so user input matches literally.
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => '\\' + c)
}

export function searchProject(projectId: number, term: string): SearchResults {
  const trimmed = term.trim()
  if (trimmed === '') return { requirements: [], modules: [], headings: [] }
  const db = getDatabase()
  const like = `%${escapeLike(trimmed)}%`

  const requirements = (db.prepare(`
    SELECT r.* FROM requirements r
    JOIN modules m ON m.id = r.module_id
    WHERE m.project_id = ? AND r.deleted_at IS NULL AND m.deleted_at IS NULL
      AND (r.req_id LIKE ? ESCAPE '\\' OR r.text LIKE ? ESCAPE '\\'
        OR r.source LIKE ? ESCAPE '\\' OR r.rationale LIKE ? ESCAPE '\\')
    ORDER BY r.req_id LIMIT 10
  `).all(projectId, like, like, like, like) as any[]).map(rowToRequirement)

  const modules = (db.prepare(`
    SELECT * FROM modules
    WHERE project_id = ? AND deleted_at IS NULL AND kind = 'module' AND name LIKE ? ESCAPE '\\'
    ORDER BY name LIMIT 10
  `).all(projectId, like) as any[]).map(rowToModule)

  const headings = (db.prepare(`
    SELECT h.* FROM req_headings h
    JOIN modules m ON m.id = h.module_id
    WHERE m.project_id = ? AND h.deleted_at IS NULL AND m.deleted_at IS NULL
      AND h.title LIKE ? ESCAPE '\\'
    ORDER BY h.title LIMIT 10
  `).all(projectId, like) as any[]).map(rowToHeading)

  return { requirements, modules, headings }
}

export function registerSearchHandlers(): void {
  ipcMain.handle('search:query', (_e, projectId: number, term: string) => searchProject(projectId, term))
}
