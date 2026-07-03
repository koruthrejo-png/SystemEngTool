# Handoff: ReqArch2 — Current State

## What's Been Built (as of 2026-07-02)

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
- `npm`/`node` NOT in shell PATH — export the Logi node22 PATH (see Commands above) or use `./node_modules/.bin/*` directly
- Preload must be CJS (`format: 'cjs'` in `electron.vite.config.ts`) — configured already
- Debug log at `/tmp/reqarch-debug.txt` (written from main process + renderer via `window.api.debugLog`)
- Stitch MCP server available: `claude mcp add stitch --transport http -H "X-Goog-Api-Key: ..." https://stitch.googleapis.com/mcp`

## Branch
`main` — all work committed directly to main. Latest commit at handoff: `f2a2894` (UI overhaul Task 8 — properties panels); Task 9 doc update is the next commit.
