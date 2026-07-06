# Requirement Hierarchy & Derivation Traceability (Design)

Date: 2026-07-06
Status: approved in conversation; awaiting spec review

## Goal

Let users organize requirement modules as a nested tree (high-level → progressively more technical), link requirements to their higher/lower-level equivalents ("derives from"), and see derivation coverage — filterable by module and direction — on the Dashboard.

## Decisions (confirmed with user)

1. **Modules nest, requirements don't.** Sidebar becomes a collapsible folder tree; each module keeps its flat requirements table + existing 2-level document headings. A requirement's "level" is implied by where its module sits in the tree. No level enum, arbitrary depth.
2. **Derives-from links between any two requirements**, across modules, directional: `child` derives from `parent`. No strict level-to-level enforcement.
3. **Links are created in the requirement detail drawer** (new "Traceability" section). A req×req matrix tab is a follow-up, not in scope.
4. **Migration:** existing modules get `parent_id = NULL` (top-level). Zero data risk; users re-organize afterwards via move.
5. **Dashboard:** a "Derivation Coverage" card with a module filter (All or any module) and a direction toggle (*Has parent* / *Has children*), showing linked/total, %, progress bar, and a clickable list of the unlinked requirements.

## Data layer (main process)

- `modules` table gains `parent_id INTEGER REFERENCES modules(id)` — nullable, added via the existing `addColumnIfMissing` migration helper.
- Handlers (`src/main/handlers/modules.ts`):
  - `createModule` accepts optional `parentId`.
  - `moveModule(id, newParentId: number | null)` — cycle guard: reject when `newParentId` is the module itself or any of its descendants (ancestor walk).
  - `deleteModule` reparents child modules to the deleted module's parent (same pattern as `deleteHeading`).
- New `requirement_links` table: `id`, `parent_req_id`, `child_req_id`, FKs to `requirements(id)`, `UNIQUE(parent_req_id, child_req_id)`, timestamps. Guards: no self-link; ancestor-walk cycle guard (A→B→A rejected at any depth).
- New handlers (`src/main/handlers/requirementLinks.ts`): `add(parentReqId, childReqId)`, `remove(parentReqId, childReqId)`, `listByProject(projectId)` (joins out soft-deleted requirements on both sides, scopes via module→project).
- Preload + `api.d.ts` mirrors for every new method (`modules.move`, `reqLinks.*`).

## Renderer

### Sidebar module tree
- Pure helper `src/renderer/src/components/Sidebar/moduleTree.ts` (pattern: `outline.ts`): flat modules → nested tree, orphan-safe (module with dangling parent renders as top-level), stable ordering (position, id).
- Sidebar renders collapsible folders: chevron toggles collapse (renderer state, not persisted), indent per depth, hover actions per module row:
  - **Add submodule** — creates child module.
  - **Move to…** — popover listing "(top level)" + all valid target modules (self and descendants excluded).
  - Existing select/rename/delete behavior unchanged.

### Detail drawer "Traceability" section (`RequirementDetail`)
- Two lists: **Derives from** (parents) and **Derived by** (children). Each row: `reqId` + truncated text; click navigates via existing `openRequirement`; × removes the link.
- Add-link control: module select → requirement select (excluding self and already-linked) → "Add as parent" / "Add as child".

### Store
- `modules` already loaded; add `moveModule`, `createModule` parentId passthrough.
- New state: `reqLinks: RequirementLink[]`, `loadReqLinks()`, `addReqLink(parentReqId, childReqId)`, `removeReqLink(parentReqId, childReqId)` — loaded with project (and refreshed by drawer actions). Type `RequirementLink { parentReqId: number; childReqId: number }`.

### Dashboard "Derivation Coverage" card
- Pure helper `derivationStats(requirements, reqLinks, moduleId: number | null, direction: 'hasParent' | 'hasChildren')` → `{ total, linked, pct, unlinked: Requirement[] }` in `Dashboard/stats.ts`.
- Card UI: filter row (module dropdown with indented tree order + "All modules"; direction toggle), linked/total + % + progress bar, clickable unlinked list (same pattern as Critical Trace Gaps; `openRequirement`). Empty states for no reqs / everything linked.

## Error handling / edge cases
- Cycle attempts (module move, req link) rejected in main with a thrown error; renderer ignores failed promise per existing convention.
- Soft-deleted reqs excluded from links listing and coverage math.
- Module with dangling `parent_id` (corruption) renders top-level, never vanishes.
- Deleting a requirement leaves link rows orphaned in DB but they are joined out everywhere; a cleanup pass is a follow-up if it ever matters.

## Testing
- Pure helpers (`moduleTree`, `derivationStats`) unit-tested (TDD).
- Store additions covered via existing store-test pattern.
- Renderer component tests: sidebar tree rendering/collapse/actions (mock store), drawer Traceability section add/remove/navigate, dashboard card filter + unlinked list.
- Main-process handlers: typecheck + live app verification only (better-sqlite3 ABI baseline).
- Post-plan live verification via Playwright driver: create submodule, move module, cycle rejection, add derives-from link across modules, coverage card filter both directions, click-through from unlinked list.

## Out of scope (follow-ups)
- Req×req derivation matrix tab; drag-and-drop module re-ordering; link types beyond derives-from (verifies, satisfies…); orphaned-link cleanup; persisted sidebar collapse state.
