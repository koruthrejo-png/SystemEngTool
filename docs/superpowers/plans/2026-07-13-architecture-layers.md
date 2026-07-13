# Architecture Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-architecture visibility layers — a user creates named layers on an architecture, assigns blocks/connectors to them, and cycles each layer Visible → Faded → Hidden to carve custom views of one diagram.

**Architecture:** New `layers` table (per architecture, with a `state` column) + `element_layers` / `connection_layers` many-to-many link tables (mirror `element_requirement_links`). A pure helper resolves each object's effective visibility (no-layer = always visible; any Visible layer = normal; else any Faded = faded; else hidden). Connectors auto-constrain to the strictest of their own visibility and both endpoints. A floating React Flow `<Panel position="top-right">` lists layers with a 3-state dot; the properties drawer gets a LAYERS checkbox section for assignment.

**Tech Stack:** Electron + React + TS + Zustand + Tailwind (semantic tokens) + better-sqlite3 + @xyflow/react. Layers scope to the already-shipped `architectures` model.

## Global Constraints

- `layers` state (visible/faded/hidden) lives in the **DB** (a `state` column), not localStorage — decided with the user.
- No backfill / no "Default" layer — absence of any layer link means the object is base content (always visible).
- Layers belong to one architecture; they load/scope by `activeArchitectureId`, reload on architecture switch.
- Assignment UX: **checkboxes in the properties drawer** (ElementPanel / ConnectionPanel). No canvas multi-select.
- Layers panel: **floating `<Panel position="top-right">`** on the canvas, matching `CanvasControls`.
- `src/main/**` vitest fails on the known better-sqlite3 ABI mismatch — ACCEPTED baseline. This plan's gate is the renderer/pure-helper vitest, which DOES run.
- Never use `npm run`. Use `./node_modules/.bin/*` (`tsc`, `vitest`, `electron-vite`). `node` is on PATH; if a binary needs it: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"`.
- Both typechecks: `./node_modules/.bin/tsc -p tsconfig.web.json --noEmit && ./node_modules/.bin/tsc -p tsconfig.node.json --noEmit`
- Renderer test: `./node_modules/.bin/vitest run <path>`
- Token classes: sidebars/cards `border-line bg-white`, caps labels via the `SectionLabel` primitive from `../ui`, active tint `bg-action-tint/40 border-action/40`.
- Backlog items 18–20 (DnD reqs into section, multi-level subheadings, `+ Object` toolbar rework) are ALREADY recorded in `docs/superpowers/specs/2026-07-02-ui-overhaul-design.md` §6 — not part of this plan.
- Commit after each task with a `feat(arch):` / `test(arch):` message.

---

### Task 1: Backend — tables, handler, preload, types

**Files:**
- Modify: `src/main/db/migrations.ts`
- Create: `src/main/handlers/layers.ts`
- Modify: `src/main/index.ts`, `src/preload/index.ts`, `src/types/api.d.ts`, `src/types/index.ts`

**Interfaces:**
- Produces (types): `LAYER_STATES`, `LayerState`, `Layer`, `ElementLayerLink`, `ConnectionLayerLink`, `LayerAssignments`.
- Produces (`window.api.layers`): `list(architectureId)`, `create(architectureId, name)`, `rename(id, name)`, `setState(id, state)`, `delete(id)`, `assignments(architectureId)`, `assignElement(elementId, layerId)`, `unassignElement(elementId, layerId)`, `assignConnection(connectionId, layerId)`, `unassignConnection(connectionId, layerId)`.

- [ ] **Step 1: Add the tables**

In `src/main/db/migrations.ts`, inside the big `db.exec(\`...\`)` block, next to the other `CREATE TABLE IF NOT EXISTS` blocks (e.g. after `connection_requirement_links` ~line 110), add:

```sql
    CREATE TABLE IF NOT EXISTS layers (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      architecture_id INTEGER NOT NULL REFERENCES architectures(id),
      name            TEXT    NOT NULL,
      state           TEXT    NOT NULL DEFAULT 'visible',
      position        INTEGER NOT NULL DEFAULT 0,
      deleted_at      TEXT,
      created_at      TEXT    NOT NULL,
      updated_at      TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS element_layers (
      element_id INTEGER NOT NULL REFERENCES architecture_elements(id),
      layer_id   INTEGER NOT NULL REFERENCES layers(id),
      PRIMARY KEY (element_id, layer_id)
    );

    CREATE TABLE IF NOT EXISTS connection_layers (
      connection_id INTEGER NOT NULL REFERENCES architecture_connections(id),
      layer_id      INTEGER NOT NULL REFERENCES layers(id),
      PRIMARY KEY (connection_id, layer_id)
    );
```

No `addColumnIfMissing`, no backfill.

- [ ] **Step 2: Add the types**

In `src/types/index.ts`, after the `ElementRequirementLink` interface (~line 269) and near `AC_STATUSES` for the const, add:

```typescript
export const LAYER_STATES = ['visible', 'faded', 'hidden'] as const
export type LayerState = (typeof LAYER_STATES)[number]

export interface Layer {
  id: number
  architectureId: number
  name: string
  state: LayerState
  position: number
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ElementLayerLink { elementId: number; layerId: number }
export interface ConnectionLayerLink { connectionId: number; layerId: number }
export interface LayerAssignments {
  elementLayers: ElementLayerLink[]
  connectionLayers: ConnectionLayerLink[]
}
```

- [ ] **Step 3: Write the handler**

Create `src/main/handlers/layers.ts` (mirrors `architectures.ts` + `elementLinks.ts`):

```typescript
import { ipcMain } from 'electron'
import { getDatabase } from '../db/connection'
import type { Layer, LayerState, LayerAssignments } from '../../types'

function now(): string { return new Date().toISOString() }

function rowToLayer(row: any): Layer {
  return {
    id: row.id, architectureId: row.architecture_id, name: row.name, state: row.state as LayerState,
    position: row.position, deletedAt: row.deleted_at ?? null, createdAt: row.created_at, updatedAt: row.updated_at
  }
}

export function listLayers(architectureId: number): Layer[] {
  const db = getDatabase()
  return (db.prepare('SELECT * FROM layers WHERE architecture_id = ? AND deleted_at IS NULL ORDER BY position, id').all(architectureId) as any[]).map(rowToLayer)
}

export function createLayer(architectureId: number, name: string): Layer {
  const db = getDatabase()
  const ts = now()
  const row = db.prepare('SELECT COALESCE(MAX(position), -1) as mp FROM layers WHERE architecture_id = ? AND deleted_at IS NULL').get(architectureId) as any
  const r = db.prepare('INSERT INTO layers (architecture_id, name, state, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(architectureId, name, 'visible', (row.mp as number) + 1, ts, ts)
  return rowToLayer(db.prepare('SELECT * FROM layers WHERE id = ?').get(r.lastInsertRowid))
}

export function renameLayer(id: number, name: string): Layer {
  const db = getDatabase()
  db.prepare('UPDATE layers SET name = ?, updated_at = ? WHERE id = ?').run(name, now(), id)
  return rowToLayer(db.prepare('SELECT * FROM layers WHERE id = ?').get(id))
}

export function setLayerState(id: number, state: LayerState): Layer {
  const db = getDatabase()
  db.prepare('UPDATE layers SET state = ?, updated_at = ? WHERE id = ?').run(state, now(), id)
  return rowToLayer(db.prepare('SELECT * FROM layers WHERE id = ?').get(id))
}

export function deleteLayer(id: number): void {
  const db = getDatabase()
  const ts = now()
  db.transaction(() => {
    db.prepare('DELETE FROM element_layers WHERE layer_id = ?').run(id)
    db.prepare('DELETE FROM connection_layers WHERE layer_id = ?').run(id)
    db.prepare('UPDATE layers SET deleted_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, id)
  })()
}

export function getAssignments(architectureId: number): LayerAssignments {
  const db = getDatabase()
  const elementLayers = (db.prepare(
    `SELECT el.element_id, el.layer_id FROM element_layers el
     JOIN layers l ON l.id = el.layer_id
     WHERE l.architecture_id = ? AND l.deleted_at IS NULL`
  ).all(architectureId) as any[]).map((r) => ({ elementId: r.element_id, layerId: r.layer_id }))
  const connectionLayers = (db.prepare(
    `SELECT cl.connection_id, cl.layer_id FROM connection_layers cl
     JOIN layers l ON l.id = cl.layer_id
     WHERE l.architecture_id = ? AND l.deleted_at IS NULL`
  ).all(architectureId) as any[]).map((r) => ({ connectionId: r.connection_id, layerId: r.layer_id }))
  return { elementLayers, connectionLayers }
}

export function assignElementLayer(elementId: number, layerId: number): void {
  getDatabase().prepare('INSERT OR IGNORE INTO element_layers (element_id, layer_id) VALUES (?, ?)').run(elementId, layerId)
}
export function unassignElementLayer(elementId: number, layerId: number): void {
  getDatabase().prepare('DELETE FROM element_layers WHERE element_id = ? AND layer_id = ?').run(elementId, layerId)
}
export function assignConnectionLayer(connectionId: number, layerId: number): void {
  getDatabase().prepare('INSERT OR IGNORE INTO connection_layers (connection_id, layer_id) VALUES (?, ?)').run(connectionId, layerId)
}
export function unassignConnectionLayer(connectionId: number, layerId: number): void {
  getDatabase().prepare('DELETE FROM connection_layers WHERE connection_id = ? AND layer_id = ?').run(connectionId, layerId)
}

export function registerLayerHandlers(): void {
  ipcMain.handle('layers:list', (_e, architectureId: number) => listLayers(architectureId))
  ipcMain.handle('layers:create', (_e, architectureId: number, name: string) => createLayer(architectureId, name))
  ipcMain.handle('layers:rename', (_e, id: number, name: string) => renameLayer(id, name))
  ipcMain.handle('layers:setState', (_e, id: number, state: LayerState) => setLayerState(id, state))
  ipcMain.handle('layers:delete', (_e, id: number) => deleteLayer(id))
  ipcMain.handle('layers:assignments', (_e, architectureId: number) => getAssignments(architectureId))
  ipcMain.handle('layers:assignElement', (_e, elementId: number, layerId: number) => assignElementLayer(elementId, layerId))
  ipcMain.handle('layers:unassignElement', (_e, elementId: number, layerId: number) => unassignElementLayer(elementId, layerId))
  ipcMain.handle('layers:assignConnection', (_e, connectionId: number, layerId: number) => assignConnectionLayer(connectionId, layerId))
  ipcMain.handle('layers:unassignConnection', (_e, connectionId: number, layerId: number) => unassignConnectionLayer(connectionId, layerId))
}
```

- [ ] **Step 4: Register the handler**

In `src/main/index.ts`: add `import { registerLayerHandlers } from './handlers/layers'` next to the architectures import (~:18), and call `registerLayerHandlers()` next to `registerArchitectureHandlers()` (~:53).

- [ ] **Step 5: Preload bridge**

In `src/preload/index.ts`, add a `layers` object next to `architectures` (~:72):

```typescript
  layers: {
    list: (architectureId: number): Promise<Layer[]> => ipcRenderer.invoke('layers:list', architectureId),
    create: (architectureId: number, name: string): Promise<Layer> => ipcRenderer.invoke('layers:create', architectureId, name),
    rename: (id: number, name: string): Promise<Layer> => ipcRenderer.invoke('layers:rename', id, name),
    setState: (id: number, state: LayerState): Promise<Layer> => ipcRenderer.invoke('layers:setState', id, state),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('layers:delete', id),
    assignments: (architectureId: number): Promise<LayerAssignments> => ipcRenderer.invoke('layers:assignments', architectureId),
    assignElement: (elementId: number, layerId: number): Promise<void> => ipcRenderer.invoke('layers:assignElement', elementId, layerId),
    unassignElement: (elementId: number, layerId: number): Promise<void> => ipcRenderer.invoke('layers:unassignElement', elementId, layerId),
    assignConnection: (connectionId: number, layerId: number): Promise<void> => ipcRenderer.invoke('layers:assignConnection', connectionId, layerId),
    unassignConnection: (connectionId: number, layerId: number): Promise<void> => ipcRenderer.invoke('layers:unassignConnection', connectionId, layerId)
  },
```

Add `Layer, LayerState, LayerAssignments` to the type import at the top of the preload file (it already imports `Architecture` etc.).

- [ ] **Step 6: api.d.ts**

In `src/types/api.d.ts`, add a matching `layers` block on `Window.api` next to `architectures` (~:73), and add `Layer, LayerState, LayerAssignments` to the top-of-file type import:

```typescript
      layers: {
        list(architectureId: number): Promise<Layer[]>
        create(architectureId: number, name: string): Promise<Layer>
        rename(id: number, name: string): Promise<Layer>
        setState(id: number, state: LayerState): Promise<Layer>
        delete(id: number): Promise<void>
        assignments(architectureId: number): Promise<LayerAssignments>
        assignElement(elementId: number, layerId: number): Promise<void>
        unassignElement(elementId: number, layerId: number): Promise<void>
        assignConnection(connectionId: number, layerId: number): Promise<void>
        unassignConnection(connectionId: number, layerId: number): Promise<void>
      }
```

- [ ] **Step 7: Typecheck**

Run: `./node_modules/.bin/tsc -p tsconfig.web.json --noEmit && ./node_modules/.bin/tsc -p tsconfig.node.json --noEmit`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/main/db/migrations.ts src/main/handlers/layers.ts src/main/index.ts src/preload/index.ts src/types/api.d.ts src/types/index.ts
git commit -m "feat(arch): layers backend — tables, handler, preload, types"
```

---

### Task 2: Store — layers state, load, CRUD, assignment toggles

**Files:**
- Modify: `src/renderer/src/store/index.ts`
- Modify: `src/renderer/src/store/architectures.test.ts` (mock ripple)
- Test: `src/renderer/src/store/layers.test.ts` (new)

**Interfaces:**
- Consumes: `window.api.layers.*` (Task 1), `Layer`, `ElementLayerLink`, `ConnectionLayerLink`.
- Produces (store state): `layers: Layer[]`, `elementLayers: ElementLayerLink[]`, `connectionLayers: ConnectionLayerLink[]`.
- Produces (store actions): `loadLayers()`, `addLayer(name)`, `renameLayer(id, name)`, `cycleLayerState(id)`, `removeLayer(id)`, `toggleElementLayer(elementId, layerId)`, `toggleConnectionLayer(connectionId, layerId)`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/store/layers.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useStore } from './index'
import type { Layer } from '../../../../types'

const layer = (id: number, name: string, state: Layer['state'] = 'visible', position = id): Layer =>
  ({ id, architectureId: 5, name, state, position, deletedAt: null, createdAt: '', updatedAt: '' })

beforeEach(() => {
  ;(window as any).api = {
    layers: {
      list: vi.fn().mockResolvedValue([layer(1, 'Power'), layer(2, 'Comms')]),
      assignments: vi.fn().mockResolvedValue({ elementLayers: [{ elementId: 100, layerId: 1 }], connectionLayers: [] }),
      create: vi.fn().mockResolvedValue(layer(3, 'Thermal', 'visible', 2)),
      rename: vi.fn().mockResolvedValue(layer(1, 'Renamed')),
      setState: vi.fn().mockResolvedValue(layer(1, 'Power', 'faded')),
      delete: vi.fn().mockResolvedValue(undefined),
      assignElement: vi.fn().mockResolvedValue(undefined),
      unassignElement: vi.fn().mockResolvedValue(undefined),
      assignConnection: vi.fn().mockResolvedValue(undefined),
      unassignConnection: vi.fn().mockResolvedValue(undefined)
    }
  }
  useStore.setState({ activeArchitectureId: 5, layers: [], elementLayers: [], connectionLayers: [] })
})

describe('loadLayers', () => {
  it('loads layers + assignments for the active architecture', async () => {
    await useStore.getState().loadLayers()
    const s = useStore.getState()
    expect(s.layers.map((l) => l.id)).toEqual([1, 2])
    expect(s.elementLayers).toEqual([{ elementId: 100, layerId: 1 }])
    expect((window as any).api.layers.list).toHaveBeenCalledWith(5)
  })

  it('clears layers when no active architecture', async () => {
    useStore.setState({ activeArchitectureId: null, layers: [layer(9, 'Stale')] })
    await useStore.getState().loadLayers()
    expect(useStore.getState().layers).toEqual([])
    expect((window as any).api.layers.list).not.toHaveBeenCalled()
  })
})

describe('cycleLayerState', () => {
  it('cycles visible -> faded -> hidden -> visible via setState', async () => {
    useStore.setState({ layers: [layer(1, 'Power', 'visible')] })
    await useStore.getState().cycleLayerState(1)
    expect((window as any).api.layers.setState).toHaveBeenCalledWith(1, 'faded')

    useStore.setState({ layers: [layer(1, 'Power', 'faded')] })
    await useStore.getState().cycleLayerState(1)
    expect((window as any).api.layers.setState).toHaveBeenCalledWith(1, 'hidden')

    useStore.setState({ layers: [layer(1, 'Power', 'hidden')] })
    await useStore.getState().cycleLayerState(1)
    expect((window as any).api.layers.setState).toHaveBeenCalledWith(1, 'visible')
  })
})

describe('toggleElementLayer', () => {
  it('assigns when not a member, unassigns when a member', async () => {
    useStore.setState({ elementLayers: [] })
    await useStore.getState().toggleElementLayer(100, 2)
    expect((window as any).api.layers.assignElement).toHaveBeenCalledWith(100, 2)

    useStore.setState({ elementLayers: [{ elementId: 100, layerId: 2 }] })
    await useStore.getState().toggleElementLayer(100, 2)
    expect((window as any).api.layers.unassignElement).toHaveBeenCalledWith(100, 2)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run src/renderer/src/store/layers.test.ts`
Expected: FAIL — `loadLayers`/`cycleLayerState`/`toggleElementLayer` not functions.

- [ ] **Step 3: Add state + type imports**

In `src/renderer/src/store/index.ts`:
- Add `Layer, LayerState, ElementLayerLink, ConnectionLayerLink` to the `../../../../types` import.
- In the state interface, after `reqLinks: RequirementLink[]` (~:64) add:
```typescript
  layers: Layer[]
  elementLayers: ElementLayerLink[]
  connectionLayers: ConnectionLayerLink[]
```
- In the architecture actions interface block (~:120), add:
```typescript
  loadLayers: () => Promise<void>
  addLayer: (name: string) => Promise<void>
  renameLayer: (id: number, name: string) => Promise<void>
  cycleLayerState: (id: number) => Promise<void>
  removeLayer: (id: number) => Promise<void>
  toggleElementLayer: (elementId: number, layerId: number) => Promise<void>
  toggleConnectionLayer: (connectionId: number, layerId: number) => Promise<void>
```
- In the initial state object, next to `traceLinks: [], reqLinks: [],` (~:151) add:
```typescript
  layers: [], elementLayers: [], connectionLayers: [],
```

Note: the store already has `renameArchitecture`; keep the new `renameLayer` distinct — do not reuse the architecture action.

- [ ] **Step 4: Implement the actions**

Add these actions near the other architecture actions (after `removeArchitecture`, ~:453):

```typescript
  loadLayers: async () => {
    const { activeArchitectureId } = get()
    if (activeArchitectureId == null) { set({ layers: [], elementLayers: [], connectionLayers: [] }); return }
    const [layers, assignments] = await Promise.all([
      window.api.layers.list(activeArchitectureId),
      window.api.layers.assignments(activeArchitectureId)
    ])
    set({ layers, elementLayers: assignments.elementLayers, connectionLayers: assignments.connectionLayers })
  },

  addLayer: async (name) => {
    const { activeArchitectureId } = get()
    if (activeArchitectureId == null) return
    await window.api.layers.create(activeArchitectureId, name)
    await get().loadLayers()
  },

  renameLayer: async (id, name) => {
    await window.api.layers.rename(id, name)
    await get().loadLayers()
  },

  cycleLayerState: async (id) => {
    const layer = get().layers.find((l) => l.id === id)
    if (!layer) return
    const next: LayerState = layer.state === 'visible' ? 'faded' : layer.state === 'faded' ? 'hidden' : 'visible'
    await window.api.layers.setState(id, next)
    await get().loadLayers()
  },

  removeLayer: async (id) => {
    await window.api.layers.delete(id)
    await get().loadLayers()
  },

  toggleElementLayer: async (elementId, layerId) => {
    const member = get().elementLayers.some((l) => l.elementId === elementId && l.layerId === layerId)
    if (member) await window.api.layers.unassignElement(elementId, layerId)
    else await window.api.layers.assignElement(elementId, layerId)
    await get().loadLayers()
  },

  toggleConnectionLayer: async (connectionId, layerId) => {
    const member = get().connectionLayers.some((l) => l.connectionId === connectionId && l.layerId === layerId)
    if (member) await window.api.layers.unassignConnection(connectionId, layerId)
    else await window.api.layers.assignConnection(connectionId, layerId)
    await get().loadLayers()
  },
```

- [ ] **Step 5: Reload layers on architecture load/switch**

In `loadArchitecture` (~:401-412), after the existing `set({ elements, connections, ... })`, add:
```typescript
    await get().loadLayers()
```
So it becomes the last line of `loadArchitecture`. (`setActiveArchitecture` and `loadArchitectures` both route through `loadArchitecture`, so layers reload on switch and on project open.)

- [ ] **Step 6: Fix the architectures.test.ts mock ripple**

`loadArchitecture` now calls `window.api.layers.list` + `.assignments`. In `src/renderer/src/store/architectures.test.ts`, add to the `beforeEach` `(window as any).api = { ... }` object:
```typescript
    layers: { list: vi.fn().mockResolvedValue([]), assignments: vi.fn().mockResolvedValue({ elementLayers: [], connectionLayers: [] }) },
```

- [ ] **Step 7: Run to verify it passes**

Run: `./node_modules/.bin/vitest run src/renderer/src/store/layers.test.ts src/renderer/src/store/architectures.test.ts`
Expected: PASS (both files).

- [ ] **Step 8: Full store suite + typecheck**

Run: `./node_modules/.bin/vitest run src/renderer/src/store`
Expected: no new failures.
Run: `./node_modules/.bin/tsc -p tsconfig.web.json --noEmit`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/store/index.ts src/renderer/src/store/layers.test.ts src/renderer/src/store/architectures.test.ts
git commit -m "feat(arch): store layers state, load, CRUD, assignment toggles"
```

---

### Task 3: Pure visibility resolver

**Files:**
- Create: `src/renderer/src/components/ArchitectureCanvas/layers.ts`
- Test: `src/renderer/src/components/ArchitectureCanvas/layers.test.ts` (new)

**Interfaces:**
- Consumes: `Layer` type.
- Produces: `type Visibility = 'normal' | 'faded' | 'hidden'`; `effectiveVisibility(memberLayerIds: number[], layersById: Map<number, Layer>): Visibility`; `resolveConnectorVisibility(own: Visibility, source: Visibility, target: Visibility): Visibility`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/components/ArchitectureCanvas/layers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { effectiveVisibility, resolveConnectorVisibility } from './layers'
import type { Layer } from '../../../../types'

const L = (id: number, state: Layer['state']): Layer =>
  ({ id, architectureId: 1, name: 'L' + id, state, position: id, deletedAt: null, createdAt: '', updatedAt: '' })

const byId = (...ls: Layer[]): Map<number, Layer> => new Map(ls.map((l) => [l.id, l]))

describe('effectiveVisibility', () => {
  it('no member layers → normal (base content)', () => {
    expect(effectiveVisibility([], byId(L(1, 'hidden')))).toBe('normal')
  })
  it('any visible member → normal', () => {
    expect(effectiveVisibility([1, 2], byId(L(1, 'hidden'), L(2, 'visible')))).toBe('normal')
  })
  it('no visible but a faded member → faded', () => {
    expect(effectiveVisibility([1, 2], byId(L(1, 'hidden'), L(2, 'faded')))).toBe('faded')
  })
  it('all members hidden → hidden', () => {
    expect(effectiveVisibility([1, 2], byId(L(1, 'hidden'), L(2, 'hidden')))).toBe('hidden')
  })
  it('member layer missing from map is ignored → normal', () => {
    expect(effectiveVisibility([99], byId(L(1, 'hidden')))).toBe('normal')
  })
})

describe('resolveConnectorVisibility', () => {
  it('takes the strictest of own/source/target', () => {
    expect(resolveConnectorVisibility('normal', 'normal', 'normal')).toBe('normal')
    expect(resolveConnectorVisibility('normal', 'faded', 'normal')).toBe('faded')
    expect(resolveConnectorVisibility('normal', 'normal', 'hidden')).toBe('hidden')
    expect(resolveConnectorVisibility('faded', 'normal', 'normal')).toBe('faded')
    expect(resolveConnectorVisibility('hidden', 'faded', 'normal')).toBe('hidden')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/layers.test.ts`
Expected: FAIL — cannot find `./layers`.

- [ ] **Step 3: Implement**

Create `src/renderer/src/components/ArchitectureCanvas/layers.ts`:

```typescript
import type { Layer } from '../../../../types'

export type Visibility = 'normal' | 'faded' | 'hidden'

const RANK: Record<Visibility, number> = { normal: 2, faded: 1, hidden: 0 }
const fromState = (s: Layer['state']): Visibility => (s === 'visible' ? 'normal' : s === 'faded' ? 'faded' : 'hidden')

// No member layers (or none resolvable) → base content, always visible.
// Otherwise the MOST visible member wins (any Visible → normal, else any Faded → faded, else hidden).
export function effectiveVisibility(memberLayerIds: number[], layersById: Map<number, Layer>): Visibility {
  let best: Visibility | null = null
  for (const id of memberLayerIds) {
    const layer = layersById.get(id)
    if (!layer) continue
    const v = fromState(layer.state)
    if (best === null || RANK[v] > RANK[best]) best = v
  }
  return best ?? 'normal'
}

// A connector is never more visible than its stricter endpoint (and never more than its own layers).
export function resolveConnectorVisibility(own: Visibility, source: Visibility, target: Visibility): Visibility {
  return [own, source, target].reduce((a, b) => (RANK[b] < RANK[a] ? b : a))
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/layers.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ArchitectureCanvas/layers.ts src/renderer/src/components/ArchitectureCanvas/layers.test.ts
git commit -m "feat(arch): pure layer visibility resolver + tests"
```

---

### Task 4: Canvas — apply visibility to nodes and edges

**Files:**
- Modify: `src/renderer/src/components/ArchitectureCanvas/nodes.ts`
- Modify: `src/renderer/src/components/ArchitectureCanvas/BlockNode.tsx`
- Modify: `src/renderer/src/components/ArchitectureCanvas/EdgeLabel.tsx`
- Modify: `src/renderer/src/components/ArchitectureCanvas/index.tsx`
- Test: `src/renderer/src/components/ArchitectureCanvas/nodes.test.ts` (extend)

**Interfaces:**
- Consumes: `effectiveVisibility`, `resolveConnectorVisibility`, `Visibility` (Task 3); store `layers`, `elementLayers`, `connectionLayers` (Task 2).
- Produces: `buildNodes` gains a trailing `visibilityById: Map<number, Visibility>` param; `BlockNodeData` gains `faded: boolean`. No exported-signature change consumed by other tasks.

- [ ] **Step 1: Write the failing test (extend nodes.test.ts)**

Add to `src/renderer/src/components/ArchitectureCanvas/nodes.test.ts` (it already imports `buildNodes`; add a `Visibility` map arg to a couple of existing calls if TS complains — the new param is required):

```typescript
import type { Visibility } from './layers'

it('omits hidden elements and fades faded ones', () => {
  const els = [
    { id: 1, projectId: 1, architectureId: 1, parentId: null, blockId: 'SYS-001', name: 'A', elementTypeId: null, description: null, color: null, posX: 0, posY: 0, width: 140, height: 60, deletedAt: null, createdAt: '', updatedAt: '' },
    { id: 2, projectId: 1, architectureId: 1, parentId: null, blockId: 'SYS-002', name: 'B', elementTypeId: null, description: null, color: null, posX: 0, posY: 0, width: 140, height: 60, deletedAt: null, createdAt: '', updatedAt: '' },
    { id: 3, projectId: 1, architectureId: 1, parentId: null, blockId: 'SYS-003', name: 'C', elementTypeId: null, description: null, color: null, posX: 0, posY: 0, width: 140, height: 60, deletedAt: null, createdAt: '', updatedAt: '' }
  ] as any[]
  const vis = new Map<number, Visibility>([[1, 'normal'], [2, 'faded'], [3, 'hidden']])
  const nodes = buildNodes(els, [], [], null, () => {}, vis)
  expect(nodes.map((n) => n.id)).toEqual(['1', '2'])              // 3 (hidden) omitted
  expect((nodes[1].data as any).faded).toBe(true)                  // 2 faded
  expect((nodes[1].style as any).opacity).toBeLessThan(1)
  expect((nodes[0].data as any).faded).toBe(false)
})

it('omits descendants of a hidden container', () => {
  const els = [
    { id: 1, projectId: 1, architectureId: 1, parentId: null, blockId: 'P', name: 'P', elementTypeId: null, description: null, color: null, posX: 0, posY: 0, width: 300, height: 200, deletedAt: null, createdAt: '', updatedAt: '' },
    { id: 2, projectId: 1, architectureId: 1, parentId: 1, blockId: 'C', name: 'C', elementTypeId: null, description: null, color: null, posX: 20, posY: 40, width: 140, height: 60, deletedAt: null, createdAt: '', updatedAt: '' }
  ] as any[]
  const vis = new Map<number, Visibility>([[1, 'hidden'], [2, 'normal']])
  const nodes = buildNodes(els, [], [], null, () => {}, vis)
  expect(nodes.map((n) => n.id)).toEqual([])                       // child dropped with hidden parent
})
```

Any pre-existing `buildNodes(...)` call in this file must gain a final arg `new Map()` (all-normal) to typecheck.

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/nodes.test.ts`
Expected: FAIL — `buildNodes` takes 5 args / `faded` missing.

- [ ] **Step 3: Thread visibility through `buildNodes`**

In `src/renderer/src/components/ArchitectureCanvas/nodes.ts`:
- Import: `import type { Visibility } from './layers'`.
- Change the signature to add the param:
```typescript
export function buildNodes(
  elements: ArchitectureElement[],
  elementTypes: ElementType[],
  connections: ArchitectureConnection[],
  selectedId: number | null,
  onResizeEnd: (id: number, x: number, y: number, width: number, height: number) => void,
  visibilityById: Map<number, Visibility>
): Node[] {
```
- After `const byId = new Map(...)` (~:65), compute the hidden set (hidden elements + their descendants):
```typescript
  const hidden = new Set<number>()
  for (const el of elements) {
    if (visibilityById.get(el.id) === 'hidden') {
      hidden.add(el.id)
      for (const d of descendantIds(el.id, elements)) hidden.add(d)
    }
  }
```
- In the topo loop, skip hidden elements. Simplest: filter the input once — replace `let remaining = elements` with `let remaining = elements.filter((el) => !hidden.has(el.id))`. (The `ordered.push(...remaining)` tail then only carries visible cycle-remnants.)
- In the final `.map`, add `faded` to `data` and `opacity` to `style`:
```typescript
    data: {
      label: el.name,
      blockId: el.blockId,
      color: el.color,
      selected: el.id === selectedId,
      nested: hasParent(el),
      childCount: elements.filter((c) => c.parentId === el.id).length,
      typeName: el.elementTypeId != null ? typeName.get(el.elementTypeId) ?? null : null,
      connectionCount: connections.filter((c) => c.sourceId === el.id || c.targetId === el.id).length,
      faded: visibilityById.get(el.id) === 'faded',
      onResizeEnd: (x: number, y: number, w: number, h: number) => onResizeEnd(el.id, x, y, w, h)
    } satisfies BlockNodeData,
    style: { width: el.width, height: el.height, ...(visibilityById.get(el.id) === 'faded' ? { opacity: 0.35 } : {}) }
```
Note: `childCount` still counts hidden children (it reads `elements`), which is fine — a hidden container is itself omitted, so its badge never renders.

- [ ] **Step 4: Add `faded` to `BlockNodeData` + dim the node**

In `src/renderer/src/components/ArchitectureCanvas/BlockNode.tsx`:
- Add to `BlockNodeData` (after `connectionCount: number`): `faded: boolean`.
- The node's outer `style` already sets opacity via the RF node `style` (Step 3), so BlockNode needs no change to dim. (Leave BlockNode as-is; the RF wrapper opacity covers it. If a subagent prefers an explicit class, add `${d.faded ? 'opacity-60' : ''}` at `:26` — but do not double-apply if the wrapper opacity already shows.) Keep it simple: rely on the node `style.opacity` from Step 3 and just add the `faded` field to the type so `satisfies BlockNodeData` compiles.

- [ ] **Step 5: Compute visibility in `index.tsx` and apply to edges**

In `src/renderer/src/components/ArchitectureCanvas/index.tsx`:
- Imports: add `import { effectiveVisibility, resolveConnectorVisibility, type Visibility } from './layers'`.
- Destructure from the store (in the `useStore()` at ~:66): add `layers, elementLayers, connectionLayers`.
- Before the two effects, derive a memoized visibility map (add `useMemo` to the react import):
```typescript
  const visById = useMemo(() => {
    const layersById = new Map(layers.map((l) => [l.id, l]))
    const memberIds = new Map<number, number[]>()
    for (const { elementId, layerId } of elementLayers) {
      const arr = memberIds.get(elementId) ?? []; arr.push(layerId); memberIds.set(elementId, arr)
    }
    return new Map<number, Visibility>(elements.map((e) => [e.id, effectiveVisibility(memberIds.get(e.id) ?? [], layersById)]))
  }, [elements, elementLayers, layers])
```
- Pass `visById` to `buildNodes(...)` and add it + `visById` deps to the nodes `useEffect`:
```typescript
    setNodes(buildNodes(elements, elementTypes, connections, selectedElementId, (id, x, y, width, height) => {
      // ...unchanged body...
    }, visById))
  }, [elements, elementTypes, connections, selectedElementId, visById])
```
- In the edge `useEffect` (~:94-107), compute connector visibility, drop hidden edges, fade the rest. Build a connection-layer membership map and reuse `visById` for endpoints:
```typescript
  useEffect(() => {
    const layersById = new Map(layers.map((l) => [l.id, l]))
    const connMemberIds = new Map<number, number[]>()
    for (const { connectionId, layerId } of connectionLayers) {
      const arr = connMemberIds.get(connectionId) ?? []; arr.push(layerId); connMemberIds.set(connectionId, arr)
    }
    setEdges(
      connections
        .map((c) => {
          const own = effectiveVisibility(connMemberIds.get(c.id) ?? [], layersById)
          const vis = resolveConnectorVisibility(own, visById.get(c.sourceId) ?? 'normal', visById.get(c.targetId) ?? 'normal')
          return {
            id: String(c.id),
            source: String(c.sourceId),
            target: String(c.targetId),
            sourceHandle: c.sourceHandle ?? 'right',
            targetHandle: c.targetHandle ?? 'left',
            type: 'labeled' as const,
            data: { label: c.name ?? '', faded: vis === 'faded' },
            selected: c.id === selectedConnectionId,
            hidden: vis === 'hidden'
          }
        })
    )
  }, [connections, selectedConnectionId, connectionLayers, layers, visById])
```
(Using RF's native `hidden` flag on the edge object drops it from the view without unmounting; `data.faded` drives the fade.)

- [ ] **Step 6: Fade the edge in `EdgeLabel.tsx`**

In `src/renderer/src/components/ArchitectureCanvas/EdgeLabel.tsx`, read `data.faded` and lower opacity:
```typescript
  const label = (data as any)?.label as string | undefined
  const faded = (data as any)?.faded === true
  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{ stroke: selected ? '#42682d' : '#94a3b8', strokeWidth: selected ? 2 : 1.5, opacity: faded ? 0.3 : 1 }} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'all', opacity: faded ? 0.4 : 1 }}
            className="px-1.5 py-0.5 bg-white border border-line rounded text-xs text-ink-muted shadow-sm nodrag nopan"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
```

- [ ] **Step 7: Run tests + typecheck**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/nodes.test.ts`
Expected: PASS.
Run: `./node_modules/.bin/tsc -p tsconfig.web.json --noEmit && ./node_modules/.bin/tsc -p tsconfig.node.json --noEmit`
Expected: clean.
Run: `./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas`
Expected: no new failures (the canvas `index.test.tsx` store mock now needs `layers: [], elementLayers: [], connectionLayers: []` — add them to its `mockReturnValue`/`useStore` stub if the render throws).

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/ArchitectureCanvas/nodes.ts src/renderer/src/components/ArchitectureCanvas/nodes.test.ts src/renderer/src/components/ArchitectureCanvas/BlockNode.tsx src/renderer/src/components/ArchitectureCanvas/EdgeLabel.tsx src/renderer/src/components/ArchitectureCanvas/index.tsx
git commit -m "feat(arch): apply layer visibility to canvas nodes and edges"
```

---

### Task 5: LayerPanel floating panel

**Files:**
- Create: `src/renderer/src/components/ArchitectureCanvas/LayerPanel.tsx`
- Test: `src/renderer/src/components/ArchitectureCanvas/LayerPanel.test.tsx` (new)
- Modify: `src/renderer/src/components/ArchitectureCanvas/index.tsx` (mount)

**Interfaces:**
- Consumes: store `layers`, `addLayer`, `renameLayer`, `cycleLayerState`, `removeLayer` (Task 2).
- Produces: `LayerPanel` default export, mounted inside the ReactFlow tree.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/components/ArchitectureCanvas/LayerPanel.test.tsx`:

```typescript
import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LayerPanel from './LayerPanel'
import { useStore } from '../../store'

vi.mock('../../store')

const layer = (id: number, name: string, state = 'visible') => ({ id, architectureId: 1, name, state, position: id, deletedAt: null, createdAt: '', updatedAt: '' })

beforeEach(() => {
  ;(useStore as any).mockReturnValue({
    layers: [layer(1, 'Power', 'visible'), layer(2, 'Comms', 'faded')],
    addLayer: vi.fn(), renameLayer: vi.fn(), cycleLayerState: vi.fn(), removeLayer: vi.fn()
  })
})

it('renders a row per layer', () => {
  render(<LayerPanel />)
  expect(screen.getByText('Power')).toBeInTheDocument()
  expect(screen.getByText('Comms')).toBeInTheDocument()
})

it('cycles a layer state when its dot is clicked', () => {
  const cycle = vi.fn()
  ;(useStore as any).mockReturnValue({
    layers: [layer(1, 'Power', 'visible')],
    addLayer: vi.fn(), renameLayer: vi.fn(), cycleLayerState: cycle, removeLayer: vi.fn()
  })
  render(<LayerPanel />)
  fireEvent.click(screen.getByLabelText('Cycle visibility of Power'))
  expect(cycle).toHaveBeenCalledWith(1)
})

it('adds a layer via the + affordance', () => {
  const addLayer = vi.fn()
  ;(useStore as any).mockReturnValue({
    layers: [], addLayer, renameLayer: vi.fn(), cycleLayerState: vi.fn(), removeLayer: vi.fn()
  })
  render(<LayerPanel />)
  fireEvent.click(screen.getByLabelText('New layer'))
  const input = screen.getByPlaceholderText('Layer name')
  fireEvent.change(input, { target: { value: 'Thermal' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(addLayer).toHaveBeenCalledWith('Thermal')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/LayerPanel.test.tsx`
Expected: FAIL — cannot find `./LayerPanel`.

- [ ] **Step 3: Implement (render the panel content; the test renders it bare, the canvas wraps it in RF `<Panel>`)**

Create `src/renderer/src/components/ArchitectureCanvas/LayerPanel.tsx`:

```tsx
import { useState } from 'react'
import { useStore } from '../../store'
import { SectionLabel } from '../ui'
import type { LayerState } from '../../../../types'

const DOT: Record<LayerState, string> = { visible: '●', faded: '◐', hidden: '○' }

export default function LayerPanel(): JSX.Element {
  const { layers, addLayer, renameLayer, cycleLayerState, removeLayer } = useStore() as any
  const [adding, setAdding] = useState(false)
  const [addValue, setAddValue] = useState('')
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')

  function commitAdd(): void {
    const v = addValue.trim()
    if (v) addLayer(v)
    setAdding(false); setAddValue('')
  }
  function commitRename(id: number): void {
    const v = renameValue.trim()
    if (v) renameLayer(id, v)
    setRenamingId(null)
  }

  return (
    <div className="bg-white/95 backdrop-blur border border-line rounded-lg shadow-md w-52 max-h-80 overflow-y-auto">
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <SectionLabel>Layers</SectionLabel>
        <button aria-label="New layer" onClick={() => setAdding(true)} className="text-ink-muted hover:text-ink leading-none text-base px-1">+</button>
      </div>
      {adding && (
        <div className="px-2 pb-2">
          <input
            autoFocus placeholder="Layer name" value={addValue}
            onChange={(e) => setAddValue(e.target.value)}
            onBlur={commitAdd}
            onKeyDown={(e) => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') { setAdding(false); setAddValue('') } }}
            className="w-full px-2 py-1 text-sm rounded border border-action bg-white text-ink"
          />
        </div>
      )}
      <div className="px-1.5 pb-2 space-y-0.5">
        {layers.length === 0 && !adding && <div className="px-2 py-1 text-xs text-ink-faint">No layers yet.</div>}
        {layers.map((l: any) => (
          renamingId === l.id ? (
            <input
              key={l.id} autoFocus value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => commitRename(l.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(l.id); if (e.key === 'Escape') setRenamingId(null) }}
              className="w-full px-2 py-1 text-sm rounded border border-action bg-white text-ink"
            />
          ) : (
            <div key={l.id} className="group flex items-center gap-2 px-2 py-1 rounded text-sm hover:bg-workspace">
              <button
                aria-label={`Cycle visibility of ${l.name}`}
                onClick={() => cycleLayerState(l.id)}
                title={l.state}
                className={`leading-none w-4 text-center ${l.state === 'hidden' ? 'text-ink-faint' : 'text-action'}`}
              >{DOT[l.state as LayerState]}</button>
              <span className="flex-1 truncate text-ink" onDoubleClick={() => { setRenamingId(l.id); setRenameValue(l.name) }}>{l.name}</span>
              <button
                aria-label={`Delete ${l.name}`}
                onClick={() => { if (window.confirm('Delete this layer? Objects stay, they just lose this layer.')) removeLayer(l.id) }}
                className="opacity-0 group-hover:opacity-100 text-ink-faint hover:text-error leading-none"
              >×</button>
            </div>
          )
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/LayerPanel.test.tsx`
Expected: PASS (all three cases).

- [ ] **Step 5: Mount it on the canvas**

In `src/renderer/src/components/ArchitectureCanvas/index.tsx`:
- Import: `import LayerPanel from './LayerPanel'`.
- Inside `<ReactFlow>…</ReactFlow>`, next to `<CanvasControls />` (~:233), add:
```tsx
            <Panel position="top-right"><LayerPanel /></Panel>
```
(`Panel` is already imported from `@xyflow/react`.)

- [ ] **Step 6: Typecheck + canvas suite**

Run: `./node_modules/.bin/tsc -p tsconfig.web.json --noEmit`
Expected: clean.
Run: `./node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas`
Expected: no new failures.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/ArchitectureCanvas/LayerPanel.tsx src/renderer/src/components/ArchitectureCanvas/LayerPanel.test.tsx src/renderer/src/components/ArchitectureCanvas/index.tsx
git commit -m "feat(arch): floating LayerPanel with 3-state visibility dots"
```

---

### Task 6: Drawer LAYERS assignment section

**Files:**
- Modify: `src/renderer/src/components/ElementPanel/index.tsx`
- Modify: `src/renderer/src/components/ConnectionPanel/index.tsx`
- Test: `src/renderer/src/components/ElementPanel/ElementPanel.test.tsx` (new or extend if present)

**Interfaces:**
- Consumes: store `layers`, `elementLayers`, `toggleElementLayer` (ElementPanel); `layers`, `connectionLayers`, `toggleConnectionLayer` (ConnectionPanel).
- Produces: a LAYERS checkbox section in each drawer.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/components/ElementPanel/ElementPanel.test.tsx`:

```typescript
import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ElementPanel from './index'
import { useStore } from '../../store'

vi.mock('../../store')

const el = { id: 100, projectId: 1, architectureId: 1, parentId: null, blockId: 'SYS-001', name: 'Pump', elementTypeId: null, description: null, color: null, posX: 0, posY: 0, width: 140, height: 60, deletedAt: null, createdAt: '', updatedAt: '' }
const layer = (id: number, name: string) => ({ id, architectureId: 1, name, state: 'visible', position: id, deletedAt: null, createdAt: '', updatedAt: '' })

beforeEach(() => {
  ;(window as any).api = { elementLinks: { list: vi.fn().mockResolvedValue([]) } }
  ;(useStore as any).mockReturnValue({
    selectedElementId: 100, elements: [el], elementTypes: [], projectRequirements: [],
    layers: [layer(1, 'Power'), layer(2, 'Comms')], elementLayers: [{ elementId: 100, layerId: 1 }],
    updateElement: vi.fn(), removeElement: vi.fn(), addElementLink: vi.fn(), removeElementLink: vi.fn(),
    toggleElementLayer: vi.fn()
  })
})

it('shows a checkbox per layer, checked for assigned layers', () => {
  render(<ElementPanel />)
  expect((screen.getByLabelText('Power') as HTMLInputElement).checked).toBe(true)
  expect((screen.getByLabelText('Comms') as HTMLInputElement).checked).toBe(false)
})

it('toggles layer membership on checkbox click', () => {
  const toggle = vi.fn()
  ;(useStore as any).mockReturnValue({
    selectedElementId: 100, elements: [el], elementTypes: [], projectRequirements: [],
    layers: [layer(2, 'Comms')], elementLayers: [],
    updateElement: vi.fn(), removeElement: vi.fn(), addElementLink: vi.fn(), removeElementLink: vi.fn(),
    toggleElementLayer: toggle
  })
  render(<ElementPanel />)
  fireEvent.click(screen.getByLabelText('Comms'))
  expect(toggle).toHaveBeenCalledWith(100, 2)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/ElementPanel/ElementPanel.test.tsx`
Expected: FAIL — no LAYERS checkboxes rendered.

- [ ] **Step 3: Add the section to ElementPanel**

In `src/renderer/src/components/ElementPanel/index.tsx`:
- Extend the store destructure (~:6-9): add `layers, elementLayers, toggleElementLayer`.
- Add a LAYERS `Field` after the Requirements field (before the closing `</div>` of the scroll area, ~:115):
```tsx
        {layers.length > 0 && (
          <Field label="Layers">
            <div className="space-y-1">
              {layers.map((l) => {
                const assigned = elementLayers.some((m) => m.elementId === el!.id && m.layerId === l.id)
                return (
                  <label key={l.id} className="flex items-center gap-2 px-1 py-1 text-xs text-ink cursor-pointer">
                    <input type="checkbox" aria-label={l.name} checked={assigned} onChange={() => toggleElementLayer(el!.id, l.id)} />
                    {l.name}
                  </label>
                )
              })}
            </div>
          </Field>
        )}
```

- [ ] **Step 4: Run to verify it passes**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/ElementPanel/ElementPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Mirror into ConnectionPanel**

In `src/renderer/src/components/ConnectionPanel/index.tsx`: extend the store destructure with `layers, connectionLayers, toggleConnectionLayer`, and add the same LAYERS section (use the connection's id and `toggleConnectionLayer`, membership via `connectionLayers.some((m) => m.connectionId === conn.id && m.layerId === l.id)`). Match the panel's existing `Field`/section styling (read the file first to reuse its local field wrapper and the selected-connection variable name).

- [ ] **Step 6: Typecheck + full renderer suite**

Run: `./node_modules/.bin/tsc -p tsconfig.web.json --noEmit && ./node_modules/.bin/tsc -p tsconfig.node.json --noEmit`
Expected: clean.
Run: `./node_modules/.bin/vitest run src/renderer`
Expected: no new failures (add `layers/elementLayers/connectionLayers` to any App/panel test store mock that now renders these sections).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/ElementPanel/index.tsx src/renderer/src/components/ElementPanel/ElementPanel.test.tsx src/renderer/src/components/ConnectionPanel/index.tsx
git commit -m "feat(arch): LAYERS assignment checkboxes in element + connection drawers"
```

---

### Task 7: Verification + live-verify

**Files:** none (verification only; fix-forward any failures found).

- [ ] **Step 1: Full gate**

Run: `./node_modules/.bin/tsc -p tsconfig.web.json --noEmit && ./node_modules/.bin/tsc -p tsconfig.node.json --noEmit` → clean.
Run: `./node_modules/.bin/vitest run src/renderer` → the only failures are the accepted baseline (the pre-existing ArchitectureCanvas "connection mode toggle" test); everything else green.
Run: `./node_modules/.bin/electron-vite build` → clean.

- [ ] **Step 2: Live-verify (Playwright driver)**

Read the run-app skill; drive `.claude/skills/run-app/driver.mjs` via a FIFO with a persistent write-holder (`sleep 100000 > fifo &`). Nav/panel rows are `<div>` — click them via `eval`; element name edits need a real `focusout` event (synthetic `blur` is insufficient). On an architecture with a few blocks + at least one connector, confirm and report each:
1. Create 2–3 layers in the top-right LAYERS panel; assign blocks to them via the properties-drawer LAYERS checkboxes.
2. Click a layer's dot to cycle Visible → Faded → Hidden: its member blocks go normal → dimmed (opacity) → omitted; a base (no-layer) block stays fully visible the whole time.
3. A connector whose endpoint is on a Hidden layer disappears; a connector to a Faded endpoint renders at most faded (endpoint-wins).
4. A faded block is still clickable (its drawer opens).
5. Relaunch → layer names, states, and memberships persist (DB); switching to another architecture shows that architecture's own (empty or different) layer set, and back again restores the first.

Report exactly what was observed; do not claim a check you did not run.

- [ ] **Step 3: Record the ledger + commit**

Append a new section to `.superpowers/sdd/progress.md` summarizing the tasks, verification, and live-verify results, then:
```bash
git add .superpowers/sdd/progress.md
git commit -m "docs: record Architecture Layers plan complete"
```

---

## Self-Review Notes

- **Spec coverage** (combined spec §159-185): layer = per-architecture visibility layer → Task 1 table scoped to `architecture_id` + `loadLayers` keyed on `activeArchitectureId` (Task 2). Many-to-many assignment, no-layer=always-visible → link tables (Task 1) + `effectiveVisibility` returns `normal` on empty (Task 3). 3-state cycle Visible→Faded→Hidden → `cycleLayerState` (Task 2) + dot button (Task 5). Object display resolution (any visible→normal, else faded, else hidden) → `effectiveVisibility` truth table (Task 3, tested). Connector own layer + endpoint auto-constrain → `resolveConnectorVisibility` strictest-of-three (Task 3) applied in the edge effect (Task 4). Layers panel with 3-state dots → Task 5. Canvas applies opacity for faded / omit for hidden → Task 4. Open questions resolved: new-layer default = `visible` (Task 1 `createLayer`); state persisted in DB (Task 1 column); faded objects stay selectable (Task 4 only sets opacity, no `pointer-events`); layer color-coding deferred.
- **Type consistency:** `LayerState`/`Layer`/`ElementLayerLink`/`ConnectionLayerLink`/`LayerAssignments` defined once (Task 1) and consumed unchanged in Tasks 2/3/4/5/6. `Visibility` defined in Task 3, consumed by Task 4. `effectiveVisibility`/`resolveConnectorVisibility` names identical across Tasks 3 and 4. Store action names (`loadLayers`, `addLayer`, `renameLayer`, `cycleLayerState`, `removeLayer`, `toggleElementLayer`, `toggleConnectionLayer`) identical between the interface block and the implementations and the components.
- **Renderer + thin-backend only:** the only backend is additive (3 tables, one handler, registration, preload, api.d.ts, types) — no changes to existing tables or handlers, no migration of existing rows.
- **Test ripples called out:** `architectures.test.ts` (Task 2 Step 6), canvas `index.test.tsx` and App/panel store mocks (Tasks 4 Step 7, 6 Step 6) gain empty `layers`/`elementLayers`/`connectionLayers` so pre-existing renders don't throw.
- **Deferred (unchanged):** layer color-coding; drag-reorder of layers (create-order only); canvas multi-select bulk-assign; nav/panel row `role`/keyboard a11y (batched a11y ticket). Backlog items 18–20 recorded, not built.
