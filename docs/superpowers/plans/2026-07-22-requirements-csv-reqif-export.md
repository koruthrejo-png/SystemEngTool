# Requirements CSV/ReqIF Export + CSV Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export requirements to CSV and ReqIF, and import requirements from CSV (create/update, merge-by-`req_id`), all over the current module or the whole project.

**Architecture:** Pure, Electron-free transform modules (`csv.ts`, `reqif.ts`, `model.ts`, `merge.ts`) plus one thin IPC handler (`io.ts`) that does dialogs, DB I/O, and calls the existing `createRequirement`/`updateRequirement`/`addRequirementLink` so attribution is stamped by main. The pure modules are the whole test surface — they import only types, so they dodge the `better-sqlite3` ABI baseline that fails `src/main/**` DB tests.

**Tech Stack:** TypeScript, Electron IPC, better-sqlite3 (reused via existing handlers only), Zustand store, React. Vitest for the pure modules.

## Global Constraints

- **v1 scope (locked by user 2026-07-21):** CSV export **and** CSV import, plus ReqIF **export**. ReqIF import and xlsx are **deferred** — do NOT add `fast-xml-parser` or any spreadsheet library. Zero new dependencies.
- **No schema migration, no new tables, no changes to existing handlers.** Import calls `createRequirement`/`updateRequirement`/`addRequirementLink` as-is.
- **Attribution rule:** the renderer never asserts an author; main stamps it. Import routes writes through the existing handler functions so the importing user becomes author/updater.
- **Import is create/update only** — never deletes requirements absent from the file.
- Store mutations use the `run()` convention (`src/renderer/src/store/index.ts:817`) so a rejected IPC surfaces as `lastError`, never an unhandled rejection.
- Keep both typechecks green: `npx tsc -p tsconfig.web.json --noEmit` and `npx tsc -p tsconfig.node.json --noEmit`.
- Enum display strings are the union constants verbatim: `REQUIREMENT_TYPES`, `REQUIREMENT_STATUSES`, `REQUIREMENT_PRIORITIES` in `src/types/index.ts`.
- Custom-field CSV columns are prefixed `cf:` so they can never collide with a core column.
- Section = heading title-path joined with ` > ` (e.g. `Power > Thermal`), `''` when a requirement has no heading.
- `derivedFrom` uses **`reqId` strings, not row ids** — the stable join key across files.

**Settled defaults (spec open questions, taken as-is):** update-on-`req_id`-match overwrites (Q2); ReqIF export is best-effort/lossy for foreign tools, lossless for our own fields (Q3); whole-project CSV is one flat file with a `module` column (Q4).

---

### Task 1: Shared model — types, XML escaping, section paths

**Files:**
- Create: `src/main/export/model.ts`
- Test: `src/main/export/model.test.ts`

**Interfaces:**
- Produces:
  - `interface ExportRow { reqId: string; module: string; section: string; text: string; acceptanceCriteria: string; source: string; rationale: string; reqType: string; status: string; priority: string; derivedFrom: string[]; custom: Record<string, string> }`
  - `interface ParsedRow { reqId: string; section: string; text: string; acceptanceCriteria: string; source: string; rationale: string; reqType: string; status: string; priority: string; derivedFrom: string[]; custom: Record<string, string> }`
  - `escapeXml(s: string): string`
  - `buildSectionPath(headingId: number | null, byId: Map<number, { parentId: number | null; title: string }>): string`
  - `findHeadingByPath(path: string, headings: { id: number; parentId: number | null; title: string }[]): number | null`

- [ ] **Step 1: Write the failing test**

```typescript
// src/main/export/model.test.ts
import { describe, it, expect } from 'vitest'
import { escapeXml, buildSectionPath, findHeadingByPath } from './model'

describe('escapeXml', () => {
  it('escapes the five XML entities', () => {
    expect(escapeXml(`a & b < c > d " e ' f`)).toBe('a &amp; b &lt; c &gt; d &quot; e &apos; f')
  })
})

describe('buildSectionPath', () => {
  const byId = new Map([
    [1, { parentId: null, title: 'Power' }],
    [2, { parentId: 1, title: 'Thermal' }]
  ])
  it('walks parents into a > path', () => {
    expect(buildSectionPath(2, byId)).toBe('Power > Thermal')
  })
  it('returns empty string for no heading', () => {
    expect(buildSectionPath(null, byId)).toBe('')
  })
})

describe('findHeadingByPath', () => {
  const headings = [
    { id: 1, parentId: null, title: 'Power' },
    { id: 2, parentId: 1, title: 'Thermal' }
  ]
  it('matches an exact title-path', () => {
    expect(findHeadingByPath('Power > Thermal', headings)).toBe(2)
  })
  it('returns null for an unknown path', () => {
    expect(findHeadingByPath('Power > Nope', headings)).toBeNull()
    expect(findHeadingByPath('', headings)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/export/model.test.ts`
Expected: FAIL — `Failed to resolve import "./model"`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/main/export/model.ts
import type { RequirementType, RequirementStatus, RequirementPriority } from '../../types'

// A flat requirement shape both CSV and ReqIF export consume. Enums are typed on the way
// out (assembled from typed rows); ParsedRow keeps them as raw strings, validated on import.
export interface ExportRow {
  reqId: string
  module: string
  section: string
  text: string
  acceptanceCriteria: string
  source: string
  rationale: string
  reqType: RequirementType
  status: RequirementStatus
  priority: RequirementPriority
  derivedFrom: string[]
  custom: Record<string, string>
}

export interface ParsedRow {
  reqId: string
  section: string
  text: string
  acceptanceCriteria: string
  source: string
  rationale: string
  reqType: string
  status: string
  priority: string
  derivedFrom: string[]
  custom: Record<string, string>
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Title-path from root to the given heading, joined ' > '. '' when headingId is null.
export function buildSectionPath(
  headingId: number | null,
  byId: Map<number, { parentId: number | null; title: string }>
): string {
  const parts: string[] = []
  let cur = headingId
  const seen = new Set<number>()
  while (cur != null && !seen.has(cur)) {
    seen.add(cur)
    const h = byId.get(cur)
    if (!h) break
    parts.unshift(h.title)
    cur = h.parentId
  }
  return parts.join(' > ')
}

// Reverse of buildSectionPath: resolve a title-path back to an existing heading id, or null.
export function findHeadingByPath(
  path: string,
  headings: { id: number; parentId: number | null; title: string }[]
): number | null {
  if (path.trim() === '') return null
  const byId = new Map(headings.map((h) => [h.id, h]))
  for (const h of headings) {
    if (buildSectionPath(h.id, byId) === path) return h.id
  }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/export/model.test.ts`
Expected: PASS (8 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/main/export/model.ts src/main/export/model.test.ts
git commit -m "feat(export): shared export model — types, escapeXml, section paths"
```

---

### Task 2: CSV writer + parser (RFC 4180)

**Files:**
- Create: `src/main/export/csv.ts`
- Test: `src/main/export/csv.test.ts`

**Interfaces:**
- Consumes: `ExportRow`, `ParsedRow` from `./model`.
- Produces:
  - `rowsToCsv(rows: ExportRow[], customKeys: string[]): string`
  - `parseCsv(text: string): ParsedRow[]`
  - `CORE_COLUMNS: readonly string[]` (exported for the handler + tests)

Fixed core column order: `req_id, module, section, text, acceptance_criteria, source, rationale, type, status, priority, derived_from`, then one `cf:<Key>` per custom key. `derived_from` cells join parent reqIds with `;`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/main/export/csv.test.ts
import { describe, it, expect } from 'vitest'
import { rowsToCsv, parseCsv } from './csv'
import type { ExportRow } from './model'

const row = (over: Partial<ExportRow> = {}): ExportRow => ({
  reqId: 'SRS-1', module: 'Sys', section: '', text: 'The system shall work',
  acceptanceCriteria: '', source: '', rationale: '', reqType: 'Functional',
  status: 'Draft', priority: 'Medium', derivedFrom: [], custom: {}, ...over
})

describe('rowsToCsv', () => {
  it('quotes fields with commas, quotes, and newlines', () => {
    const csv = rowsToCsv([row({ text: 'a,b "c"\nd' })], [])
    expect(csv).toContain('"a,b ""c""\nd"')
  })
  it('appends cf: columns as the union of custom keys', () => {
    const csv = rowsToCsv([row({ custom: { Owner: 'Jo' } })], ['Owner'])
    const [header] = csv.split('\n')
    expect(header).toContain('cf:Owner')
    expect(csv).toContain('Jo')
  })
  it('joins derived_from with ;', () => {
    const csv = rowsToCsv([row({ derivedFrom: ['SRS-2', 'SRS-3'] })], [])
    expect(csv).toContain('SRS-2;SRS-3')
  })
})

describe('parseCsv', () => {
  it('reads a quoted field with a delimiter and doubled quotes', () => {
    const rows = parseCsv('req_id,module,section,text,acceptance_criteria,source,rationale,type,status,priority,derived_from\nSRS-1,Sys,,"a,b ""c""",,,,Functional,Draft,Medium,')
    expect(rows[0].text).toBe('a,b "c"')
    expect(rows[0].reqId).toBe('SRS-1')
  })
})

describe('round-trip', () => {
  it('parseCsv(rowsToCsv(rows)) equals the logical rows', () => {
    const rows = [
      row({ reqId: 'SRS-1', section: 'Power > Thermal', derivedFrom: ['SRS-2'], custom: { Owner: 'Jo' } }),
      row({ reqId: 'SRS-2', text: 'line1\nline2', priority: 'High' })
    ]
    const parsed = parseCsv(rowsToCsv(rows, ['Owner']))
    expect(parsed[0]).toMatchObject({
      reqId: 'SRS-1', section: 'Power > Thermal', text: 'The system shall work',
      reqType: 'Functional', status: 'Draft', priority: 'Medium',
      derivedFrom: ['SRS-2'], custom: { Owner: 'Jo' }
    })
    expect(parsed[1]).toMatchObject({ reqId: 'SRS-2', text: 'line1\nline2', priority: 'High' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/export/csv.test.ts`
Expected: FAIL — `Failed to resolve import "./csv"`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/main/export/csv.ts
import type { ExportRow, ParsedRow } from './model'

export const CORE_COLUMNS = [
  'req_id', 'module', 'section', 'text', 'acceptance_criteria',
  'source', 'rationale', 'type', 'status', 'priority', 'derived_from'
] as const

function esc(v: string): string {
  // RFC 4180: quote when the value contains a comma, quote, CR, or LF; double embedded quotes.
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function rowsToCsv(rows: ExportRow[], customKeys: string[]): string {
  const header = [...CORE_COLUMNS, ...customKeys.map((k) => `cf:${k}`)]
  const lines = [header.map(esc).join(',')]
  for (const r of rows) {
    const cells = [
      r.reqId, r.module, r.section, r.text, r.acceptanceCriteria,
      r.source, r.rationale, r.reqType, r.status, r.priority, r.derivedFrom.join(';'),
      ...customKeys.map((k) => r.custom[k] ?? '')
    ]
    lines.push(cells.map(esc).join(','))
  }
  return lines.join('\n')
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
    reqType: at(cells, 'type'),
    status: at(cells, 'status'),
    priority: at(cells, 'priority'),
    derivedFrom: at(cells, 'derived_from').split(';').map((x) => x.trim()).filter(Boolean),
    custom: Object.fromEntries(
      cfKeys.map(({ key, i }) => [key, cells[i] ?? '']).filter(([, v]) => v !== '')
    )
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/export/csv.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/export/csv.ts src/main/export/csv.test.ts
git commit -m "feat(export): RFC 4180 CSV writer + parser with round-trip"
```

---

### Task 3: ReqIF export (write only)

**Files:**
- Create: `src/main/export/reqif.ts`
- Test: `src/main/export/reqif.test.ts`

**Interfaces:**
- Consumes: `ExportRow`, `escapeXml` from `./model`; `REQUIREMENT_TYPES`, `REQUIREMENT_STATUSES`, `REQUIREMENT_PRIORITIES` from `../../types`.
- Produces: `rowsToReqif(rows: ExportRow[], customKeys: string[], meta: { projectName: string; timestamp: string; identifier: string }): string`

ReqIF import is deferred (no `parseReqif`, no round-trip test). Test asserts structure and escaping only.

- [ ] **Step 1: Write the failing test**

```typescript
// src/main/export/reqif.test.ts
import { describe, it, expect } from 'vitest'
import { rowsToReqif } from './reqif'
import type { ExportRow } from './model'

const row = (over: Partial<ExportRow> = {}): ExportRow => ({
  reqId: 'SRS-1', module: 'Sys', section: '', text: 'shall',
  acceptanceCriteria: '', source: '', rationale: '', reqType: 'Functional',
  status: 'Draft', priority: 'Medium', derivedFrom: [], custom: {}, ...over
})
const meta = { projectName: 'Demo', timestamp: '2026-07-22T00:00:00.000Z', identifier: 'urn:x' }

describe('rowsToReqif', () => {
  it('emits a ReqIF envelope with the header metadata', () => {
    const xml = rowsToReqif([row()], [], meta)
    expect(xml).toContain('<REQ-IF')
    expect(xml).toContain('Demo')
    expect(xml).toContain('2026-07-22T00:00:00.000Z')
  })
  it('emits one SPEC-OBJECT per row', () => {
    const xml = rowsToReqif([row({ reqId: 'SRS-1' }), row({ reqId: 'SRS-2' })], [], meta)
    expect(xml.match(/<SPEC-OBJECT /g)?.length).toBe(2)
  })
  it('escapes XML entities in text', () => {
    const xml = rowsToReqif([row({ text: 'a < b & c' })], [], meta)
    expect(xml).toContain('a &lt; b &amp; c')
    expect(xml).not.toContain('a < b & c')
  })
  it('declares the three enumeration datatypes', () => {
    const xml = rowsToReqif([row()], [], meta)
    expect(xml.match(/<DATATYPE-DEFINITION-ENUMERATION /g)?.length).toBe(3)
  })
  it('emits one SPEC-RELATION per derivation link', () => {
    const xml = rowsToReqif([row({ reqId: 'SRS-1', derivedFrom: ['SRS-2'] }), row({ reqId: 'SRS-2' })], [], meta)
    expect(xml.match(/<SPEC-RELATION /g)?.length).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/export/reqif.test.ts`
Expected: FAIL — `Failed to resolve import "./reqif"`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/main/export/reqif.ts
import type { ExportRow } from './model'
import { escapeXml } from './model'
import { REQUIREMENT_TYPES, REQUIREMENT_STATUSES, REQUIREMENT_PRIORITIES } from '../../types'

// Stable-ish id derived from a reqId (ReqIF IDENTIFIERs must be unique within a file).
const objId = (reqId: string): string => `SPEC-OBJECT-${reqId.replace(/[^a-zA-Z0-9_-]/g, '_')}`

const STRING_ATTRS = ['reqId', 'section', 'text', 'acceptanceCriteria', 'source', 'rationale'] as const
const ENUMS: Record<string, readonly string[]> = {
  type: REQUIREMENT_TYPES, status: REQUIREMENT_STATUSES, priority: REQUIREMENT_PRIORITIES
}

function enumDatatype(name: string, values: readonly string[]): string {
  const vals = values.map((v, i) =>
    `<ENUM-VALUE IDENTIFIER="ENUMVAL-${name}-${i}" LONG-NAME="${escapeXml(v)}"><PROPERTIES><EMBEDDED-VALUE KEY="${i}" OTHER-CONTENT=""/></PROPERTIES></ENUM-VALUE>`
  ).join('')
  return `<DATATYPE-DEFINITION-ENUMERATION IDENTIFIER="DT-ENUM-${name}" LONG-NAME="${name}"><SPECIFIED-VALUES>${vals}</SPECIFIED-VALUES></DATATYPE-DEFINITION-ENUMERATION>`
}

function attrDefsString(customKeys: string[]): string {
  const defs = [...STRING_ATTRS, ...customKeys.map((k) => `cf:${k}`)]
  return defs.map((name) =>
    `<ATTRIBUTE-DEFINITION-STRING IDENTIFIER="AD-STR-${escapeXml(name)}" LONG-NAME="${escapeXml(name)}"><TYPE><DATATYPE-DEFINITION-STRING-REF>DT-STRING</DATATYPE-DEFINITION-STRING-REF></TYPE></ATTRIBUTE-DEFINITION-STRING>`
  ).join('')
}

function attrDefsEnum(): string {
  return Object.keys(ENUMS).map((name) =>
    `<ATTRIBUTE-DEFINITION-ENUMERATION IDENTIFIER="AD-ENUM-${name}" LONG-NAME="${name}" MULTI-VALUED="false"><TYPE><DATATYPE-DEFINITION-ENUMERATION-REF>DT-ENUM-${name}</DATATYPE-DEFINITION-ENUMERATION-REF></TYPE></ATTRIBUTE-DEFINITION-ENUMERATION>`
  ).join('')
}

function specObject(r: ExportRow, customKeys: string[]): string {
  const strVals = [
    ['reqId', r.reqId], ['section', r.section], ['text', r.text],
    ['acceptanceCriteria', r.acceptanceCriteria], ['source', r.source], ['rationale', r.rationale],
    ...customKeys.map((k) => [`cf:${k}`, r.custom[k] ?? ''])
  ].map(([name, val]) =>
    `<ATTRIBUTE-VALUE-STRING THE-VALUE="${escapeXml(val)}"><DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>AD-STR-${escapeXml(name)}</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION></ATTRIBUTE-VALUE-STRING>`
  ).join('')
  const enumVals = [['type', r.reqType], ['status', r.status], ['priority', r.priority]].map(([name, val]) => {
    const i = ENUMS[name].indexOf(val)
    return `<ATTRIBUTE-VALUE-ENUMERATION><DEFINITION><ATTRIBUTE-DEFINITION-ENUMERATION-REF>AD-ENUM-${name}</ATTRIBUTE-DEFINITION-ENUMERATION-REF></DEFINITION><VALUES><ENUM-VALUE-REF>ENUMVAL-${name}-${i}</ENUM-VALUE-REF></VALUES></ATTRIBUTE-VALUE-ENUMERATION>`
  }).join('')
  return `<SPEC-OBJECT IDENTIFIER="${objId(r.reqId)}" LONG-NAME="${escapeXml(r.reqId)}"><VALUES>${strVals}${enumVals}</VALUES><TYPE><SPEC-OBJECT-TYPE-REF>SOT-REQ</SPEC-OBJECT-TYPE-REF></TYPE></SPEC-OBJECT>`
}

function specRelations(rows: ExportRow[]): string {
  const known = new Set(rows.map((r) => r.reqId))
  const rels: string[] = []
  let n = 0
  for (const r of rows) {
    for (const parent of r.derivedFrom) {
      if (!known.has(parent)) continue
      rels.push(`<SPEC-RELATION IDENTIFIER="REL-${n++}"><SOURCE><SPEC-OBJECT-REF>${objId(r.reqId)}</SPEC-OBJECT-REF></SOURCE><TARGET><SPEC-OBJECT-REF>${objId(parent)}</SPEC-OBJECT-REF></TARGET><TYPE><SPEC-RELATION-TYPE-REF>SRT-DERIVE</SPEC-RELATION-TYPE-REF></TYPE></SPEC-RELATION>`)
    }
  }
  return rels.join('')
}

export function rowsToReqif(
  rows: ExportRow[],
  customKeys: string[],
  meta: { projectName: string; timestamp: string; identifier: string }
): string {
  const specHierarchy = rows.map((r, i) =>
    `<SPEC-HIERARCHY IDENTIFIER="SH-${i}"><OBJECT><SPEC-OBJECT-REF>${objId(r.reqId)}</SPEC-OBJECT-REF></OBJECT></SPEC-HIERARCHY>`
  ).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd">
<THE-HEADER><REQ-IF-HEADER IDENTIFIER="${escapeXml(meta.identifier)}"><CREATION-TIME>${escapeXml(meta.timestamp)}</CREATION-TIME><TITLE>${escapeXml(meta.projectName)}</TITLE><REQ-IF-TOOL-ID>ReqArch</REQ-IF-TOOL-ID><SOURCE-TOOL-ID>ReqArch</SOURCE-TOOL-ID><REPOSITORY-ID>${escapeXml(meta.projectName)}</REPOSITORY-ID><REQ-IF-VERSION>1.0</REQ-IF-VERSION></REQ-IF-HEADER></THE-HEADER>
<CORE-CONTENT><REQ-IF-CONTENT>
<DATATYPES>
<DATATYPE-DEFINITION-STRING IDENTIFIER="DT-STRING" LONG-NAME="String" MAX-LENGTH="32000"/>
${enumDatatype('type', REQUIREMENT_TYPES)}
${enumDatatype('status', REQUIREMENT_STATUSES)}
${enumDatatype('priority', REQUIREMENT_PRIORITIES)}
</DATATYPES>
<SPEC-TYPES>
<SPEC-OBJECT-TYPE IDENTIFIER="SOT-REQ" LONG-NAME="Requirement"><SPEC-ATTRIBUTES>${attrDefsString(customKeys)}${attrDefsEnum()}</SPEC-ATTRIBUTES></SPEC-OBJECT-TYPE>
<SPEC-RELATION-TYPE IDENTIFIER="SRT-DERIVE" LONG-NAME="Derives"/>
</SPEC-TYPES>
<SPEC-OBJECTS>${rows.map((r) => specObject(r, customKeys)).join('')}</SPEC-OBJECTS>
<SPEC-RELATIONS>${specRelations(rows)}</SPEC-RELATIONS>
<SPECIFICATIONS><SPECIFICATION IDENTIFIER="SPEC-1" LONG-NAME="${escapeXml(meta.projectName)}"><CHILDREN>${specHierarchy}</CHILDREN></SPECIFICATION></SPECIFICATIONS>
</REQ-IF-CONTENT></CORE-CONTENT>
</REQ-IF>`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/export/reqif.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/export/reqif.ts src/main/export/reqif.test.ts
git commit -m "feat(export): ReqIF export writer (best-effort, our fields lossless)"
```

---

### Task 4: Import merge decision (pure)

**Files:**
- Create: `src/main/export/merge.ts`
- Test: `src/main/export/merge.test.ts`

**Interfaces:**
- Consumes: `ParsedRow` from `./model`; `REQUIREMENT_TYPES`, `REQUIREMENT_STATUSES`, `REQUIREMENT_PRIORITIES` from `../../types`.
- Produces:
  - `interface ImportAction { kind: 'create' | 'update'; targetId: number | null; row: ParsedRow }`
  - `interface ImportPlan { actions: ImportAction[]; errors: string[]; skipped: number }`
  - `planImport(rows: ParsedRow[], existingByReqId: Map<string, number>): ImportPlan`
  - `resolveDerivedFrom(derivedFrom: string[], knownReqIds: Set<string>): { resolved: string[]; errors: string[] }`

Rules (from spec §Import conflict/merge): match `req_id` in target → update; no/blank match → create (requires non-empty `text`); invalid enum or missing text on create → skip + error. Enum cells are validated only when non-empty (blank = leave existing on update).

- [ ] **Step 1: Write the failing test**

```typescript
// src/main/export/merge.test.ts
import { describe, it, expect } from 'vitest'
import { planImport, resolveDerivedFrom } from './merge'
import type { ParsedRow } from './model'

const p = (over: Partial<ParsedRow> = {}): ParsedRow => ({
  reqId: '', section: '', text: 'shall', acceptanceCriteria: '', source: '', rationale: '',
  reqType: '', status: '', priority: '', derivedFrom: [], custom: {}, ...over
})

describe('planImport', () => {
  it('updates when req_id matches an existing requirement', () => {
    const plan = planImport([p({ reqId: 'SRS-1', text: 'new' })], new Map([['SRS-1', 42]]))
    expect(plan.actions).toEqual([{ kind: 'update', targetId: 42, row: expect.objectContaining({ reqId: 'SRS-1' }) }])
  })
  it('creates when req_id is blank or unmatched', () => {
    const plan = planImport([p({ reqId: '' }), p({ reqId: 'SRS-9' })], new Map())
    expect(plan.actions.map((a) => a.kind)).toEqual(['create', 'create'])
    expect(plan.actions[0].targetId).toBeNull()
  })
  it('skips a create with empty text and reports it', () => {
    const plan = planImport([p({ reqId: '', text: '' })], new Map())
    expect(plan.actions).toHaveLength(0)
    expect(plan.skipped).toBe(1)
    expect(plan.errors[0]).toMatch(/text/i)
  })
  it('skips a row with an invalid enum and reports it', () => {
    const plan = planImport([p({ reqId: 'SRS-1', status: 'Bogus' })], new Map([['SRS-1', 1]]))
    expect(plan.actions).toHaveLength(0)
    expect(plan.skipped).toBe(1)
    expect(plan.errors[0]).toMatch(/status/i)
  })
})

describe('resolveDerivedFrom', () => {
  it('separates known parents from reported unknowns', () => {
    const { resolved, errors } = resolveDerivedFrom(['SRS-2', 'SRS-X'], new Set(['SRS-2']))
    expect(resolved).toEqual(['SRS-2'])
    expect(errors[0]).toMatch(/SRS-X/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/export/merge.test.ts`
Expected: FAIL — `Failed to resolve import "./merge"`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/main/export/merge.ts
import type { ParsedRow } from './model'
import { REQUIREMENT_TYPES, REQUIREMENT_STATUSES, REQUIREMENT_PRIORITIES } from '../../types'

export interface ImportAction { kind: 'create' | 'update'; targetId: number | null; row: ParsedRow }
export interface ImportPlan { actions: ImportAction[]; errors: string[]; skipped: number }

const ENUM_SETS: { field: keyof ParsedRow; label: string; values: readonly string[] }[] = [
  { field: 'reqType', label: 'type', values: REQUIREMENT_TYPES },
  { field: 'status', label: 'status', values: REQUIREMENT_STATUSES },
  { field: 'priority', label: 'priority', values: REQUIREMENT_PRIORITIES }
]

export function planImport(rows: ParsedRow[], existingByReqId: Map<string, number>): ImportPlan {
  const actions: ImportAction[] = []
  const errors: string[] = []
  let skipped = 0
  rows.forEach((row, i) => {
    const label = row.reqId || `row ${i + 1}`
    // Non-empty enum cells must be valid union values (blank = leave existing on update).
    const bad = ENUM_SETS.find((e) => {
      const v = row[e.field] as string
      return v !== '' && !e.values.includes(v)
    })
    if (bad) {
      errors.push(`${label}: invalid ${bad.label} "${row[bad.field]}"`)
      skipped++
      return
    }
    const targetId = row.reqId ? existingByReqId.get(row.reqId) ?? null : null
    if (targetId != null) {
      actions.push({ kind: 'update', targetId, row })
      return
    }
    if (row.text.trim() === '') {
      errors.push(`${label}: missing text, cannot create`)
      skipped++
      return
    }
    actions.push({ kind: 'create', targetId: null, row })
  })
  return { actions, errors, skipped }
}

export function resolveDerivedFrom(
  derivedFrom: string[],
  knownReqIds: Set<string>
): { resolved: string[]; errors: string[] } {
  const resolved: string[] = []
  const errors: string[] = []
  for (const parent of derivedFrom) {
    if (knownReqIds.has(parent)) resolved.push(parent)
    else errors.push(`unknown derived_from "${parent}"`)
  }
  return { resolved, errors }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/export/merge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/export/merge.ts src/main/export/merge.test.ts
git commit -m "feat(export): pure import merge planner + derivation resolver"
```

---

### Task 5: IPC handler + types + preload + registration

**Files:**
- Create: `src/main/handlers/io.ts`
- Modify: `src/types/index.ts` (append `ExportResult`, `ImportResult`)
- Modify: `src/main/index.ts:20` (import) and `:61` (call `registerIoHandlers()`)
- Modify: `src/preload/index.ts` (add `io` bridge + type import)
- Modify: `src/types/api.d.ts` (add `io` block + type imports)

**Interfaces:**
- Consumes: everything from Tasks 1–4; `listRequirements`/`listRequirementsByProject`/`createRequirement`/`updateRequirement` (`../handlers/requirements`); `listHeadings` (`../handlers/headings`); `addRequirementLink`/`listRequirementLinksByProject` (`../handlers/requirementLinks`); `getDatabase` (`../db/connection`).
- Produces:
  - IPC `io:exportCsv(projectId, moduleId|null)`, `io:exportReqif(projectId, moduleId|null)`, `io:importCsv(moduleId)`.
  - `window.api.io.exportCsv/exportReqif/importCsv`.
  - `ExportResult { path: string; count: number }`, `ImportResult { created: number; updated: number; skipped: number; errors: string[] }`.

No unit test — the handler touches Electron `dialog`/`fs` and the real DB (ABI baseline). Verified by typecheck (this task) and live-verify (Task 8). The decision logic it calls is already unit-tested in Tasks 1–4.

- [ ] **Step 1: Append the result types**

In `src/types/index.ts`, add at the end of the file:

```typescript
export interface ExportResult { path: string; count: number }
export interface ImportResult { created: number; updated: number; skipped: number; errors: string[] }
```

- [ ] **Step 2: Write the handler**

```typescript
// src/main/handlers/io.ts
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
      // A create's minted reqId differs from the file's, so links key off the file's reqId
      // for existing rows and the freshly minted one for creates. Resolve after all rows exist.
      if (action.kind === 'update' && action.row.reqId) reqIdToRowId.set(action.row.reqId, req.id)
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
```

- [ ] **Step 3: Register the handler**

In `src/main/index.ts`, add the import after line 19 (`import { registerUserHandlers } from './handlers/users'`):

```typescript
import { registerIoHandlers } from './handlers/io'
```

And add the call after `registerLayerHandlers()` (line ~61):

```typescript
  registerIoHandlers()
```

- [ ] **Step 4: Add the preload bridge**

In `src/preload/index.ts`, add `ExportResult, ImportResult` to the type import block (line 2–18), then add this bridge after the `search` block (before the closing `})` at line 141):

```typescript
  ,
  io: {
    exportCsv: (projectId: number, moduleId: number | null): Promise<ExportResult | null> => ipcRenderer.invoke('io:exportCsv', projectId, moduleId),
    exportReqif: (projectId: number, moduleId: number | null): Promise<ExportResult | null> => ipcRenderer.invoke('io:exportReqif', projectId, moduleId),
    importCsv: (moduleId: number): Promise<ImportResult | null> => ipcRenderer.invoke('io:importCsv', moduleId)
  }
```

- [ ] **Step 5: Add the api.d.ts declaration**

In `src/types/api.d.ts`, add `ExportResult, ImportResult` to the import block (line 1–17), then add after the `search` block (line ~140):

```typescript
      io: {
        exportCsv(projectId: number, moduleId: number | null): Promise<ExportResult | null>
        exportReqif(projectId: number, moduleId: number | null): Promise<ExportResult | null>
        importCsv(moduleId: number): Promise<ImportResult | null>
      }
```

- [ ] **Step 6: Typecheck both projects**

Run: `npx tsc -p tsconfig.node.json --noEmit && npx tsc -p tsconfig.web.json --noEmit`
Expected: no output (clean).

- [ ] **Step 7: Commit**

```bash
git add src/main/handlers/io.ts src/main/index.ts src/preload/index.ts src/types/index.ts src/types/api.d.ts
git commit -m "feat(export): io handler — CSV/ReqIF export + CSV import IPC"
```

---

### Task 6: Store actions

**Files:**
- Modify: `src/renderer/src/store/index.ts` (interface block ~line 178, action impls ~line 300, near requirement actions)
- Test: `src/renderer/src/store/io.test.ts`

**Interfaces:**
- Consumes: `window.api.io.*`, `window.api.requirements.list`, the `run()` wrapper.
- Produces store actions:
  - `exportCsv(moduleId: number | null): Promise<void>`
  - `exportReqif(moduleId: number | null): Promise<void>`
  - `importCsv(moduleId: number): Promise<void>`

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/src/store/io.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStore } from './index'

describe('importCsv', () => {
  beforeEach(() => {
    useStore.setState({ project: { id: 7 } as any, selectedModuleId: 3, requirements: [], lastError: null })
  })
  it('re-syncs the module list after a successful import and reports skipped rows', async () => {
    const list = vi.fn().mockResolvedValue([{ id: 1 } as any])
    ;(globalThis as any).window = { api: {
      io: { importCsv: vi.fn().mockResolvedValue({ created: 2, updated: 1, skipped: 1, errors: ['bad'] }) },
      requirements: { list }
    } }
    await useStore.getState().importCsv(3)
    expect(list).toHaveBeenCalledWith(3)
    expect(useStore.getState().requirements).toHaveLength(1)
    expect(useStore.getState().lastError).toMatch(/skipped/i)
  })
  it('does nothing on a cancelled dialog (null result)', async () => {
    const list = vi.fn()
    ;(globalThis as any).window = { api: {
      io: { importCsv: vi.fn().mockResolvedValue(null) }, requirements: { list }
    } }
    await useStore.getState().importCsv(3)
    expect(list).not.toHaveBeenCalled()
  })
})

describe('exportCsv', () => {
  it('calls the io bridge with the project id and module scope', async () => {
    const exportCsv = vi.fn().mockResolvedValue({ path: '/x.csv', count: 3 })
    ;(globalThis as any).window = { api: { io: { exportCsv } } }
    useStore.setState({ project: { id: 7 } as any })
    await useStore.getState().exportCsv(null)
    expect(exportCsv).toHaveBeenCalledWith(7, null)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/store/io.test.ts`
Expected: FAIL — `exportCsv is not a function` / `importCsv is not a function`.

- [ ] **Step 3: Add the interface declarations**

In `src/renderer/src/store/index.ts`, in the `Store` interface (after `updateElementType` ~line 178, or near the requirement actions block), add:

```typescript
  exportCsv: (moduleId: number | null) => Promise<void>
  exportReqif: (moduleId: number | null) => Promise<void>
  importCsv: (moduleId: number) => Promise<void>
```

- [ ] **Step 4: Add the action implementations**

In the store body, near the other requirement actions (after `restoreRequirement`, ~line 315), add:

```typescript
  exportCsv: (moduleId) => run(async () => {
    const { project } = get(); if (!project) return
    await window.api.io.exportCsv(project.id, moduleId)
  }),
  exportReqif: (moduleId) => run(async () => {
    const { project } = get(); if (!project) return
    await window.api.io.exportReqif(project.id, moduleId)
  }),
  importCsv: (moduleId) => run(async () => {
    const res = await window.api.io.importCsv(moduleId)
    if (!res) return
    set({ requirements: await window.api.requirements.list(moduleId) })
    if (res.errors.length || res.skipped) {
      set({ lastError: `Imported ${res.created} new, ${res.updated} updated, ${res.skipped} skipped` })
    }
  }),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/store/io.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/store/index.ts src/renderer/src/store/io.test.ts
git commit -m "feat(export): store actions exportCsv/exportReqif/importCsv via run()"
```

---

### Task 7: Toolbar UI — Export ▾ + Import CSV

**Files:**
- Modify: `src/renderer/src/components/RequirementsList/index.tsx` (toolbar `!showDeleted` group, line ~355; store destructure line ~116; `HeaderMenu` is already imported/used in this file)

**Interfaces:**
- Consumes: store `exportCsv`, `exportReqif`, `importCsv`, `selectedModuleId`; existing `HeaderMenu`, `Button`.

Import is CSV-only in v1 → a plain `Import CSV` button, not a dropdown (no ReqIF import to disambiguate). Export ▾ offers the four scope×format combos.

- [ ] **Step 1: Add the store selectors**

In the `useStore` destructure block (~line 116), add `exportCsv, exportReqif, importCsv` to the pulled actions.

- [ ] **Step 2: Add the toolbar buttons**

In the `!showDeleted` toolbar group (line ~355), insert before `+ Heading`:

```tsx
              <HeaderMenu
                align="right"
                trigger={
                  <span className="flex items-center gap-1 text-xs text-ink-faint hover:text-ink px-2">
                    Export <span className="text-[10px]">▾</span>
                  </span>
                }
              >
                {(close) => (
                  <div className="py-1 text-sm text-ink whitespace-nowrap">
                    {([
                      ['Current module (CSV)', () => exportCsv(selectedModuleId)],
                      ['Whole project (CSV)', () => exportCsv(null)],
                      ['Current module (ReqIF)', () => exportReqif(selectedModuleId)],
                      ['Whole project (ReqIF)', () => exportReqif(null)]
                    ] as const).map(([label, fn]) => (
                      <button
                        key={label}
                        className="block w-full text-left px-3 py-1.5 hover:bg-workspace"
                        onClick={() => { fn(); close() }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </HeaderMenu>
              <Button variant="secondary" onClick={() => importCsv(selectedModuleId!)}>Import CSV</Button>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -p tsconfig.web.json --noEmit`
Expected: clean.

- [ ] **Step 4: Run the renderer suite (no regressions)**

Run: `npx vitest run src/renderer/src/components/RequirementsList`
Expected: PASS (existing tests unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/RequirementsList/index.tsx
git commit -m "feat(export): Export ▾ menu + Import CSV button in requirements toolbar"
```

---

### Task 8: Full gate + live-verify + docs

**Files:**
- Modify: `handoff.md` (add a session section), `docs/superpowers/specs/2026-07-02-ui-overhaul-design.md` (§6: mark items 32/33 partial — CSV done, ReqIF export done, ReqIF import deferred)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: all pass, higher count than the 423 baseline (new pure tests added; no failures).

- [ ] **Step 2: Both typechecks**

Run: `npx tsc -p tsconfig.node.json --noEmit && npx tsc -p tsconfig.web.json --noEmit`
Expected: clean.

- [ ] **Step 3: Build**

Run: `npx electron-vite build`
Expected: main/preload/renderer all `✓ built`.

- [ ] **Step 4: Live-verify (Playwright driver against a real project)**

Using `.claude/skills/run-app/driver.mjs` (launch the built app on a dev project, e.g. `thermal`):
1. Select a module. Export ▾ → `Current module (CSV)`; save; read the file back — assert header row + one line per requirement, enums are display strings, custom-field `cf:` columns present.
2. Export ▾ → `Whole project (CSV)` — assert a `module` column populated and reqs from >1 module.
3. Export ▾ → `Current module (ReqIF)` — assert the file contains `<REQ-IF`, one `<SPEC-OBJECT` per req, and the three `<DATATYPE-DEFINITION-ENUMERATION`.
4. Edit one row's `text` in the exported CSV, add a new blank-`req_id` row with valid enums, then Import CSV that file into the same module — assert the edited req updated (not duplicated), one new req created with a freshly minted `req_id`, and the toolbar item-count grew by exactly one.
5. Import a CSV with an invalid `status` and an unknown `derived_from` — assert the row with the bad status is skipped (item count unchanged for it) and the `lastError` banner shows the skipped summary; the good rows still import.
   Restore the project to baseline afterward (soft-delete any test reqs created, revert edited text).

- [ ] **Step 5: Update docs**

Add a `## Session 2026-07-22 — CSV/ReqIF export + CSV import (items 32/33 phase 1)` section to `handoff.md` describing: what shipped, the deferred ReqIF import + xlsx, the pure-module test surface, and any live-verify residue. In §6 of the UI-overhaul spec, annotate items 32/33 as phase-1 done (CSV both ways + ReqIF export; ReqIF import + xlsx = follow-up).

- [ ] **Step 6: Commit**

```bash
git add handoff.md docs/superpowers/specs/2026-07-02-ui-overhaul-design.md
git commit -m "docs: handoff + backlog — items 32/33 phase 1 (CSV/ReqIF export, CSV import)"
```

---

## Self-Review notes

- **Spec coverage:** CSV export ✓ (T2), CSV import ✓ (T4/T5), ReqIF export ✓ (T3); ReqIF import + xlsx explicitly deferred per locked scope. Normalized `ExportRow` ✓ (T1). IPC namespace `io` ✓ (T5, minus `importReqif`). Merge rules ✓ (T4/T5). Store `run()` ✓ (T6). Toolbar ✓ (T7). Section derivation ✓ (T1). Custom-field `cf:` columns ✓ (T2/T5). Derivation two-pass ✓ (T5). One-transaction import ✓ (T5).
- **Deviation from spec, intended:** whole-project export adds a `module` column (spec Q4 default). Import always targets one `moduleId`. `importReqif` omitted (deferred).
- **Type consistency:** `ExportRow`/`ParsedRow`/`ImportPlan`/`ImportResult`/`ExportResult` used identically across T1–T7. Handler `toUpdateInput` returns the real `UpdateRequirementInput` shape (fields verified against `src/types/index.ts:128`).
- **Known simplification (`ponytail:`):** on create, the handler makes the row then immediately calls `updateRequirement` to stamp enums (create input has no enum fields — verified `CreateRequirementInput` at `src/types/index.ts:117`). Two writes per created row; acceptable for an import path, and it keeps `createRequirement` untouched.
