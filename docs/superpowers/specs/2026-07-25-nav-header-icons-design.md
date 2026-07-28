# Design: Nav header icons — notifications, help, settings, profile polish

**Date:** 2026-07-25
**Status:** Approved (design) — brainstormed and agreed with the user 2026-07-25. No code yet.
**Backlog:** item 12 (nav notification / settings / help / profile icons).

## Overview

Add a uniform **icon cluster** to the right of the utility header, giving the four
standard app affordances a home: **🔔 notifications**, **? help**, **⚙ settings**, and the
existing **avatar** menu. Settings and the avatar already exist in the header; notifications
and help are the genuine gaps. The gear promotes the buried "Settings" avatar item to a
first-class icon, and the bell surfaces requirements that need attention across the project.

All four reuse the existing `HeaderMenu` / `MenuItem` primitives (`App.tsx`,
imported from `./components/HeaderMenu`). No new menu primitive.

## Header layout

Current header (`App.tsx:87`) right group, in order: `GlobalSearch` · `+ New Project`
Button · divider · avatar `HeaderMenu`.

New order (same `ml-auto` flex row): `GlobalSearch` · `+ New Project` · **divider** ·
**🔔 bell · ? help · ⚙ gear** · **divider** · avatar. Uniform icon buttons (same size /
hover treatment, e.g. a `w-6 h-6` white/70→white icon button matching the avatar circle
scale), plain-glyph or inline SVG per the app's no-Material-Symbols convention.

## Notifications bell 🔔

**Badge** = count of DISTINCT requirements needing attention (a requirement in two groups
counts once). Hidden entirely when 0.

**Data source — pure function** `attentionItems(projectRequirements, traceLinks)` (new,
e.g. `src/renderer/src/components/attention.ts`), returning the three groups plus a
deduped distinct-requirement set for the badge count. Three groups:

- **Trace gaps** — High-priority requirements not linked to any architecture element.
  Reuse the Dashboard logic: `unallocated` (a req whose `id` is in no `traceLinks` row)
  `filter(r => r.priority === 'High')` — identical to `computeStats().criticalGaps`
  (`Dashboard/stats.ts:78`). Factor the shared predicate so bell and dashboard agree.
- **In review** — `status === 'Review'`.
- **Verification failed** — `verificationStatus === 'Failed'`.

**Dropdown** (`HeaderMenu`, `align="right"`): the three groups, each a labelled section of
rows; empty groups omitted. Row = requirement `reqId` + truncated `text`. Click →
`openRequirement(req)` + switch to the Requirements tab (`setActiveTab('requirements')`),
mirroring the GlobalSearch navigation. Empty state (all groups empty): **"You're all
caught up."**

**Data-loading gotcha (found during brainstorm):** the bell is always visible, so it needs
`projectRequirements` + `traceLinks` loaded on project open. Today `loadProject`
(`store/index.ts:224`) loads only modules / elementTypes / users — it does **not** load
traceability. `loadTraceability` (`store/index.ts:619`) is what populates
`projectRequirements` / `traceLinks`, and it currently runs only via the Dashboard /
Traceability tab effects (`App.tsx`, keyed on `activeTab`). **Fix:** run `loadTraceability`
on project open — add it to the `App.tsx` `loadProject` / `loadMe` effect, or trigger it
from the bell keyed on `project?.id`. It is idempotent, so leaving the Dashboard's call in
place is safe (the Dashboard already re-runs it).

## Help menu ?

`HeaderMenu` with two items:

- **Keyboard shortcuts** — a small modal listing the app's REAL shortcuts. **Verify the
  actual set during planning** (do not fabricate): known candidates are ⌘K global search
  focus (`GlobalSearch`), Delete / Backspace on the architecture canvas, Esc / Enter in
  dialogs, undo / redo on the canvas. List only shortcuts confirmed to exist.
- **About ReqArch** — a small modal showing the app name + version. Version via
  `app.getVersion()`, which needs a tiny new read-only IPC (e.g. `app:getVersion` →
  preload `api.app.getVersion()`). No other app metadata in v1.

## Settings gear ⚙

Opens the existing `Settings` modal directly: `onClick={() => setShowSettings(true)}`.
No dropdown. `Settings` / `showSettings` already wired in `App.tsx` (line 22 / 138).

## Profile polish (avatar menu)

- **Remove** the now-redundant **"Settings"** `MenuItem` from the avatar menu
  (`App.tsx:108`) — the gear covers it.
- **Keep** the identity block (name + email, `App.tsx:104`).
- **Add** a **"People"** shortcut that opens Settings (the People / users area lives inside
  the Settings modal). Confirm the Settings modal exposes a People section / tab to deep-link
  to during planning; if it is a single-pane modal, "People" simply opens Settings (same as
  the gear) until Settings gains sections.

## Out of scope

- Persisted / dismissible notifications, unread state, notification history — the bell is a
  live derived view of current attention items, not a stored inbox.
- Real-time push (server work) — v1 recomputes from already-loaded data.
- Configurable attention rules — the three groups are fixed in v1.
- Richer About (license, credits, update check).

## Verification plan

- **Pure `attentionItems`** unit-tested: each of the three groups selected correctly; the
  badge distinct-count; **dedup** when one requirement lands in two groups (e.g. a
  High-priority unallocated req that is also `status==='Review'` counts once); empty → 0.
- **Bell renderer** tests: badge shows the distinct count and is hidden at 0; the three
  groups render with correct rows and omit empty groups; empty state "You're all caught
  up."; row click calls `openRequirement` + `setActiveTab('requirements')`.
- **Help / About** renderer tests: menu opens both modals; About renders the version from
  the mocked `api.app.getVersion()`.
- **`loadTraceability` on project open**: assert the store loads `projectRequirements` /
  `traceLinks` after `loadProject` without visiting the Dashboard (so the bell has data on
  first paint).
- Renderer + main typechecks clean; `electron-vite build` clean; vitest green.
- Live-verify in the running app: bell badge reflects seeded attention items on the real
  `SmokeTest.reqarch`, dropdown groups populate, a row click navigates to the requirement;
  gear opens Settings; About shows the real version.
