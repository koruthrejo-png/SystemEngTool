# Design: Requirement Quality Linter (backlog item 37)

**Date:** 2026-07-28
**Status:** Draft — awaiting review
**Backlog:** item 37 (medium), §6 in `2026-07-02-ui-overhaul-design.md`

## Purpose

Flag low-quality requirement statements with cheap, deterministic heuristics — weak/ambiguous language, missing acceptance criteria, run-on ("compound") requirements, no verification method. High perceived intelligence for near-zero cost: no NLP, no LLM, no network. Helps the author tighten a requirement while writing it.

## Non-goals (v1)

- No auto-fix / rewrite suggestions (just flag + explain).
- No project-wide quality score card on the Dashboard (deferred — see Deferrals).
- No per-project rule configuration / custom rule editor (deferred).
- No blocking: lint never prevents save. Purely advisory.

## Architecture

A **pure, dependency-free module** — no DB, no IPC, no store. Lint is derived live from the already-loaded `Requirement` (and its custom fields where relevant), recomputed on render. This mirrors the `attention.ts` / `stats.ts` pure-helper pattern.

**File:** `src/renderer/src/components/RequirementsList/lint.ts`

```ts
export type LintSeverity = 'warning' | 'info'

export interface LintRule {
  id: string                                   // stable key, e.g. 'weak-word'
  severity: LintSeverity
  message: (m: RegExpMatchArray | null) => string  // human-readable, may cite the offending token
  test: (r: Requirement) => RegExpMatchArray | boolean | null
}

export interface LintFinding {
  ruleId: string
  severity: LintSeverity
  message: string
}

export const LINT_RULES: readonly LintRule[]
export function lintRequirement(r: Requirement): LintFinding[]
export function lintCount(r: Requirement): { warnings: number; infos: number }
```

`lintRequirement` runs every rule in order, returns the findings that fire. Pure and total: same input → same output, never throws.

## Rules (v1)

| id | severity | fires when | message |
|----|----------|-----------|---------|
| `no-shall` | warning | text has no imperative keyword (`shall`, `must`, `will`) | "No requirement keyword — use 'shall'." |
| `weak-word` | warning | text matches a weak-word list | "Weak/ambiguous word: '<word>'." |
| `compound` | info | text contains ` and ` / ` or ` joining clauses that each look like a requirement (heuristic: keyword appears twice, or ` and ` after a keyword) | "Possible compound requirement — consider splitting." |
| `no-ac` | warning | `acceptanceCriteria` empty/blank | "No acceptance criteria." |
| `no-verification-method` | info | `verificationMethod` empty (depends on item 39; rule is inert until that field ships) | "No verification method assigned." |
| `vague-quantifier` | info | matches unmeasurable terms (`fast`, `quickly`, `efficient`, `user-friendly`, `robust`, `minimal`, `as needed`, `etc.`, `TBD`) | "Unmeasurable term: '<word>'." |
| `too-short` | info | text shorter than 15 chars (excluding whitespace) | "Requirement text looks too short to be testable." |

**Weak-word list** (`weak-word`): `should`, `may`, `might`, `could`, `would`, `can`, `possibly`, `optionally`, `if possible`, `where appropriate`. These undermine testability (a "should" isn't a commitment).

Word rules are **whole-word, case-insensitive** regexes (`\bshould\b`), so "shoulder" doesn't trip `should`. The rule list is data — adding a rule is one array entry + one test case. Rules that reference an unbuilt field (`no-verification-method`) guard on the field being present, so they're inert no-ops until item 39 lands (no coupling, no failure).

## UI

Two surfaces, both read-only:

1. **Drawer "Quality" section** (`RequirementDetail`) — a collapsed section after History. Lists each finding as a row: a severity glyph (⚠ warning / ⓘ info, token-colored — amber / ink-muted) + the message. Empty state: "No quality issues." So the author sees exactly what to fix on the requirement they're editing.

2. **Table row indicator** — a small warning dot in the requirements table row when the requirement has ≥1 **warning** (infos don't dot, to avoid noise). Title/tooltip = warning count. Placed in a narrow cell (reuse the existing row-actions area or a dedicated 16px column). Click behavior: none (it's an indicator; the drawer shows detail).

No new columns are toggleable in v1; the dot is always-on. `lintRequirement` runs per visible row — O(rules) per row, trivial.

## Data flow

`Requirement` (+ custom fields already in store) → `lintRequirement(r)` (pure) → findings → rendered. No round-trip, no persistence, no store slice. Recomputed on every render of the drawer / row; cheap enough not to memoize in v1 (note if profiling ever disagrees).

## Testing

Pure `lint.test.ts`:
- Each rule: one requirement that fires it + one that doesn't (whole-word boundary case for word rules — "shoulder" must NOT trip `should`).
- `compound` heuristic: "The system shall X and shall Y" fires; "The system shall log X and Y" (single clause) does not.
- `no-verification-method` inert when the field is absent/undefined (item-39 guard).
- `lintCount` tallies warnings vs infos correctly.
- Empty/blank text and blank AC handled without throwing.

Renderer: drawer Quality section renders findings + empty state; table dot appears only with ≥1 warning.

## Deferrals

- Dashboard project-wide quality summary card (counts by rule, worst offenders — navigates to req).
- Per-project custom rules / toggle individual rules / severity overrides.
- Auto-fix suggestions.
- "and"/"or" compound detection is a heuristic — will have false positives on legitimate conjunctions; kept `info` severity for that reason.
