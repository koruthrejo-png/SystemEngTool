# Global Search — Design

**Date:** 2026-07-07
**Backlog item:** 4 (Deferred Backlog, `2026-07-02-ui-overhaul-design.md`) — "Global search box in the nav bar"
**Approach chosen:** backend search IPC (over renderer-side store filtering — incomplete unless all data eagerly loaded — and SQLite FTS5 — overkill at desktop scale).

## Goal

A search box in the navy shell bar that finds requirements, modules, and section headings across the whole project by substring, with a grouped results dropdown whose rows navigate to the hit.

## Scope

Searchable: requirements (`req_id`, `text`, `source`, `rationale`), modules (`name`), headings (`title`).

Out of scope: architecture elements/connections, custom-field values, acceptance-criteria item text, arrow-key result navigation, fuzzy matching, FTS5, search history, cross-project search.

## Backend

New `src/main/handlers/search.ts`, registered in `src/main/index.ts`, one channel:

- `search:query(projectId: number, term: string): SearchResults`

Behavior:

- Case-insensitive substring match: `LIKE '%' || ? || '%'` with the raw term parameterized (SQLite `LIKE` is case-insensitive for ASCII). `%` and `_` in the user's term are escaped (`ESCAPE '\'`) so they match literally.
- Empty/whitespace-only term returns empty groups (guard in handler; renderer also won't call below 2 chars).
- Soft-delete rules: requirements exclude `r.deleted_at IS NOT NULL` and join through modules to scope to the project and exclude deleted modules; modules exclude deleted; headings join through modules with both sides live.
- `LIMIT 10` per group, ordered: requirements by `req_id`, modules by `name`, headings by `title`.
- Rows map through the existing `rowToRequirement` / `rowToModule` / `rowToHeading` mappers (imported or duplicated per sibling-handler idiom — implementation plan decides based on what those files export).

## Types (`src/types/index.ts` + `api.d.ts` + preload)

```ts
export interface SearchResults {
  requirements: Requirement[]
  modules: Module[]
  headings: ReqHeading[]
}
```

`window.api.search.query(projectId, term): Promise<SearchResults>` mirrored in `src/preload/index.ts` and `src/types/api.d.ts`.

## UI — `src/renderer/src/components/GlobalSearch/index.tsx`

Mounted in the `App.tsx` navy header (`h-14 bg-navy`) between the tab nav and the right-side Open / New Project buttons.

- **Input:** compact, on-navy styling consistent with `secondary-on-navy` button treatment; placeholder `Search…  ⌘K`. Semantic tokens only.
- **⌘K / Ctrl+K:** global `keydown` listener (added on mount, removed on unmount) focuses the input.
- **Query:** component-local state (no store slice — results are ephemeral UI state). Debounce 200ms; fire only when trimmed term length ≥ 2; calls `window.api.search.query(project.id, term)` directly. Stale-response guard: a response is discarded if the term it was issued for no longer matches the current input.
- **Dropdown:** absolutely positioned panel under the input (`bg-white border border-line rounded shadow`), grouped with `SectionLabel`-style captions REQUIREMENTS / MODULES / SECTIONS; groups with no hits are omitted; all groups empty → single "No matches." row. Rows: requirements show mono `req_id` + truncated text; modules show name; headings show title + module name.
- **Navigation on row click:**
  - Requirement → existing `openRequirement(req)` (switches to Requirements tab, selects module, opens drawer, highlights row).
  - Module → `setActiveTab('requirements')` + `selectModule(module.id)`.
  - Heading → `setActiveTab('requirements')` + `selectModule(heading.moduleId)`.
  - After navigating: clear input, close dropdown.
- **Dismiss:** Esc closes the dropdown and blurs; clicking outside closes (document `mousedown` listener checking `contains`).
- Search renders only when a project is open (header already conditions its right-side controls on project state — same guard).

## Error Handling

The query promise carries a `.catch` that clears results and logs via the existing `window.api.debugLog` if available — search must never crash the shell bar. (Deliberate small deviation from the codebase's fire-and-forget convention: a background typeahead has no other error surface.)

## Testing

Renderer-only vitest (main verified by typecheck + live checks, per repo constraint):

- `GlobalSearch` component tests, mocking `window.api.search.query` and the store (stable `storeState` module-mock idiom): debounce with fake timers (no call below 2 chars, one call after settle), grouped rendering with group omission, "No matches." state, all three navigation paths (assert store-action calls + input cleared), Esc close, ⌘K focuses input.
- No store tests (no store slice added).

## Live Verification (post-plan)

Playwright driver: type a term matching a requirement + module + heading, confirm grouped dropdown; click each result type and confirm navigation (drawer open / module selected); ⌘K focuses; Esc closes; term with `%` matches literally; relaunch not needed (no persistence).
