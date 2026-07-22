import { ipcMain, dialog, BrowserWindow } from 'electron'
import { writeFileSync, readFileSync } from 'fs'
import { getDatabase } from '../db/connection'
import {
  listRequirements, listRequirementsByProject, createRequirement, updateRequirement
} from './requirements'
import { listHeadings } from './headings'
import { addRequirementLink, listRequirementLinksByProject } from './requirementLinks'
import { buildSectionPath, findHeadingByPath } from '../export/model'
import type { ExportRow, ParsedRow } from '../export/model'
import { rowsToCsv, parseCsv } from '../export/csv'
import { rowsToReqif } from '../export/reqif'
import { planImport, resolveDerivedFrom } from '../export/merge'
import type { Requirement, ExportResult, ImportResult, RequirementStatus, RequirementPriority, RequirementType } from '../../types'

function winFrom(e: Electron.IpcMainInvokeEvent): BrowserWindow {
  return BrowserWindow.fromWebContents(e.sender) ?? BrowserWindow.getAllWindows()[0]
}

// Assemble the flat ExportRow[] for a module (moduleId set) or a whole project (moduleId null).
function assembleRows(projectId: number, moduleId: number | null): { rows: ExportRow[]; customKeys: string[] } {
  const db = getDatabase()
  const reqs = moduleId != null ? listRequirements(moduleId) : listRequirementsByProject(projectId)

  // module id -> name (for the whole-project `module` column)
  const modNames = new Map<number, string>(
    (db.prepare('SELECT id, name FROM modules WHERE project_id = ?').all(projectId) as any[]).map((m) => [m.id, m.name])
  )
  // heading id -> { parentId, title } across the project, for section paths
  const headById = new Map<number, { parentId: number | null; title: string }>()
  for (const mId of new Set(reqs.map((r) => r.moduleId))) {
    for (const h of listHeadings(mId)) headById.set(h.id, { parentId: h.parentId, title: h.title })
  }
  // row id -> reqId, and derivation child(rowId) -> parent reqId[]
  const reqIdByRowId = new Map<number, string>(reqs.map((r) => [r.id, r.reqId]))
  const derivedFrom = new Map<number, string[]>()
  for (const link of listRequirementLinksByProject(projectId)) {
    const child = link.childReqId, parentReqId = reqIdByRowId.get(link.parentReqId)
    if (parentReqId && reqIdByRowId.has(child)) {
      const arr = derivedFrom.get(child) ?? []
      arr.push(parentReqId)
      derivedFrom.set(child, arr)
    }
  }
  // custom fields per requirement
  const cfByReq = new Map<number, Record<string, string>>()
  const keySet = new Set<string>()
  const ids = reqs.map((r) => r.id)
  if (ids.length > 0) {
    const rows = db.prepare(
      `SELECT requirement_id, key, value FROM requirement_custom_fields WHERE requirement_id IN (${ids.map(() => '?').join(',')})`
    ).all(...ids) as any[]
    for (const cf of rows) {
      if (!cf.key) continue
      const m = cfByReq.get(cf.requirement_id) ?? {}
      m[cf.key] = cf.value ?? ''
      cfByReq.set(cf.requirement_id, m)
      keySet.add(cf.key)
    }
  }

  const rows: ExportRow[] = reqs.map((r) => ({
    reqId: r.reqId,
    module: modNames.get(r.moduleId) ?? '',
    section: buildSectionPath(r.headingId, headById),
    text: r.text,
    acceptanceCriteria: r.acceptanceCriteria ?? '',
    source: r.source ?? '',
    rationale: r.rationale ?? '',
    entryType: r.entryType,
    reqType: r.reqType,
    status: r.status,
    priority: r.priority,
    derivedFrom: derivedFrom.get(r.id) ?? [],
    custom: cfByReq.get(r.id) ?? {}
  }))
  return { rows, customKeys: [...keySet].sort() }
}

async function exportFile(
  e: Electron.IpcMainInvokeEvent, projectId: number, moduleId: number | null,
  ext: string, build: (rows: ExportRow[], keys: string[]) => string
): Promise<ExportResult | null> {
  const { rows, customKeys } = assembleRows(projectId, moduleId)
  const project = getDatabase().prepare('SELECT name FROM projects WHERE id = ?').get(projectId) as any
  const { filePath } = await dialog.showSaveDialog(winFrom(e), {
    defaultPath: `${(project?.name ?? 'requirements')}.${ext}`,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
  })
  if (!filePath) return null
  const content = ext === 'csv'
    ? build(rows, customKeys)
    : rowsToReqif(rows, customKeys, {
        projectName: project?.name ?? 'ReqArch', timestamp: new Date().toISOString(),
        identifier: `urn:reqarch:${projectId}:${Date.now()}`
      })
  writeFileSync(filePath, content, 'utf-8')
  return { path: filePath, count: rows.length }
}

// Set only the columns the file carries; blank enum cells leave the existing value.
function toUpdateInput(row: ParsedRow, headingId: number | null): Parameters<typeof updateRequirement>[1] {
  return {
    text: row.text || undefined,
    acceptanceCriteria: row.acceptanceCriteria,
    source: row.source,
    rationale: row.rationale,
    entryType: row.entryType || undefined,
    status: (row.status || undefined) as RequirementStatus | undefined,
    priority: (row.priority || undefined) as RequirementPriority | undefined,
    reqType: (row.reqType || undefined) as RequirementType | undefined,
    headingId
  }
}

async function importCsvFile(e: Electron.IpcMainInvokeEvent, moduleId: number): Promise<ImportResult | null> {
  const { filePaths } = await dialog.showOpenDialog(winFrom(e), {
    filters: [{ name: 'CSV', extensions: ['csv'] }], properties: ['openFile']
  })
  if (!filePaths[0]) return null
  const parsed = parseCsv(readFileSync(filePaths[0], 'utf-8'))
  const db = getDatabase()

  const existing = listRequirements(moduleId)
  const existingByReqId = new Map(existing.map((r) => [r.reqId, r.id]))
  const headings = listHeadings(moduleId).map((h) => ({ id: h.id, parentId: h.parentId, title: h.title }))
  const plan = planImport(parsed, existingByReqId)

  let created = 0, updated = 0
  const errors = [...plan.errors]
  const reqIdToRowId = new Map<string, number>(existing.map((r) => [r.reqId, r.id]))
  const rowByChildId: { childRowId: number; derivedFrom: string[] }[] = []

  db.transaction(() => {
    for (const action of plan.actions) {
      const headingId = findHeadingByPath(action.row.section, headings)
      // Import never creates headings (no-schema-change constraint); a section path that
      // doesn't match an existing heading is dropped — surface it rather than lose it silently.
      if (action.row.section && headingId == null) {
        errors.push(`${action.row.reqId || 'row'}: section "${action.row.section}" not found, left unsectioned`)
      }
      let req: Requirement
      if (action.kind === 'update' && action.targetId != null) {
        req = updateRequirement(action.targetId, toUpdateInput(action.row, headingId))
        updated++
      } else {
        req = createRequirement({
          moduleId, text: action.row.text,
          acceptanceCriteria: action.row.acceptanceCriteria || undefined,
          source: action.row.source || undefined,
          rationale: action.row.rationale || undefined,
          headingId
        })
        // A create ignores the file's req_id and mints a fresh one; still apply enums via update.
        req = updateRequirement(req.id, toUpdateInput({ ...action.row, text: '' }, headingId))
        created++
      }
      reqIdToRowId.set(req.reqId, req.id)
      // A create mints a fresh reqId, but derived_from cells in the file reference the file's
      // reqId, not the minted one — so register the file's reqId too (for creates and updates
      // alike). Resolve links after all rows exist.
      if (action.row.reqId) reqIdToRowId.set(action.row.reqId, req.id)
      if (action.row.derivedFrom.length) rowByChildId.push({ childRowId: req.id, derivedFrom: action.row.derivedFrom })
      // custom fields: upsert each non-empty cell for this requirement
      for (const [key, value] of Object.entries(action.row.custom)) {
        if (!value) continue
        const ts = new Date().toISOString()
        const found = db.prepare('SELECT id FROM requirement_custom_fields WHERE requirement_id = ? AND key = ?').get(req.id, key) as any
        if (found) db.prepare('UPDATE requirement_custom_fields SET value = ?, updated_at = ? WHERE id = ?').run(value, ts, found.id)
        else {
          const pos = (db.prepare('SELECT COALESCE(MAX(position), -1) AS p FROM requirement_custom_fields WHERE requirement_id = ?').get(req.id) as any).p + 1
          db.prepare('INSERT INTO requirement_custom_fields (requirement_id, key, value, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(req.id, key, value, pos, ts, ts)
        }
      }
    }
    // Second pass: derivation links, now that every reqId resolves to a row id.
    const known = new Set(reqIdToRowId.keys())
    for (const { childRowId, derivedFrom } of rowByChildId) {
      const { resolved, errors: linkErrors } = resolveDerivedFrom(derivedFrom, known)
      errors.push(...linkErrors)
      for (const parentReqId of resolved) {
        const parentRowId = reqIdToRowId.get(parentReqId)
        if (parentRowId != null && parentRowId !== childRowId) {
          try { addRequirementLink(parentRowId, childRowId) } catch (err) { errors.push(String(err instanceof Error ? err.message : err)) }
        }
      }
    }
  })()

  return { created, updated, skipped: plan.skipped, errors }
}

export function registerIoHandlers(): void {
  ipcMain.handle('io:exportCsv', (e, projectId: number, moduleId: number | null) =>
    exportFile(e, projectId, moduleId, 'csv', rowsToCsv))
  ipcMain.handle('io:exportReqif', (e, projectId: number, moduleId: number | null) =>
    exportFile(e, projectId, moduleId, 'reqif', rowsToCsv /* ignored for reqif */))
  ipcMain.handle('io:importCsv', (e, moduleId: number) => importCsvFile(e, moduleId))
}
