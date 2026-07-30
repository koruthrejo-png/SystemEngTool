# Interface / Connection Table CSV Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export the Interface Register (one row per architecture connection) to a CSV file, reusing the existing item-32 pure export layer.

**Architecture:** A pure, Electron-free module (`src/main/export/interfacesCsv.ts`) builds `InterfaceExportRow`s from connections + elements + connection types + connection custom fields and serializes them with the shared RFC-4180 CSV writer. A thin `io:exportInterfacesCsv(projectId)` handler gathers project-scoped data, runs the native save dialog, and writes. A toolbar button + store action drive it. Export-only; no import, no ReqIF.

**Tech Stack:** TypeScript, Electron (main IPC + `dialog`/`fs`), better-sqlite3, React renderer, Zustand store, Vitest.

## Global Constraints

- **Export-only.** No CSV import of interfaces, no ReqIF, no xlsx. (spec Non-goals)
- **Export ALL data columns, ignore the register's column-visibility toggles** (localStorage `reqarch.interfaceRegister.columns.v1`). An export is a data dump. (spec "Key decision")
- **Header order:** `interface_id, from, to, name, type, description, cf:<Key>…`. Endpoint columns (`from`/`to`) are element `blockId`s. (spec Architecture)
- **Soft-deleted connections excluded** — guaranteed by `listConnections(projectId)` (`WHERE … deleted_at IS NULL`).
- **Custom-field columns:** one `cf:<Key>` per distinct non-blank connection custom-field key, stable order (first appearance). Connections missing a key → empty cell.
- **Reuse, do not duplicate:** the RFC-4180 escaping already in `src/main/export/csv.ts`; `listConnections`/`listElements`/`listConnectionTypes` in `src/main/handlers/`; the `run()`/`lastError` store convention; the `dialog.showSaveDialog` + `writeFileSync` pattern in `io.ts`.
- **Default filename:** `<projectName> - Interfaces.csv`.
- **Test baseline:** full suite 515 pass / 1 pre-existing `App.test.tsx` fail. Don't regress it.

---

### Task 1: Pure interfaces CSV module

**Files:**
- Modify: `src/main/export/csv.ts` (export a generic matrix serializer, refactor `rowsToCsv` to use it — behavior unchanged)
- Create: `src/main/export/interfacesCsv.ts`
- Test: `src/main/export/interfacesCsv.test.ts`

**Interfaces:**
- Consumes: `ArchitectureConnection`, `ArchitectureElement`, `ConnectionType`, `ConnectionCustomField` from `src/types`; `toCsv` from `./csv`.
- Produces:
  - `interface InterfaceExportRow { interfaceId: string; from: string; to: string; name: string; type: string; description: string; custom: Record<string, string> }`
  - `buildInterfaceExportRows(connections: ArchitectureConnection[], elements: ArchitectureElement[], connectionTypes: ConnectionType[], customFields: ConnectionCustomField[]): { rows: InterfaceExportRow[]; customKeys: string[] }`
  - `interfaceRowsToCsv(rows: InterfaceExportRow[], customKeys: string[]): string`
  - `toCsv(matrix: string[][]): string` (newly exported from `csv.ts`)

- [ ] **Step 1: Export a shared matrix serializer from `csv.ts`.** The escaping helper `esc` already exists there (used by `rowsToCsv`). Add, right after `esc` is defined:

```typescript
/** Serialize a matrix (first row = header) to RFC-4180 CSV. Rows joined by \n. */
export function toCsv(matrix: string[][]): string {
  return matrix.map((row) => row.map(esc).join(',')).join('\n')
}
```

Then refactor the existing `rowsToCsv` body to build a matrix and delegate, so there is ONE serializer (behavior identical):

```typescript
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
```

- [ ] **Step 2: Verify existing CSV tests still pass (refactor is behavior-preserving).**

Run: `npx vitest run src/main/export/csv.test.ts`
Expected: PASS (same count as before).

- [ ] **Step 3: Write the failing test** `src/main/export/interfacesCsv.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildInterfaceExportRows, interfaceRowsToCsv } from './interfacesCsv'

const el = (id: number, blockId: string, name = '') => ({ id, blockId, name } as any)
const conn = (o: Partial<any>) => ({
  id: 1, connId: 'IF-001', sourceId: 10, targetId: 20, connectionTypeId: null,
  architectureId: null, name: '', description: '', deletedAt: null, ...o
} as any)

describe('buildInterfaceExportRows', () => {
  it('maps a connection to interface_id + from/to blockIds + name/type/description', () => {
    const rows = buildInterfaceExportRows(
      [conn({ connId: 'IF-001', sourceId: 10, targetId: 20, name: 'Power bus', description: '28V', connectionTypeId: 5 })],
      [el(10, 'SYS-001'), el(20, 'SYS-002')],
      [{ id: 5, name: 'Electrical' } as any],
      []
    )
    expect(rows.rows[0]).toMatchObject({
      interfaceId: 'IF-001', from: 'SYS-001', to: 'SYS-002',
      name: 'Power bus', type: 'Electrical', description: '28V'
    })
  })

  it('adds a cf:<Key> column per distinct custom-field key (stable order); missing → empty', () => {
    const rows = buildInterfaceExportRows(
      [conn({ id: 1 }), conn({ id: 2, connId: 'IF-002' })],
      [el(10, 'SYS-001'), el(20, 'SYS-002')],
      [],
      [
        { id: 1, connectionId: 1, key: 'Protocol', value: 'CAN' } as any,
        { id: 2, connectionId: 1, key: 'Rate', value: '1Mbps' } as any,
        { id: 3, connectionId: 2, key: 'Protocol', value: 'SPI' } as any,
        { id: 4, connectionId: 2, key: '', value: 'ignored-blank-key' } as any
      ]
    )
    expect(rows.customKeys).toEqual(['Protocol', 'Rate'])
    expect(rows.rows[0].custom).toEqual({ Protocol: 'CAN', Rate: '1Mbps' })
    expect(rows.rows[1].custom).toEqual({ Protocol: 'SPI' })
  })
})

describe('interfaceRowsToCsv', () => {
  it('writes the header in spec order and one row per interface, RFC-4180 escaped', () => {
    const { rows, customKeys } = buildInterfaceExportRows(
      [conn({ connId: 'IF-001', name: 'A, B', description: 'has "quote"' })],
      [el(10, 'SYS-001'), el(20, 'SYS-002')],
      [],
      [{ id: 1, connectionId: 1, key: 'Protocol', value: 'CAN' } as any]
    )
    const csv = interfaceRowsToCsv(rows, customKeys)
    const lines = csv.split('\n')
    expect(lines[0]).toBe('interface_id,from,to,name,type,description,cf:Protocol')
    // comma + quote fields are quoted/escaped
    expect(lines[1]).toBe('IF-001,SYS-001,SYS-002,"A, B","has ""quote""",,CAN')
  })
})
```

- [ ] **Step 4: Run the test to confirm it fails.**

Run: `npx vitest run src/main/export/interfacesCsv.test.ts`
Expected: FAIL ("Cannot find module './interfacesCsv'").

- [ ] **Step 5: Implement** `src/main/export/interfacesCsv.ts`:

```typescript
import type {
  ArchitectureConnection, ArchitectureElement, ConnectionType, ConnectionCustomField
} from '../../types'
import { toCsv } from './csv'

export interface InterfaceExportRow {
  interfaceId: string
  from: string
  to: string
  name: string
  type: string
  description: string
  custom: Record<string, string>
}

export function buildInterfaceExportRows(
  connections: ArchitectureConnection[],
  elements: ArchitectureElement[],
  connectionTypes: ConnectionType[],
  customFields: ConnectionCustomField[]
): { rows: InterfaceExportRow[]; customKeys: string[] } {
  const blockById = new Map(elements.map((el) => [el.id, el.blockId]))
  const typeById = new Map(connectionTypes.map((t) => [t.id, t.name]))

  const fieldsByConn = new Map<number, ConnectionCustomField[]>()
  const customKeys: string[] = []
  for (const f of customFields) {
    if (f.key.trim() === '') continue
    if (!customKeys.includes(f.key)) customKeys.push(f.key)
    const arr = fieldsByConn.get(f.connectionId) ?? []
    arr.push(f)
    fieldsByConn.set(f.connectionId, arr)
  }

  const rows = connections.map((c) => {
    const custom: Record<string, string> = {}
    for (const f of fieldsByConn.get(c.id) ?? []) custom[f.key] = f.value
    return {
      interfaceId: c.connId,
      from: blockById.get(c.sourceId) ?? '',
      to: blockById.get(c.targetId) ?? '',
      name: c.name ?? '',
      type: (c.connectionTypeId != null ? typeById.get(c.connectionTypeId) : '') ?? '',
      description: c.description ?? '',
      custom
    }
  })
  return { rows, customKeys }
}

const HEADER = ['interface_id', 'from', 'to', 'name', 'type', 'description'] as const

export function interfaceRowsToCsv(rows: InterfaceExportRow[], customKeys: string[]): string {
  const header = [...HEADER, ...customKeys.map((k) => `cf:${k}`)]
  const matrix = [header]
  for (const r of rows) {
    matrix.push([
      r.interfaceId, r.from, r.to, r.name, r.type, r.description,
      ...customKeys.map((k) => r.custom[k] ?? '')
    ])
  }
  return toCsv(matrix)
}
```

- [ ] **Step 6: Run the tests to confirm they pass.**

Run: `npx vitest run src/main/export/interfacesCsv.test.ts src/main/export/csv.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add src/main/export/csv.ts src/main/export/interfacesCsv.ts src/main/export/interfacesCsv.test.ts
git commit -m "feat(export): pure interface-CSV builder + shared toCsv serializer"
```

---

### Task 2: Main handler + custom-fields list extraction

**Files:**
- Modify: `src/main/handlers/connectionCustomFields.ts` (extract a reusable list-by-project function; rewire its IPC handler to call it)
- Modify: `src/main/handlers/io.ts` (new handler + registration)

**Interfaces:**
- Consumes: `listConnections`, `listElements`, `listConnectionTypes`, the new `listConnectionCustomFieldsByProject`, and `buildInterfaceExportRows`/`interfaceRowsToCsv` from Task 1.
- Produces: IPC channel `io:exportInterfacesCsv(projectId: number) → Promise<ExportResult | null>`; exported `listConnectionCustomFieldsByProject(projectId: number): ConnectionCustomField[]`.

- [ ] **Step 1: Extract the list-by-project query** in `connectionCustomFields.ts`. Add above `registerConnectionCustomFieldHandlers`:

```typescript
export function listConnectionCustomFieldsByProject(projectId: number): ConnectionCustomField[] {
  return (getDatabase()
    .prepare(`
      SELECT ccf.* FROM connection_custom_fields ccf
      JOIN architecture_connections ac ON ac.id = ccf.connection_id
      WHERE ac.project_id = ? AND ac.deleted_at IS NULL
      ORDER BY ccf.connection_id, ccf.position, ccf.id
    `)
    .all(projectId) as any[]).map(rowToField)
}
```

Then replace the body of the existing `connectionCustomFields:listByProject` IPC handler so it delegates (DRY — one query):

```typescript
  ipcMain.handle('connectionCustomFields:listByProject', (_e, projectId: number) =>
    listConnectionCustomFieldsByProject(projectId))
```

- [ ] **Step 2: Add the handler + registration** in `io.ts`. Add these imports to the existing import block:

```typescript
import { listConnections } from './connections'
import { listElements } from './elements'
import { listConnectionTypes } from './connectionTypes'
import { listConnectionCustomFieldsByProject } from './connectionCustomFields'
import { buildInterfaceExportRows, interfaceRowsToCsv } from '../export/interfacesCsv'
```

Add the handler function (near `exportFile`):

```typescript
async function exportInterfacesCsvFile(
  e: Electron.IpcMainInvokeEvent, projectId: number
): Promise<ExportResult | null> {
  const { rows, customKeys } = buildInterfaceExportRows(
    listConnections(projectId),
    listElements(projectId),
    listConnectionTypes(projectId),
    listConnectionCustomFieldsByProject(projectId)
  )
  const project = getDatabase().prepare('SELECT name FROM projects WHERE id = ?').get(projectId) as any
  const { filePath } = await dialog.showSaveDialog(winFrom(e), {
    defaultPath: `${project?.name ?? 'interfaces'} - Interfaces.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  })
  if (!filePath) return null
  writeFileSync(filePath, interfaceRowsToCsv(rows, customKeys), 'utf-8')
  return { path: filePath, count: rows.length }
}
```

Register it inside `registerIoHandlers()`:

```typescript
  ipcMain.handle('io:exportInterfacesCsv', (e, projectId: number) =>
    exportInterfacesCsvFile(e, projectId))
```

- [ ] **Step 3: Typecheck (main config).**

Run: `npm run typecheck:node`
Expected: PASS (no errors).

- [ ] **Step 4: Confirm the custom-fields tests (if any) + full main typecheck still pass.**

Run: `npx vitest run src/main/export`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/main/handlers/connectionCustomFields.ts src/main/handlers/io.ts
git commit -m "feat(export): io:exportInterfacesCsv handler + reusable conn-custom-field lister"
```

---

### Task 3: Preload bridge + api type + store action

**Files:**
- Modify: `src/preload/index.ts` (add `io.exportInterfacesCsv`)
- Modify: `src/types/api.d.ts` (declare it on the `io` block)
- Modify: `src/renderer/src/store/index.ts` (state type + action)

**Interfaces:**
- Consumes: IPC `io:exportInterfacesCsv` from Task 2.
- Produces: `window.api.io.exportInterfacesCsv(projectId: number): Promise<ExportResult | null>`; store action `exportInterfacesCsv(): Promise<void>`.

- [ ] **Step 1: Preload.** In `src/preload/index.ts`, inside the `io: { … }` object (next to `exportReqif`):

```typescript
    exportInterfacesCsv: (projectId: number): Promise<ExportResult | null> => ipcRenderer.invoke('io:exportInterfacesCsv', projectId),
```

- [ ] **Step 2: api type.** In `src/types/api.d.ts`, in the `io` block (next to `exportReqif(...)`), add:

```typescript
    exportInterfacesCsv(projectId: number): Promise<ExportResult | null>
```

- [ ] **Step 3: Store.** In `src/renderer/src/store/index.ts`, add to the `Store` interface (next to `exportReqif`):

```typescript
  exportInterfacesCsv: () => Promise<void>
```

And the action (next to `exportCsv`/`exportReqif`), mirroring their `run()` shape:

```typescript
  exportInterfacesCsv: () => run(async () => {
    const { project } = get(); if (!project) return
    await window.api.io.exportInterfacesCsv(project.id)
  }),
```

- [ ] **Step 4: Typecheck both configs.**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/preload/index.ts src/types/api.d.ts src/renderer/src/store/index.ts
git commit -m "feat(export): wire exportInterfacesCsv through preload/api/store"
```

---

### Task 4: Interface Register toolbar button

**Files:**
- Modify: `src/renderer/src/components/InterfaceRegister/index.tsx` (Export CSV button)
- Test: `src/renderer/src/components/InterfaceRegister/index.test.tsx` (create if absent, else add a case)

**Interfaces:**
- Consumes: store `exportInterfacesCsv` from Task 3.
- Produces: an "Export CSV" toolbar button that calls it.

- [ ] **Step 1: Write the failing test.** In `InterfaceRegister/index.test.tsx`, add a test that renders the register and asserts clicking "Export CSV" calls the store action. Follow the existing `RequirementsList/index.test.tsx` mock pattern (`vi.mock('../../store', () => ({ useStore: () => storeState }))`, `storeState` assigned in `beforeEach`). Minimal case:

```typescript
it('Export CSV button calls exportInterfacesCsv', async () => {
  render(<InterfaceRegister />)
  await userEvent.click(screen.getByText('Export CSV'))
  expect(storeState.exportInterfacesCsv).toHaveBeenCalledTimes(1)
})
```

Ensure `storeState` in `beforeEach` includes `exportInterfacesCsv: vi.fn()` plus whatever fields the component already reads (connections, elements, connectionTypes, projectConnectionCustomFields, architectures, project — mirror the component's `useStore()` destructure; empty arrays are fine).

- [ ] **Step 2: Run the test to confirm it fails.**

Run: `npx vitest run src/renderer/src/components/InterfaceRegister`
Expected: FAIL ("Unable to find an element with the text: Export CSV").

- [ ] **Step 3: Implement.** In `InterfaceRegister/index.tsx`: pull `exportInterfacesCsv` from `useStore()` (the component already does `const { … } = useStore() as any`), and add the button just before the Columns button (`~line 57`):

```tsx
          <Button variant="secondary" onClick={() => exportInterfacesCsv()}>Export CSV</Button>
```

- [ ] **Step 4: Run the test to confirm it passes.**

Run: `npx vitest run src/renderer/src/components/InterfaceRegister`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/renderer/src/components/InterfaceRegister/index.tsx src/renderer/src/components/InterfaceRegister/index.test.tsx
git commit -m "feat(export): Export CSV button in Interface Register toolbar"
```

---

### Task 5: Gate, live-verify, docs

**Files:**
- Modify: `handoff.md`, `docs/superpowers/specs/2026-07-28-interface-table-export-design.md` (mark built), `.superpowers/sdd/progress.md` (ledger entry)

- [ ] **Step 1: Full gate.**

Run: `npm run typecheck && npx vitest run && npx electron-vite build`
Expected: typecheck clean; suite = prior pass count + the new interface tests, still exactly **1** failure (pre-existing `App.test.tsx`); 3-target build clean.

- [ ] **Step 2: Live-verify** (native save dialog blocks the driver, so stub it in main). One-shot Playwright `_electron` script against the running dev app (`ELECTRON_RENDERER_URL=http://localhost:5173/`), real `SmokeTest.reqarch`:
  - Stub the dialog in main: `app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: '/tmp/interfaces-verify.csv' }) })`.
  - Open the Interfaces tab, click **Export CSV**.
  - Read `/tmp/interfaces-verify.csv`: header is `interface_id,from,to,name,type,description[,cf:…]`; one row per non-deleted connection; `from`/`to` are element blockIds; a connection custom field appears under its `cf:<Key>` column.
  - Confirm hiding a column in the register does NOT change the exported columns (export-all invariant).

- [ ] **Step 3: Docs.** Mark item 42 built in the spec header and `docs/superpowers/specs/2026-07-02-ui-overhaul-design.md` §6 backlog; add a ledger section to `.superpowers/sdd/progress.md`; add a session entry + refresh the TL;DR in `handoff.md`.

- [ ] **Step 4: Commit.**

```bash
git add -A
git commit -m "docs: item 42 interface CSV export complete + live-verified"
```

---

## Notes for the executor

- **Endpoint columns are blockIds**, not element names — `from`/`to` map `sourceId`/`targetId` through `elements[].blockId`, matching the register's From/To.
- **The architecture display column is intentionally omitted** from the export (spec) — only `interface_id, from, to, name, type, description` + custom fields.
- **No import path.** Do not add an `io:importInterfacesCsv` channel or any parse code.
- **Do not touch `reqif.ts`/`merge.ts`** — interfaces are CSV-only.
