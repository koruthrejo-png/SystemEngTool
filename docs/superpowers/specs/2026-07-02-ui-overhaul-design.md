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

Recorded so they can be planned as future feature work.

> **Status as of 2026-07-14** (reconciled against the code and the handoff — the strikes had
> drifted badly and most of 1-15 were done but unstruck). **Done: 1-10, 15-22.**
> **Open: 11** (admin area), **12** (nav notification/settings/help/profile icons),
> **13** (last-modified *user* attribution — blocked on there being no user concept at all),
> **14** (export PDF from architecture view), **23** (item-21 migration regression tests —
> blocked on the main-process test suite being runnable at all).
> Every item struck below was verified against the code or a named commit, not assumed.
> Items 11/12/14 were verified **absent** from `src/` rather than left ambiguous.

> **~~★ TOP PRIORITY (item 20)~~ — DONE 2026-07-13 (`2a280ca`).** Reworked the Architecture
> `+ Object` toolbar: removed the unwanted full-width type-picker `<Select>` entirely (new
> blocks are created untyped; the type is set afterward in the properties panel, which
> already has a Type select), then re-spaced the toolbar row — `+ Object` | divider |
> undo/redo, hint right-aligned. UI-only, as scoped.

1. ~~Status field on requirements + colored status chips (Approved/Draft/Review/Rejected)~~ — DONE 2026-07-03 (`546f4d7..a6eb0c8`, with items 2/3/6)
2. ~~Priority field + chips (High/Medium/Low)~~ — DONE 2026-07-03 (`546f4d7..a6eb0c8`, with items 1/3/6)
3. ~~Filter toolbar (status, priority, More Filters)~~ — DONE 2026-07-03 (`546f4d7..a6eb0c8`, with items 1/2/6)
4. ~~Global search box in the nav bar~~ — DONE 2026-07-07 (`f4fc503..4927f32`; design `docs/superpowers/specs/2026-07-07-global-search-design.md`)
5. ~~Row checkboxes + bulk actions~~ — DONE 2026-07-04 (`96da68a..cec91c7`)
6. ~~Requirement Type field (Functional / Non-Functional, …)~~ — DONE 2026-07-03 (`546f4d7..a6eb0c8`, with items 1/2/3)
7. ~~Acceptance criteria as a structured checklist (currently free text)~~ — DONE 2026-07-07 (`8a8830c..438041a`; migration converts legacy free text to checklist items)
8. ~~"Trace to Architecture" linking UI in the detail drawer~~ — DONE 2026-07-07 (`f9a31a7..f96ba65`)
9. ~~Traceability Matrix screen (new tab)~~ — DONE 2026-07-05 (`2f6be32..a004223`, with item 10)
10. ~~Dashboard screen (metrics, status charts, activity feed)~~ — DONE 2026-07-05 (`2f6be32..a004223`, with item 9), restyled 2026-07-06 (`61cb1ab..72b1a30`)
11. Admin area — **NOT STARTED** (verified 2026-07-14: zero `admin` references in `src/`)
12. Notifications / settings / help / profile icons in nav — **NOT STARTED** (verified 2026-07-14: the nav holds only tabs + GlobalSearch + project name + Open + New Project; `App.tsx:63-80`)
13. Last-modified attribution (user + timestamp) on requirements — **NOT STARTED** (verified 2026-07-14: `updatedAt` exists, but there is no user/author concept anywhere — no `updated_by`/`author` field, and the app is single-user with no accounts. The *user* half is unbuilt; needs a product decision on what identity even means here before it can be planned.)
14. Export PDF from architecture view — **NOT STARTED** (verified 2026-07-14: no PDF library or export path in `src/`)
15. ~~Undo/redo on the architecture canvas~~ — DONE 2026-07-09 (`38d1d82..e4e522c`, merged at `bab0c1e`)
16. ~~Node port-count indicators and typed component library, including the Component Library left palette panel from spec §4~~ — DONE 2026-07-08 (commits ee93fad..7589d28; palette click-to-add typed node, type name in node header, ⇆N connection-count badge)
17. ~~Restyle React Flow zoom/fit controls~~ — DONE 2026-07-08 (custom `CanvasControls`, commit 574cb9c)
18. ~~Drag-and-drop requirements into a section. Requirement rows become `draggable`; heading rows become drop targets; on drop call the existing `updateRequirement(reqId, { headingId })`. Native HTML5 DnD — no dnd library~~ — DONE 2026-07-13 (`25f8400`; dropping on an ungrouped requirement moves it to the module root. Unit-tested only — Playwright's mouse cannot fire native HTML5 drag events, so there is no live-drag verification).
19. ~~Multi-level subheadings with hierarchical dotted numbering, nested deeper than the original 2 levels; number by depth `1` → `1.1` → `1.1.1`~~ — DONE 2026-07-13 (`f0f89e3`; dropped the 2-level depth guard in `createHeading`, made `buildOutline` recursive and cycle-guarded, `+ Sub` on every heading, depth-proportional indent. Live-verified 3 → 3.1 → 3.1.1).
21. ~~**Rework requirements file structure**. Today the requirements tree is "modules nested inside modules" (submodules). The user wants organization by **pure container files/folders that requirement modules live inside**~~ — DONE 2026-07-14 (commits 5d1292e..8cacaed; `modules.kind` `'folder' | 'module'` single-table model, folders nest to any depth and modules are leaves, idempotent split migration converts each legacy parent into a folder + same-name module so requirement IDs never change). Design: `docs/superpowers/specs/2026-07-14-requirements-file-structure-design.md`.
22. ~~**Connection line editing**. From the canvas/ConnectionPanel: easily **delete** a connection, and change the **line style** — dotted/dashed/solid — and **arrow/marker types** at either end~~ — DONE 2026-07-14 (`467d9e5..07e1487`; `line_style`/`marker_start`/`marker_end` on `architecture_connections`, drawer selects, Delete/Backspace removal, `edgeStyle.ts` render helpers). Design: `docs/superpowers/specs/2026-07-14-connection-line-editing-design.md`.
23. **Migration regression tests for the item-21 folder split** — raised by item 21's final whole-branch review (opus, 2026-07-14) as its only new finding. `src/main/db/migrations.test.ts` already holds 5 migration tests, so the home exists. The item-21 design spec's Testing section mandated three: the **split** case (parent with both requirements and children → folder + same-name module, prefix/counter preserved, requirements repointed), the **flip-only** case (parent owning neither requirements nor headings → flipped to folder, no split), and a **second run proving idempotence**. The plan overrode that (plan line 243, "vitest cannot open the DB") and substituted live-verify. The trade was legitimate, but it left real gaps: live-verify exercised exactly **one** shape — a 2-level tree taking the split branch. The **flip-only branch** and **3+ level nesting** have two independent hand-traces (implementer + reviewer) but **no empirical evidence and no automated coverage**.
    **⚠️ Blocked on a prerequisite — do not just write the tests.** Every `src/main/**` test currently fails with `ERR_DLOPEN_FAILED`: `better-sqlite3` is compiled against Electron's `NODE_MODULE_VERSION 125` while the test runner's node is `127`. All 52 main-process tests are dark, and have been for the life of the project. Tests added today would fail on arrival and rot unread. **The real work is making main-process tests runnable** — rebuild `better-sqlite3` for node under a test-only install, or run the main-process suite under Electron — after which these three tests *and the existing 52* all come alive. Size this as a test-infrastructure task, not a test-authoring one; that framing is the whole point of the item.

### Ratified deviations from the mockups (accepted at final review, 2026-07-03)

- Focus/selection rings use `ring-action/60` (60% opacity), not full-opacity action green
- Architecture node names render at `text-sm font-medium`, not body-lg
- ~~React Flow zoom controls keep default chrome (restyle deferred, item 17)~~ — DONE 2026-07-08 (custom CanvasControls, commit 574cb9c)
- Module rename input in the tree stays a compact native `<input>` (token colors, not the Input primitive)

## Out of Scope

- Dark mode (light only; tokens keep the door open)
- Any behavioral/workflow changes beyond panel layout polish
- New dependencies beyond locally bundled font files
