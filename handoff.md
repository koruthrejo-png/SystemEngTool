# Handoff: ReqArch2 — Current State

## What's Been Built (as of 2026-07-01)

### Core App — Working
The app launches, creates/opens projects, manages modules, and all IPC is wired. Key fixes that unblocked everything:
- Preload outputs as CJS (`out/preload/index.js`) — electron-vite was building `.mjs` which Electron silently rejected in sandboxed mode
- `better-sqlite3` replaced with Electron ABI 125 prebuilt binary (`electron-v125-darwin-arm64`)
- `handleNewProject` in `App.tsx` uses the returned project directly instead of calling `loadProject()` again

### Requirements List Improvements — IN PROGRESS (Tasks 1–6 of 7 complete)
All committed to `main`. Remaining: Task 7 (build + smoke test).

**Task 1 — Types + DB migration** (`723ce8e`)
- `RequirementCustomField` and `UpdateCustomFieldInput` interfaces in `src/types/index.ts`
- `requirement_custom_fields` table in `src/main/db/migrations.ts`

**Task 2 — Custom fields IPC handlers** (`3a93a34`)
- New file `src/main/handlers/requirementCustomFields.ts` — 4 handlers: `customFields:list`, `customFields:create`, `customFields:update`, `customFields:delete`
- Registered in `src/main/index.ts`

**Task 3 — listDeleted IPC + preload** (`7aa49dc`)
- `listDeletedRequirements` + `requirements:listDeleted` IPC in `src/main/handlers/requirements.ts`
- Preload `src/preload/index.ts` exposes `requirements.listDeleted`, `requirements.restore`, and full `customFields.*` API

**Task 4 — Store extensions** (`8d0fab8`)
- `src/renderer/src/store/index.ts` — new state: `customFields`, `showDeleted`, `deletedRequirements`
- New actions: `restoreRequirement`, `setShowDeleted`, `loadCustomFields`, `addCustomField`, `updateCustomField`, `removeCustomField`
- `selectModule` and `selectRequirement` updated to reset new state on switch
- `src/types/api.d.ts` updated to declare `window.api.customFields` and `window.api.requirements.listDeleted`

**Task 5 — RequirementsList table UI** (`9209971`)
- `src/renderer/src/components/RequirementsList/index.tsx` rewritten as 6-column CSS grid (`grid-cols-[80px_1fr_1fr_120px_1fr_36px]`)
- Columns: ID | Requirement | Acceptance Criteria | Source | Rationale | actions
- Hover-reveal delete icon (×) calls `removeRequirement`
- "Show deleted" checkbox toggle; deleted view shows greyed rows with "Restore" button
- Item count in header reflects active vs deleted list

**Task 6 — RequirementDetail custom fields** (`3c75d20`, fix `09ba54c`)
- `src/renderer/src/components/RequirementDetail/index.tsx` — custom fields section below Rationale
- Key/value inputs per field, save on blur, × to remove, "+ Add Field" appends blank row and auto-focuses label input
- Fix: `prevCustomFieldCount.current` reset to 0 on requirement switch to prevent spurious auto-focus

### Next Step: Task 7 — Build + Smoke Test
The app needs to be rebuilt (`electron-vite build`) and run to verify all three features work end-to-end:
1. Multi-column table with column headers visible
2. Hover over a row → × appears; click → requirement disappears; "Show deleted" toggle → it reappears with Restore
3. Select a requirement → detail panel shows Custom Fields section; "+ Add Field" → new row focused; values persist on re-select

**Build command** (Node.js not in shell PATH — use electron-vite directly):
```bash
./node_modules/.bin/electron-vite build
```
Then launch:
```bash
"./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" "./out/main/index.js"
```

After smoke test passes → Task 7 marks the requirements improvements complete, then the UI Overhaul (using Stitch MCP) begins.

---

## Planned: UI Overhaul with Stitch
- Stitch MCP server added: `claude mcp add stitch --transport http -H "X-Goog-Api-Key: ..." https://stitch.googleapis.com/mcp`
- Scope TBD — needs brainstorming session to define which screens, visual direction, what to preserve

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
| `src/renderer/src/components/RequirementsList/index.tsx` | Requirements table UI |
| `src/renderer/src/components/RequirementDetail/index.tsx` | Requirement detail + custom fields |

## Environment Notes
- Electron 31, Node ABI 125
- `better-sqlite3` native binary is `electron-v125-darwin-arm64` (in `node_modules/better-sqlite3/build/Release/`)
- `npm`/`node` NOT in shell PATH — use `./node_modules/.bin/electron-vite` directly
- Preload must be CJS (`format: 'cjs'` in `electron.vite.config.ts`) — configured already
- Debug log at `/tmp/reqarch-debug.txt` (written from main process + renderer via `window.api.debugLog`)

## Branch
`main` — all work committed directly to main.
