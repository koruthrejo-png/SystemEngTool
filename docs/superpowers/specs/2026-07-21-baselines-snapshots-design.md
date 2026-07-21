# Baselines / Snapshots — Design

**Backlog item 35.** Let a user freeze a labelled, point-in-time version of the whole project ("Rev A", "PDR baseline"), list past baselines, and diff the current project against a baseline — what requirements were **added / removed / changed** since the freeze.

**Date:** 2026-07-21
**Status:** Design, pending spec review

## Context

Freezing a baseline is a core systems-engineering workflow: at a review gate (SRR, PDR, CDR) you stamp the current requirement set as an immutable revision, then later show what moved against it. Today ReqArch has no such freeze — the `.reqarch` file is only ever "now".

**Relationship to item 34 (per-requirement change history) — note it, don't couple to it.** A *baseline* is a **whole-project, discrete, labelled freeze** at one instant. *History* is a **continuous per-field log** of one requirement over time. They share no structure and ship independently: a baseline's snapshot is not derived from the history log, and the history log is not reconstructed from baselines. If both land, a diff *view* could someday link out to a field's history, but there is no data coupling in v1 and neither blocks the other.

## Decision: how to store a baseline

Three options were weighed against **diff-ability, storage, and the server future** (a baseline must survive being handed to another person or ingested by the future server — so it must travel *inside* the one `.reqarch` document and reference authors by `uuid`, never by per-file integer PK).

| Option | Diff-ability | Storage | Server future | Verdict |
|---|---|---|---|---|
| **(a) Sibling snapshot file** (`copy the .reqarch`) | Poor — needs a *second* open DB handle; `connection.ts` holds exactly one `_db` and `openDatabase` closes the previous | Full DB copy per baseline (WAL, indexes, all) | **Bad** — a separate artifact that does *not* travel with the document on handover/ingest | ✗ |
| **(b) JSON snapshot in a `baselines` table in the same DB** | **Best** — freeze is one serialize; diff is a pure function over two JSON structures, no second connection | Text of the content only, modest | **Best** — lives inside the one file; travels on handover; authors stored by `uuid` | **✓ chosen** |
| **(c) Per-table snapshot rows keyed by `baseline_id`** | SQL-queryable, but we never need to *query inside* a baseline | Normalized rows | OK | ✗ over-built — either mirror every project table (a schema burden that grows with every new column) or a generic `(baseline_id, table, row_json)` EAV, which is just (b) with more joins |

**Chosen: (b) — a single `baselines` table, one `TEXT` column holding the serialized project as JSON.**

Justification (the lazy ladder):
- **One table, one migration, no per-table mirror to maintain.** Option (c) re-pays its cost every time a project table gains a column; (b) serializes whatever `loadProject`-style reads return, so new fields ride along for free.
- **Freeze = one serialize** reusing the existing `listRequirementsByProject(projectId)` read (§Freeze). No new read plumbing.
- **Diff = a pure function** (`diffSnapshots`) over two in-memory arrays — trivially unit-testable, no DB, no second connection (which is the wall option (a) hits).
- **Travels inside the document** — the whole point of the server end goal. A sibling file (a) is orphaned the moment the `.reqarch` is copied or ingested.

**Trade (named, with the upgrade path):** the snapshot blob is opaque to SQL — you cannot `SELECT` a requirement *inside* a baseline. We never need to; the only read of a snapshot is "load it whole and diff it." And the whole project is re-serialized per baseline. Baselines are infrequent, deliberate, whole-project events, so that is fine.
`// ponytail: snapshot stored as plain-TEXT JSON; if blobs get large, store gzipped as BLOB — one-line change at the serialize/parse boundary, diff is unaffected.`

## Identity: `uuid` in the blob, integer FK on the live row

The schema already splits per-file `users.id` from portable `users.uuid` (see the comment on the `users` table in `migrations.ts`). The baseline honours that split exactly:

- **`baselines.created_by`** — `INTEGER REFERENCES users(id)`, nullable, stamped by `currentUserRowId(db)` in main. Identical convention to `requirements.created_by`. It is a live-file row; the in-file integer is the right key here.
- **Inside the snapshot blob** — each frozen requirement's `createdBy` / `updatedBy` is resolved **integer → `uuid`** at freeze time (a join to `users`). The frozen content therefore references people the way a server will, and survives ingest into a file whose roster mints different integer ids.

The renderer never supplies attribution — main stamps it, same rule as every other write.

## Schema (`src/main/db/migrations.ts`)

Add to the `CREATE TABLE IF NOT EXISTS` block:

```sql
CREATE TABLE IF NOT EXISTS baselines (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id),
  label       TEXT    NOT NULL,
  description TEXT,
  snapshot    TEXT    NOT NULL,               -- JSON, see §Snapshot shape
  created_by  INTEGER REFERENCES users(id),   -- nullable; stamped via currentUserRowId
  created_at  TEXT    NOT NULL
);
```

- **No `updated_at`** — a baseline is immutable by definition. A freeze you can edit is not a freeze.
- **No `deleted_at` — delete is a hard `DELETE`.** Baselines are few and user-explicit, and there is no restore-baselines surface planned. `// ponytail: hard delete, no soft-delete/restore. Add deleted_at only if a "deleted baselines" view is ever asked for.` (Open question 4 confirms this with the user.)
- No backfill, no `CHECK` — same additive-migration convention as every prior feature.

## Snapshot shape (`src/types/index.ts`)

v1 is **requirements-only** (architecture deferred — Open question 1). The blob:

```jsonc
{
  "version": 1,
  "takenAt": "2026-07-21T12:00:00.000Z",
  "requirements": [
    {
      "reqId": "SRS-0001",          // the STABLE diff key — text, not the integer id
      "moduleName": "SRS",          // display context (integer module_id is not portable)
      "text": "The system shall …",
      "status": "Approved",
      "priority": "High",
      "reqType": "Functional",
      "source": null,
      "rationale": null,
      "createdByUuid": "…",         // resolved from users.uuid at freeze
      "updatedByUuid": "…"
    }
  ]
}
```

The `version` field lets a future shape change (e.g. adding architecture) be read back compatibly. Types:

```ts
export interface Baseline {            // the LIST row — never carries the blob
  id: number
  projectId: number
  label: string
  description: string | null
  createdBy: number | null
  createdAt: string
}
export interface CreateBaselineInput {
  projectId: number
  label: string
  description?: string
}
export interface BaselineReqSnapshot {
  reqId: string; moduleName: string; text: string
  status: RequirementStatus; priority: RequirementPriority; reqType: RequirementType
  source: string | null; rationale: string | null
  createdByUuid: string | null; updatedByUuid: string | null
}
export interface BaselineFieldChange { field: string; before: string | null; after: string | null }
export interface BaselineReqModified { reqId: string; changes: BaselineFieldChange[] }
export interface BaselineDiff {
  added: BaselineReqSnapshot[]      // in current, not in the baseline
  removed: BaselineReqSnapshot[]    // in the baseline, not in current
  modified: BaselineReqModified[]   // in both, ≥1 compared field differs
}
```

## Freeze (`createBaseline`)

Pure serialize, reusing an existing read:

1. `serializeProject(projectId)` → build the snapshot:
   - `listRequirementsByProject(projectId)` (already exists in `requirements.ts`) for the rows.
   - one join to `users` to map each `created_by` / `updated_by` integer → `uuid`, and `module_id` → `moduleName`.
2. `INSERT INTO baselines (…)` with `snapshot = JSON.stringify(...)`, `created_by = currentUserRowId(db)`, `created_at = now()`.
3. Return the `Baseline` metadata row (not the blob).

`serializeProject` is exported and unit-tested on its own.

## Diff (`diffBaseline` → pure `diffSnapshots`)

Computed **in main** (it owns the DB): read the current project via the same `serializeProject(projectId)`, `JSON.parse` the stored snapshot, hand both to a **pure function**:

```ts
// pure, no DB — the unit-tested core
export function diffSnapshots(current: BaselineReqSnapshot[], baseline: BaselineReqSnapshot[]): BaselineDiff
```

- Key both sides by `reqId` (the stable text id, **never** the integer PK — the integer diverges as the live file evolves, `reqId` does not).
- `added` = reqIds in `current` ∖ `baseline`; `removed` = reqIds in `baseline` ∖ `current`.
- `modified` = reqIds in both where any **compared field** differs, returning per-field `{ field, before, after }`.
- Compared fields (cheap — all scalar, on the row): `text`, `status`, `priority`, `reqType`, `source`, `rationale`. (Acceptance criteria + custom fields are child tables — deferred, Open question 5.)

Because both inputs are plain arrays, the diff has zero DB or store dependency and pins its whole contract in unit tests.

## IPC channels

| Channel | Signature | Returns |
|---|---|---|
| `baselines:create` | `(input: CreateBaselineInput)` | `Promise<Baseline>` — metadata only |
| `baselines:list` | `(projectId: number)` | `Promise<Baseline[]>` — metadata only, newest first, **no blob** |
| `baselines:diff` | `(baselineId: number)` | `Promise<BaselineDiff>` |
| `baselines:delete` | `(id: number)` | `Promise<void>` — hard delete |

`list` deliberately omits the `snapshot` column from its `SELECT` so the list payload stays small no matter how many baselines exist; the blob is read only by `diff`.

## Files that change

| File | Change |
|---|---|
| `src/main/db/migrations.ts` | `baselines` table in the CREATE block |
| `src/main/handlers/baselines.ts` **(new)** | `serializeProject`, `createBaseline`, `listBaselines`, `diffBaseline`, `deleteBaseline`, pure `diffSnapshots`, `registerBaselineHandlers` |
| `src/main/index.ts` | call `registerBaselineHandlers()` alongside the others |
| `src/preload/index.ts` | `baselines` bridge (4 `ipcRenderer.invoke`s) |
| `src/types/api.d.ts` | `baselines` block on `Window['api']` |
| `src/types/index.ts` | `Baseline`, `CreateBaselineInput`, `BaselineReqSnapshot`, `BaselineDiff` + change types |
| `src/renderer/src/store/index.ts` | baselines slice (below) |
| `src/renderer/src/components/Dashboard/index.tsx` | Baselines card + diff view (below) |

**Store slice** — all mutations through the existing `run()` / `lastError` convention:
- state: `baselines: Baseline[]`, `baselineDiff: BaselineDiff | null`
- `loadBaselines()` → `set({ baselines: await window.api.baselines.list(project.id) })`
- `createBaseline(label, description?)` → `run(async () => { await window.api.baselines.create({ projectId, label, description }); set({ baselines: await window.api.baselines.list(project.id) }) })`
- `removeBaseline(id)` → `run(...)` then re-list
- `loadBaselineDiff(id)` / `clearBaselineDiff()` → `set({ baselineDiff })`

### UI entry point: a **Dashboard card** (not a new tab, not the Settings modal)

- **Not the Settings modal** — Settings holds app/render *preferences* + per-project type colours; baselines are project *data*, and a modal is too cramped for a diff table.
- **Not a new top-level tab** — baselines are an *occasional* action (a review gate, not daily). A permanent nav slot over-weights the header for it.
- **Dashboard card ✓** — the Dashboard is already a tab and already the **project-overview** surface aggregating project-level state, which is exactly where "the project's baselines" belong. Reuse it: a **Baselines** card listing past baselines (label · date · author) with a **New baseline** action, and a **Diff against current** control per row that renders the `BaselineDiff` (added / removed / modified counts + an expandable per-field list) in the app's existing modal wrapper (the same one Settings uses) or an inline expanded panel.

Fewest moving parts, no new nav, reuses a surface whose purpose baselines fit. `// ponytail: if baselines grow (compare two baselines, restore-to-baseline), promote to its own tab then — not before.`

## Testing

Main-process vitest is **green** (the item-23 sqlite ABI issue is fixed; handler tests run against a real SQLite via the `better-sqlite3` ↔ `better-sqlite3-node` alias). Tests use the established `mkdtempSync` + `openDatabase` temp-DB pattern (see `requirements.test.ts`).

- **`diffSnapshots` (pure, no DB)** — `baselines.test.ts`: added-only, removed-only, per-field modified (asserts `{ field, before, after }`), identical inputs → all-empty diff, keyed by `reqId` not integer id.
- **`serializeProject` / `createBaseline`** — temp DB: create project + module + reqs, freeze, assert the row exists and the parsed `snapshot` contains the reqs. **Identity:** frozen `createdByUuid` is a `uuid` string, not the integer id.
- **Freeze is a stable copy (the key correctness test)** — create a baseline; then **add, edit, and delete** requirements in the live DB; re-read the stored `snapshot` and assert it is **byte-identical** to what was frozen (later edits do not mutate the snapshot). Then `diffBaseline` reflects exactly those edits (one added, one removed, one modified) while the snapshot still shows pre-edit values.
- **`baselines:list` omits the blob** — assert the returned rows have no `snapshot` field (payload hygiene).

## Scope / YAGNI (smallest v1, and what to defer)

**In v1:** freeze with a label + optional description; list; diff current-vs-baseline over requirement scalar fields (add/remove/modify); hard delete. Requirements-only.

**Deferred (each is additive, none blocks v1):**
- Architecture in the snapshot/diff (elements, connections, links) — bigger diff surface; `version` field leaves room.
- Acceptance criteria + custom fields in the diff.
- Restore / revert the project to a baseline (destructive; needs conflict handling).
- Export a baseline to a file (the blob is already JSON — near-free later).
- Baseline-to-baseline diff; soft-delete + a deleted-baselines view.

## Open questions for the user

1. **Scope of v1 snapshot:** requirements-only *(recommended)* vs requirements + architecture (elements/connections/links)? Architecture is a much larger diff surface; I'd ship requirements first.
2. **Restore/revert:** view + diff only *(recommended)* vs the ability to reset the project to a baseline? Restore is destructive and needs conflict handling — I'd defer it.
3. **Export:** should a baseline be exportable to a standalone JSON/file for audit or sharing outside the app? Cheap to add later since the blob is already JSON.
4. **Delete semantics:** hard delete *(recommended, simpler)* vs soft-delete with a restore surface? Every other entity soft-deletes, but baselines have no restore UI planned.
5. **Diff depth:** requirement scalar fields only in v1 *(recommended)* vs also diffing acceptance criteria and custom fields?
