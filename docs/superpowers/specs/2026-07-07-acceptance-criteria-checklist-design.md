# Acceptance Criteria Checklist — Design

**Date:** 2026-07-07
**Backlog item:** 7 (Deferred Backlog, `2026-07-02-ui-overhaul-design.md`) — "Acceptance criteria as a structured checklist (currently free text)"
**Approach chosen:** child table (over JSON-in-column and markdown-checkbox parsing) — matches the `requirement_custom_fields` idiom end to end and keeps items queryable for future V&V work.

## Goal

Replace the free-text `acceptance_criteria` column/textarea with per-item acceptance criteria: each item has text and a verification status (Unverified / Passed / Failed), ordered, editable inline in the requirement drawer, summarized in the requirements table.

## Data Model

New table (in `src/main/db/migrations.ts`):

```sql
CREATE TABLE IF NOT EXISTS acceptance_criteria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requirement_id INTEGER NOT NULL REFERENCES requirements(id),
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Unverified',
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
```

- Hard delete per item (same as `requirement_custom_fields`). No `deleted_at`: items are only ever fetched by `requirement_id`, and requirement soft-delete/restore leaves them untouched.
- `position`: 0-based per requirement, assigned `MAX(position)+1` on insert (custom-fields pattern), swapped on move (headings pattern).
- Status values live in the types layer, not a DB CHECK (codebase convention — see `REQUIREMENT_STATUSES`).

**Types** (`src/types/index.ts`):

```ts
export const AC_STATUSES = ['Unverified', 'Passed', 'Failed'] as const
export type AcStatus = (typeof AC_STATUSES)[number]

export interface AcceptanceCriterion {
  id: number
  requirementId: number
  text: string
  status: AcStatus
  position: number
  createdAt: string
  updatedAt: string
}
```

## Migration of Existing Data

Idempotent, runs inside the existing migration function after table creation:

- Select requirements where `acceptance_criteria IS NOT NULL AND TRIM(acceptance_criteria) != ''`.
- For each: split text on newlines, trim each line, drop empty lines, insert one `acceptance_criteria` row per line (status `Unverified`, positions in line order), then `UPDATE requirements SET acceptance_criteria = NULL` for that row — per-row idempotence, safe to re-run.
- The legacy `acceptance_criteria` column stays in the schema; after migration nothing reads or writes it. `Requirement.acceptanceCriteria` stays in the type (rows still map it; always null post-migration).

## IPC / Preload / api.d.ts

New handler file `src/main/handlers/acceptanceCriteria.ts` (registered in `src/main/index.ts`), mirrored in `src/preload/index.ts` and `src/types/api.d.ts` under `window.api.acceptanceCriteria`:

| Method | Channel | Behavior |
|---|---|---|
| `list(requirementId)` | `acceptanceCriteria:list` | `ORDER BY position, id` |
| `create(requirementId, text)` | `acceptanceCriteria:create` | insert with next position, status `Unverified`; returns row |
| `update(id, patch)` | `acceptanceCriteria:update` | patch `{ text?, status? }`, coalesce against existing (custom-fields idiom); throws if id missing; returns row |
| `remove(id)` | `acceptanceCriteria:delete` | hard delete |
| `move(id, direction)` | `acceptanceCriteria:move` | `'up' \| 'down'`; swap positions with neighbor within same requirement, no-op at boundary (`moveHeading` pattern) |
| `listByModule(moduleId)` | `acceptanceCriteria:listByModule` | all items for the module's non-soft-deleted requirements (join through `requirements` on `module_id`, `WHERE r.deleted_at IS NULL`) — feeds the table summary in one query, no N+1 |

## Store (`src/renderer/src/store/index.ts`)

Custom-fields pattern exactly:

- State: `acItems: AcceptanceCriterion[]` (items of the currently selected requirement); `acSummary: Record<number, { passed: number; total: number; first: string }>` (summary per requirement id for the selected module's table).
- Actions: `loadAcItems(reqId)`, `addAcItem(reqId, text)`, `updateAcItem(id, patch)`, `removeAcItem(id)`, `moveAcItem(id, direction)` — each mutation refetches via `list` for the selected requirement.
- `acSummary` loads via `listByModule` alongside `loadRequirements` and recomputes after any AC mutation on a requirement in the current module; the derivation from item rows to the summary map is a pure exported helper so it can be unit-tested directly.

## Drawer UI (`src/renderer/src/components/RequirementDetail/index.tsx`)

ACCEPTANCE CRITERIA section replaces the current textarea:

- One row per item: status chip + text input + ↑ ↓ × buttons.
- **Status chip:** click cycles Unverified → Passed → Failed → Unverified. Reuses the `Chip` primitive: add `Unverified` (gray, `bg-workspace text-ink-muted border border-line`), `Passed` (`bg-action-tint text-action-hover`), `Failed` (`bg-error/10 text-error`) to `CHIP_STYLES`. Verified no key collision with existing entries (Draft/Review/Approved/Rejected/High/Medium/Low) — the shared value-key namespace invariant holds.
- **Text input:** inline, saves on blur (existing drawer idiom); empty-text items allowed transiently, saved as-is (matches custom fields' empty key/value behavior).
- **× remove:** immediate hard delete. **↑ ↓ move:** swap with neighbor, disabled styling not required (no-op at boundary).
- **"+ Add criterion"** button appends an empty Unverified item and focuses its text input via the existing `focusNewField` ref pattern.
- Free-text `ac` local state, `setAc`, and `acceptanceCriteria` in the `updateRequirement` save-payload are removed from the drawer.

## Requirements Table (`src/renderer/src/components/RequirementsList/index.tsx`)

Acceptance Criteria column cell becomes: `passed/total` in mono (e.g. `2/5`) + first item's text, truncated — from `acSummary[req.id]`; em-dash (existing `—` faint span) when the requirement has no items. Column header unchanged.

## Out of Scope

- Verification method/evidence per item, dashboard AC coverage stats, traceability-matrix integration (future V&V slice).
- Reordering by drag-and-drop (↑↓ only).
- Bulk status operations.

## Testing

Renderer-only vitest (main-process code verified by typecheck + live app checks, per repo constraint):

- Store tests: load/add/update/remove/move + acSummary derivation, mocked `window.api`.
- Drawer component tests: items render in position order, add-focuses-new-input, blur saves text, chip click cycles status, × removes, ↑↓ call move.
- List tests: summary cell renders `2/5` + first text; em-dash when empty.
- TDD per task; full suite must stay at baseline (47 sqlite-ABI + 1 ArchitectureCanvas failures, all renderer files pass).

## Live Verification (post-plan)

Launch via Playwright driver: legacy free-text requirement shows migrated line-per-item checklist; add/edit/cycle/remove/move items; summary cell updates; relaunch persists items and statuses.
