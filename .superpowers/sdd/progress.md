# SDD Progress Ledger — Requirements List Improvements

Plan: docs/superpowers/plans/2026-07-01-requirements-list-improvements.md
Base commit: 37b7bf7

## Tasks
- [x] Task 1: complete (commits 37b7bf7..723ce8e, review clean)
- [x] Task 2: complete (commits 723ce8e..3a93a34, review clean)
- [x] Task 3: complete (commits 3a93a34..7aa49dc, review clean)
- [x] Task 4: complete (commits 7aa49dc..8d0fab8, review clean — minor: deletedRequirements not cleared on setShowDeleted(false), not a defect)
- [x] Task 5: complete (commits 8d0fab8..9209971, review clean — minor: onClick could use undefined instead of short-circuit, aria-label missing on × button, trailing space in class join)
- [x] Task 6: complete (commits 9209971..09ba54c, review needed fix — spurious auto-focus on req switch; fixed by resetting prevCustomFieldCount.current=0 in [req?.id] effect)
- [x] Task 7: complete (commits 4998731..edaeda0) — typecheck clean, built, smoke-tested in running app via Playwright driver. Verified: table layout + headers, delete ×, show-deleted toggle, restore, custom fields add/edit/persist/remove. Found+fixed: Task 6 focus "fix" was inverted (reset-to-0 caused focus steal on every requirement switch when fields loaded) → replaced count check with explicit focusNewField intent flag (4998731). Also fixed pre-existing tsc errors: type import paths off by one ../ (b6738b8).

## PLAN COMPLETE

# SDD Progress Ledger — UI Overhaul (Industrial Precision)

Plan: docs/superpowers/plans/2026-07-02-ui-overhaul.md
Base commit: 5886086

## Tasks
- [x] Task 1: complete (commits 5886086..1710037, review clean)
- [x] Task 2: complete (commits 1710037..5a6f6c1, review: Important finding 'Panel missing border width' adjudicated by controller — per-side border classes are supplied at usage sites per Task 3 plan code; minor: focus:ring-action/60 opacity drift noted)
- [x] Task 3: complete (commits 5a6f6c1..3d302ff, review approved; Important finding fixed in 3d302ff: App.test.tsx baseStore mock now includes customFields — 4 pre-existing failures recovered, file 5/5)
- [x] Task 4: complete (commits 3d302ff..15e89c2, review clean; minor: rename input intentionally native, could adopt Input primitive later)
- [x] Task 5: complete (commits 15e89c2..d73e913, review clean; ⚠️ opacity-modifier-on-token risk resolved by controller — tokens are plain hex, Tailwind v3 supports modifiers natively; minor: no tests for new toolbar behaviors — show-deleted toggle, item count, Restore visibility)
- [x] Task 9: complete (commits f2a2894..7706d84 — docs-only diff, reviewed directly by controller; typechecks clean, vitest 45 failed/40 passed vs 52-failed baseline [7 recovered], 3-target build clean, all 5 visual + all interaction checks pass in running app)
- [x] Final whole-branch review (5886086..7706d84): ready to merge with fixes; fixes applied in 5b8aaaa (text-gray-500→text-ink-muted in both panels, !text-xs on Delete buttons, handoff PATH note) — tests 10/10, typecheck clean. Deferred (reviewer triage): ring-action/60 ratified — update design-system.md; native rename input; toolbar-behavior tests (inherited debt); vi.clearAllMocks() in RequirementDetail test next time file is touched; spec§4 narrowings to record in backlog (Controls restyle, Component Library panel, node-name size)

## PLAN COMPLETE — all 9 tasks + final review; final commit 5b8aaaa
- [x] Task 8: complete (commits 7947812..f2a2894, review clean; tests 10/10 before and after; minor: pre-existing text-gray-500 on req text span in both panels — outside brief scope, follow-up candidate)
- [x] Task 7: complete (commits 1eb7972..7947812, review clean — no findings; canvas tests 3/4, 1 pre-existing baseline failure; test-mock addition of BackgroundVariant additive/non-weakening)
- [x] Task 6: complete (commits f8214f2..1eb7972, review approved; implementer's test-mock addition caused vitest worker OOM — fresh object per useStore() call looped useEffect[customFields]; fixed in 1eb7972 by hoisting stable storeState, RequirementDetail tests now 3/3 [were failing at baseline]; ⚠️ Input forwardRef resolved by controller — ui/index.tsx:29; minor: beforeEach only clears mockUpdateRequirement, new custom-field vi.fn()s never cleared between tests)

# SDD Progress Ledger — Requirement Metadata & Filtering

Plan: docs/superpowers/plans/2026-07-03-requirement-metadata.md
Base commit: 546f4d7 (plan doc); code base 546f4d7

## Tasks
- [x] Task 1: complete (commits 546f4d7..fbe7ffa, review clean; implementer also added the 3 fields to Requirement row-mapping in connectionLinks.ts + elementLinks.ts — verified complete ripple; minor noted: two coalescing idioms coexist in updateRequirement, intentional)
- [x] Task 2: complete (commits fbe7ffa..703fa8c, review clean; store tests 11/11)
- [x] Task 3: complete (commits 703fa8c..5064944, review clean; ui tests 7/7; minor: only 3/7 chip values test-asserted — per brief, coverage gap inherited from plan)
- [x] Task 4: complete (commits 5064944..2bff8e0; review found Important: chip test non-diagnostic vs filter options — fixed in 2bff8e0 with within(row) scoping, re-review clean; noted: RED-phase evidence omitted the 3 folded-in toolbar tests, documentation gap only; tests 10/10)
- [x] Task 5: complete (commits 2bff8e0..b8e7093, review clean; 6/6 tests; block-body beforeEach deviation verified as genuine TS necessity; minor: no change-test for Type select — inherited from plan)
- [x] Task 6: complete (verification: suite 48 failed/55 passed — all ABI baseline + 1 pre-existing ArchitectureCanvas; build 3-target clean; all 6 running-app checks pass incl. legacy-DB migration defaults, persistence across relaunch, filter reset)
- [x] Final whole-branch review (546f4d7..b8e7093, opus): READY TO MERGE — no Critical/Important; optional comments applied in a6eb0c8 (coalescing rationale in updateRequirement, CHIP_STYLES no-overlap invariant); all 4 carried-forward minors triaged DEFER

## PLAN COMPLETE — 6 tasks + final review; final commit a6eb0c8

# SDD Progress Ledger — Row Checkboxes & Bulk Actions

Plan: docs/superpowers/plans/2026-07-04-bulk-actions.md
Base commit: 96da68a (plan commit)

## Tasks
- [x] Task 1: complete (commits 96da68a..51f3676, review clean — spec compliant, approved; controller resolved ⚠️ removeRequirements/removeRequirement parity by direct inspection [both filter local array + clear selection]; minor noted: updateRequirements early-returns before clearing checkedIds when selectedModuleId falsy — mirrors plan code, latent edge case only)
- [x] Task 2: complete (commits 51f3676..ad64697, review clean — spec compliant, approved; 18/18 tests, grid math 10/10/10 verified, tokens verified against tailwind.config.js; minors for final-review triage: [a] stale checkedIds when a CHECKED row is deleted via the single-row × [removeRequirement doesn't prune checkedIds → wrong count, bulk op could hit soft-deleted row — not plan-mandated, cross-task gap], [b] bulk-action promises fired unawaited without .catch — inherited codebase convention; ⚠️ full-renderer-suite evidence deferred to Task 3 Step 1 by design)
- [x] Task 3: complete (verification only, no app-source changes: suite 48 failed/68 passed — identical failure composition to baseline [47 sqlite-ABI + 1 pre-existing ArchitectureCanvas], +13 passed matches new renderer tests; typecheck clean both configs; 3-target build clean; 6/6 running-app checks pass — checkboxes/select-all present and absent-in-deleted-view, single-check bulk bar, select-all count match, bulk status update clears selection, delete→show-deleted→restore round-trip preserves other fields, filter-change clears checked set. See .superpowers/sdd/task-3-report.md)
- [x] Final whole-branch review (96da68a..ad64697, opus): READY TO MERGE WITH FIXES — no Critical/Important; carried-forward minor triage: #1 updateRequirements early-return DEFER (unreachable from UI — bulk bar only renders with a module selected), #2 stale checkedIds on single-row × FIX BEFORE MERGE → fixed in cec91c7 (one-line prune in removeRequirement + TDD test, 17/17, typecheck clean), #3 unawaited bulk promises DEFER (matches codebase convention; belongs to a codebase-wide error-surfacing pass, ticketed as follow-up). Reviewer minors noted, no fix required: component tests verify wiring not reducer semantics (store tests cover those); allChecked tolerates a checkedIds superset — safe only while every scope change clears checkedIds

## PLAN COMPLETE — 3 tasks + final review; final commit cec91c7 (083febd is unrelated driver tooling)
