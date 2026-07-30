# Design: Interface / Connection Table Export (backlog item 42)

**Date:** 2026-07-28
**Status:** BUILT 2026-07-30 (commits `2ddbccd`..`1b71f0e` on `main`; live-verified). Plan: `docs/superpowers/plans/2026-07-30-interface-table-export.md`.
**Backlog:** item 42 (medium)

## Purpose

The Interface Register (`InterfaceRegister`) already shows one row per connection (Interface ID, From, To, + Name/Type/Description/custom fields). Export it to CSV — for interface control documents, review, sharing. Folds into the existing item-32 export machinery.

## Non-goals (v1)

- **Export-only.** Interfaces are architecture connections, created on the canvas / via `+ New Interface`; no CSV *import* of interfaces (no way to mint a connection from a row without endpoint elements — out of scope).
- No ReqIF (ReqIF models requirements, not interfaces).
- No xlsx (Excel opens CSV).

## Key decision: export all data columns, ignore UI visibility

The register lets users hide columns (localStorage `reqarch.interfaceRegister.columns.v1`). Export ignores those toggles and writes **every data column** — the mandatory trio (Interface ID, From, To), the built-in optionals (Name, Type, Description; **not** the derived "architecture" display column unless useful), and one `cf:<Key>` column per connection custom field. Rationale: an export is a data dump, not a screenshot of the current view; hiding a column to declutter the screen shouldn't silently drop it from the file. (Matches the whole-project requirements CSV, which also exports beyond the current filter.)

## Architecture

Reuse the pure export layer in `src/main/export/`:

- **Pure model + writer** — a new `interfacesCsv.ts` (or extend `model.ts`) building an `InterfaceExportRow` and rows from connections + elements + connection custom fields, then the existing RFC-4180 `csv.ts` writer. Header order: `interface_id, from, to, name, type, description, cf:<Key>…`. Endpoint columns are the element `blockId`s (e.g. `SYS-001`), matching the register's From/To.
- **Handler** — a new `io:exportInterfacesCsv(projectId)` in `io.ts`: assembles connections (project-wide, soft-deletes excluded), elements (for blockId lookup), and `connectionCustomFields.listByProject`, builds rows via the pure module, runs the **native save dialog** + writes (same pattern as `io:exportCsv`).

The row-assembly logic (connection + element-endpoint + custom-field flattening) is the same shape as `buildInterfaceRows` in the renderer, but the export version lives in the pure main-side module so it's unit-testable without Electron (imports only types).

## UI

An **"Export CSV"** button in the Interface Register toolbar (beside `+ New Interface` / the Columns toggle). Click → `io:exportInterfacesCsv` → dialog + write. Default filename `<projectName> - Interfaces.csv`. Failure surfaces via the store `run()`/`lastError` convention.

## Data flow

Click → `io:exportInterfacesCsv(projectId)` → main gathers connections + elements + connection custom fields → pure `buildInterfaceExportRows` → `csv.ts` writer → save dialog → `writeFile`.

## Testing

Pure (`interfacesCsv.test.ts`):
- Row build: connection → `{interface_id, from(blockId), to(blockId), name, type, description}`; a connection custom field becomes a `cf:<Key>` column with its value; connections missing that field get an empty cell.
- Column set = mandatory + built-in optional + union of all custom-field keys (stable order).
- CSV round-trip through the existing writer: values with commas/quotes/newlines escaped (RFC 4180), reuses `csv.ts` — no new escaping code.
- Soft-deleted connections excluded.

Handler: assembles the right inputs and writes (dialog stubbed); cancelled dialog → no write.

## Deferrals

- Interface CSV *import* (needs endpoint-element resolution / creation).
- Match export columns to the user's current visibility toggles (v1 exports all).
- Interface export folded into the whole-project requirements CSV as a second sheet/section.
- `N²` interface matrix export.
