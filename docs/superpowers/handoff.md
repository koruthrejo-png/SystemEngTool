# Session Handoff

> Read this at the start of every session before doing anything.
> Last updated: 2026-06-29

---

## Current Goal

Implement the **Architecture Canvas** feature — a React Flow canvas tab where engineers model their system as typed, nested blocks connected by typed edges, all traceable back to requirements. This is the second major module of ReqArch Suite alongside Requirements.

---

## Current State

**All planning is done. Zero implementation tasks have been executed.**

- Design spec: `docs/superpowers/specs/2026-06-29-architecture-canvas-design.md` — approved, committed
- Implementation plan: `docs/superpowers/plans/2026-06-29-architecture-canvas.md` — committed at `c213025`
- All 13 tasks (Tasks 13–25) are unchecked. Nothing has been built yet.
- Branch: `main`. Working tree is clean (only `.claude/settings.local.json` dirty — local tool config, ignore it).

---

## What Exists (Before Implementation)

### Completed features (fully implemented and tested)
- 3-panel Requirements UI: ModuleTree, RequirementsList, RequirementDetail
- Zustand store: project, modules, requirements state and actions
- Main-process handlers: `projects`, `modules`, `requirements`
- Preload bridge: `window.api.project`, `window.api.modules`, `window.api.requirements`
- SQLite schema: `projects`, `modules`, `requirements` tables
- TypeScript types: `Project`, `Module`, `Requirement`, `CreateModuleInput`, `UpdateModuleInput`, `CreateRequirementInput`, `UpdateRequirementInput`

### Key source files (current, pre-implementation)
| File | Status |
|---|---|
| `src/types/index.ts` | Exists — needs 12 new interfaces added (Task 13) |
| `src/main/db/migrations.ts` | Exists — needs 6 new tables + 6 ALTER TABLE columns (Task 14) |
| `src/main/handlers/projects.ts` | Exists — needs `rowToProject` updated + seeding calls (Tasks 13, 15) |
| `src/main/handlers/requirements.ts` | Exists — needs `listRequirementsByProject` added (Task 18) |
| `src/preload/index.ts` | Exists — needs full replacement with architecture IPC channels (Task 19) |
| `src/types/api.d.ts` | Exists — needs full replacement with architecture API types (Task 19) |
| `src/main/index.ts` | Exists — needs full replacement to register all 9 handlers (Task 19) |
| `src/renderer/src/store/index.ts` | Exists — needs full replacement with architecture state (Task 20) |
| `src/renderer/src/App.tsx` | Exists — needs tab bar + conditional architecture panel (Tasks 21, 25) |

---

## Files to Create (all new)

| File | Task |
|---|---|
| `src/main/handlers/elementTypes.ts` + `.test.ts` | 15 |
| `src/main/handlers/connectionTypes.ts` + `.test.ts` | 15 |
| `src/main/handlers/elements.ts` + `.test.ts` | 16 |
| `src/main/handlers/connections.ts` + `.test.ts` | 17 |
| `src/main/handlers/elementLinks.ts` + `.test.ts` | 18 |
| `src/main/handlers/connectionLinks.ts` + `.test.ts` | 18 |
| `src/renderer/src/components/ArchitectureCanvas/BlockNode.tsx` | 22 |
| `src/renderer/src/components/ArchitectureCanvas/EdgeLabel.tsx` | 22 |
| `src/renderer/src/components/ArchitectureCanvas/index.tsx` + `.test.tsx` | 22 |
| `src/renderer/src/components/ElementPanel/index.tsx` + `.test.tsx` | 23 |
| `src/renderer/src/components/ConnectionPanel/index.tsx` + `.test.tsx` | 24 |

---

## Task Summary

| Task | What it does | Status |
|---|---|---|
| **13** | Add 12 new TS types; update `Project` interface; update `rowToProject` | ☐ |
| **14** | Add 6 DB tables + 6 `ALTER TABLE` columns to projects | ☐ |
| **15** | Create `elementTypes` + `connectionTypes` handlers; seed built-ins on project create | ☐ |
| **16** | Create `elements` handler with atomic block ID generation (`SYS-001`) | ☐ |
| **17** | Create `connections` handler with atomic conn ID generation (`ICN-0001`) | ☐ |
| **18** | Create `elementLinks` + `connectionLinks` handlers; add `listRequirementsByProject` | ☐ |
| **19** | Replace preload bridge, API types, main entry with all new IPC channels | ☐ |
| **20** | Replace Zustand store with architecture state and actions | ☐ |
| **21** | Add tab bar to App.tsx; architecture tab shows placeholder | ☐ |
| **22** | Create ArchitectureCanvas (React Flow v12), BlockNode, EdgeLabel | ☐ |
| **23** | Create ElementPanel (block properties + requirement link picker) | ☐ |
| **24** | Create ConnectionPanel (edge properties + requirement link picker) | ☐ |
| **25** | Wire ArchitectureCanvas + panels into App.tsx; golden-path test | ☐ |

---

## Critical Technical Notes

### React Flow v12 (`@xyflow/react`)
- **ALL exports are named** — no default export. Use `import { ReactFlow, Background, ... }`.
- CSS: `import '@xyflow/react/dist/style.css'`
- `connectOnClick` prop does NOT exist in v12 — removed from plan.
- Connection mode: user drags from a block handle to another block handle.
- `deleteKeyCode="Delete"` + `onNodesDelete` + `onEdgesDelete` for keyboard deletion.

### ID Generation (Tasks 16, 17)
- Element IDs: `{elem_id_prefix}-{padded counter}` e.g. `SYS-001`
- Connection IDs: `{conn_id_prefix}-{padded counter}` e.g. `ICN-0001`
- Both are atomic SQLite transactions: read project counter → generate ID → increment counter → insert row. Counter never reuses values after soft delete.

### Migrations (Task 14)
- `addColumnIfMissing(db, table, col, def)` — try/catch around `ALTER TABLE`; safe for existing `.reqarch` files.
- New tables use `CREATE TABLE IF NOT EXISTS`.
- Soft delete everywhere: `deleted_at TEXT` column, never hard delete.

### Seeding (Task 15)
- `seedElementTypes(db, projectId)`: 5 built-ins — System, Subsystem, Component, Function, External
- `seedConnectionTypes(db, projectId)`: 6 built-ins — Data, Power, Mechanical, Thermal, Control, Software
- Both are idempotent (check `is_built_in = 1` rows before inserting).
- Called inside `project:create` IPC handler (in `projects.ts`) after `createProject(name)`.

### Nesting
- `parentId` is stored in DB and mapped to React Flow `parentId` / `extent: 'parent'`.
- Drag-to-parent detection UI is **deferred** (not in Task 22 scope). Users can nest via panel field.

---

## Known Issues (from ponytail review, pre-implementation)

1. **`undefined/launch.png`** — screenshot was saved to a wrongly-named `undefined/` directory. Minor; fix when noticed.
2. **`playwright-core` devDependency** — was added to `package.json` but is unused. Remove it.

---

## How to Proceed

1. Read this file.
2. Open `docs/superpowers/plans/2026-06-29-architecture-canvas.md` for full task detail (exact code, exact test commands).
3. Execute tasks in order 13 → 25. Each task follows TDD: write failing test → verify fail → implement → verify pass → commit.
4. Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` skill for agentic execution.

**Run command to check current test suite health before starting:**
```bash
npx vitest run
```
All existing tests should pass. If any fail, investigate before proceeding.
