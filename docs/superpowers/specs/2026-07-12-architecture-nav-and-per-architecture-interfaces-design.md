# Architecture Left-Nav + Per-Architecture Interfaces + Object-Name Columns — Design

**Date:** 2026-07-12
**Status:** Approved (brainstorm)
**Depends on:** Multiple Architectures (shipped, `60700a2..cbe4b4e`)

## Goal

Restructure architecture navigation from the top sub-tab strip to a left sidebar (in the space the Component Library occupied), shelve the Component Library, mirror the same navigation in the Interfaces tab so interfaces can be browsed per architecture, and make the source/target object **names** mandatory columns in the Interface Register.

## Context

Current Architecture tab (`App.tsx` `panel-architecture`): `[ ArchitectureTabs strip on top + (ArchitectureCanvas, which renders ComponentLibrary as a left palette) | properties panel ]`. `ComponentLibrary.tsx` lists the project's `elementTypes`; clicking a row adds a typed block. The toolbar `+ Object` adds an untyped block.

Current Interfaces tab (`panel-interfaces`): `[ InterfaceRegister (full width) | ConnectionPanel ]` — no left nav. The register loads ALL project connections (`loadInterfaces`, unfiltered) and each row already carries `architectureId` + `architectureName` (from the Multiple Architectures work). Mandatory columns today: Interface ID, From, To (object `blockId`s). Optional toggleable: Name, Type, Description, Architecture, + custom-field keys.

This change is **pure renderer** — no DB, migration, handler, preload, or type-shape changes. All data it needs is already loaded.

## Requirements

### 1. Architecture tab: left-nav replaces the top strip

- New component `src/renderer/src/components/ArchitectureCanvas/ArchitectureNav.tsx` — a vertical left sidebar (`w-56`, `border-r`, token-styled to match the Requirements `ModuleTree` sidebar).
  - Header row: label "ARCHITECTURES" (SectionLabel/label-caps style) + a "+ New" affordance that reveals a compact inline `<input placeholder="Architecture name">` (Enter commits `addArchitecture(value)` when non-empty, Escape cancels). Placement: in the header (top), consistent with the app's other "+ New X" affordances.
  - One row per architecture (store order): shows the name; the active one (`activeArchitectureId`) highlighted with the app's active treatment (`bg-white border border-line text-ink`), inactive `text-ink-muted hover:bg-white/60`.
  - Click a non-active row → `setActiveArchitecture(id)`.
  - Double-click a row → inline rename (native `<input>` seeded with the name; Enter/blur commits via `renameArchitecture(id, trimmed)` ignoring empty; Escape cancels).
  - Hover `×` on a row → `removeArchitecture(id)` after `window.confirm('Delete this architecture and all its blocks?')`. The `×` is hidden entirely when `architectures.length <= 1`.
  - Consumes existing store state/actions only: `architectures`, `activeArchitectureId`, `setActiveArchitecture`, `addArchitecture`, `renameArchitecture`, `removeArchitecture`. **No store changes.**
- **Delete** `ArchitectureTabs.tsx` and `ArchitectureTabs.test.tsx`. Remove the strip from `App.tsx`.
- New `panel-architecture` layout:
  ```
  [ ArchitectureNav (w-56, shrink-0, border-r) | ArchitectureCanvas (flex-1) | properties Panel (w-96, on selection) ]
  ```
  The `App.tsx` tab-entry effect still calls `loadArchitectures()` (which sets active + loads the canvas) — unchanged.

### 2. Component Library shelved

- Stop rendering `<ComponentLibrary />` inside `ArchitectureCanvas/index.tsx`. Keep `ComponentLibrary.tsx` in the repo (unmounted, not deleted — "for now"). Remove now-dead imports/wrappers left by its removal, but do not delete the file.
- The canvas toolbar `+ Object` gains a **type picker** so typed-block creation survives the palette's removal:
  - A compact `Select` next to `+ Object` listing the project's `elementTypes` (by name), with an empty/"Untyped" default.
  - Clicking `+ Object` calls `addElement({ projectId, elementTypeId: <selected or null>, posX, posY })` — same store action the palette used. Empty selection = untyped block (today's `+ Object` behavior).
  - `elementTypes` already live in the store (loaded by `loadArchitecture`).

### 3. Interfaces tab: per-architecture left nav

- New left sidebar in `panel-interfaces` (`w-56`, `border-r`, styled to match `ArchitectureNav`), listing:
  - An **"All architectures"** entry at the top (selected by default) — the current project-wide register.
  - One entry per architecture (`architectures`, already loaded by `loadInterfaces`).
  - This nav is **navigation/filter only** — no create/rename/delete of architectures from the Interfaces tab (those live in the Architecture tab).
- New store session state `interfaceArchFilter: number | 'all'` (default `'all'`; setter `setInterfaceArchFilter`). Not persisted (session-scoped). Reset to `'all'` on project switch (fold into the existing project-load reset, alongside other per-project resets).
- Register filtering is **client-side**: when `interfaceArchFilter` is a number, show only rows where `row.architectureId === interfaceArchFilter`; when `'all'`, show every row (today's behavior). Rows are already built from the fully-loaded `connections`, so no new IPC and no `loadInterfaces` change to the connection fetch.
- **`+ New Interface` scoping:** when a specific architecture is selected, the two element `Select`s in the create form list only that architecture's elements (`elements.filter(e => e.architectureId === interfaceArchFilter)`), and the created connection is stamped explicitly: `addConnection({ ..., architectureId: interfaceArchFilter })`. When "All" is selected, keep today's behavior: pickers span all project elements and `addConnection` is called without an `architectureId`, so `createConnection` derives it from the source element (the shipped fallback).

### 4. Interface Register: mandatory object-name columns

- `src/renderer/src/components/InterfaceRegister/rows.ts`: `InterfaceRow` gains `fromName: string` and `toName: string` — the `.name` of the source/target element (looked up in the existing element map used for `fromId`/`toId`), empty string when the element is missing or unnamed.
- The register renders **From Name** and **To Name** as **mandatory** columns (never hideable), positioned in this exact mandatory order: **Interface ID | From | From Name | To | To Name**, followed by the optional/toggleable columns. They are NOT part of the toggleable-column set.

## Architecture / Components

| Unit | Responsibility | Depends on |
|---|---|---|
| `ArchitectureNav.tsx` (new) | Left sidebar: list + switch/create/rename/delete architectures | store architecture state/actions |
| `ArchitectureCanvas/index.tsx` (mod) | Drop `<ComponentLibrary/>`; add type-picker `+ Object` | store `elementTypes`, `addElement` |
| `InterfaceNav.tsx` (new) | Left sidebar: "All" + per-architecture filter entries | store `architectures`, `interfaceArchFilter`, `setInterfaceArchFilter` |
| `InterfaceRegister/index.tsx` (mod) | Client-side arch filter; From/To Name columns; scoped create pickers | `interfaceArchFilter`, rows helper |
| `InterfaceRegister/rows.ts` (mod) | `fromName`/`toName` on rows | `elements` |
| `store/index.ts` (mod) | `interfaceArchFilter` + setter + project-switch reset | — |
| `App.tsx` (mod) | New architecture + interfaces panel layouts; remove strip | the new components |
| `ArchitectureTabs.tsx` / `.test.tsx` | **Deleted** | — |

Two focused nav components rather than one forced abstraction: `ArchitectureNav` (canvas switch + full CRUD, no "All") and `InterfaceNav` (filter + "All", no CRUD) differ in both behavior and affordances. They share token styling by convention, not a shared component.

## Data Flow

- Architecture nav: click → `setActiveArchitecture(id)` → store persists + reloads canvas (existing path). No new flow.
- Interface nav: click → `setInterfaceArchFilter(id | 'all')` (store, session) → `InterfaceRegister` re-derives visible rows by filtering already-loaded `connections`. Pure client-side.
- Object names: already-loaded `elements` → `buildInterfaceRows` map lookup → `fromName`/`toName` → mandatory cells.

## Testing

- Renderer vitest (runs; main-process vitest stays the accepted ABI-failing baseline):
  - `ArchitectureNav.test.tsx`: renders a row per architecture; click switches; "+ New" commits; `×` hidden when one architecture.
  - `InterfaceNav.test.tsx`: renders "All" + per-architecture entries; click sets `interfaceArchFilter`.
  - `rows.test.ts`: `fromName`/`toName` mapped from elements; empty when missing.
  - `InterfaceRegister` test: rows filtered to selected architecture; "All" shows every row; From/To Name columns always present (not in the toggle set).
  - Update/replace `ArchitectureTabs.test.tsx` (deleted) — remove references.
  - `App.test.tsx`: its store mock already carries architecture state; add `interfaceArchFilter: 'all'`, `setInterfaceArchFilter: vi.fn()` if the render path needs them.
- Both typechecks clean; `electron-vite build` clean.
- Live-verify in the running app: left nav switches architectures (canvas swaps, top strip gone); `+ Object` type picker adds typed blocks (palette gone); Interfaces left nav filters the register per architecture and "All" shows all; From/To Name columns show object names; `+ New Interface` under a specific architecture scopes the pickers.

## Out of Scope / Deferred

- Component Library stays shelved (file retained); no decision here on its eventual return.
- No persistence of `interfaceArchFilter` across relaunch (session-only by design).
- No backend `architectureId` filter for the register (client-side is sufficient — all rows already loaded).
- No hierarchy/tree for architectures (flat list; they are not nested).
- Architecture-nav a11y (`role`/keyboard) rides the existing batched a11y follow-up ticket, same as the strip it replaces.

## Known Follow-ups Touched

- The batched `aria-pressed`/`role=tab` a11y ticket now covers `ArchitectureNav`/`InterfaceNav` rows instead of the deleted strip.
