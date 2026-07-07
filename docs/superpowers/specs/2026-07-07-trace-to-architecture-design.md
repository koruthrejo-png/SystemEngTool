# Trace to Architecture (Requirement Drawer) — Design

**Date:** 2026-07-07
**Backlog item:** 8 (Deferred Backlog, `2026-07-02-ui-overhaul-design.md`) — ""Trace to Architecture" linking UI in the detail drawer"

## Goal

From a requirement's detail drawer, see which architecture elements implement it, link/unlink elements, and jump to an element on the canvas. The reverse direction (element → requirements) already exists in `ElementPanel`; the matrix view already toggles links. This adds the requirement-side view.

## What Already Exists (all reused, none modified)

- IPC: `window.api.elementLinks.{list, add, remove, listByProject}`; `ElementRequirementLink { elementId, requirementId }`.
- Store: `traceLinks: ElementRequirementLink[]`, `elements: ArchitectureElement[]`, `loadTraceability()` (fetches projectRequirements + elements + traceLinks + reqLinks), `toggleTraceLink(elementId, requirementId)` (adds if absent, removes if present, refetches `traceLinks`), `selectElement(id)`, `setActiveTab(tab)`.

**No backend, store, preload, or type changes.**

## UI — `ArchitectureSection` in `src/renderer/src/components/RequirementDetail/index.tsx`

New section rendered after the existing `TraceabilitySection`, mirroring its structure and styling:

- `data-testid="arch-section"`, header `ARCHITECTURE` via `SectionLabel`.
- **Linked list:** derive rows from `traceLinks.filter((l) => l.requirementId === req.id)` joined to `elements` by `elementId` (elements missing from the array — e.g. soft-deleted — are silently skipped, same as TraceabilitySection's `byId` filter idiom). Each row: navigate button (mono `blockId` + name, hover tint, click → `setActiveTab('architecture')` then `selectElement(el.id)`; the canvas loads on tab switch via App's existing effect) and a × remove button (`aria-label="Unlink {blockId}"`) calling `toggleTraceLink(el.id, req.id)`. Empty list renders "None."
- **Add picker:** `Select` (`aria-label="Link element"`) listing elements not already linked to this requirement (`{blockId} — {name}`), plus a `Link` `Button` disabled until a pick is made; click calls `toggleTraceLink(pickedId, req.id)` then resets the picker to `''` (the refetch removes the picked element from candidates — same stale-pick hazard fixed in the derives-from section).
- **Data load:** the section's mount effect calls `loadTraceability()` keyed on `req.id` — same as `TraceabilitySection`. (Both sections calling it is a redundant-but-cheap double fetch; acceptable, matches sibling precedent.)

## Error Handling

`toggleTraceLink` promises fired without await, matching the file's existing convention (drawer link actions are fire-and-forget; error-surfacing pass is a ticketed codebase-wide follow-up).

## Testing

Component tests only (`RequirementDetail/architecture.test.tsx`), stable-`storeState` module-mock idiom:

1. Linked rows render (blockId + name) from `traceLinks` + `elements`; unlinked elements absent from the list.
2. Row click calls `setActiveTab('architecture')` and `selectElement(id)`.
3. × calls `toggleTraceLink(elementId, req.id)`.
4. Picker options exclude already-linked elements and include unlinked ones.
5. Link button disabled with no pick; after pick + click, `toggleTraceLink` called with picked id and picker reset to `''`.
6. Empty state renders "None."
7. Mount calls `loadTraceability()`.

Existing `RequirementDetail` test files' store mocks already stub `loadTraceability`/`reqLinks`/`projectRequirements`; they need `traceLinks: []`, `elements: []`, `selectElement`, `setActiveTab`, `toggleTraceLink` added additively.

## Out of Scope

Linking from the canvas side (exists), connection-requirement links in the drawer, multi-select linking, element search/filter inside the picker, canvas scroll-into-view on navigate (selection highlight only).

## Live Verification (post-plan)

Playwright driver: open a requirement → ARCHITECTURE section lists elements linked via the matrix; pick an unlinked element + Link → row appears + DB row exists; × → row gone + DB row gone; click a linked element row → Architecture tab with that element selected (ElementPanel shows it); picker excludes linked elements.
