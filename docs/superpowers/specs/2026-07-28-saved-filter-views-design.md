# Design: Saved Filter Views (backlog item 38)

**Date:** 2026-07-28
**Status:** Draft — awaiting review
**Backlog:** item 38 (medium)

## Purpose

The filter builder (`FilterPanel`, `filter.ts` — `FilterRule[]` + `FilterCombine`) is **session-only**: rules reset on module switch and vanish on relaunch. Let users **name and persist** a filter set ("Open safety reqs", "Failed verification") and re-apply it in one click.

## Non-goals (v1)

- No sharing/permissions (single-user today; the `created_by` stamp makes it server-forward).
- No cross-project views (views are project-scoped).
- No auto-apply-on-open / default view (deferred).
- No editing a saved view's rules in place — to change one, apply it, tweak, re-save over the same name (upsert by name).

## Key decision: persist in the `.reqarch` DB, not localStorage

Column widths and the colour-by-type preference live in localStorage because they're **UI chrome**. A saved filter is **project content**: its rules reference custom-field keys that belong to the project, and it should travel with the `.reqarch` file (open it on another machine → your views are there) and be attributable. So: a **new DB table**, project-scoped, mirroring the `requirementCustomFields` handler shape. This is also consistent with the server end-goal (views become a syncable, per-user entity later).

## Data model

New table (in `migrations.ts` CREATE block; idempotent):

```sql
CREATE TABLE saved_filters (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  rules TEXT NOT NULL,          -- JSON: FilterRule[]
  combine TEXT NOT NULL,        -- 'AND' | 'OR'
  created_by INTEGER,           -- FK users, stamped by main
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT               -- soft delete, excluded from list
);
CREATE UNIQUE INDEX idx_saved_filters_name ON saved_filters(project_id, name) WHERE deleted_at IS NULL;
```

`rules` is the same JSON the store already holds — a `FilterRule[]`. Storing it as one TEXT blob (option-b, same as baselines) avoids a per-rule child table; the renderer parses it back into live rules. The unique index makes save-by-name an **upsert** (re-saving a name overwrites).

## IPC / handler

New `src/main/handlers/savedFilters.ts`, mirroring `requirementCustomFields.ts`:

- `savedFilters:list(projectId)` → rows (newest first), `rules` parsed JSON.
- `savedFilters:save(projectId, name, rules, combine)` → upsert by `(project_id, name)`; `created_by`/timestamps stamped by main (`currentUserRowId`), never client-asserted.
- `savedFilters:delete(id)` → soft-delete (`deleted_at`).

Preload bridge + `api.d.ts` + `SavedFilter` type. Read/create/delete only — no arbitrary update channel (save = upsert covers edits).

## Store

New slice: `savedViews: SavedFilter[]` + `loadSavedViews()` (mirrors `loadCustomFields`), `saveView(name)` (serializes current `filterRules`/`filterCombine`), `applyView(id)` (sets `filterRules`/`filterCombine` from the stored view), `deleteView(id)`. `loadSavedViews` runs on project open (keyed on `project?.id`, like `loadTraceability`).

## UI

A **"Views ▾"** control in the filter toolbar, beside the existing Filter button:

- Dropdown lists saved views (name); click a name → `applyView` (loads its rules into the live builder, filter takes effect immediately).
- "Save current view…" → inline name input → `saveView`. If the name exists, it overwrites (upsert) with a confirm ("Replace 'X'?").
- Each row has a `×` to delete (soft).
- Disabled/empty state: "No saved views yet."

Applying a view **replaces** the current session rules (doesn't merge). The active view name shows as a subtle label on the Views button while its rules are unmodified; editing any rule clears the label (you're now off-view) — cheap dirty check by comparing serialized rules.

## Data flow

Save: live `filterRules`/`filterCombine` → JSON → `savedFilters:save` (main stamps identity) → re-`loadSavedViews`.
Apply: pick view → store sets `filterRules`/`filterCombine` → existing `applyFilters` pipeline runs unchanged.

## Testing

- Migration test: table + unique index created; idempotent.
- Handler: save creates; save same name updates-not-duplicates (upsert); `created_by` stamped by main (client value ignored); list excludes soft-deleted; delete soft-deletes.
- Round-trip: a `FilterRule[]` with a custom-field-key rule serializes and parses back identical.
- Store/renderer: save serializes current rules; apply sets them; dirty-label clears on rule edit.

## Deferrals

- A "default view" applied automatically on module/project open.
- Per-user views once the server + multi-user identity exist (the `created_by` column already anticipates this).
- Exporting/importing views with the CSV/ReqIF payload.
