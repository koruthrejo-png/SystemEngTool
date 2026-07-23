# Design: Acceptance Criteria as free text + per-requirement Verification status

**Date:** 2026-07-23
**Status:** Approved (design)
**Supersedes:** the structured acceptance-criteria checklist (backlog item 7, `2026-07-07-acceptance-criteria-checklist-design.md`)

## Overview

Replace the structured acceptance-criteria checklist (a child table of individually
statused items with add/move/remove) with:

1. **Acceptance Criteria as a single free-text field** on the requirement, edited like
   `source` / `rationale`.
2. **One Verification status per requirement** (`Unverified | In Progress | Passed | Failed`,
   default `Unverified`) shown in the drawer Properties block. The tracker now applies to the
   whole entry rather than to individual criteria.

This also fixes the item-32 CSV/ReqIF round-trip bug: acceptance criteria currently live in a
child table that export/import never touch, so AC silently fail to round-trip. Once AC is a plain
column on `requirements`, export/import round-trip it for free (the columns are already wired),
and Verification status is added as a second plain column.

**Motivation for the change (user, 2026-07-23):** the per-criterion checklist is more machinery
than the workflow needs; a free-text AC field plus a single pass/fail-style tracker in properties
is simpler to use and to maintain, and it removes the child-table complexity that broke the
export round-trip.

## Data model

`requirements` table:
- **Reuse** the existing `acceptance_criteria TEXT` column (currently dead — item 7 NULLed it and
  moved AC to a child table). It becomes the live free-text AC field again.
- **Add** `verification_status TEXT NOT NULL DEFAULT 'Unverified'` via `addColumnIfMissing`
  (TS-enforced enum, no CHECK constraint — matches the `status`/`priority`/`req_type` convention).
- **Drop** the `acceptance_criteria` child table (see Migration).

Types (`src/types/index.ts`):
- Add `export const VERIFICATION_STATUSES = ['Unverified', 'In Progress', 'Passed', 'Failed'] as const`
  and `export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number]`.
- Add `verificationStatus: VerificationStatus` to `Requirement`.
- **Remove** `AC_STATUSES`, `AcStatus`, `AcceptanceCriterion`, `UpdateAcceptanceCriterionInput`.

## Enum + chip

- `Chip` (`src/renderer/src/components/ui/index.tsx`, `CHIP_STYLES`) already styles
  `Unverified` / `Passed` / `Failed`. Add an **`In Progress`** entry using an amber/warning
  token (verify a `warning`/amber token exists in `tailwind.config.js`; if not, use a neutral
  distinguishable style). The value-key namespace is shared across statuses/priorities/verification;
  `In Progress` is unique and does not collide.

## Removed surface (dead-code deletion)

- **Handler:** delete `src/main/handlers/acceptanceCriteria.ts` (6 IPC channels:
  list / listByModule / create / update / delete / move) and its registration in
  `src/main/index.ts`.
- **Preload + api:** remove the `acceptanceCriteria` bridge from `src/preload/index.ts` and its
  entry in `src/types/api.d.ts`.
- **Store (`src/renderer/src/store/index.ts`):** remove `acItems`, `acSummary`, and
  `loadAcItems` / `addAcItem` / `updateAcItem` / `removeAcItem` / `moveAcItem` / `refreshAc`.
  Delete `src/renderer/src/store/acSummary.ts` (`summarize`).
- **Drawer (`RequirementDetail/index.tsx`):** remove the checklist block (status-cycling chip,
  inline edit, ↑↓ move, × remove, + Add criterion, `focusNewAc`, `localAcTexts` sync effects).
- **Requirements table (`RequirementsList/index.tsx`):** the `ac` column stops reading
  `acSummary`; the passed/total badge is removed.
- **Tests deleted:** `store/acceptanceCriteria.test.ts`, `store/acSummary.test.ts`,
  `RequirementDetail/acceptance.test.tsx`. Update any other test that mocks the removed store
  slices (`App.test.tsx`, `Dashboard/*`, `GlobalSearch`, `ElementPanel`, `TraceabilityMatrix`,
  `RequirementDetail/*`, `RequirementsList/*` — those referencing `acItems`/`acSummary`).

## UI changes

**Drawer (`RequirementDetail/index.tsx`):**
- Acceptance Criteria section becomes a `Textarea` bound to `acceptanceCriteria`, blur-save,
  mirroring the Rationale field (local `useState` + `save()` through `updateRequirement`).
- Add a **Verification** `Field` with a `Select` in the Properties block, beside Status/Priority
  (options `VERIFICATION_STATUSES`, `aria-label="Verification"`, saves on change via
  `updateRequirement(req.id, { verificationStatus })`).

**Requirements table (`RequirementsList/index.tsx`):**
- The `ac` column renders the truncated AC free text (like other text cells), em-dash when blank.
- **No verification column** in the table (user decision — verification lives only in the drawer).

## Migration (`src/main/db/migrations.ts`, idempotent, transactional)

1. Keep `requirements.acceptance_criteria TEXT` in the create-table DDL.
2. **Remove** the `CREATE TABLE IF NOT EXISTS acceptance_criteria (...)` DDL.
3. `addColumnIfMissing(db, 'requirements', 'verification_status', "TEXT NOT NULL DEFAULT 'Unverified'")`.
4. **Replace** the item-7 "split legacy free-text into checklist items" block with a **collapse**
   step, guarded on the child table still existing
   (`SELECT name FROM sqlite_master WHERE type='table' AND name='acceptance_criteria'`):
   - For each `requirement_id` with rows in `acceptance_criteria`, set
     `requirements.acceptance_criteria = <item texts joined by '\n', ordered by position>`.
   - Leave `verification_status` at its default `Unverified` (per user decision — old per-item
     statuses are discarded).
   - `DROP TABLE acceptance_criteria`.
   - One transaction. Idempotent: once the table is dropped, the guard fails and the step is a
     no-op. Requirement text and IDs are never touched.
   - Fresh installs never create the child table (DDL removed), so the guard simply skips.

## Item 32 export/import (`src/main/export/*`, `src/main/handlers/io.ts`)

- `acceptance_criteria` is **already** a `CORE_COLUMN` (csv) and a field on `ExportRow`/`ParsedRow`
  (model) and reqif. With AC back as a plain column, `assembleRows` reads
  `r.acceptanceCriteria` (the live column) and `createRequirement`/`updateRequirement` write it —
  the round-trip works with no export-side change.
- **Add `verification_status`:** to `CORE_COLUMNS` (csv.ts), `ExportRow`/`ParsedRow` (model.ts),
  the reqif writer (reqif.ts), and to `ENUM_SETS` in `merge.ts` (validated against
  `VERIFICATION_STATUSES`; invalid non-blank value → row skipped-and-reported; blank leaves the
  existing value on update, matching status/priority/type).
- `createRequirement`/`updateRequirement` (`requirements.ts`) gain a `verificationStatus` field;
  `rowToRequirement` maps `verification_status` (default `Unverified`). `io.ts` `toUpdateInput`
  and the create call pass it through.

## Filter (`RequirementsList/filter.ts`)

- Add `verificationStatus` as an `enum` filter attr (`options: VERIFICATION_STATUSES`,
  `get: (r) => r.verificationStatus ?? ''`).
- The existing `acceptanceCriteria` text filter attr now works against the live column (it already
  reads `r.acceptanceCriteria`, which was empty under the child-table model).

## Out of scope

- Dedicated toolbar Verification filter-select (the generic Filter builder covers it; add later if
  wanted).
- Individual/structured criteria (that is exactly what this removes).
- Dashboard changes — it never consumed AC (`Dashboard/stats.ts` has no AC references).

## Verification plan

- Renderer + main typechecks clean; `electron-vite build` clean; vitest green (removed tests
  deleted, updated tests passing).
- Migration live-verify on the real `Satellite Demo` DB (3 AC items across 2 requirements) and
  `SmokeTest` (1 item): after launch, the child table is gone, each affected requirement's
  `acceptance_criteria` column holds the joined text, `verification_status = 'Unverified'`,
  requirement IDs unchanged; relaunch is a no-op.
- Drawer: AC textarea edits persist; Verification select persists and shows the right chip.
- Item 32 round-trip: export a module to CSV, confirm `acceptance_criteria` and
  `verification_status` columns are populated; edit + re-import, confirm both round-trip and an
  invalid `verification_status` row is skipped-and-reported. Drive the native dialog via the
  main-process `dialog` stub (`app.evaluate`) — osascript keystrokes are blocked by macOS
  Accessibility (error 1002).
