# Preferences section + "Colour objects by type" (item 29 B1) — Design

**Date:** 2026-07-16
**Status:** Approved (design), pending spec review
**Supersedes the B1 framing in:** `docs/superpowers/specs/2026-07-15-architecture-top-bar-design.md` §9 (which filed B1 as a one-line render change — false; see that spec's inline correction and the handoff).

## Context

Architecture objects render one colour (a hand-set `color`, else NAVY). A systems engineer colour-codes a diagram by *category* — every "Component" one colour, every "External" another — which today means hand-colouring every box. B1 lets objects **inherit their element type's colour**, with per-object colour still winning as an override.

**User decisions driving this design (2026-07-16):**
- It is an **optional user setting**, not always-on — some users find forced type colours annoying.
- It needs a **Preferences section inside a new Settings surface** (the app has no settings UI today). Built **extensible** so future toggles slot in.
- **Border colour only** — no `fill_color` on element types. Fill stays per-object.
- The toggle persists in **localStorage** (a render preference, like column widths / snap / active architecture), **app-global** (one switch across all projects — a person-level preference).

The idea's render change really is ~one line. Everything else below is the infrastructure that has to exist first.

## Components

### 1. Settings surface (new)
- A gear (⚙) button at the far right of the navy header (`App.tsx`), after Global search / Open / New Project.
- Opens a **Settings modal** reusing the app's existing modal wrapper in `App.tsx` (same one used elsewhere — no new modal primitive).
- The modal holds two sections:
  - **Preferences** — toggle rows. First (and, for now, only) row: `Colour objects by type`.
  - **Type Colours** — the loaded project's element types, each with a border-swatch picker + a ✕ (clear → NULL). Rendered with a muted hint when the toggle is off, so the dependency reads. This is per-project data shown in an app-settings modal; acceptable because the modal only ever opens with a project loaded.

### 2. Preferences store slice
- New store state: `colourByType: boolean`, action `setColourByType(v)`.
- Persisted to localStorage key `reqarch.prefs.colourByType`, read on store init (mirror the existing localStorage view-pref reads — snap, active architecture, column widths).
- App-global: not keyed by project id.

### 3. Shared border palette (kills divergence)
The canonical 8 border hexes + `NAVY` move to a **shared module both main and renderer import** — `src/types/index.ts` (already imported main-side as `../../types` and renderer-side as `../../../../types`). Export:
- The 8 named border hexes (values identical to `SWATCHES[].border` today) + `NAVY`.
- `BUILT_IN_TYPE_COLORS: Record<string, string>` mapping each built-in type name → one border hex. Proposed map: System→Navy, Subsystem→Teal, Component→Slate, Function→Green, External→Amber.

`ArchitectureCanvas/swatches.ts` then imports the border hexes for its `border` fields (keeps its renderer-only `fill` shades local). Seed + migration read `BUILT_IN_TYPE_COLORS`. One source of truth — a type's colour can never fall outside the palette its own picker offers. A parity guard test asserts `SWATCHES[].border` still equals the shared constants.

### 4. Seeding + backfill migration
- **New projects:** `seedElementTypes` (`elementTypes.ts:18`) inserts `color = BUILT_IN_TYPE_COLORS[name]` instead of literal `NULL`.
- **Existing projects:** an idempotent backfill in `runMigrations` (`migrations.ts`) — for each built-in name:
  `UPDATE element_types SET color = ?, updated_at = ? WHERE is_built_in = 1 AND color IS NULL AND name = ?`
  The `color IS NULL` guard makes it self-healing (re-runs harmlessly on every launch, since `openDatabase` re-runs migrations) and **never stomps a user-set colour**. Not version-gated — same pattern as the item-21 folder-split migration.

### 5. `elementTypes:update` (new backend)
None exists; the Type Colours picker has nothing to call. Add, mirroring the existing create/delete plumbing:
- `updateElementType(input)` in `elementTypes.ts` — sets `color` using the nullable idiom `'color' in input ? input.color : existing.color` so ✕ can write `NULL` (same idiom `updateElement` uses for `fillColor`).
- `ipcMain.handle('elementTypes:update', …)` in `registerElementTypeHandlers`.
- Preload bridge entry + `api.d.ts` declaration + `UpdateElementTypeInput` type.
- Store action `updateElementType` that calls it and refreshes `elementTypes` (which the canvas already consumes).

### 6. Border-clear (✕) on objects — prerequisite, not polish
`color` (border) has no NULL affordance today (Phase 2's ✕ was Fill-only). Without a clear path, any object with an explicit `color` (e.g. `thermal`'s `SYS-003` = `#66ffbd`) overrides an inherited type colour **forever**, so B1 silently does nothing for already-coloured objects and reads as broken. Add a ✕ to the **Border** row of the top-bar `Style ▾` popover, mirroring Phase 2's Fill ✕ — `Swatches` already accepts `clearable`. Clearing writes `color = NULL` through the existing `updateElement` path.

### 7. Render (the one line)
`ArchitectureCanvas/nodes.ts`: the type Map at ~line 119 (`new Map(elementTypes.map(t => [t.id, t.name]))`) must carry `.color` as well as `.name`. Then per node:
```
const border = colourByType ? (el.color ?? type?.color ?? NAVY) : (el.color ?? NAVY)
```
`colourByType` is threaded from the store into `buildNodes` as a parameter (pure — no store read inside the helper), alongside the existing inputs.

## Data flow

Toggle ON → store `colourByType=true` → `buildNodes(..., colourByType)` resolves each node's border as `el.color ?? type.color ?? NAVY`. A type's colour comes from `element_types.color` (seeded/backfilled/edited via the Settings Type Colours picker → `elementTypes:update`). A per-object `color` (set via the bar Border row) still wins; its ✕ clears to NULL so inheritance can take over. Toggle OFF → `el.color ?? NAVY`, exactly today's behaviour.

## Error handling
- Backfill migration runs inside the existing migration transaction; the `color IS NULL` guard is the idempotence contract.
- `elementTypes:update` mutation goes through the store; it will use whatever error-surfacing pattern the in-flight item-4 pass establishes (do not invent a second mechanism — reconcile at merge).

## Testing (must NOT ship dark — item 23 is fixed)
- **Migration** (`migrations.test.ts` or a dedicated file): built-in NULL colours get backfilled; a user-set colour is left untouched; second run is a no-op (idempotence).
- **`elementTypes:update`** (`elementTypes.test.ts`): sets a colour; clears to NULL via the `'color' in input` idiom.
- **`nodes.ts`**: border resolves `el.color ?? type.color ?? NAVY` when ON; `el.color ?? NAVY` when OFF; NAVY fallback when neither set.
- **Palette parity** (`swatches.test.ts` or shared): `SWATCHES[].border` equals the shared border constants.
- **Preferences persistence**: `setColourByType` writes/reads the localStorage key.

## Scope / YAGNI
- No `fill_color` on element types (border only, user decision).
- No general type-management UI beyond the colour picker (rename/add/delete types stays out — `create`/`delete` exist but no UI is in scope here).
- Preferences holds one toggle; the section is structured to grow but we add no speculative toggles.
- App-global toggle, not per-project.

## Key files
| File | Change |
|---|---|
| `src/renderer/src/App.tsx` | Gear button + Settings modal wiring |
| `src/renderer/src/components/Settings/` (new) | Settings modal, Preferences + Type Colours sections |
| `src/renderer/src/store/index.ts` | `colourByType` slice + `updateElementType` action |
| `src/types/index.ts` | Shared border palette + `BUILT_IN_TYPE_COLORS` + `UpdateElementTypeInput` |
| `src/renderer/src/components/ArchitectureCanvas/swatches.ts` | Import border hexes from shared |
| `src/main/handlers/elementTypes.ts` | Seed colours + `updateElementType` + IPC |
| `src/main/db/migrations.ts` | Idempotent backfill |
| `src/preload/index.ts`, `src/types/api.d.ts` | `elementTypes:update` bridge |
| `src/renderer/src/components/ArchitectureCanvas/nodes.ts` | Map carries `.color`; border resolution |
| Top-bar `Style ▾` popover component | Border ✕ clear |

## Verification
Live-verify on `thermal` via the Playwright driver: toggle ON tints objects by type colour, OFF reverts; edit a type colour in Settings → objects of that type change; ✕ on a hand-set border lets the type colour take over; relaunch persists the toggle; backfill ran (built-in types have colours, `SYS-003`'s hand-set colour untouched). Restore `thermal` to baseline afterward.
