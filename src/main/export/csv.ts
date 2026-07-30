import type { ExportRow, ParsedRow } from './model'

export const CORE_COLUMNS = [
  'req_id', 'module', 'section', 'text', 'acceptance_criteria',
  'source', 'rationale', 'entry_type', 'type', 'status', 'priority', 'verification_status', 'verification_method', 'derived_from'
] as const

function esc(v: string): string {
  // RFC 4180: quote when the value contains a comma, quote, CR, or LF; double embedded quotes.
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/** Serialize a matrix (first row = header) to RFC-4180 CSV. Rows joined by \n. */
export function toCsv(matrix: string[][]): string {
  return matrix.map((row) => row.map(esc).join(',')).join('\n')
}

export function rowsToCsv(rows: ExportRow[], customKeys: string[]): string {
  const header = [...CORE_COLUMNS, ...customKeys.map((k) => `cf:${k}`)]
  const matrix = [header]
  for (const r of rows) {
    matrix.push([
      r.reqId, r.module, r.section, r.text, r.acceptanceCriteria,
      r.source, r.rationale, r.entryType, r.reqType, r.status, r.priority, r.verificationStatus, r.verificationMethod, r.derivedFrom.join(';'),
      ...customKeys.map((k) => r.custom[k] ?? '')
    ])
  }
  return toCsv(matrix)
}

// RFC 4180 parser: handles quoted fields with embedded commas/quotes/newlines and CRLF.
function parseRows(text: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false
  let i = 0
  const s = text
  while (i < s.length) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      field += c; i++; continue
    }
    if (c === '"') { inQuotes = true; i++; continue }
    if (c === ',') { record.push(field); field = ''; i++; continue }
    if (c === '\r') { i++; continue }
    if (c === '\n') { record.push(field); rows.push(record); record = []; field = ''; i++; continue }
    field += c; i++
  }
  // flush trailing field/record unless the input ended on a clean newline
  if (field !== '' || record.length > 0) { record.push(field); rows.push(record) }
  return rows
}

export function parseCsv(text: string): ParsedRow[] {
  const grid = parseRows(text)
  if (grid.length === 0) return []
  const header = grid[0]
  const idx = (name: string): number => header.indexOf(name)
  const cfKeys = header
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.startsWith('cf:'))
    .map(({ h, i }) => ({ key: h.slice(3), i }))
  const at = (cells: string[], name: string): string => {
    const j = idx(name)
    return j >= 0 ? (cells[j] ?? '') : ''
  }
  return grid.slice(1).filter((cells) => cells.some((c) => c !== '')).map((cells) => ({
    reqId: at(cells, 'req_id'),
    section: at(cells, 'section'),
    text: at(cells, 'text'),
    acceptanceCriteria: at(cells, 'acceptance_criteria'),
    source: at(cells, 'source'),
    rationale: at(cells, 'rationale'),
    entryType: at(cells, 'entry_type'),
    reqType: at(cells, 'type'),
    status: at(cells, 'status'),
    priority: at(cells, 'priority'),
    verificationStatus: at(cells, 'verification_status'),
    verificationMethod: at(cells, 'verification_method'),
    derivedFrom: at(cells, 'derived_from').split(';').map((x) => x.trim()).filter(Boolean),
    custom: Object.fromEntries(
      cfKeys.map(({ key, i }) => [key, cells[i] ?? '']).filter(([, v]) => v !== '')
    )
  }))
}
