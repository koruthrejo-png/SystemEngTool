# Handoff: ReqArch2 — Current State

## What's Been Built (as of 2026-07-07)

### Core App — Working
The app launches, creates/opens projects, manages modules, and all IPC is wired. Key fixes that unblocked everything:
- Preload outputs as CJS (`out/preload/index.js`) — electron-vite was building `.mjs` which Electron silently rejected in sandboxed mode
- `better-sqlite3` replaced with Electron ABI 125 prebuilt binary (`electron-v125-darwin-arm64`)
- `handleNewProject` in `App.tsx` uses the returned project directly instead of calling `loadProject()` again

### Requirements List Improvements — COMPLETE (all 7 tasks)
Plan: `docs/superpowers/plans/2026-07-01-requirements-list-improvements.md`. All committed to `main`, smoke-tested end-to-end in the running app (Playwright driver at `.claude/skills/run-app/driver.mjs`). Delivered:
- Custom fields: types + DB migration, IPC handlers (`src/main/handlers/requirementCustomFields.ts`), preload API, store actions, detail-panel UI with save-on-blur and "+ Add Field"
- Soft delete/restore: `requirements:listDeleted` IPC, "Show deleted" toggle, hover-reveal × delete, Restore button
- RequirementsList rewritten as 6-column CSS grid table (ID | Requirement | Acceptance Criteria | Source | Rationale | actions)
- Post-review fixes: auto-focus intent flag (`focusNewField`) replaced fragile count-based check (`4998731`); pre-existing tsc import-path errors fixed (`b6738b8`)

### UI Overhaul (Industrial Precision) — COMPLETE
Plan: `docs/superpowers/plans/2026-07-02-ui-overhaul.md` (base commit `5886086`). Spec: `docs/superpowers/specs/2026-07-02-ui-overhaul-design.md`. Design source: Stitch project `9610086237141072081`. Mockups + Stitch HTML: `docs/superpowers/specs/assets/2026-07-02-ui/`.
Executed via subagent-driven development; per-task briefs/reports and review diffs live in `.superpowers/sdd/`, ledger in `.superpowers/sdd/progress.md` (second section). Visually verified in running app via Playwright driver (Task 9).

- [x] **Task 1 — Fonts, Tailwind tokens, test baseline** (`5886086..1710037`) — bundled Inter + JetBrains Mono woff2, semantic color tokens in `tailwind.config.js`, baseline test failures captured
- [x] **Task 2 — UI primitives** (`1710037..5a6f6c1`) — `src/renderer/src/components/ui/index.tsx`: Button, Input, Textarea, Select, SectionLabel, Panel + tests
- [x] **Task 3 — App shell** (`5a6f6c1..3d302ff`) — navy shell bar, tabs, modal, panel wrappers in `App.tsx`; review fix in `3d302ff` added `customFields` to App.test.tsx baseStore mock (recovered 4 pre-existing failures)
- [x] **Task 4 — Module sidebar / Project Explorer** (`3d302ff..15e89c2`) — ModuleTree index/ModuleNode/NewModuleForm restyled with tokens + primitives; button copy now "+ New Module" (test updated)
- [x] **Task 5 — Requirements Table + Toolbar** (`15e89c2..d73e913`) — RequirementsList: toolbar with module name/show-deleted/item-count/+ New Requirement, zebra rows, mono IDs, green left-accent selection, label-caps column headers
- [x] **Task 6 — Requirement Details Drawer** (`f8214f2..1eb7972`) — RequirementDetail: "Requirement Details" heading, label-caps field labels, CUSTOM FIELDS section, auto-focus on new field, blur-save, × remove; fixed OOM render loop (stable store mock in tests)
- [x] **Task 7 — Architecture View** (`1eb7972..7947812`) — ArchitectureCanvas: dot-grid background, navy header-strip block nodes with mono IDs, palette-colored edges with label
- [x] **Task 8 — Element & Connection Properties Panels** (`7947812..f2a2894`) — ElementPanel + ConnectionPanel: "Properties" heading, label-caps fields (NAME, TYPE, DESCRIPTION, COLOR, REQUIREMENTS)
- [x] **Task 9 — Build, visual verification, docs** — typechecks clean (node + web); vitest 45 failed / 40 passed (≤ 52 baseline); 3-target build clean; running-app visual + interaction checks all pass

**Next feature queue:** see the Deferred Backlog section in `docs/superpowers/specs/2026-07-02-ui-overhaul-design.md`.

Post-overhaul wrap-up (2026-07-03, after Task 9):
- Final whole-branch review (5886086..7706d84) came back "ready to merge with fixes"; fixes applied in `5b8aaaa` (last two `text-gray-500` → `text-ink-muted` in ElementPanel/ConnectionPanel, `text-xs` → `!text-xs` on their Delete buttons, handoff PATH note). Reviewer triage of carried-forward minors is recorded at the bottom of `.superpowers/sdd/progress.md`.
- `87b209a` updated the design spec: backlog items 16 (component library palette) amended, 17 (zoom-controls restyle) added, plus a "Ratified deviations from the mockups" list (ring-action/60, node names text-sm, default RF controls, native rename input).

### Requirement Metadata & Filtering — COMPLETE (backlog items 1, 2, 3, 6)
Plan: `docs/superpowers/plans/2026-07-03-requirement-metadata.md` (commits `546f4d7..a6eb0c8`). Executed via subagent-driven development (third ledger section in `.superpowers/sdd/progress.md`); final whole-branch review: ready to merge, no Critical/Important findings. Verified end-to-end in the running app (migration defaults on legacy rows, chips, filters, persistence across relaunch, filter reset on module switch — screenshots in task-6 report). Delivered:
- DB: `status`/`priority`/`req_type` TEXT NOT NULL columns (defaults Draft/Medium/Functional) via `addColumnIfMissing`; no new IPC — edits flow through `requirements:update`
- Types: `REQUIREMENT_STATUSES`/`REQUIREMENT_PRIORITIES`/`REQUIREMENT_TYPES` const arrays + derived unions in `src/types/index.ts`; `Requirement.status/priority/reqType`
- Store: `statusFilter`/`priorityFilter`/`typeFilter` (+setters), reset to 'All' on module switch
- UI: `Chip` primitive (token-colored, shared value-key namespace — statuses and priorities must never overlap); RequirementsList 9-column grid with Type text + Status/Priority chips + filter-select toolbar; RequirementDetail Type/Status/Priority selects saving on change
- Deferred minors folded in: `vi.clearAllMocks()` in RequirementDetail tests; RequirementsList toolbar-behavior tests
- Test baseline is now 48 failed / 55 passed — all failures are the sqlite ABI mismatch (see Environment Notes) + 1 pre-existing ArchitectureCanvas test; every renderer file passes

### Row Checkboxes & Bulk Actions — COMPLETE (backlog item 5)
Plan: `docs/superpowers/plans/2026-07-04-bulk-actions.md` (commits `96da68a..cec91c7`). Executed via subagent-driven development (fourth ledger section in `.superpowers/sdd/progress.md`); final whole-branch review (opus): ready to merge, no Critical/Important; the one mandated fix (stale `checkedIds` when a checked row is deleted via the single-row ×) landed in `cec91c7`. Verified end-to-end in the running app (6/6 checks: checkboxes absent in deleted view, bulk bar count, select-all, bulk status update, delete→restore round-trip, filter-change clears selection). Delivered:
- Store: `checkedIds: number[]` + `toggleChecked`/`setChecked`/`updateRequirements`/`removeRequirements`; every scope change (module switch, show-deleted, all three filters) and every bulk op clears `checkedIds`; single-row delete prunes its id — the invariant is "checked set only ever contains visible rows" and `allChecked` silently relies on it
- UI: 10-column grid (28px checkbox column first), select-all header checkbox targeting displayed (filtered) rows, bulk bar (`N selected`, Set status, Set priority, Delete selected, Clear) rendered only when `!showDeleted && checkedIds.length > 0`; `BulkSelect` helper with disabled `value=""` placeholder; no new IPC — bulk ops loop per-row IPC via `Promise.all`
- Driver tooling (unrelated commit `083febd`): `resize` command in `.claude/skills/run-app/driver.mjs` (closes DevTools, sets content size) for usable screenshots
- Test baseline is now 48 failed / 69 passed (failures: 47 sqlite ABI + 1 pre-existing ArchitectureCanvas; every renderer file passes)

### Requirements-tab layout fixes (controller hotfix, outside SDD)
Commit `6f5f8f0`. Root cause of "can't restore deleted requirements": the always-open detail panel + fixed grid pushed the actions column off-screen with no horizontal scroll — restore worked, the button was unreachable. Delivered: detail panel renders only when a requirement is selected; header+rows share one `overflow-auto` container (sticky header); draggable column widths (min 48px, persisted to localStorage key `reqarch.reqTable.colWidths.v1`).

### Canvas Resize, Nesting & 4-Side Handles — COMPLETE
Plan: `docs/superpowers/plans/2026-07-04-canvas-resize-nesting-handles.md` (commits `8cef5b3..d021616`). Fifth ledger section in `.superpowers/sdd/progress.md`; final whole-branch review (opus): with fixes, both applied and live-verified (`e45f819` store re-sync on element delete — the Critical; `d021616` top/left resize position persistence). Delivered:
- Blocks resize via NodeResizer (selected only, min 140x60); position AND size persisted on resize end (top/left handles included)
- Drag-to-nest: pure geometry module `ArchitectureCanvas/nodes.ts` (`buildNodes` parents-first + orphan guard, `resolveDrop` center-point innermost-candidate + descendant exclusion, `absolutePosition`); child positions stored parent-relative; un-nest by dragging out (no `extent`); deleting an element reparents children to grandparent with position compensation (SQL in `deleteElement`), and `removeElement` re-syncs elements+connections from DB after delete — do NOT regress this to a local filter
- 4 source-type handles (left/right/top/bottom) + `ConnectionMode.Loose`; `source_handle`/`target_handle` columns persist the chosen sides; legacy NULL rows render right→left via edge-mapping defaults
- Driver gained a real-mouse `mouse` command (`4a20f20`) — drags in the running app are now scriptable
- Test baseline: 48 failed (unchanged composition) / 87 passed
- Known deferrals (ledger): ConnectionPanel test fixture needs sourceHandle/targetHandle when that panel consumes them; absolutePosition cycle guard; 3-level nesting test; resolveDrop equal-area tiebreak
- Note: SmokeTest dev project contains some leftover scratch blocks/connections from driver verification

### Headings, Traceability Matrix & Dashboard — COMPLETE
Plan: `docs/superpowers/plans/2026-07-05-headings-traceability-dashboard.md` (commits `2f6be32..a004223`). Sixth ledger section; final whole-branch review (opus): ready to merge, no Critical/Important. Live-verified end-to-end (heading create/rename/numbering/collapse, section select in drawer, 16×11 traceability matrix with live toggle + DB round-trip, dashboard KPIs/breakdowns/navigation). Delivered:
- `req_headings` table (tree via `parent_id`, `position` ordering, depth guard max 2 levels) + CRUD/move IPC; requirements get `heading_id`
- Outline helper (`buildOutline`) numbers sections `1`, `1.1`; RequirementsList renders heading rows (rename inline, add sub/req to section, collapse, move up/down); drawer "Section" select
- Traceability tab: req×element matrix, cell click toggles element↔requirement link; Dashboard tab: KPI cards, status donut, per-module coverage bars, recent activity, critical gaps, unallocated list — rows navigate to the requirement

### Dashboard Executive Restyle — COMPLETE
Plan: `docs/superpowers/plans/2026-07-06-dashboard-redesign.md` (commits `61cb1ab..72b1a30`). Spec: `docs/superpowers/specs/2026-07-06-dashboard-redesign-design.md`. Seventh ledger section; final review: ready to merge. Live-verified (KPIs, donut percentages, module bars, activity badges, tab navigation, drawer open from activity row). Also RESOLVED the "renderer reloads spontaneously in driver sessions" mystery: window was closed externally during idle; the app's `activate` handler recreates a default-size window — not an app bug. Driver now logs lifecycle events + re-points at recreated windows (`f96d0fb`).

### Requirement Hierarchy & Derivation Traceability — COMPLETE
Plan: `docs/superpowers/plans/2026-07-06-requirement-hierarchy.md` (commits `f96d0fb..1efbe67`). Spec: `docs/superpowers/specs/2026-07-06-requirement-hierarchy-design.md`. Eighth ledger section; final whole-branch review (opus): ready to merge, no Critical/Important. Live-verified (submodule create/indent/collapse, move picker, cycle guard at both UI and backend layers, bidirectional drawer links, Derivation Coverage counts per module×direction, unlinked-req navigation, relaunch persistence). Delivered:
- Modules backend: `moveModule` with ancestor-walk cycle guard; `deleteModule` reparents children to grandparent (transaction)
- `requirement_links` table (composite PK `(parent_req_id, child_req_id)`, matches sibling link tables) + add/remove/listByProject IPC with derivation-cycle guard; listings join out soft-deleted reqs on both sides
- Store: `reqLinks` + `loadTraceability`/`addReqLink`/`removeReqLink`; `removeModule` re-syncs from DB (children reparented server-side — do NOT regress to local filter)
- Sidebar module tree: add-submodule (+) and move (⇄, descendants excluded from targets) on hover; pure helpers in `ModuleTree/moduleTree.ts` (orphan-safe)
- Drawer Traceability section: Derives from / Derived by lists (navigate + × remove), module→requirement picker, Add as parent/child buttons (picker resets after add — regression-tested)
- Dashboard Derivation Coverage card: module filter + hasParent/hasChildren toggle, `derivationStats` pure helper, unlinked list navigates to requirement
- Test baseline: 48 failed (unchanged: 47 sqlite ABI + 1 pre-existing ArchitectureCanvas) / 149 passed

## Next Step: pick the next backlog slice

Nothing in flight. Next candidates from the Deferred Backlog in `docs/superpowers/specs/2026-07-02-ui-overhaul-design.md`: item 7 (structured acceptance-criteria checklist), 8 (Trace to Architecture linking UI), 4 (global search), 16/17 (component library + RF controls restyle). Follow the same flow: superpowers:writing-plans → subagent-driven-development (append new ledger section).

Known deferrals from final reviews (all triaged non-blocking, recorded in the ledger): only 3/7 chip mappings test-asserted; no change-test for the Type select; optional DB `CHECK` constraint on enum columns if write paths multiply; unawaited fire-and-forget mutation promises (singular + bulk) — a codebase-wide error-surfacing pass is the right home; batched `aria-pressed` pass for toggle-group buttons; `requirement_links(child_req_id)` index if link volume grows.

---

## Key Files

| File | Purpose |
|---|---|
| `src/main/index.ts` | App entry, all IPC handler registration |
| `src/main/db/migrations.ts` | DB schema + migrations |
| `src/main/handlers/requirements.ts` | Requirements CRUD + listDeleted/restore |
| `src/main/handlers/requirementCustomFields.ts` | Custom fields CRUD |
| `src/preload/index.ts` | contextBridge API surface |
| `src/types/index.ts` | All TypeScript types |
| `src/types/api.d.ts` | `window.api` type declarations |
| `src/renderer/src/store/index.ts` | Zustand store — all app state |
| `tailwind.config.js` | Semantic design tokens + font families |
| `src/renderer/src/components/ui/index.tsx` | Shared UI primitives (Button, Input, Textarea, Select, SectionLabel, Panel) |
| `src/renderer/src/components/RequirementsList/index.tsx` | Requirements table UI (Task 5 target) |
| `src/renderer/src/components/RequirementDetail/index.tsx` | Requirement detail + custom fields (Task 6 target) |
| `.superpowers/sdd/progress.md` | SDD task ledger (both plans) |

## Environment Notes
- Electron 31, Node ABI 125
- `better-sqlite3` native binary is `electron-v125-darwin-arm64` (in `node_modules/better-sqlite3/build/Release/`)
- `npm`/`node` NOT in shell PATH — export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" — or use `./node_modules/.bin/*` directly
- Preload must be CJS (`format: 'cjs'` in `electron.vite.config.ts`) — configured already
- Debug log at `/tmp/reqarch-debug.txt` (written from main process + renderer via `window.api.debugLog`)
- Stitch MCP server available: `claude mcp add stitch --transport http -H "X-Goog-Api-Key: ..." https://stitch.googleapis.com/mcp`

## Branch
`main` — all work committed directly to main. Latest commit at handoff: `1efbe67` (feat(dashboard): filterable derivation coverage card — requirement hierarchy plan complete).

## Environment gotcha found this session
The `npm` shim in the Logi node22 distribution is broken (`npm-cli.js: No such file or directory`). Use `./node_modules/.bin/*` binaries directly (`vitest`, `tsc`, `electron-vite`) — `node` itself works fine from that PATH.
