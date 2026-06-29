import { ipcMain, app, dialog } from 'electron'
import { openDatabase, getDatabase } from '../db/connection'
import { initSettings, getLastProjectPath, setLastProjectPath } from '../settings'
import type { Project } from '../../types'

function now(): string { return new Date().toISOString() }

function rowToProject(row: any): Project {
  return {
    id: row.id,
    name: row.name,
    elemIdPrefix: row.elem_id_prefix ?? 'SYS',
    elemIdPadding: row.elem_id_padding ?? 3,
    elemNextCounter: row.elem_next_counter ?? 1,
    connIdPrefix: row.conn_id_prefix ?? 'ICN',
    connIdPadding: row.conn_id_padding ?? 4,
    connNextCounter: row.conn_next_counter ?? 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function createProject(name: string): Project {
  const db = getDatabase()
  const ts = now()
  const result = db
    .prepare('INSERT INTO projects (name, created_at, updated_at) VALUES (?, ?, ?)')
    .run(name, ts, ts)
  return {
    id: result.lastInsertRowid as number,
    name,
    elemIdPrefix: 'SYS',
    elemIdPadding: 3,
    elemNextCounter: 1,
    connIdPrefix: 'ICN',
    connIdPadding: 4,
    connNextCounter: 1,
    createdAt: ts,
    updatedAt: ts
  }
}

export function getFirstProject(): Project | null {
  const row = getDatabase().prepare('SELECT * FROM projects ORDER BY id LIMIT 1').get() as any
  return row ? rowToProject(row) : null
}

export function registerProjectHandlers(): void {
  initSettings(app.getPath('userData'))

  ipcMain.handle('project:create', async (_e, name: string) => {
    const { filePath } = await dialog.showSaveDialog({
      defaultPath: `${name}.reqarch`,
      filters: [{ name: 'ReqArch Project', extensions: ['reqarch'] }]
    })
    if (!filePath) return null
    openDatabase(filePath)
    const project = createProject(name)
    setLastProjectPath(filePath)
    return project
  })

  ipcMain.handle('project:open', async () => {
    const { filePaths } = await dialog.showOpenDialog({
      filters: [{ name: 'ReqArch Project', extensions: ['reqarch'] }],
      properties: ['openFile']
    })
    if (!filePaths[0]) return null
    openDatabase(filePaths[0])
    setLastProjectPath(filePaths[0])
    return getFirstProject()
  })

  ipcMain.handle('project:getCurrent', async () => {
    const lastPath = getLastProjectPath()
    if (!lastPath) return null
    try { openDatabase(lastPath); return getFirstProject() } catch { return null }
  })
}
