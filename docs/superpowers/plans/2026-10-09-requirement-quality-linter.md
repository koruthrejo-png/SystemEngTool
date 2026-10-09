# Plan: Requirement Quality Linter (backlog item 37)

**Date:** 2026-10-09
**Spec:** `docs/superpowers/specs/2026-07-28-requirement-quality-linter-design.md`
**Base:** `main` @ `2785eb6`

## Deltas from the spec (deliberate, decided at plan time)

1. **`no-verification-method` is a live rule, not an inert one.** The spec guarded it on item 39
   being unbuilt; item 39 shipped 2026-07-28 and `Requirement.verificationMethod:
   VerificationMethod | null` exists (`src/types/index.ts:63`). Plain null check, no guard.
2. **Rule shape collapses to one function.** Spec had `test: (r) => RegExpMatchArray | boolean |
   null` plus `message: (m) => string`, plumbing a match object between two fields. One field does
   it: `check: (r) => string | null` returns the message or `null`. Same behaviour, half the types.
3. **`compound` fires on keyword-count >= 2 only.** The spec's prose offered two triggers
   ("keyword appears twice, **or** ` and ` after a keyword") but its own mandated test says
   `"The system shall log X and Y"` must NOT fire — and that sentence has ` and ` after a keyword.
   The two halves contradict; keyword-count >= 2 satisfies both mandated cases, the other does not.
4. **Table dot lives inside the existing `reqId` cell**, not a new grid column (user decision).
   `gridStyle` is derived from `visibleColumns` and consumed in 3 places, and a new column would
   also force a `COLUMNS_STORAGE_KEY` bump to v4 because `DEFAULT_KEYS` rejects stale layouts.
   **Accepted caveat:** the dot is hidden along with the ID column. `ponytail:` comment records it.

## Task 1 — pure lint module  (no dependencies)

**Files:** `src/renderer/src/components/RequirementsList/lint.ts` (new),
`src/renderer/src/components/RequirementsList/lint.test.ts` (new)

Pure, dependency-free, total (never throws). Mirrors `attention.ts` / `filter.ts`.

```ts
export type LintSeverity = 'warning' | 'info'
export interface LintRule { id: string; severity: LintSeverity; check: (r: Requirement) => string | null }
export interface LintFinding { ruleId: string; severity: LintSeverity; message: string }
export const LINT_RULES: readonly LintRule[]
export function lintRequirement(r: Requirement): LintFinding[]
export function lintCount(r: Requirement): { warnings: number; infos: number }
```

| id | severity | fires when | message |
|----|----------|-----------|---------|
| `no-shall` | warning | `text` lacks `/\b(shall\|must\|will)\b/i` | `No requirement keyword — use 'shall'.` |
| `weak-word` | warning | matches `should\|may\|might\|could\|would\|can\|possibly\|optionally\|if possible\|where appropriate` | `Weak/ambiguous word: '<match>'.` |
| `compound` | info | `/\b(shall\|must\|will)\b/gi` matches >= 2 times | `Possible compound requirement — consider splitting.` |
| `no-ac` | warning | `!r.acceptanceCriteria?.trim()` | `No acceptance criteria.` |
| `no-verification-method` | info | `r.verificationMethod == null` | `No verification method assigned.` |
| `vague-quantifier` | info | matches `fast\|quickly\|efficient\|user-friendly\|robust\|minimal\|TBD\|as needed\|etc\.?` | `Unmeasurable term: '<match>'.` |
| `too-short` | info | `text` with whitespace stripped is < 15 chars | `Requirement text looks too short to be testable.` |

Word rules are whole-word, case-insensitive (`\b…\b`) so `"shoulder"` must not trip `should`.
`LINT_RULES` is data — a new rule is one array entry plus one test case.

**How we know it worked:** `lint.test.ts` — each rule gets a fires case and a does-not-fire case;
the `shoulder` boundary case; both mandated `compound` cases (`"The system shall X and shall Y"`
fires, `"The system shall log X and Y"` does not); blank `text` and blank AC do not throw;
`lintCount` tallies warnings vs infos.

## Task 2 — drawer Quality section  (depends on Task 1)

**Files:** `src/renderer/src/components/RequirementDetail/index.tsx`,
`src/renderer/src/components/RequirementDetail/quality.test.tsx` (new)

A `QualitySection` collapsible copying `HistorySection`'s idiom verbatim (`index.tsx:231` —
`SectionLabel` + `<button>` toggle + `▾`/`▸`), mounted after `<HistorySection req={req} />` at
`index.tsx:219`. Each finding is one row: `⚠` amber for warning, `ⓘ` ink-muted for info, then the
message. Empty state: `No quality issues.` Read-only; lint never blocks a save.

**How we know it worked:** `quality.test.tsx` — expand the section on a requirement with known
findings and assert the messages render; assert the empty state on a clean requirement.

## Task 3 — table warning dot  (depends on Task 1)

**Files:** `src/renderer/src/components/RequirementsList/index.tsx`,
`src/renderer/src/components/RequirementsList/index.test.tsx`

In `cell('reqId')` (`index.tsx:249`), wrap the existing `<span>` in a flex row and prepend the dot
when `lintCount(req).warnings > 0`. Infos never dot (noise). `title` = the warning count, e.g.
`2 quality warnings`. No click behaviour — it is an indicator; the drawer carries detail.
Carries the `ponytail:` comment for the hidden-ID-column caveat.

**How we know it worked:** added cases in `index.test.tsx` — a requirement with >= 1 warning
renders the dot, a clean one does not, an info-only requirement does not.

## Waves

- **Wave 1:** Task 1 — 1 agent. Wave 2 codes against its exported API, so it lands first.
- **Wave 2:** Task 2 + Task 3 — 2 agents in parallel, disjoint files.

## Gate

`npm run typecheck` (both projects), `npx electron-vite build`, full `vitest` suite.
Baseline to beat: **556 passed / 1 failed** — the 1 is the pre-existing `App.test.tsx` "open"
button test, which fails on base and is unrelated. Any other failure is a real failure.

## Out of scope (spec's own deferrals, unchanged)

Dashboard project-wide quality card · per-project custom rules / rule toggles / severity
overrides · auto-fix suggestions · memoizing `lintRequirement` (O(7) per row; note it if
profiling ever disagrees).
