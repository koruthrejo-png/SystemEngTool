# Requirements List Improvements

**Date:** 2026-07-01  
**Status:** Approved

## Overview

Three improvements to the Requirements tab: soft-delete with restore, a full multi-column table view, and user-defined custom key-value fields per requirement.

---

## 1. Soft Delete & Restore

### Behaviour
- Each row in the requirements list shows a trash icon on the right, visible on hover.
- Clicking the trash icon calls the existing `removeRequirement` store action, which sets `deleted_at` on the record. The requirement disappears from the active list.
- A **"Show deleted"** toggle (checkbox or pill button) appears at the top of the requirements list panel.
- When toggled on, the list shows only soft-deleted requirements, rendered in greyed-out styling with a **Restore** button on each row instead of the trash icon.
- Clicking Restore calls the existing `restoreRequirement` store action (IPC: `requirements:restore`), clearing `deleted_at`. The requirement reappears in the active list.

### What already exists
- `deleted_at` column exists on the `requirements` table.
- `requirements:restore` IPC handler exists in `src/main/handlers/requirements.ts`.
- `removeRequirement` and a stub for `restore` exist in the store — the restore action just needs to be wired up (`window.api.requirements.restore`).

### What needs adding
- Trash icon button on each row (hover-reveal).
- "Show deleted" toggle state in `RequirementsList`.
- `listDeleted` IPC handler (`requirements:listDeleted`) that queries `WHERE deleted_at IS NOT NULL`.
- Store action `restoreRequirement(id)` calling `window.api.requirements.restore(id)`, then re-fetching the active list.

---

## 2. Multi-Column Table View

### Layout
The requirements list becomes a scrollable table with sticky column headers:

| ID | Requirement | Acceptance Criteria | Source | Rationale | (actions) |
|---|---|---|---|---|---|

- **ID**: fixed-width, monospace, ~80px.
- **Requirement**: flex-1, full text, wraps.
- **Acceptance Criteria**: flex-1, full text, wraps.
- **Source**: fixed-width ~120px, single line, truncated with tooltip if needed.
- **Rationale**: flex-1, full text, wraps.
- **(actions)**: fixed-width ~40px, trash icon (hover-reveal), or Restore button when in deleted view.

All rows grow to the height of their tallest cell. The selected row keeps the existing blue left-border highlight. Clicking any row selects it and opens the detail panel.

### Implementation notes
- Replace the current `flex` row layout in `RequirementsList` with a CSS grid (`display: grid; grid-template-columns: 80px 1fr 1fr 120px 1fr 40px`).
- Header row uses the same grid with `text-xs uppercase tracking-wide text-gray-400` labels.
- No external table library needed — CSS grid handles this cleanly.

---

## 3. Custom Key-Value Fields

### DB Schema
New migration adds:

```sql
CREATE TABLE IF NOT EXISTS requirement_custom_fields (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  requirement_id INTEGER NOT NULL REFERENCES requirements(id),
  key            TEXT    NOT NULL DEFAULT '',
  value          TEXT    NOT NULL DEFAULT '',
  position       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL
);
```

### IPC Handlers (`src/main/handlers/requirementCustomFields.ts`)
- `customFields:list(requirementId)` — `SELECT * WHERE requirement_id = ? ORDER BY position`
- `customFields:create(requirementId)` — inserts a blank row, returns the new field
- `customFields:update(id, { key, value })` — updates key and/or value
- `customFields:delete(id)` — hard delete (these are user-created metadata, no soft delete needed)

### Preload (`src/preload/index.ts`)
Expose `window.api.customFields` with the four methods above.

### Store
Add to the store:
- `customFields: RequirementCustomField[]`
- `loadCustomFields(requirementId)` — called when a requirement is selected
- `addCustomField(requirementId)` — creates a blank field, appends to list
- `updateCustomField(id, patch)` — updates in list
- `removeCustomField(id)` — removes from list

### UI — `RequirementDetail`
At the bottom of the detail panel, below Rationale:

```
CUSTOM FIELDS
[ Label         ] [ Value                    ] [✕]
[ Label         ] [ Value                    ] [✕]
                                        [+ Add Field]
```

- **Label** input: ~30% width, placeholder "Field name"
- **Value** input: ~65% width, placeholder "Value"
- **✕** button: removes the field
- **+ Add Field** button: appends a new blank row and focuses the label input
- All inputs save on blur (key and value separately)

---

## Data Flow Summary

```
selectRequirement(id)
  → store.loadCustomFields(id)      // fetches custom fields for selected req
  → set({ customFields })
  → RequirementDetail renders custom fields section
```

```
addCustomField(requirementId)
  → customFields:create IPC
  → append to store.customFields
  → focus new label input
```

```
removeRequirement(id)
  → requirements:delete IPC (sets deleted_at)
  → remove from store.requirements
  → clear selectedRequirementId if it was selected
```

```
restoreRequirement(id)
  → requirements:restore IPC (clears deleted_at)
  → re-fetch active requirements list
  → toggle off "Show deleted" view
```

---

## Files Changed

| File | Change |
|---|---|
| `src/main/db/migrations.ts` | Add `requirement_custom_fields` table |
| `src/main/handlers/requirementCustomFields.ts` | New file — 4 IPC handlers |
| `src/main/handlers/requirements.ts` | Add `requirements:listDeleted` handler |
| `src/main/index.ts` | Register `registerCustomFieldHandlers()` |
| `src/preload/index.ts` | Expose `customFields` API |
| `src/renderer/src/store/index.ts` | Add custom fields state + actions, wire `restoreRequirement` |
| `src/renderer/src/components/RequirementsList/index.tsx` | Table layout, delete icon, show-deleted toggle |
| `src/renderer/src/components/RequirementDetail/index.tsx` | Custom fields section |
| `src/types/index.ts` | Add `RequirementCustomField` type |
