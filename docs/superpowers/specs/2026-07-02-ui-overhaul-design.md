# UI Overhaul — Industrial Precision Design

**Date:** 2026-07-02
**Status:** Approved
**Scope decision:** Restyle existing functionality only. Features shown in the
Stitch mockups but not yet built are recorded in the Deferred Backlog below and
implemented afterwards as separate feature work.

## Goal

Replace the current bare, generic Tailwind look with the "Industrial Precision"
design generated in Stitch (project *Integrated Requirements Architecture*),
across the whole app: shell, Requirements view, and Architecture view. Layout
may change where the current one is weak (cramped middle column, plain header),
but the 3-panel requirements workflow and all current behavior are preserved.

**User's stated pain points:** the app looks like an unstyled prototype, and
panel space usage is poor.

## Design References (committed snapshots)

| File | Content |
|---|---|
| `assets/2026-07-02-ui/design-system.md` | Token set + component rules |
| `assets/2026-07-02-ui/requirements-screen.png` | Requirements view mockup |
| `assets/2026-07-02-ui/requirements-screen.html` | Stitch HTML for it (styling reference) |
| `assets/2026-07-02-ui/architecture-screen.png` | Architecture view mockup |
| `assets/2026-07-02-ui/architecture-screen.html` | Stitch HTML for it |

The Stitch project remains the living design source: `projects/9610086237141072081`.

## 1. Design System → Code

- Extend `tailwind.config.js` theme with the palette, font families, and
  `label-caps`-style utilities from `design-system.md`. Semantic token names
  (`navy`, `action` (green), `workspace`, `content`, `border-line`, …), not
  raw hexes scattered through components.
- Bundle **Inter** and **JetBrains Mono** locally (woff2 in
  `src/renderer/src/assets/fonts/` + `@font-face` in the global CSS) so the
  app works offline. No CDN references.
- New shared primitives in `src/renderer/src/components/ui/`:
  - `Button` — variants: `primary` (solid green/white), `secondary` (ghost,
    navy border+text), `ghost` (no chrome until hover)
  - `Input`, `Textarea` — slate border, green 2px focus ring
  - `SectionLabel` — label-caps section/table headers
  - `Panel` — white surface, 1px border
- All existing components consume these primitives; no repeated ad-hoc class
  strings for the same element kind.

## 2. App Shell

Current white header + separate gray tab row merge into one 56px navy bar:

- Left: **ReqArch Suite** wordmark (white, semibold).
- Center-left: tabs **Requirements | Architecture** — active tab gets green
  underline/edge treatment per mockup. Only these two tabs; no
  Traceability/Dashboard/Admin placeholders.
- Right: current project name (subdued), then **Open** (secondary-on-navy) and
  **New Project** (primary green) buttons.
- Content area below sits on workspace gray; each panel is a white bordered
  surface.

## 3. Requirements View (3 panels preserved)

**Left — Module sidebar (Project Explorer style):**
- White panel, project name header, `MODULES` label-caps section label.
- Tree rows with folder icon, body-md; active row = green container tint fill.
- `+ New Module` becomes a solid green button pinned at the panel bottom.

**Middle — Requirements table:**
- 48px toolbar: module name (headline-md), right side: Show deleted toggle,
  item count, and the `+ New Requirement` primary button (moved up from the
  footer).
- Table: sticky label-caps header row with 1px bottom border; zebra striping;
  requirement IDs in JetBrains Mono; 12px vertical row padding; hover = light
  row tint + delete ×; selected row keeps the left accent edge (green, per
  design system active rule).
- Deleted view unchanged in behavior: greyed rows + Restore.

**Right — Requirement Details drawer:**
- "Requirement Details" header (headline-md) with the mono req ID.
- label-caps field labels; Inputs/Textareas from the ui/ primitives.
- Custom Fields section styled to match; `+ Add Field` as ghost button.
- **Deviation from mockup:** keep save-on-blur autosave; no "Save Changes"
  button.

## 4. Architecture View

- Left element-types panel styled as **Component Library**: label-caps header,
  icon rows, green active tint; `+ Block` becomes primary green.
- Canvas: dot-grid workspace background (React Flow `Background` dots variant,
  colors from tokens).
- Nodes: solid navy header strip with label-caps type text, white body with
  mono element ID + name (body-lg), 1px border matching header color, top-only
  4px rounding.
- Zoom controls + right Properties/Connection panels restyled with the same
  primitives; linked requirements render as small bordered cards with mono ID.

## 5. Implementation Strategy

- Presentation layer only: **no store, IPC, preload, or DB changes.**
- Use the committed Stitch HTML files as the concrete styling reference
  (class-level detail) rather than re-deriving from screenshots.
- Order: tokens/fonts/primitives → shell → requirements view → architecture
  view. Each stage builds and is visually verified in the running app with the
  Playwright driver (`.claude/skills/run-app/driver.mjs`) against the mockup
  screenshots.
- Existing renderer tests that assert on markup may need selector updates —
  text/behavior assertions should still pass.

## 6. Deferred Backlog (shown in mockups, NOT in this pass)

Recorded so they can be planned as future feature work:

1. Status field on requirements + colored status chips (Approved/Draft/Review/Rejected)
2. Priority field + chips (High/Medium/Low)
3. Filter toolbar (status, priority, More Filters)
4. Global search box in the nav bar
5. Row checkboxes + bulk actions
6. Requirement Type field (Functional / Non-Functional, …)
7. Acceptance criteria as a structured checklist (currently free text)
8. "Trace to Architecture" linking UI in the detail drawer
9. Traceability Matrix screen (new tab)
10. Dashboard screen (metrics, status charts, activity feed)
11. Admin area
12. Notifications / settings / help / profile icons in nav
13. Last-modified attribution (user + timestamp) on requirements
14. Export PDF from architecture view
15. Undo/redo on the architecture canvas
16. Node port-count indicators and typed component library (Sensor/Actuator/Controller/Bus), including the Component Library left palette panel from spec §4
17. Restyle React Flow zoom/fit controls (spec §4 called for it; the overhaul kept default React Flow chrome)

### Ratified deviations from the mockups (accepted at final review, 2026-07-03)

- Focus/selection rings use `ring-action/60` (60% opacity), not full-opacity action green
- Architecture node names render at `text-sm font-medium`, not body-lg
- React Flow zoom controls keep default chrome (restyle deferred, item 17)
- Module rename input in the tree stays a compact native `<input>` (token colors, not the Input primitive)

## Out of Scope

- Dark mode (light only; tokens keep the door open)
- Any behavioral/workflow changes beyond panel layout polish
- New dependencies beyond locally bundled font files
