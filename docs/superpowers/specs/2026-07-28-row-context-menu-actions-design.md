# Design: Right-Click Row Menu — More Actions (backlog item 43)

**Date:** 2026-07-28
**Status:** Draft — awaiting review
**Backlog:** item 43 (medium)

## Purpose

The requirements-table row context menu shipped extensible but with a single item ("Add requirement below"). Add the everyday row actions users expect from a right-click: **Duplicate**, **Move to section**, **Copy ID**, **Delete**. Fewer trips to the drawer / toolbar for common edits.

## Architecture

Pure renderer change to the **existing** context menu in `RequirementsList/index.tsx` (the `ctxMenu` state + the `role="menu"` popover already anchored at the cursor, dismissed by the full-screen backdrop). No new IPC — every action reuses a store action that already exists. This is an additive extension of a working component, not a new one.

The menu is anchored to **one requirement** (the right-clicked row). Menu items, in order:

| Item | Action | Existing plumbing |
|------|--------|-------------------|
| Add requirement below | (unchanged) | existing |
| Duplicate | clone the row → new requirement, fresh `reqId`, same section, just below | `addRequirement` / `createRequirement` |
| Move to section ▸ | submenu of the module's headings → set `heading_id` | `updateRequirement({ headingId })` |
| Copy ID | write `reqId` to the clipboard | `navigator.clipboard.writeText` |
| Delete | soft-delete the requirement | existing `removeRequirement` |

A divider separates the destructive **Delete** from the rest; Delete is token-styled as destructive (red text).

## Behavior details

- **Duplicate** copies the editable scalar fields (text, entryType, status, priority, reqType, verificationStatus, verificationMethod [if item 39], acceptanceCriteria, source, rationale, headingId) into a `createRequirement` call. `reqId` is **minted fresh** by the backend (never copied). Custom fields: v1 copies the built-in scalars only; custom-field values are a noted follow-up (they go through a separate handler). The new row is selected + scrolled into view.
- **Move to section** opens a submenu listing the current module's headings (numbered outline titles, same source as the drawer's Section select) + "(no section)". Picking one sets `heading_id`. Long lists scroll within the submenu (`max-h` + overflow).
- **Copy ID** uses the async Clipboard API; a brief confirmation (toast or transient menu-item flip to "Copied") — no persistence.
- **Delete** routes through the existing soft-delete (`removeRequirement`), so the row moves to the "Show deleted" view and is restorable — consistent with the toolbar/hover delete. Prunes it from `checkedIds` (the existing bulk-selection invariant).

All actions **close the menu** on activation.

## Data flow

Right-click row → `setCtxMenu({ requirementId, x, y })` → menu renders → item click → existing store action (`createRequirement` / `updateRequirement` / `removeRequirement`) or clipboard write → menu closes → list re-syncs via the action's normal path.

## Testing

Renderer (`index.test.tsx`, extends existing context-menu coverage):
- Menu shows all items for a row; Delete is visually separated.
- Duplicate → `createRequirement` called with the source row's scalar fields and **no** `reqId` (backend mints it); new row selected.
- Move to section → submenu lists headings; picking one calls `updateRequirement` with the chosen `headingId`; "(no section)" sets it null.
- Copy ID → `clipboard.writeText` called with the `reqId` (clipboard mocked).
- Delete → `removeRequirement` called; row leaves the active list; `checkedIds` pruned.

## Deferrals

- Duplicating custom-field values along with the requirement (separate handler).
- The same enriched menu on the module tree / architecture nodes (this spec is the requirements table only).
- Multi-row context actions (bulk actions already cover set-status/priority/delete via the bulk bar).
- Keyboard access to the context menu (menu-key / Shift-F10).
