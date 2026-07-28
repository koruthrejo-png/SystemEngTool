# Design: Verification Method Field (backlog item 39)

**Date:** 2026-07-28
**Status:** Draft — awaiting review
**Backlog:** item 39 (medium)

## Purpose

Systems-engineering requirements carry a **verification method** — the classic four: **Test / Analysis / Inspection / Demonstration** (the "TAID" set). Today the app tracks *whether* a requirement is verified (`verification_status`: Unverified / In Progress / Passed / Failed) but not *how* it will be verified. This adds the method as a first-class enum field, reusing the existing status/priority/type machinery end-to-end.

**Distinct from `verification_status`:** status = pass/fail progress; method = the technique. Both coexist on the requirement.

## Key decision: optional (nullable), not a forced default

The existing enums (`status`, `priority`, `req_type`) are `NOT NULL` with a default (Draft / Medium / Functional). A verification **method** is different: not every requirement has one assigned, and defaulting to "Test" would silently misattribute a technique the author never chose. So `verification_method` is **nullable / optional** — the drawer Select includes a blank ("— none —") option, and the table shows "—" when unset. This is a deliberate departure from the NOT-NULL enum convention, chosen so an unset method reads as "not decided", not "Test".

`VERIFICATION_METHODS = ['Test', 'Analysis', 'Inspection', 'Demonstration'] as const` — no `N/A`/`None` member; "unset" is `null`, not an enum value.

## Data model

- **Column:** `verification_method TEXT` (nullable, no default) on `requirements`, added via the idempotent `addColumnIfMissing` helper in `migrations.ts`. Legacy rows get `NULL` (no backfill — never-fabricate).
- **Types** (`src/types/index.ts`): `VERIFICATION_METHODS` const array + `VerificationMethod` union; `Requirement.verificationMethod?: VerificationMethod` (optional); add to `CreateRequirementInput` / `UpdateRequirementInput` as optional.

## Handler / history

- `createRequirement` / `updateRequirement` read/write the new column with the same coercion pattern as the other enums; `null` when blank.
- **History:** `verification_method` joins the tracked field set in `updateRequirement`'s transactioned per-field diff — it becomes the **11th** tracked column (was 10). `FIELD_LABELS` in the drawer History gains "Verification Method". A change from unset→Test records `old_value=NULL`, `new_value='Test'`.
- No new IPC — edits flow through `requirements:update`, reads through the existing requirement payloads.

## UI

- **Drawer:** a **Verification Method** `Select` placed next to the existing Verification (status) select, under Type/Status/Priority. Options: blank ("— none —") + the four methods. Saves on change (like the other selects).
- **Table:** a `verificationMethod` column rendering the method text (or "—"), matching the `verificationStatus` cell style. Not a chip — plain text (method isn't a status).
- **Filter:** a new `verificationMethod` entry in `FILTERABLE_ATTRS` (`filter.ts`), enum-typed like the others, so users can filter "method = Test".

## CSV / ReqIF round-trip

`verification_method` joins the export/import pipeline so it survives a round-trip (item-32 lesson — a new column that skips the pipeline is silently dropped):
- CSV `CORE_COLUMNS` (after `verification_status`), `ExportRow` / `ParsedRow`.
- ReqIF enum attribute.
- `merge.ts` `ENUM_SETS` — invalid value → row skipped-and-reported; blank leaves existing on update; blank on create = `null`.

## Testing

- Migration: column added; idempotent; legacy rows `NULL`.
- Handler: create with method; update method; **history records the method change** (unset→Test, Test→Analysis); no-op update writes zero history rows; blank clears to `NULL`.
- CSV round-trip: method survives export→import; invalid enum skipped-and-reported; blank on update preserves existing.
- Filter: `verificationMethod = Test` selects the right rows; unset rows excluded.
- Renderer: drawer Select saves; table cell shows method / "—".

## Deferrals

- Per-method verification evidence / test-case linkage (a method → its verifying test) — larger V&V feature, out of scope.
- Aggregate "verification method coverage" Dashboard card.
