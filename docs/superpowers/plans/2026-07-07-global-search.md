# Global Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Search box in the navy shell bar that finds requirements, modules, and section headings by substring, with a grouped dropdown whose rows navigate to the hit.

**Architecture:** One new IPC channel `search:query` running three parameterized `LIKE` queries (soft-deletes excluded, `LIMIT 10` per group), mirrored through preload/api.d.ts. One new renderer component `GlobalSearch` (component-local state, 200ms debounce, stale-response guard) mounted in the `App.tsx` header; navigation reuses existing store actions (`openRequirement`, `selectModule`, `setActiveTab`). The three row mappers in requirements/modules/headings handlers get exported so `search.ts` imports them instead of duplicating (the duplicate-mapper idiom already forced a 3-file ripple in the metadata plan).

**Tech Stack:** Electron IPC (better-sqlite3) → preload → React; vitest + @testing-library/react.

Spec: `docs/superpowers/specs/2026-07-07-global-search-design.md`

## Global Constraints

- Renderer NEVER touches the DB directly — all data flows through `window.api` (preload) → `ipcMain.handle` (main). Every new `window.api` method appears in BOTH `src/preload/index.ts` and `src/types/api.d.ts`.
- Tailwind semantic tokens only in classNames (`text-ink`, `bg-workspace`, `border-line`, etc.; `bg-white`/`text-white` and white-opacity variants on the navy header are established convention — see `secondary-on-navy` in `ui/index.tsx`).
- Tests: `./node_modules/.bin/vitest run <paths>` — NEVER `npm run` (npm shim broken). Typechecks: `./node_modules/.bin/tsc --noEmit -p tsconfig.web.json` AND `-p tsconfig.node.json` — both clean.
- Do NOT write vitest tests under `src/main/**` (better-sqlite3 ABI mismatch; baseline = 47 main-process failures + 1 pre-existing ArchitectureCanvas failure). Main-process code is verified by typecheck + live app checks. All renderer tests must pass.
- Commits go straight to `main`. Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- PATH prefix required in every shell: `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"`.
- Out of scope: architecture elements/connections, custom-field values, AC item text, arrow-key result navigation, fuzzy match, FTS5, search history, cross-project search.

---

### Task 1: Backend — SearchResults type, exported mappers, search handler, IPC/preload mirrors

**Files:**
- Modify: `src/types/index.ts` (after the `SearchResults`-adjacent types — place after `RequirementLink`)
- Modify: `src/main/handlers/requirements.ts:7`, `src/main/handlers/modules.ts:7`, `src/main/handlers/headings.ts:7` (add `export` to the row mappers — no other change)
- Create: `src/main/handlers/search.ts`
- Modify: `src/main/index.ts` (import + register)
- Modify: `src/preload/index.ts` (new group after `reqLinks`)
- Modify: `src/types/api.d.ts` (new group after `reqLinks`)

**Interfaces:**
- Consumes: existing `getDatabase()`; `rowToRequirement`/`rowToModule`/`rowToHeading` (exported by this task).
- Produces (Task 2 relies on): `SearchResults { requirements: Requirement[]; modules: Module[]; headings: ReqHeading[] }`; `window.api.search.query(projectId: number, term: string): Promise<SearchResults>`.

No vitest here (main-process). Verified by typecheck now + live checks in Task 3.

- [ ] **Step 1: Add type**

In `src/types/index.ts`, after the `RequirementLink` interface:

```ts
export interface SearchResults {
  requirements: Requirement[]
  modules: Module[]
  headings: ReqHeading[]
}
```

- [ ] **Step 2: Export the three mappers**

In each of `src/main/handlers/requirements.ts`, `src/main/handlers/modules.ts`, `src/main/handlers/headings.ts`, change the line-7 mapper declaration from `function rowToX(` to `export function rowToX(`. Nothing else changes.

- [ ] **Step 3: Handler file**

Create `src/main/handlers/search.ts`:

```ts
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
    WHERE project_id = ? AND deleted_at IS NULL AND name LIKE ? ESCAPE '\\'
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
```

- [ ] **Step 4: Register in main**

In `src/main/index.ts`: add `import { registerSearchHandlers } from './handlers/search'` after the `registerRequirementLinkHandlers` import, and call `registerSearchHandlers()` after `registerRequirementLinkHandlers()` in the registration block.

- [ ] **Step 5: Preload mirror**

In `src/preload/index.ts`, add `SearchResults` to the types import, then after the `reqLinks` group:

```ts
  search: {
    query: (projectId: number, term: string): Promise<SearchResults> => ipcRenderer.invoke('search:query', projectId, term)
  },
```

- [ ] **Step 6: api.d.ts mirror**

In `src/types/api.d.ts`, add `SearchResults` to the import, then after the `reqLinks` group:

```ts
      search: {
        query(projectId: number, term: string): Promise<SearchResults>
      }
```

- [ ] **Step 7: Typecheck both configs**

Run:
```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.node.json
./node_modules/.bin/tsc --noEmit -p tsconfig.web.json
```
Expected: both clean, no output.

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/main/handlers/requirements.ts src/main/handlers/modules.ts src/main/handlers/headings.ts src/main/handlers/search.ts src/main/index.ts src/preload/index.ts src/types/api.d.ts
git commit -m "feat(search): search:query IPC — LIKE over requirements/modules/headings, exported row mappers"
```

---

### Task 2: GlobalSearch component + header mount

**Files:**
- Create: `src/renderer/src/components/GlobalSearch/index.tsx`
- Create: `src/renderer/src/components/GlobalSearch/index.test.tsx`
- Modify: `src/renderer/src/App.tsx` (import + mount in header)
- Modify: `src/renderer/src/App.test.tsx` (extend store mock only if rendering breaks — see Step 6)

**Interfaces:**
- Consumes: `window.api.search.query(projectId, term)` (Task 1); store members `project`, `modules`, `openRequirement(req)`, `selectModule(id)`, `setActiveTab(tab)`.
- Produces: `data-testid="search-results"` dropdown; input `aria-label="Global search"`.

- [ ] **Step 1: Write failing component tests**

Create `src/renderer/src/components/GlobalSearch/index.test.tsx`. Store mock follows the stable-`storeState` module-mock idiom (see `RequirementDetail/traceability.test.tsx`); `window.api.search.query` mocked directly; debounce driven by fake timers:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import GlobalSearch from './index'
import type { SearchResults } from '../../../../types'

const mockOpenRequirement = vi.fn()
const mockSelectModule = vi.fn()
const mockSetActiveTab = vi.fn()
const mockQuery = vi.fn()

const storeState: Record<string, unknown> = {}

vi.mock('../../store', () => ({
  useStore: (): Record<string, unknown> => storeState
}))

function results(over: Partial<SearchResults>): SearchResults {
  return { requirements: [], modules: [], headings: [], ...over }
}

const req = {
  id: 7, moduleId: 3, reqId: 'SRS-0007', text: 'The system shall search.',
  acceptanceCriteria: null, source: null, rationale: null, position: 0,
  status: 'Draft', priority: 'Medium', reqType: 'Functional', headingId: null,
  deletedAt: null, createdAt: '', updatedAt: ''
}
const mod = { id: 3, projectId: 1, parentId: null, name: 'SRS', idPrefix: 'SRS', idPadding: 4, nextCounter: 1, position: 0, deletedAt: null, createdAt: '', updatedAt: '' }
const heading = { id: 9, moduleId: 3, parentId: null, title: 'Performance', position: 0, deletedAt: null, createdAt: '', updatedAt: '' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  mockQuery.mockResolvedValue(results({}))
  ;(window as any).api = { ...(window as any).api, search: { query: mockQuery } }
  Object.assign(storeState, {
    project: { id: 1, name: 'P' },
    modules: [mod],
    openRequirement: mockOpenRequirement,
    selectModule: mockSelectModule,
    setActiveTab: mockSetActiveTab
  })
})

afterEach(() => {
  vi.useRealTimers()
})

async function typeAndSettle(value: string): Promise<void> {
  fireEvent.change(screen.getByLabelText('Global search'), { target: { value } })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250)
  })
}

describe('GlobalSearch', () => {
  it('does not query below 2 characters', async () => {
    render(<GlobalSearch />)
    await typeAndSettle('a')
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('debounces and queries once with the trimmed term', async () => {
    render(<GlobalSearch />)
    await typeAndSettle('  audit ')
    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(mockQuery).toHaveBeenCalledWith(1, 'audit')
  })

  it('renders grouped results and omits empty groups', async () => {
    mockQuery.mockResolvedValue(results({ requirements: [req], headings: [heading] }))
    render(<GlobalSearch />)
    await typeAndSettle('perf')
    const panel = screen.getByTestId('search-results')
    expect(within(panel).getByText('Requirements')).toBeInTheDocument()
    expect(within(panel).getByText('SRS-0007')).toBeInTheDocument()
    expect(within(panel).getByText('Sections')).toBeInTheDocument()
    expect(within(panel).getByText('Performance')).toBeInTheDocument()
    expect(within(panel).queryByText('Modules')).toBeNull()
  })

  it('shows No matches when all groups are empty', async () => {
    mockQuery.mockResolvedValue(results({}))
    render(<GlobalSearch />)
    await typeAndSettle('zzz')
    expect(within(screen.getByTestId('search-results')).getByText('No matches.')).toBeInTheDocument()
  })

  it('requirement row navigates via openRequirement and clears the input', async () => {
    mockQuery.mockResolvedValue(results({ requirements: [req] }))
    render(<GlobalSearch />)
    await typeAndSettle('search')
    fireEvent.click(screen.getByText('SRS-0007'))
    expect(mockOpenRequirement).toHaveBeenCalledWith(req)
    expect((screen.getByLabelText('Global search') as HTMLInputElement).value).toBe('')
    expect(screen.queryByTestId('search-results')).toBeNull()
  })

  it('module row switches tab and selects the module', async () => {
    mockQuery.mockResolvedValue(results({ modules: [mod] }))
    render(<GlobalSearch />)
    await typeAndSettle('srs')
    fireEvent.click(within(screen.getByTestId('search-results')).getByText('SRS'))
    expect(mockSetActiveTab).toHaveBeenCalledWith('requirements')
    expect(mockSelectModule).toHaveBeenCalledWith(3)
  })

  it('heading row switches tab and selects its module', async () => {
    mockQuery.mockResolvedValue(results({ headings: [heading] }))
    render(<GlobalSearch />)
    await typeAndSettle('perf')
    fireEvent.click(screen.getByText('Performance'))
    expect(mockSetActiveTab).toHaveBeenCalledWith('requirements')
    expect(mockSelectModule).toHaveBeenCalledWith(3)
  })

  it('Escape closes the dropdown', async () => {
    mockQuery.mockResolvedValue(results({ requirements: [req] }))
    render(<GlobalSearch />)
    await typeAndSettle('search')
    expect(screen.getByTestId('search-results')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByLabelText('Global search'), { key: 'Escape' })
    expect(screen.queryByTestId('search-results')).toBeNull()
  })

  it('Cmd+K focuses the input', () => {
    render(<GlobalSearch />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(document.activeElement).toBe(screen.getByLabelText('Global search'))
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/GlobalSearch`
Expected: FAIL — module `./index` has no component / renders nothing.

- [ ] **Step 3: Implement the component**

Create `src/renderer/src/components/GlobalSearch/index.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store'
import type { SearchResults } from '../../../../types'

export default function GlobalSearch(): JSX.Element | null {
  const { project, modules, openRequirement, selectModule, setActiveTab } = useStore()
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null) // null = dropdown closed
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    function onDown(e: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setResults(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  useEffect(() => {
    const trimmed = term.trim()
    if (!project || trimmed.length < 2) {
      setResults(null)
      return
    }
    const t = setTimeout(() => {
      window.api.search
        .query(project.id, trimmed)
        // Stale-response guard: only apply if the input still holds the term this query was issued for.
        .then((r) => {
          if (inputRef.current?.value.trim() === trimmed) setResults(r)
        })
        .catch(() => setResults(null))
    }, 200)
    return () => clearTimeout(t)
  }, [term, project?.id])

  if (!project) return null

  const moduleName = (id: number): string => modules.find((m) => m.id === id)?.name ?? ''
  const isEmpty =
    results !== null &&
    results.requirements.length === 0 && results.modules.length === 0 && results.headings.length === 0

  function go(navigate: () => void): void {
    navigate()
    setTerm('')
    setResults(null)
  }

  return (
    <div ref={rootRef} className="relative w-64">
      <input
        ref={inputRef}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setResults(null)
            inputRef.current?.blur()
          }
        }}
        placeholder="Search…  ⌘K"
        aria-label="Global search"
        className="w-full text-sm px-3 py-1.5 rounded border border-white/30 bg-white/10 text-white placeholder-white/50 focus:outline-none focus:border-white/60"
      />
      {results !== null && (
        <div
          data-testid="search-results"
          className="absolute top-full mt-1 left-0 w-80 max-h-96 overflow-auto bg-white border border-line rounded shadow-lg z-50"
        >
          {isEmpty && <div className="px-3 py-2 text-sm text-ink-faint">No matches.</div>}
          {results.requirements.length > 0 && (
            <Group label="Requirements">
              {results.requirements.map((r) => (
                <Row key={r.id} onClick={() => go(() => { openRequirement(r) })}>
                  <span className="text-xs font-mono text-ink-faint shrink-0">{r.reqId}</span>
                  <span className="text-sm text-ink truncate">{r.text || '—'}</span>
                </Row>
              ))}
            </Group>
          )}
          {results.modules.length > 0 && (
            <Group label="Modules">
              {results.modules.map((m) => (
                <Row key={m.id} onClick={() => go(() => { setActiveTab('requirements'); selectModule(m.id) })}>
                  <span className="text-sm text-ink truncate">{m.name}</span>
                </Row>
              ))}
            </Group>
          )}
          {results.headings.length > 0 && (
            <Group label="Sections">
              {results.headings.map((h) => (
                <Row key={h.id} onClick={() => go(() => { setActiveTab('requirements'); selectModule(h.moduleId) })}>
                  <span className="text-sm text-ink truncate">{h.title || 'Untitled section'}</span>
                  <span className="text-xs text-ink-faint shrink-0">{moduleName(h.moduleId)}</span>
                </Row>
              ))}
            </Group>
          )}
        </div>
      )}
    </div>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="py-1">
      <div className="px-3 py-1 text-[11px] font-semibold tracking-wider uppercase text-ink-faint">{label}</div>
      {children}
    </div>
  )
}

function Row({ onClick, children }: { onClick: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-baseline gap-2 px-3 py-1.5 text-left hover:bg-action-tint/20"
    >
      {children}
    </button>
  )
}
```

Note: `selectModule` returns a promise; the `go` wrapper fires it without awaiting — matches the codebase's fire-and-forget convention for navigation actions (`openRequirement` is called the same way from Dashboard rows).

- [ ] **Step 4: Run tests — pass**

Run: `./node_modules/.bin/vitest run src/renderer/src/components/GlobalSearch`
Expected: 9/9 PASS.

- [ ] **Step 5: Mount in App header**

In `src/renderer/src/App.tsx`: add `import GlobalSearch from './components/GlobalSearch'`, then in the header change

```tsx
        <div className="ml-auto flex items-center gap-3">
          {project && <span className="text-sm text-white/50">{project.name}</span>}
```

to

```tsx
        <div className="ml-auto flex items-center gap-3">
          <GlobalSearch />
          {project && <span className="text-sm text-white/50">{project.name}</span>}
```

(`GlobalSearch` itself returns `null` when no project is open.)

- [ ] **Step 6: Run App + full renderer suites**

Run: `./node_modules/.bin/vitest run src/renderer/src/App.test.tsx src/renderer/src/components/GlobalSearch`
Expected: all green. If `App.test.tsx` fails because its store mock lacks `modules` or the navigation actions `GlobalSearch` destructures, extend that mock additively (the mock likely already has `modules`; add `openRequirement`, `selectModule`, `setActiveTab` stubs only if missing — never weaken assertions). `window.api.search` is NOT needed in App tests: with an empty input the query effect never fires.

Then: `./node_modules/.bin/vitest run src/renderer`
Expected: only the 1 pre-existing ArchitectureCanvas failure.

- [ ] **Step 7: Typecheck + commit**

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.web.json
git add src/renderer/src/components/GlobalSearch src/renderer/src/App.tsx src/renderer/src/App.test.tsx
git commit -m "feat(search): nav-bar global search — debounced grouped dropdown, ⌘K, click-through navigation"
```

(Drop `App.test.tsx` from the `git add` if it needed no change.)

---

### Task 3: Verification — full suite, typechecks, build

**Files:** none (verification only; fix regressions if found and document them).

- [ ] **Step 1: Full suite vs baseline**

Run: `./node_modules/.bin/vitest run`
Expected: failures = 47 main-process ABI + 1 pre-existing ArchitectureCanvas, nothing else.

- [ ] **Step 2: Both typechecks**

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.node.json
./node_modules/.bin/tsc --noEmit -p tsconfig.web.json
```
Expected: clean.

- [ ] **Step 3: Build**

Run: `./node_modules/.bin/electron-vite build`
Expected: 3 targets build clean.

- [ ] **Step 4: Commit (only if fixes were needed)**

If Steps 1-3 forced changes, commit them with a message describing the fix; otherwise nothing to commit.

---

## Post-plan verification (controller, not a task)

Playwright driver against SmokeTest: type a term hitting a requirement + module + heading (e.g. "SRS" or "perf") — grouped dropdown appears with correct groups; click a requirement result → Requirements tab + module selected + drawer open on it; click a module result → module's list shown; click a heading result → heading's module selected; term below 2 chars shows nothing; term with `%` matches literally (no wildcard blowup); Esc closes; ⌘K focuses the input; "No matches." for gibberish.
