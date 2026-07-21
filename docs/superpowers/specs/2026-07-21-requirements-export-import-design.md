# Requirements Export / Import + ReqIF Interchange — Design

**Date:** 2026-07-21
**Backlog:** items 32 (CSV / Excel export + import) and 33 (ReqIF interchange), filed in `docs/superpowers/specs/2026-07-02-ui-overhaul-design.md` §32–33.
**Status:** Design, pending spec review.

## Goal

Get requirements out of the app for stakeholders who live in spreadsheets (CSV), and interoperate with real SE tools — DOORS / Polarion / Jama — via ReqIF (the OMG XML interchange format). Two directions:

- **Export** the current module *or* the whole project with every data column, custom fields, and derivation links.
- **Import** CSV (create/update requirements) and ReqIF (create/update, best-effort).

The interop checkbox is ReqIF; CSV is the everyday workhorse.

## Ponytail dependency decision (read first — it shapes everything)

Applying the ladder to the two formats:

| Format | Read | Write | Decision |
|---|---|---|---|
| **CSV** | hand-rolled parser | hand-rolled writer | **No dependency.** RFC 4180 is a ~40-line pure module. Correct-on-edge-cases (quotes, embedded commas/newlines, CRLF) beats pulling `papaparse`. |
| **ReqIF export** | — | hand-rolled XML string | **No dependency.** The ReqIF envelope is a fixed template; the only real work is escaping 5 XML entities (~5 lines). |
| **ReqIF import** | `fast-xml-parser` | — | **One small dependency, phase 2 only.** Parsing XML by hand (namespaces, entity decoding, attribute-vs-text, self-closing tags) is exactly the "pick the option that's correct on edge cases" case. `fast-xml-parser` is pure-JS, zero native bindings — which matters here because the native `better-sqlite3` ABI is already a testing headache (see §Testing); a native XML dep would double it. |

**Phasing that keeps phase 1 dependency-free:** CSV export+import and ReqIF *export* ship first with **zero new deps**. ReqIF *import* is a fast-follow that adds `fast-xml-parser` when it lands. If the reviewer wants ReqIF import in the same cycle, add the dep now; nothing else changes.

**xlsx (.xlsx) is explicitly deferred — see Open Questions.** Excel opens `.csv` natively. A real `.xlsx` writer is a ZIP-of-XML (SheetJS is heavy and no longer cleanly on the npm registry; `write-excel-file` is lighter but still a dep for formatting nobody has asked for yet). CSV is the lazy MVP that already lands in Excel. We spec CSV as the deliverable and file xlsx as a follow-up.

## Architecture: pure mappers + thin IPC handler

The whole feature is two pure modules plus one handler that does dialogs and DB I/O. The pure modules are the point — they are unit-testable **without Electron or sqlite**, so they dodge the `better-sqlite3` ABI baseline that makes `src/main/**` vitest fail (see the connection-line spec §Global Constraints, and `sqliteAbi.test.ts`).

### The normalized export row (the shared model)

Both CSV and ReqIF consume one flat shape assembled by the handler from existing queries — no new DB access patterns:

```typescript
// src/main/export/model.ts (NEW)
export interface ExportRow {
  reqId: string
  section: string            // heading title-path "Power > Thermal", '' if none
  text: string
  acceptanceCriteria: string // the requirement.acceptance_criteria TEXT field (see AC note)
  source: string
  rationale: string
  reqType: RequirementType
  status: RequirementStatus
  priority: RequirementPriority
  derivedFrom: string[]      // parent reqId strings
  custom: Record<string, string>  // custom-field key -> value
}
```

Assembled in the handler by reusing, unchanged:
- `listRequirements(moduleId)` / `listRequirementsByProject(projectId)` (`requirements.ts`)
- `headings.list` rows → build the title-path map (walk `parentId`)
- `customFields:list` per requirement (or one project-wide query)
- `listRequirementLinksByProject(projectId)` (`requirementLinks.ts`) → group children→parent reqIds

`section` is derived from the heading tree; `derivedFrom` uses **reqId strings, not row ids**, because row ids are not stable across an import into another file. This is the join key on the way back in.

## New IPC channels (exact names + signatures)

A new `io` namespace. The main process already holds exactly one open project DB, so `projectId` is passed explicitly (mirroring `requirements.listByProject`) and `moduleId: null` means whole-project.

```
io:exportCsv    (projectId: number, moduleId: number | null) => Promise<ExportResult | null>
io:exportReqif  (projectId: number, moduleId: number | null) => Promise<ExportResult | null>
io:importCsv    (moduleId: number)  => Promise<ImportResult | null>
io:importReqif  (moduleId: number)  => Promise<ImportResult | null>
```

- Export shows a **save** dialog (`dialog.showSaveDialog`, same pattern as `projects.ts:77`), writes with `writeFileSync`, returns `{ path, count }`. `null` = user cancelled the dialog.
- Import shows an **open** dialog, reads with `readFileSync`, parses, upserts, returns the merge summary. `null` = cancelled.
- Import always targets a specific `moduleId` — new requirements need a module to mint `req_id` from (`createRequirement` reads the module's prefix/counter).

```typescript
// src/types/index.ts (NEW)
export interface ExportResult { path: string; count: number }
export interface ImportResult { created: number; updated: number; skipped: number; errors: string[] }
```

## Files that change

| File | Change |
|---|---|
| `src/main/export/csv.ts` | **NEW, pure.** `rowsToCsv(rows, customKeys): string`, `parseCsv(text): ParsedRow[]`. No imports beyond types. |
| `src/main/export/reqif.ts` | **NEW, pure.** `rowsToReqif(rows, customKeys, meta): string`, `parseReqif(xml): ParsedRow[]` (phase 2 uses `fast-xml-parser`). |
| `src/main/export/model.ts` | **NEW.** `ExportRow` + `escapeXml` helper (shared). |
| `src/main/handlers/io.ts` | **NEW.** Dialogs, DB read (reuse existing query fns), file write/read, upsert loop, `registerIoHandlers()`. |
| `src/main/index.ts` | Register `registerIoHandlers()` alongside the others (line ~59). |
| `src/preload/index.ts` | `io` bridge (4 `ipcRenderer.invoke` wrappers). |
| `src/types/api.d.ts` | `io` block on `Window['api']`. |
| `src/types/index.ts` | `ExportResult`, `ImportResult`. |
| `src/renderer/src/store/index.ts` | 4 actions via the `run()` convention (below). |
| `src/renderer/src/components/RequirementsList/index.tsx` | Export ▾ / Import ▾ buttons in the toolbar (line ~251, next to `+ Heading` / `+ New Requirement`). |
| `package.json` | `fast-xml-parser` — **phase 2 only** (ReqIF import). |

No schema migration. No changes to existing handlers — import calls `createRequirement` / `updateRequirement` **as-is** so attribution is stamped by `currentUserRowId(db)` in main; the renderer never asserts who imported (house rule — the importing user becomes author/updater, which is correct).

## CSV column mapping

One header row; column order fixed for the core columns, custom fields appended (union of all keys for a whole-project export, prefixed `cf:` so they can never collide with a core column name).

| CSV column | Source | Import behaviour |
|---|---|---|
| `req_id` | `Requirement.reqId` | **Join key.** Match within target module → update; no match → create (new reqId minted, the CSV value is ignored on create). Blank → always create. |
| `section` | heading title-path | Match an existing heading in the module by exact title-path → set `headingId`; else leave null. (Creating heading trees on import = follow-up.) |
| `text` | `text` | required on create |
| `acceptance_criteria` | `acceptanceCriteria` TEXT field | plain passthrough |
| `source` | `source` | `'' → null` |
| `rationale` | `rationale` | `'' → null` |
| `type` | `reqType` | validate against `REQUIREMENT_TYPES`; invalid → row error, skip |
| `status` | `status` | validate against `REQUIREMENT_STATUSES` |
| `priority` | `priority` | validate against `REQUIREMENT_PRIORITIES` |
| `derived_from` | parent reqIds, `;`-joined | resolve each to a req in the project by reqId → `reqLinks:add`; unknown reqId → collected into `errors`, link skipped, row still imported |
| `cf:<Key>` (0..n) | custom fields | each non-empty cell upserts a `requirement_custom_fields` row for that key |

Enum columns export the display strings (`Functional`, `Approved`, …) — human-readable and exactly the union constants, so round-trip is lossless.

## ReqIF element mapping

ReqIF is a typed model: datatypes → attribute definitions → a spec-object type → spec-objects, plus specifications (the outline tree) and spec-relations (links). Mapping this app's fields:

| ReqIF element | This app |
|---|---|
| `REQ-IF` / `THE-HEADER` | envelope; `REQ-IF-HEADER` gets project name, ISO timestamp, a generated `IDENTIFIER` (uuid). |
| `DATATYPE-DEFINITION-STRING` | one, for all free-text fields. |
| `DATATYPE-DEFINITION-ENUMERATION` ×3 | `reqType`, `status`, `priority` — `ENUM-VALUE`s are our union constants. |
| `SPEC-OBJECT-TYPE` "Requirement" | one type; holds all attribute definitions below. |
| `ATTRIBUTE-DEFINITION-STRING` | `reqId` (as `ReqIF.ForeignID`-style attr), `text` (`ReqIF.Text`), `acceptanceCriteria`, `source`, `rationale`, **+ one per custom-field key**. |
| `ATTRIBUTE-DEFINITION-ENUMERATION` ×3 | `reqType`, `status`, `priority`, each `->` its datatype. |
| `SPEC-OBJECT` (one per requirement) | `IDENTIFIER` = a stable derived id (uuid seeded from reqId); `ATTRIBUTE-VALUE-STRING` / `ATTRIBUTE-VALUE-ENUMERATION` referencing the definitions. |
| `SPECIFICATION` (one per module) | `SPEC-HIERARCHY` nesting mirrors the heading tree; each requirement is a leaf `SPEC-HIERARCHY` → `OBJECT` ref. This is how section structure survives. |
| `SPEC-RELATION-TYPE` "Derives" + `SPEC-RELATION`s | one relation per derivation link: `SOURCE` = child spec-object, `TARGET` = parent. |

**Import** flattens the other way: every `SPEC-OBJECT` becomes a requirement (regardless of its source SPEC-TYPE — DOORS files carry many types we don't model). Attributes are matched to our fields **by attribute definition LONG-NAME** (`reqId`, `text`, `status`, …); a `reqId` attribute, if present, is the join key exactly like CSV. `SPEC-HIERARCHY` order/nesting → section match (same rule as CSV). `SPEC-RELATION`s with a recognizable "derive/refine" type → `reqLinks:add`.

## Import conflict / merge rules

Single rule set, shared by CSV and ReqIF:

1. **Match by `req_id`** within the *target module* (CSV) or by the `reqId` attribute (ReqIF).
2. Match found → **update** via `updateRequirement` (partial: only the columns the file carries; unknown/blank enum cells leave the existing value). `updated++`.
3. No match / blank req_id → **create** via `createRequirement` (mints a fresh reqId). `created++`.
4. Invalid enum, missing required `text` on a create, or malformed row → **skip**, push a message to `errors[]`, keep going. `skipped++`.
5. Derivation links resolved **after** all rows exist (two passes), so forward references work; unresolved parent reqIds are reported, not fatal.
6. Whole import runs in **one `db.transaction`** — a hard failure rolls back, no half-imported file. Per-row validation errors are *not* hard failures (they're collected and skipped).

No "delete requirements absent from the file" — import is create/update only. Destructive sync is out of scope (and dangerous); flag as a deliberate non-goal.

## Store actions (the `run()` / `lastError` convention)

Four actions, all through the mandated `run()` wrapper (`store/index.ts:817`) so a rejected IPC surfaces as `lastError` instead of an unhandled rejection:

```typescript
exportCsv: (moduleId) => run(async () => {
  const { project } = get(); if (!project) return
  await window.api.io.exportCsv(project.id, moduleId)   // main handles the save dialog
}),
importCsv: (moduleId) => run(async () => {
  const res = await window.api.io.importCsv(moduleId)
  if (!res) return
  set({ requirements: await window.api.requirements.list(moduleId) })   // re-sync, like resyncRequirements
  if (res.errors.length) set({ lastError: `Imported ${res.created}+${res.updated}, ${res.skipped} skipped` })
}),
// exportReqif / importReqif identical shape
```

- Export is not a mutation but still wrapped, so a write/permission failure surfaces.
- Import re-reads the module list after success — same pattern as `resyncRequirements` — so the table reflects created/updated rows.
- Success is otherwise silent (the file appears / the list updates). A dedicated non-error "notice" toast is **not** built here — `lastError` is the only channel and reusing it for the skipped-count summary is the lazy fit. A real `lastNotice` toast is a follow-up if the reviewer wants louder success feedback.

## Renderer UI entry point

`RequirementsList/index.tsx` toolbar (line ~251, the `!showDeleted` group). Add two small `Button variant="secondary"` dropdowns before `+ Heading`:

- **Export ▾** → `Current module (CSV)` · `Whole project (CSV)` · `Current module (ReqIF)` · `Whole project (ReqIF)`. Calls `exportCsv(selectedModuleId)` / `exportCsv(null)` / `exportReqif(...)`.
- **Import ▾** → `From CSV…` · `From ReqIF…`. Calls `importCsv(selectedModuleId!)` / `importReqif(selectedModuleId!)`. Disabled when no module is selected.

Reuse the existing `Select`/`Button` primitives from `../ui`; no new dropdown primitive (the `BulkSelect` in this same file is already a lightweight pattern to copy if a menu is needed).

## Acceptance-criteria note (scope boundary)

Two representations exist: the legacy `requirement.acceptance_criteria` TEXT field **and** the structured `AcceptanceCriterion` rows (separate table, per-item status). Export/import here handles **only the TEXT field** — one column / one string attribute. Structured AC items (with pass/fail status) would need multi-row CSV or a JSON-encoded cell and a matching ReqIF sub-object; that is a **follow-up**, not this spec. Called out so nobody thinks structured AC silently round-trips.

## Testing

The pure mappers are the test surface — they run under the renderer/pure-helper vitest that actually works (unlike `src/main/**`, blocked by the sqlite ABI baseline):

- **`csv.test.ts`** — `rowsToCsv`: quoting of commas / embedded quotes / newlines / CRLF; custom-field column union; enum passthrough. `parseCsv`: the inverse, plus a quoted field containing a delimiter and a doubled `""`. **Round-trip:** `parseCsv(rowsToCsv(rows)) ≡ rows` (logical equality).
- **`reqif.test.ts`** — `rowsToReqif`: XML-escapes `&<>"'`; emits one SPEC-OBJECT per row, the three enumerations, the spec-hierarchy from a 2-level heading tree, and a SPEC-RELATION per link. `parseReqif`: reads a small hand-written ReqIF sample (and one exported by us) back into rows; matches attributes by LONG-NAME; flattens unknown spec-types. **Round-trip:** `parseReqif(rowsToReqif(rows)) ≡ rows`.
- **Merge rules** — unit-test the pure "match by reqId → update else create, validate enum, defer links" decision function on `ParsedRow[]` (extract it from the handler so it's testable without a DB). Covers: update-existing, create-new, invalid-enum-skip, unresolved-derivedFrom-reported.
- **Handler / dialog / DB write** — covered by typecheck + a live-verify pass (main-process vitest stays on the accepted ABI baseline, same as every other handler).

Keep both typechecks green (`tsc -p tsconfig.web.json` and `tsconfig.node.json`).

## Scope / YAGNI

- **CSV is the export deliverable; xlsx is deferred** (Excel opens CSV). No spreadsheet library.
- **ReqIF import is phase 2** (adds the one dep); export ships dep-free in phase 1.
- Import is **create/update only** — never deletes requirements missing from the file.
- **No new schema, no migration** — pure read/transform/write over existing tables.
- Structured acceptance-criteria items, interface/connection-table export (backlog 42), and canvas PNG/SVG (backlog 41) are separate follow-ups — do not fold them in.
- Section reconstruction on import matches existing headings only; building new heading trees from a file is a follow-up.

## Open questions for the user

1. **xlsx — needed, or is CSV enough?** Recommendation: CSV only for v1 (opens in Excel, round-trips for import). Real `.xlsx` adds a dependency for formatting nobody has asked for. Confirm we can defer, or name the must-have Excel feature (multiple sheets? styled headers?) that forces it.
2. **Update-by-`req_id` semantics on import — confirm.** Matching a CSV `req_id` to an existing requirement **overwrites** its fields. Is that the intended merge, or should import always create new rows (never touch existing)? The spec assumes update-on-match.
3. **ReqIF round-trip fidelity — accept the flattening?** We map every SPEC-OBJECT to a plain requirement and store text as ReqIF STRING (not XHTML), so importing a DOORS file loses: rich-text formatting, multiple object types, and any attribute we don't model (kept? dropped? we drop). Export→import between two ReqArch files is lossless for our fields; ReqArch↔DOORS is best-effort. Acceptable?
4. **Whole-project CSV shape** — one flat file with a `module` column, or is per-module export enough? Spec currently exports project reqs into one file (custom-field columns = union across the project). Confirm one-file-with-module-column is wanted, or drop whole-project CSV and keep per-module only.
5. **ReqIF import phase** — same cycle as CSV (add `fast-xml-parser` now), or genuine fast-follow?
