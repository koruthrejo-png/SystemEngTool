# Handoff: ReqArch2 — Current State

## What's Been Built (as of 2026-07-11)

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

### Acceptance Criteria Checklist — COMPLETE (backlog item 7)
Plan: `docs/superpowers/plans/2026-07-07-acceptance-criteria-checklist.md` (commits `8a8830c..438041a`). Spec: `docs/superpowers/specs/2026-07-07-acceptance-criteria-checklist-design.md`. Ninth ledger section; final whole-branch review (opus): ready to merge, no Critical/Important. Live-verified (legacy free-text migrated line-per-item + column NULLed + relaunch idempotence, add/focus/blur-save/chip-cycle/move/remove, live table badge, persistence). Delivered:
- `acceptance_criteria` child table (text, Unverified/Passed/Failed status, position) + idempotent transactional line-split migration of legacy free text; `requirements.acceptance_criteria` column stays but is never read/written post-migration
- 6 IPC methods (`list`/`listByModule`/`create`/`update`/`remove`→`delete` channel/`move`) mirrored preload + api.d.ts; handler mirrors `requirementCustomFields.ts`, move mirrors `moveHeading`
- Store: `acItems` + per-module `acSummary` (one `listByModule` query, `summarize` pure helper in `store/acSummary.ts`); module-level `refreshAc` with stale-requirement guard
- Drawer: checklist section replaces textarea — status chip click-cycles (CHIP_STYLES gained Unverified/Passed/Failed), inline blur-save edit, ↑↓ move, × remove, + Add criterion with auto-focus (focusNewAc reset on requirement switch — regression-tested)
- Requirements table: Acceptance Criteria cell shows mono `passed/total` + first item, em-dash when empty
- Test baseline: 48 failed (unchanged: 47 sqlite ABI + 1 pre-existing ArchitectureCanvas) / 165 passed

### Global Search — COMPLETE (backlog item 4)
Plan: `docs/superpowers/plans/2026-07-07-global-search.md` (commits `f4fc503..4927f32`). Spec: `docs/superpowers/specs/2026-07-07-global-search-design.md`. Tenth ledger section; final whole-branch review (opus): ready to merge, no Critical/Important. Live-verified (grouped dropdown, all 3 navigation paths, wildcard escaping proven with "S%2", Esc, real ⌘K). Delivered:
- `search:query(projectId, term)` IPC — three parameterized LIKE queries (requirements req_id/text/source/rationale, module names, heading titles) with `ESCAPE '\'` + backslash-safe escaping, soft-deletes excluded, project-scoped, LIMIT 10/group; `rowToRequirement`/`rowToModule`/`rowToHeading` now exported and reused (not duplicated)
- `GlobalSearch` component in navy header: 200ms debounce, 2-char min, stale-response guard, grouped dropdown (empty groups omitted, "No matches."), row click navigates via `openRequirement`/`selectModule`+`setActiveTab`, Esc/outside-click close, ⌘K/Ctrl+K focus, null without project
- Test baseline: 48 failed (unchanged) / 174 passed
- Follow-up candidates (final-review minors): anchor heading clicks to the section, stale-guard out-of-order test, listbox aria if arrow-key nav ever lands

### Trace to Architecture — COMPLETE (backlog item 8)
Plan: `docs/superpowers/plans/2026-07-07-trace-to-architecture.md` (commits `f9a31a7..f96ba65`). Spec: `docs/superpowers/specs/2026-07-07-trace-to-architecture-design.md`. Eleventh ledger section; final whole-branch review (opus): ready to merge, no Critical/Important. Live-verified (list matrix-linked elements, Link via picker + DB row, Unlink + DB removal, picker exclusion + reset, row click → Architecture tab with element selected). Delivered:
- `ArchitectureSection` in the requirement drawer (after Traceability section): linked-element rows (mono blockId + name, click navigates via `setActiveTab('architecture')` + `selectElement`), × unlink and picker+Link add via existing `toggleTraceLink`, "None." empty state
- Pure renderer change — zero backend/store/preload/type changes; `elements` comes from `loadTraceability`, so the section works before the canvas is ever visited
- Test baseline: 48 failed (unchanged) / 180 passed
- Deferred: hoist the duplicated `loadTraceability` mount effect if a third drawer section ever consumes it

### Component Library Palette & Typed Nodes — COMPLETE (backlog item 16)
Plan: `docs/superpowers/plans/2026-07-08-component-library-typed-nodes.md`. Spec: `docs/superpowers/specs/2026-07-08-component-library-typed-nodes-design.md`. Commits `ee93fad..7589d28` (subagent-driven, 4 tasks; new ledger section in `.superpowers/sdd/progress.md`). UI-only on the existing `element_types` data model — no backend/DB/IPC. Delivered:
- `ArchitectureCanvas/ComponentLibrary.tsx` — left palette listing the project's `elementTypes` (seeded System/Subsystem/Component/Function/External) with color dots; click a row → `addElement({ projectId, elementTypeId, posX, posY })`. Toolbar `+ Object` kept for untyped blocks.
- `buildNodes(elements, elementTypes, connections, selectedId, onResizeEnd)` — now derives `typeName` (id→name lookup) and `connectionCount` (source-or-target incidence, self-loop once) into `BlockNodeData`.
- `BlockNode` header shows the type name (uppercase; replaces generic "Object" on unnamed typed nodes, leading tag on named ones) + a `⇆ N` port-count badge styled like the Nested pill, only when count > 0.
- Architecture view rewrapped into a flex row (palette + canvas); item-17 CanvasControls/zoom preserved.
- Also recovered 4 pre-existing `index.test.tsx` failures that item-17's CanvasControls had introduced (missing `useViewport`/`Panel`/zoom mocks) — `7589d28`. Remaining ArchitectureCanvas failure is a stale "connection mode toggle button" test (pre-existing, unrelated).
- Live-verified end-to-end (palette, click-to-add typed headers, untyped fallback, badges, relaunch persistence).

### Zoom/Fit Controls Restyle — COMPLETE (backlog item 17)
Commit `574cb9c`. Replaced default React Flow `<Controls>` with custom `CanvasControls` in `ArchitectureCanvas/index.tsx` — a bottom-left RF `<Panel>` using `useReactFlow` (zoomIn/zoomOut/fitView) + `useViewport` (live zoom %): token-styled white/blur card (zoom-in / live % / zoom-out, divider-separated) + a separate fit-view button with a corner-bracket SVG. Plain +/− glyphs and SVG per the app's no-Material-Symbols convention. Typecheck clean; live-verified (79%→114% on two zoom-ins, fit resets to 79%, buttons functional). Also this session: committed the orphaned `refreshAc` per-req summary optimization (`6454bc9`, drops a redundant listByModule IPC per AC mutation) + its test; gitignored `*.tsbuildinfo`.

### Architecture Canvas Undo/Redo — COMPLETE
Plan: `docs/superpowers/plans/2026-07-09-architecture-canvas-undo.md`. Commits `38d1d82..e4e522c`, merged to main at `bab0c1e`. Twelfth ledger section (`.superpowers/sdd/progress.md`); final whole-branch review (opus): ready to merge, no Critical/Important. Delivered:
- Undo/redo command stack in the store (create/delete/property-edit; geometry excluded) with cascade restore on delete; `elements`/`connections` restore exposed over the preload bridge
- Toolbar undo/redo buttons + keyboard shortcuts; final fixes (`e4e522c`): skip no-op undo steps from empty field blurs, resync store on command failure, ignore key autorepeat (`e.repeat`)
- Store tests 30/30

### Requirement Link UI — flat "+ Link" flow — COMPLETE
Commit `0be30c2`. Replaced the drawer's always-visible parent/child picker + "Add as parent"/"Add as child" buttons with a single merged **"Linked Requirements"** list and a **"+ Link"** button that reveals the module/requirement picker on demand (Add link / Cancel). New links store the current requirement as parent by convention; the merged list shows both directions and `×` remove picks the correct arg order per link. UI-only — the directional `requirement_links` table and the dashboard derivation-coverage card are unchanged. `traceability.test.tsx` updated (5/5); live-verified in-app (render, + Link picker, add SRS-0005, remove, self/already-linked exclusion; DB left clean).

Also fixed two pre-existing `tsc` errors in `src/renderer/src/store/index.ts` (lines 435/494, `ArchitectureElement`/`ArchitectureConnection` → `Record<string, unknown>` cast) that landed with the undo/redo merge — now `as unknown as Record<...>`. **Both typechecks (web + node) are clean again.**

### Interfaces Module — Interface Register — COMPLETE
Spec: `docs/superpowers/specs/2026-07-11-interfaces-module-design.md`. Plan: `docs/superpowers/plans/2026-07-11-interfaces-module.md` (commits `f538750..8026b6f`, base `b3f38c5`). Thirteenth ledger section in `.superpowers/sdd/progress.md`. Executed via subagent-driven development (6 tasks, each task-reviewed clean); final whole-branch review (opus) + full live-verify on the running app. The third build-order pillar (requirements → architecture → **interfaces** → V&V).

Core model: **an interface IS an architecture connection** — no new primary entity. The register derives its rows in the renderer from already-loaded `connections` + `elements` (no new backend join). Delivered:
- New `Interfaces` top-nav tab → `InterfaceRegister` component: project-wide table, one row per connection. Mandatory columns (never hideable): **Interface ID** (`conn_id`, e.g. `ICN-0001`), **From**/**To** object IDs (source/target element `blockId`, e.g. `SYS-001`). Optional toggleable columns: Name, Type, Description, + one per custom-field key.
- `connection_custom_fields` child table (mirrors `requirement_custom_fields`) + handler `src/main/handlers/connectionCustomFields.ts` (`list`/`listByProject`/`create`/`update`/`delete`); `listByProject` joins connections, project-scoped, excludes soft-deleted. Preload bridge + `api.d.ts` + types (`ConnectionCustomField`, `UpdateConnectionCustomFieldInput`).
- Pure helper `src/renderer/src/components/InterfaceRegister/rows.ts` (`buildInterfaceRows`, `customFieldKeys`, `loadColumnVisibility`/`saveColumnVisibility` → localStorage key `reqarch.interfaceRegister.columns.v1`); custom-field keys auto-become default-on toggleable columns.
- Store: `activeTab` gained `'interfaces'`; `connectionCustomFields` (selected connection, for the drawer) + `projectConnectionCustomFields` (all, for register columns) kept in sync across add/update/remove; `loadInterfaces` reuses the architecture list calls + `connectionCustomFields.listByProject`.
- Drawer reuses the existing `ConnectionPanel` (now with a Custom Fields section — `defaultValue`+`onBlur` uncontrolled inputs, `+ Add Field`, `×` remove), so custom fields are also editable from the architecture canvas. Register row click → `selectConnection` opens the same drawer.
- `+ New Interface` toolbar form: two element `Select`s → `addConnection` (existing IPC, auto-assigns next `ICN-000N`) → re-syncs register; canvas-drawn connections appear automatically.
- Live-verified on SmokeTest: register lists ICN-0001..4 with correct SYS-* endpoints; add custom field Protocol=CAN → column appears with value; column toggle hides + persists to localStorage; DB value + hidden column survive relaunch; `+ New Interface` created ICN-0005. Renderer vitest 205/205, both typechecks clean.
- Out of scope (deferred, recorded in spec): N² matrix, element ports, structured data-items child list, fixed protocol/direction schema (custom fields cover these), interface↔requirement column in the register (`connection_requirement_links` already editable in the drawer).
- Known minors (non-blocking, in ledger): `customFieldKeys` O(n²) `includes`; redundant `?? ''` in `buildInterfaceRows`; `loadColumnVisibility` runs twice on mount; `loadInterfaces` double-fetch on first tab visit (register mount effect + App tab-switch effect). Orphaned `connection_custom_fields` rows remain when a connection is soft-deleted (register/drawer never read them; a hard-delete cleanup is a future nicety).

### Architecture Tab: Multiple Architectures — COMPLETE (sub-project 1 of 2)
Combined spec: `docs/superpowers/specs/2026-07-11-multiple-architectures-and-layers-design.md` (commit `a5016b1`). Plan: `docs/superpowers/plans/2026-07-11-multiple-architectures.md`. Commits `60700a2..cbe4b4e` (base `b0fdb2f`). Fourteenth ledger section in `.superpowers/sdd/progress.md`. Executed via subagent-driven development (6 tasks, each task-reviewed clean); final whole-branch review (opus): "ready with fixes" — both applied. Delivered:
- DB: `architectures` table (per-project, soft-delete, position-ordered); nullable `architecture_id` on `architecture_elements`/`architecture_connections`; idempotent migration creates a per-project **"Default"** architecture and backfills orphaned rows. Handler `src/main/handlers/architectures.ts` (list/create/rename/delete + exported `getOrCreateDefaultArchitecture`; last-architecture delete guard, transactional cascade soft-delete of blocks/connectors).
- `elements/connections.list(projectId, architectureId?)` — OPTIONAL filter, non-breaking: canvas loads the active architecture, the project-wide Interface Register + traceability load ALL rows (unfiltered). `createElement`/`createConnection` derive a non-null architecture when input is null (connection prefers source element's architecture, else Default; element falls back to Default) — see final-review fix.
- Store: `architectures` + `activeArchitectureId` (persisted per project in localStorage `reqarch.activeArchitecture.<projectId>`), `loadArchitectures`/`setActiveArchitecture`/`addArchitecture`/`renameArchitecture`/`removeArchitecture`; canvas load filters by active id; `addElement`/`addConnection` stamp active id; `removeElement` re-syncs architecture-scoped; `setActiveArchitecture` clears selection + undo/redo history.
- UI: sub-tab strip `src/renderer/src/components/ArchitectureCanvas/ArchitectureTabs.tsx` above the canvas (switch/create/rename inline/delete-with-confirm, `×` hidden when only one architecture). Interface Register gained a toggleable **Architecture** column (`buildInterfaceRows` 5th arg + `loadInterfaces` also loads architectures).
- Final whole-branch review found 2 cross-task seam bugs, both fixed in `cbe4b4e`: (1) register-created interfaces stamped null architecture when Architecture tab never opened → orphaned/swept-to-Default; root-caused in the create handlers, live-verified with a pre/post control (NULL → `architecture_id=1`). (2) global undo/redo stack not cleared on architecture switch → undo mutated a hidden diagram. Renderer vitest 212/212, both typechecks clean, `electron-vite build` clean, all 5 live-verify checks passed via Playwright driver (screenshots, 2 launches).
- Known deferrals (ledger, non-blocking): `CreateArchitectureInput` dead (could delete); `renameArchitecture` blind reselect (codebase convention); `removeArchitecture` non-optional `architectures[0].id` (safe by server last-arch guard); sub-tabs are `<div onClick>` not `role=tab` → fold into the batched a11y follow-up.

### Architecture Left-Nav + Per-Architecture Interfaces + Object-Name Columns — COMPLETE
Spec: `docs/superpowers/specs/2026-07-12-architecture-nav-and-per-architecture-interfaces-design.md` (commit `a08ea10`). Plan: `docs/superpowers/plans/2026-07-12-architecture-nav-and-per-architecture-interfaces.md` (commit `8077fd6`). Fifteenth ledger section in `.superpowers/sdd/progress.md` (commits `8077fd6..ccda8d0`). Pure renderer — no DB/handler/preload/type changes. Final whole-branch review: ready to merge, no Critical/Important. Delivered:
- **Task 1** (`6b858fe`): store `interfaceArchFilter: number | 'all'` (session-only, default `'all'`, reset in `loadProject`) + `setInterfaceArchFilter`.
- **Task 2** (`7c2c252`): `ArchitectureCanvas/ArchitectureNav.tsx` left sidebar (list + switch/create/rename inline/delete-with-confirm, `×` hidden when 1) REPLACES the top `ArchitectureTabs` strip (strip + test DELETED); App.tsx architecture panel is `[ArchitectureNav w-56 | canvas | properties]`.
- **Task 3** (`ff0be6c`): Component Library unmounted from `ArchitectureCanvas/index.tsx` (`ComponentLibrary.tsx` kept on disk) + type-picker `Select` next to toolbar `+ Object` (Untyped + one option per `elementType`); `+ Object` stamps the picked `elementTypeId`.
- **Task 4** (`0f680b1`): `InterfaceRegister/rows.ts` gained `fromName`/`toName`/`architectureId` on `InterfaceRow`; register renders mandatory **From Name** + **To Name**, order `Interface ID | From | From Name | To | To Name | …optional` (em-dash when name blank).
- **Task 5** (`16ab04d`): `InterfaceRegister/InterfaceNav.tsx` left sidebar ("All architectures" + per-architecture entries) sets `interfaceArchFilter`; register filters `visibleRows` client-side + scopes `+ New Interface` pickers (`pickElements`) and the create stamp to the selected architecture; App.tsx interfaces panel gained the sidebar.
- Renderer vitest 220/220, both typechecks clean, `electron-vite build` clean. Live-verified via Playwright driver (all 5 checks): sidebar switches canvas + diagrams isolated (test 1 = SYS-001/002/003 vs Default = SYS-004); no Component Library, type Select adds "SYSTEM" block; Interfaces filter All=2/Default=0/test 1=2; name columns populate (named SYS-001 "Radio" → showed as From/To Name); scoped create ICN-0003 belongs to test 1.
- Known deferrals (ledger, non-blocking): ArchitectureNav/InterfaceNav rows are `<div onClick>` not `role=tab` → batched a11y follow-up (carried from the Multiple-Architectures sub-tabs); `visibleRows`/`pickElements` recomputed per render (trivial). Driver note: those `<div>` rows can't be reached by `click-text` (only button/a/role) — click via eval; element-name commit needs a real `focusout` event (synthetic `blur` insufficient).

### Architecture Tab: Layers — COMPLETE (this session, 2026-07-14)
Plan: `docs/superpowers/plans/2026-07-13-architecture-layers.md`. Commits `6ace570..7792f16` (base `a2dc791`). Sixteenth ledger section in `.superpowers/sdd/progress.md`. Executed via subagent-driven development (7 tasks, each task-reviewed clean); final whole-branch review (opus): "ready with fixes" — fix applied (`d0ae1b8`) + re-review verified + test strengthened (`7792f16`). Full live-verify (Playwright driver, all 5 checks passed). Per-architecture visibility layers: create named layers, assign blocks/connectors, cycle each Visible→Faded→Hidden to carve custom views of one diagram. Delivered:
- **Backend** (`6ace570`, additive only): `layers` table (per-architecture, `state` column DEFAULT 'visible', soft-delete, position) + `element_layers`/`connection_layers` junction tables; handler `src/main/handlers/layers.ts` (list/create/rename/setState/delete/assignments/assign+unassign element+connection); `deleteLayer` cleans both junctions transactionally before soft-delete. Preload + api.d.ts + types (`LAYER_STATES`, `Layer`, `ElementLayerLink`, `ConnectionLayerLink`, `LayerAssignments`). No changes to existing tables/handlers.
- **Store** (`870fe73`): `layers`/`elementLayers`/`connectionLayers` + `loadLayers`/`addLayer`/`renameLayer`/`cycleLayerState`/`removeLayer`/`toggleElementLayer`/`toggleConnectionLayer`. `loadLayers()` is the last line of `loadArchitecture` → reloads on every architecture switch/project-open; clears all three when `activeArchitectureId == null`.
- **Pure resolver** (`777a6fb`) `ArchitectureCanvas/layers.ts`: `effectiveVisibility(memberIds, layersById)` (no member layers → normal/base; else most-visible-member wins) + `resolveConnectorVisibility(own, source, target)` (strictest-of-three, endpoint-wins). Truth-table tested.
- **Canvas** (`2990c9d`): `buildNodes` gained a `visibilityById` param — hidden elements + their descendants omitted, faded = `style.opacity 0.35` + `data.faded`; edges use RF native `hidden` flag + `EdgeLabel` opacity. Faded objects stay SELECTABLE (opacity only).
- **LayerPanel** (`040b8d1`): floating `<Panel position="top-right">` — SectionLabel + New-layer input (Enter/blur commit, Escape cancel), per-row 3-state dot (● visible / ◐ faded / ○ hidden, click cycles), double-click rename, hover × delete (confirm-gated).
- **Drawer checkboxes** (`dfb7b07`): LAYERS section in ElementPanel + ConnectionPanel (checkbox per layer, membership-checked, toggle on change).
- **Final-review fix** (`d0ae1b8`): pure `withHiddenCascade(elements, ownVisibilityMap)` in nodes.ts folds transitive descendants of hidden containers to `'hidden'`; index.tsx builds ONE cascade-aware `visById` consumed by BOTH `buildNodes` and the edge effect (was: connectors to a container-hidden child vanished only via RF dropping missing-endpoint edges, not via the resolver — endpoint-wins invariant now truly holds). Hoisted duplicated `layersById` Map. Guarded LayerPanel Enter+blur double-commit with committed-refs. Test strengthened in `7792f16`.
- Renderer vitest 243/243, both typechecks clean, `electron-vite build` clean. (Left Power/Comms scratch layers on the `thermal` dev project — harmless.)
- Known deferrals (ledger, non-blocking): `deleteLayer` no existence check (idempotent no-op); no `CHECK` on `layers.state` (TS-enforced); store toggle reads membership pre-await (rapid double-click race, single-user); no try/catch on `api.layers.*` (folds into the codebase-wide error-surfacing pass); LayerPanel `useStore() as any`; orphaned `element_layers`/`connection_layers` rows on element/connection soft-delete (confirmed harmless — read paths iterate live objects only; future GC nicety); faded container doesn't cascade opacity to children (RF renders children as siblings — deliberate); LayerPanel/nav rows still `<div onClick>` → batched a11y follow-up.

### Toolbar fix + requirements refinements + backlog (this session, 2026-07-13)
SHIPPED (all on `main`, TDD + live-verified where driveable):
- **Toolbar** (`2a280ca`): removed the `+ Object` type dropdown (rendered full-width, cluttered); type is set in the properties panel; tightened spacing (`+ Object` | divider | undo/redo, hint right-aligned).
- **Backlog item 19 — multi-level subheadings** (`f0f89e3`): dropped the 2-level depth guard in `createHeading` (`headings.ts`); `buildOutline` (`RequirementsList/outline.ts`) now recurses to any depth with dotted numbers `1 → 1.1 → 1.1.1` + numeric `depth` (cycle-guarded); `+ Sub` on every heading; depth-proportional indent. Live-verified 3→3.1→3.1.1.
- **Backlog item 18 — DnD requirements into a section** (`25f8400`): requirement rows `draggable`; heading rows (and other req rows) are drop targets → `updateRequirement({ headingId })` (drop on heading files it there; drop on an ungrouped req moves it to module root). Native HTML5 DnD, no library; unit-tested (Playwright mouse can't fire native drag events, so no live-drag).
- Renderer suite 224/224, both typechecks + build clean.

Backlog in `docs/superpowers/specs/2026-07-02-ui-overhaul-design.md` §6: **18** DONE, **19** DONE, **20** DONE (toolbar rework), **21** rework requirements file structure — pure container files/folders that modules live in, replacing module-in-module nesting (**USE PLAN MODE** — user reminder), **22** connection line editing — easy delete + line style (dotted/dashed) + arrow/marker types (**USE PLAN MODE** — user reminder).

## Next Step: PLANNING + REFINING (user directive)
User wants focus on **planning and refining what we have currently**, not net-new build. Open, both flagged for **plan mode** (brainstorm → spec → plan before code): item **21** (requirements file-structure rework) and item **22** (connection line editing). The **Layers** plan is now EXECUTED and shipped (see the Layers COMPLETE section above). Other follow-ups: codebase-wide promise error-surfacing pass; batched `aria-pressed`/`role`-and-keyboard a11y pass (ArchitectureNav/InterfaceNav/LayerPanel rows are `<div onClick>`); heading-anchor on search section clicks. New-feature flow stays: brainstorm spec → superpowers:writing-plans → subagent-driven-development (append new ledger section).

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
| `src/main/handlers/connectionCustomFields.ts` | Connection (interface) custom fields CRUD + listByProject |
| `src/renderer/src/components/InterfaceRegister/index.tsx` | Interface Register table + column toggle + create form |
| `src/renderer/src/components/InterfaceRegister/rows.ts` | Pure helpers: register rows + column visibility |
| `src/renderer/src/components/ConnectionPanel/index.tsx` | Connection drawer (shared canvas + register; custom-fields section) |
| `.superpowers/sdd/progress.md` | SDD task ledger (all plans) |

## Environment Notes
- Electron 31, Node ABI 125
- `better-sqlite3` native binary is `electron-v125-darwin-arm64` (in `node_modules/better-sqlite3/build/Release/`)
- `npm`/`node` NOT in shell PATH — export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH" — or use `./node_modules/.bin/*` directly
- Preload must be CJS (`format: 'cjs'` in `electron.vite.config.ts`) — configured already
- Debug log at `/tmp/reqarch-debug.txt` (written from main process + renderer via `window.api.debugLog`)
- Stitch MCP server available: `claude mcp add stitch --transport http -H "X-Goog-Api-Key: ..." https://stitch.googleapis.com/mcp`

## Branch
`main` — all work committed directly to main. Session 2026-07-13 shipped: `+ Object` toolbar fix (`2a280ca`), multi-level subheadings item 19 (`f0f89e3`), DnD requirements into sections item 18 (`25f8400`); authored the Layers plan doc + backlog items 20–22. Session 2026-07-14 EXECUTED the Layers plan via subagent-driven development: `6ace570..7792f16` (7 tasks + final-review fix + test strengthen), all reviewed clean, full live-verify passed. Latest commit: `7792f16`.

## Environment gotcha found this session
The `npm` shim in the Logi node22 distribution is broken (`npm-cli.js: No such file or directory`). Use `./node_modules/.bin/*` binaries directly (`vitest`, `tsc`, `electron-vite`) — `node` itself works fine from that PATH.
