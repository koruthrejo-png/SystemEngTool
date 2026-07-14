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

# SDD Progress Ledger — Canvas Resize, Nesting & 4-Side Handles

Plan: docs/superpowers/plans/2026-07-04-canvas-resize-nesting-handles.md
Base commit: 8cef5b3 (plan commit). Note: 6f5f8f0 (conditional detail panel + h-scroll + resizable columns) was a controller-implemented hotfix outside SDD, committed just before this plan.

## Tasks
- [x] Task 1: complete (commits 8cef5b3..cdaa44c, review clean — spec compliant, approved; INSERT 10/10 column-value alignment and reparent SQL verified line-by-line; controller amended the required mockConn ripple [sourceHandle/targetHandle: null] into the commit, 17/17 store tests + both typechecks; minors: `parent` var in deleteElement actually holds the deleted element's own row — plan-verbatim naming, rename if touched again; ConnectionPanel/index.test.tsx untyped connection fixture will need the same handle-fields ripple when a later task consumes sourceHandle/targetHandle there)
- [x] Task 2: complete (commits cdaa44c..4939dae, review clean — spec compliant, approved; geometry hand-verified incl. multi-level chains, orphan guard, smallest-area tiebreak, descendant exclusion; both named risks checked [CanvasInner preserves every handler/prop; getInternalNode/positionAbsolute matches installed v12 types]; nodes tests 8/8, canvas dir at baseline, typecheck clean; minors: absolutePosition has no cycle guard unlike buildNodes — plan-verbatim, data-corruption-only path; resolveDrop/descendantIds coverage only 1-2 levels deep)
- [x] Task 3: complete (commits 4939dae..af2126b, review clean — spec compliant, approved; onResizeEnd signature verified against installed @xyflow/system .d.ts; onConnect raw-nullable vs edge-mapping-defaults distinction correct; minors: BlockNode tests are mock-capture by brief design — real interaction is Task 4's backstop; memo'd BlockNode with fresh data closures checked, no spurious-render issue)
- [x] Task 4: complete (verification only, no app-source changes: suite 48 failed/85 passed — identical failure composition to baseline [47 sqlite-ABI + 1 pre-existing ArchitectureCanvas]; both typechecks clean; 3-target build clean; 6/6 running-app checks pass via real Playwright mouse drags — 4 handles/node, resize drag persists across relaunch, drag-to-nest sets parentId+relative pos and dragging the parent carries the child, drag-out un-nests, top→bottom connection persists sourceHandle/targetHandle across relaunch, deleting a nested parent leaves the child at its visual spot with parentId null, pre-existing null/null-handle connections still render right→left. See .superpowers/sdd/task-4-report.md)

- [x] Final whole-branch review (8cef5b3..4a20f20, opus): WITH FIXES — Critical: removeElement filtered locally while deleteElement reparents children in DB → stale in-memory children rendered as roots at relative offsets until reload (Task 4's check 5 read the DB, not the live render — that's why it passed); fixed in e45f819 (removeElement re-syncs elements+connections from DB; also cures pre-existing dangling-edge staleness; store test added). Important: top/left resize handles lost the position delta (only w/h persisted) → block snapped back to old anchor; fixed in d021616 (onResizeEnd now threads x,y through BlockNode→buildNodes→updateElement; both covering tests updated). Fix verified live in-session: delete nested parent → child transform unchanged at (320,320), parent gone. Carried-forward minors 1-5 all triaged DEFER (parent var name; ConnectionPanel fixture ripple-when-consumed; absolutePosition cycle guard — corruption-only; 3-level nesting test; mock-capture BlockNode tests). Reviewer minors deferred: resolveDrop strict < tiebreak nondeterministic on exact-area tie; effect deps omit stable updateElement/getInternalNode refs.

## PLAN COMPLETE — 4 tasks + final review; final commit d021616

# Plan: 2026-07-05 Headings, Traceability Matrix & Dashboard (docs/superpowers/plans/2026-07-05-headings-traceability-dashboard.md)
Base commit: 2f6be32. Tasks: 1 headings backend, 2 outline helper, 3 store+list UI, 4 detail section select, 5 traceability tab, 6 dashboard tab.
- [x] Task 1: complete (commits 7d2877f + fix 9d1b772, review clean after depth-guard fix). Minors deferred to final review: createHeading no friendly moduleId-not-found error (FK error surfaces raw); deleteHeading leaves position gaps (harmless, ORDER BY still correct); moveHeading treats any non-'up' direction as 'down' instead of throwing. Note: implementer also fixed pre-existing TS6307 in tsconfig.node.json (src/types include) — reviewer verified pre-existing.
- [x] Task 2: complete (commit f16a919, review clean, no fixes). Minors deferred: 3rd-level malformed heading would vanish silently from outline (upstream guard 9d1b772 makes this corruption-only); O(headings×reqs) linear scan fine at expected sizes.
- [x] Task 3: complete (commit be2c65c, review clean, no fixes). Two implementer deviations validated by reviewer (compareDocumentPosition test rewrite — brief's textContent assertion unwinnable in jsdom; headings.list stub in store test mock). Minor deferred: select-all checkbox selects requirements hidden under collapsed sections (pre-existing pattern, backlog note).
- [x] Task 4: complete (commit 3cf69f8, review clean, no fixes, no minors).
- [x] Task 5: complete (commit 2d06fb9, review clean, approved, no Critical/Important). Minors deferred: no store-level test for loadTraceability/toggleTraceLink (component test covers via mock, brief only mandated component test); toggleTraceLink full refetch per toggle — brief-verbatim, fine at expected volume. Reviewer ⚠️ for controller: Task 6 must replace App.tsx body ternary's bare else (currently traceability-else-architecture) so activeTab==='dashboard' doesn't fall through to architecture panel — carried into Task 6 dispatch.
- [x] Task 6: complete (commit a004223, review clean, approved, no Critical/Important; carried-forward Task 5 ⚠️ verified satisfied — dashboard branch before terminal architecture else at App.tsx:124-128). Minors noted, no fix: App.test.tsx uses its local mockUseStore pattern vs brief snippet (follows file convention, matches Task 5 precedent); same requirement can appear in both Unallocated and Recently-updated cards (no exclusivity in spec) — check UX during live verification.
- [x] Final whole-branch review (2f6be32..a004223, opus): READY TO MERGE — no Critical/Important; all 9 carried-forward minors triaged DEFER (details in review output; notable: depth guard 9d1b772 praised as root-cause fix; migration backward-compatible via IF NOT EXISTS + addColumnIfMissing; soft-delete join correct). New reviewer minors, optional polish only: zebra stripe index counts heading rows (RequirementsList ~181), non-unique "Heading title" aria-label, TraceabilityMatrix getByText('2') brittle. Remaining: post-plan live verification (controller).
- [x] Post-plan live verification (controller, rebuilt app + Playwright driver): ALL PASS — headings: create top+sub via + Heading / Add subheading, rename persists to DB (focus+native-setter+blur; synthetic blur Event insufficient — React needs real focusout), numbering `1 SYSTEM REQUIREMENTS` / `1.1 Performance`, Add-requirement-to-section sets heading_id (SRS-0018→h1, SRS-0019→h2), collapse hides section+sub+reqs, detail Section select shows "1.1 Performance", all persisted in req_headings; traceability: 16×11 matrix, Linked 1/6% matches links, toggle cell → Linked 2/13% live + DB 3 rows, untoggle restores 1/6% + DB 2 rows; dashboard: KPIs 14/11/7%/13 (pre-heading-reqs snapshot), breakdowns + lists render, click SRS-0005 in unallocated → Requirements tab + SRS module + row highlighted + drawer on SRS-0005. Note: heading title placeholder "Untitled section" not in innerText — probe via input value, not body text.

## PLAN COMPLETE — 6 tasks + final review (READY TO MERGE) + live verification; final commit a004223

# SDD Progress Ledger — Dashboard Executive Restyle
Plan: docs/superpowers/plans/2026-07-06-dashboard-redesign.md
Spec: docs/superpowers/specs/2026-07-06-dashboard-redesign-design.md
Base commit: 61cb1ab (plan commit). Tasks: 1 stats extension, 2 component rewrite. Post-plan live verification by controller.
- [x] Task 1: complete (commits 61cb1ab..802389a, review clean — spec compliant, approved; brief-verbatim implementation, backward compat of 3-arg caller verified). Minor deferred: timeAgo day bucket unbounded ("400d ago") — fine for dashboard.
- [x] Task 2: complete (commits 802389a..d794f88, review clean — spec compliant, approved; donut offset math hand-traced, brief-verbatim, seam vs Task 1 stats API cross-checked, no token violations; first dispatch died at session limit mid-edit, tree reset to 802389a and re-dispatched clean). Minors deferred (both plan-mandated): donut center label inline font style; empty-branch + >5-gaps truncation untested.
- [x] Final whole-branch review (61cb1ab..d794f88, opus): READY TO MERGE — no Critical/Important; all 3 carried-forward minors DEFER; optional one-liners applied by controller in 72b1a30 (subsystem pluralization + test, donut center label inline font → Tailwind arbitrary classes, closing the plan-constraint deviation) — 15/15 tests, typecheck clean.
- [x] Post-plan live verification (rebuilt, Playwright driver): ALL PASS — KPIs 16 reqs / +16 this week / 11 objects / 7 subsystems / 6% coverage / 0 trace gaps (only High req is linked — correct); donut 15 Draft (94%) + 1 Approved (6%), center 16 ACTIVE; module bars: SRS 6% linked, 0-req Verify6 correctly omitted; activity CREATED/EDITED badges + time-ago correct; gaps empty state correct; "Open Traceability Matrix" switches tab; activity row click opens SRS-0019 drawer. NOTE (pre-existing, not this plan): renderer occasionally reloads spontaneously in driver sessions (fresh initial state, window size reset) — seen before this plan too; worth a separate investigation ticket. RESOLVED 2026-07-06: instrumented driver captured clean [PAGE CLOSED] main, zero crash/pageerror/stderr/navigation events — window closed externally (user/macOS) during idle; app's activate handler then recreates a default-size window with docked devtools (main/index.ts:45-47, :29), which read as a "reload". Not an app bug. Driver now logs lifecycle events + re-points at recreated windows (f96d0fb).

## PLAN COMPLETE — 2 tasks + final review (READY TO MERGE) + live verification; final commit 72b1a30

# SDD Progress Ledger — Requirement Hierarchy & Derivation Traceability
Plan: docs/superpowers/plans/2026-07-06-requirement-hierarchy.md
Spec: docs/superpowers/specs/2026-07-06-requirement-hierarchy-design.md
Base commit: f96d0fb. Tasks: 1 modules backend (move/cycle/reparent), 2 requirement_links backend, 3 store, 4 module tree UI, 5 drawer traceability, 6 dashboard derivation card, 7 verification.
- [x] Task 1: complete (commits f96d0fb..67586c0, review clean — spec compliant, approved; cycle guard hand-traced 3-hop, reparent transaction matches deleteHeading pattern, commit trailer verified). Minors deferred: cycle-guard walk ignores deleted_at on ancestors (brief-verbatim); deleteModule lacks deleteHeading's missing-id early return (no-op harmless); moveModule rowToModule(undefined) raw TypeError on missing id (pre-existing updateModule idiom).
- [x] Task 2: complete (commits 67586c0..f0154a7, review clean — spec compliant, approved; cycle guard hand-traced incl. diamond termination; double-module-join scoping + soft-delete exclusion verified). Minors noted, no action: `as any[]` row casts match sibling idiom; cross-project link insert not guarded at add() (listByProject filters both sides, latent only).
- [x] Task 3: complete (commits f0154a7..31f54d4 + controller fix a5d89d2, review approved; Important finding was plan-authored — removeModule pre-await selectedModuleId snapshot race — fixed by controller in a5d89d2 using reviewer-prescribed removeElement functional-updater idiom, 22/22 + typecheck clean after; two implementer test-fixture deviations validated by reviewer: scoped vi.clearAllMocks in store beforeEach, elementLinks.listByProject stub catch-up).
- [x] Task 4: complete (commits a5d89d2..bc547b7 + fix 4b62754, re-review approved; Important fixed — implementer's "no coverage lost" claim on overwriting old index.test.tsx was false, two dropped regression tests [row-click selectModule, +New Module form reveal] restored, 10/10; helper semantics + cycle safety + stopPropagation hand-verified by reviewer; delta re-review confirmed test-only via blob hashes). Minors deferred: addingChild/moving panels not mutually exclusive (cosmetic); inert stopPropagation on move wrapper div.
- [x] Final whole-branch review (f96d0fb..1efbe67, opus): READY TO MERGE — no Critical/Important; spec deviation (composite PK, no id/timestamps on requirement_links) confirmed deliberate + sibling-table-consistent; all 9 carried-forward minors triaged DEFER (#9 aria-pressed to be bundled into a batched toggle-a11y pass with the already-ticketed error-surfacing work). New reviewer minors, defer: no index on requirement_links(child_req_id) for the cycle walk (desktop-scale fine, matches sibling tables); flattenTree recomputed per render (trivial). Commits already on main — nothing to merge.

## PLAN COMPLETE — 7 tasks + final review (READY TO MERGE) + live verification; final commit 1efbe67

- [x] Task 7: complete (verification, controller-run, no app-source changes: suite 48 failed/149 passed — identical composition to baseline [47 sqlite-ABI + 1 pre-existing ArchitectureCanvas]; both typechecks clean; 3-target build clean; nothing to commit). Post-plan live verification (Playwright driver, SmokeTest): ALL PASS — submodule Thermal created under SRS via + button (indent 24px vs 12px, chevron collapse/expand hides/shows it); move Thermal to top level and back via ⇄ picker; cycle guard verified both layers (UI: Thermal absent from "Move SRS to" options; backend: direct api.modules.move(SRS→Thermal) rejects "Cannot move a module into itself or its descendants"); drawer traceability: SRS-0002 + picker(Thermal/THM-0001) + "Add as child" → Derived-by THM-0001 on SRS-0002 AND Derives-from SRS-0002 on THM-0001; Dashboard Derivation Coverage: All/hasParent 1/17 6%, All/hasChildren 1/17 (SRS-0002 absent from unlinked), SRS/hasChildren 1/16 6%, Thermal/hasParent 1/1 100% + "Every requirement in scope is linked."; unlinked SRS-0005 click → Requirements tab + drawer; relaunch → tree indent + link persist (DB: thermalParent=true links=1, UI re-verified + screenshot). Driver note: FIFO stdin needs a persistent write-end holder (sleep > fifo &) or EOF quits app.
- [x] Task 6: complete (commits e6d5b4f..1efbe67, review clean — spec compliant, approved; byte-for-byte match to brief, tests hand-traced, action-tint token + reqLinks store wiring verified; ⚠️ soft-delete boundary resolved by reviewer's own trace — deleted ids in linkedIds inert since scoped list comes from projectRequirements). Minor deferred: toggle buttons lack aria-pressed (matches file's existing pattern, not a regression).
- [x] Task 5: complete (commits 4b62754..99988f5 + fix e6d5b4f, re-review approved; Important fixed — implementer removed brief's setPickReqId('') reset after add, real store refetch desyncs select + enables silent reverse-link cycle attempt; fix restored reset, test re-picks between adds; reviewer verified req-null safety at index.tsx:53-55). Minors deferred: add/removeReqLink promises unawaited/no .catch (Task 3 store concern, matches codebase convention — same as bulk-actions #3 follow-up); picker candidates match exact moduleId only, not descendants (brief-literal).

# SDD Progress Ledger — Acceptance Criteria Checklist
Plan: docs/superpowers/plans/2026-07-07-acceptance-criteria-checklist.md
Spec: docs/superpowers/specs/2026-07-07-acceptance-criteria-checklist-design.md
Base commit: 8a8830c (plan commit). Tasks: 1 backend, 2 store, 3 drawer UI, 4 list cell, 5 verification. Post-plan live verification by controller.
- [x] Task 1: complete (commits 8a8830c..5b390f3, review clean — spec compliant, approved; migration transactional + per-row idempotent, whitespace-only lines dropped, 6-method channel consistency verified handler/preload/api.d.ts incl. remove→delete split; no-cascade checked, matches sibling tables + soft-delete model). Minors, no action: create position calc not transactional (mirrors customFields/headings idiom); `any` row casts (sibling idiom).
- [x] Task 2: complete (commits 5b390f3..db977cf, review clean — spec compliant, approved; 29/29 store-dir tests; both named risks independently checked [only ModuleTree calls selectModule and it full-mocks the store — no other mock catch-up needed; refreshAc function declaration hoisted, no TDZ]; index.test.ts mock extension verified pure-additive). Minors deferred: summarize firstPos strip via fromEntries round-trip (stylistic); refreshAc with null module wipes acSummary to {} — brief-verbatim, drawer-only usage makes it unreachable today.
- [x] Task 3: complete (commits db977cf..1761f78 + fix 6d8e63a, re-review approved; Important fixed — focusNewAc.current not reset in [req?.id] effect [plan omission, same bug class as prior focusNewField fix], one-line reset + regression test exercising the add-then-switch race, RED/GREEN captured; first fix dispatch died at session limit pre-edit, tree verified clean, re-dispatched; implementer deviation validated by reviewer — traceability.test.tsx mock extended additively, pre-AC mock crashed on new [acItems.length] effect; controller re-ran ArchitectureCanvas at HEAD: 1 baseline failure, implementer's "2 failures" was a run artifact). Minors deferred: localAcTexts never re-adopts store text after first local edit (inherited customFields idiom); AC_STATUSES order out-of-diff (Task 2 contract, tests corroborate).
- [x] Task 4: complete (commits 6d8e63a..12bbedc, review clean — spec compliant, approved; cell swap byte-for-byte per brief, named risk cleared [zero remaining req.acceptanceCriteria reads in component], additive mock state, 36/36). Minor deferred (brief-inherited): em-dash test near-vacuous by construction — strengthen with per-row-keyed summary if touched again.
- [x] Task 5: complete (verification + 1 regression fix: full suite initially 49 failed — App.test.tsx detail-panel test crashed on AC store members missing from its mock [Task 3 ripple, same class as traceability.test.tsx catch-up]; fixed additively in 629b1af, suite then 48 failed/165 passed = exact baseline [47 sqlite-ABI + 1 ArchitectureCanvas]; both typechecks clean; 3-target build clean). Post-plan live verification (Playwright driver, SmokeTest): ALL PASS — migration converted legacy free-text ("Verified by inspection of audit log" → 1 Unverified item, requirements.acceptance_criteria NULL); + Add criterion auto-focuses new input; typed text persists on blur; chip cycles Unverified→Passed→Failed→Unverified in UI+DB; ↑ move swaps order; × remove; table cell badge live-updates (0/2→1/2→0/1) + shows first item by position; relaunch → item/status/order persist, no duplicate items (idempotence), legacy column still NULL. Note: mid-session tab flip to Architecture with zero lifecycle/console events — external window click, not app; recovered and continued.
- [x] Final whole-branch review (8a8830c..629b1af, opus): READY TO MERGE — no Critical/Important; migration idempotence/backward-compat, SQL parameterization, position handling, summarize order-independence, focus-fix diagnosticity all verified; all 6 carried-forward minors DEFER. Reviewer minors: refreshAc late-resolve could clobber acItems after fast requirement switch — optional guard applied by controller in 438041a (selectedRequirementId check, summary still updates; 29/29 store tests + typecheck clean); acSummary not refreshed on requirement add/delete/bulk ops — invisible today (new reqs have no items, deleted rows unrender), noted only.

## PLAN COMPLETE — 5 tasks + final review (READY TO MERGE) + live verification; final commit 438041a

# SDD Progress Ledger — Global Search
Plan: docs/superpowers/plans/2026-07-07-global-search.md
Spec: docs/superpowers/specs/2026-07-07-global-search-design.md
Base commit: f4fc503 (plan commit). Tasks: 1 backend IPC, 2 GlobalSearch component + mount, 3 verification. Post-plan live verification by controller.
- [x] Task 1: complete (commits f4fc503..1bfc7c3, review clean — spec compliant, approved; export-only mapper diffs confirmed, ESCAPE '\' + backslash-safe escapeLike hand-traced incl. trailing-backslash edge, 5-placeholder binding, soft-delete joins + project scoping on all 3 queries, preload/api.d.ts lockstep). Minor, no action: inline db.prepare per call (brief-verbatim, prepare cheap).
- [x] Task 2: complete (commits 1bfc7c3..4927f32, review clean — spec compliant, approved; all 3 named risks verified [effect cleanups incl. debounce timer, ref-read-at-resolve stale guard, exact navigation call shapes]; implementer deviation validated — type annotations only on test fixtures, brief's untyped literals failed tsc; App.test.tsx-untouched claim verified via !project early return + null-render). Minors, no action: closure-wrap style in go() calls (brief-verbatim).
- [x] Task 3: complete (verification, controller-run, no changes needed: suite 48 failed/174 passed — exact baseline composition [47 sqlite-ABI + 1 ArchitectureCanvas], +9 = new GlobalSearch tests; both typechecks clean; 3-target build clean). Post-plan live verification (Playwright driver, SmokeTest): ALL PASS — input in navy header with "Search…  ⌘K" placeholder; "perf" → SECTIONS group with Performance + module name; "srs" → REQUIREMENTS (10) + MODULES groups; requirement click → drawer open + input cleared + dropdown closed; heading click → SRS list with sections; module click → Verify6 selected + input cleared; wildcard escaping proven diagnostic ("S%2" → No matches, unescaped would hit SRS-0002); "a%b" no crash; Esc closes (deferred-check — same-tick DOM read false-negatives); real ⌘K keypress focuses input from blurred state.
- [x] Final whole-branch review (f4fc503..4927f32, opus): READY TO MERGE — no Critical/Important; SQL injection-safety/escaping/scoping verified, effect hygiene + stale-guard confirmed real, navigation shapes cross-checked against store (openRequirement sets tab internally — no redundant call); both carried-forward minors DEFER (better-sqlite3 caches prepared statements internally; go() wrapper stylistic). Reviewer minors, all defer/follow-up: heading click lands on module without anchoring to the section (spec-conformant scope cut — ticket if users ask); stale-response guard untested (add out-of-order test on next search touch); debounce test proves one-change-one-call not N-keystroke coalescing; dropdown lacks listbox aria semantics (fine while arrow-key nav is out of scope).

## PLAN COMPLETE — 3 tasks + final review (READY TO MERGE) + live verification; final commit 4927f32

# SDD Progress Ledger — Trace to Architecture
Plan: docs/superpowers/plans/2026-07-07-trace-to-architecture.md
Spec: docs/superpowers/specs/2026-07-07-trace-to-architecture-design.md
Base commit: f9a31a7 (plan commit). Tasks: 1 drawer ArchitectureSection, 2 verification. Post-plan live verification by controller.
- [x] Task 1: complete (commits f9a31a7..f96ba65, review clean — spec compliant, approved; all 3 named risks verified [picker reset transplanted from e6d5b4f fix incl. regression test; sibling mock changes hunk-verified pure-additive; selectElement cross-clears selectedConnectionId per store invariant]; RED 5/6 — mount-loads test pre-passes via sibling TraceabilitySection's identical effect, non-diagnostic pre-impl only). Minor deferred: duplicate loadTraceability mount effect in both drawer sections — hoist to RequirementDetail root if a third section needs it.
- [x] Task 2: complete (verification, controller-run, no changes: suite 48 failed/180 passed — exact baseline; both typechecks clean; 3-target build clean). Post-plan live verification (Playwright driver, SmokeTest): ALL PASS — SRS-0002 drawer ARCHITECTURE section lists matrix-linked SYS-003+SYS-009, picker excludes them; pick SYS-001 + Link → row appears, picker resets, DB [3,9,1]; Unlink SYS-001 → linked rows back to [SYS-003,SYS-009], DB [3,9] (first "uiGone:false" probe was matching the picker's candidate option text — probe error, not a bug); row click SYS-003 → Architecture tab + element in panel.
- [x] Final whole-branch review (f9a31a7..f96ba65, opus): READY TO MERGE — no Critical/Important; cross-cutting checks all pass (dual loadTraceability effects idempotent last-writer-wins; elements populated by loadTraceability not loadArchitecture, so section works before any canvas visit; zero backend/store changes confirmed). Deferred: duplicate loadTraceability mount effect (hoist when a third consumer appears); unawaited toggleTraceLink (ticketed codebase-wide convention); dep array omits stable store action (sibling idiom).

## PLAN COMPLETE — 2 tasks + final review (READY TO MERGE) + live verification; final commit f96ba65

# SDD Progress Ledger — Component Library Palette & Typed Nodes
Plan: docs/superpowers/plans/2026-07-08-component-library-typed-nodes.md
Spec: docs/superpowers/specs/2026-07-08-component-library-typed-nodes-design.md
Base commit: ee93fad. Tasks: 1 buildNodes typeName+connectionCount, 2 BlockNode header, 3 ComponentLibrary palette, 4 verification.
- [x] Task 1: complete (commits ee93fad..2623d1f, review clean — spec ✅, quality approved; signature/typeName/connectionCount incl. self-loop-once verified; BlockNode.test.tsx fixture fix in-scope for tsc; minor non-blocking: implementer narrative wrongly claimed connections was already a dep).
- [x] Task 2: complete (commits 2623d1f..aeb792e, review clean — spec ✅, quality approved, zero findings; unnamed fallback typeName??Object, named leading type tag, ⇆N badge >0 guard matching Nested pill; tests non-vacuous; only BlockNode.tsx/.test.tsx touched).
- [x] Task 3: complete (commits aeb792e..7ff0314, review clean — spec ✅, quality approved; ComponentLibrary rows/aria/click→addElement verbatim, index.tsx rewrap preserved ALL ReactFlow props+children+CanvasControls+zoom import verified against full post-diff file, JSX balances; test uses repo vi.mock idiom, non-vacuous. Minors non-blocking: random-offset overlap + unreachable !project guard, both match handleAddBlock).
- [x] Task 4: complete (verification, controller-run + test-mock fix 7589d28). Both typechecks exit 0; 3-target build clean. Suite: my 3 tasks all green (nodes 2, BlockNode 2, ComponentLibrary 2 new); recovered 4 pre-existing index.test.tsx failures introduced by item-17 CanvasControls (added Panel/useViewport/zoom fns to the @xyflow mock, 7589d28); only remaining ArchitectureCanvas failure is the genuinely pre-existing stale "connection mode toggle button" test; rest are the 47 sqlite-ABI main-handler failures. Live-verified (Playwright, SmokeTest, screenshots cl-1/2/3): COMPONENT LIBRARY palette lists all 5 seeded types w/ color dots; click Component/Function drops SYS-017/018 whose headers show COMPONENT/FUNCTION (Properties panel confirms Type); +Object still makes untyped OBJECT node; port-count badges ⇆N render on connected nodes (SYS-002 ⇆3 correct); zoom controls (item 17) preserved; relaunch persists typed nodes + headers (eval true).

## PLAN COMPLETE — 4 tasks; commits ee93fad..7589d28 (2623d1f,aeb792e,7ff0314 + test-mock fix 7589d28)
- [x] Final whole-branch review (ee93fad..bcc7ee7, opus): READY TO MERGE — no Critical/Important. Signature/BlockNodeData/store-wiring/effect-deps consistent end to end; index.tsx rewrap dropped nothing (all 13 ReactFlow props + Background + CanvasControls + +Object preserved); spec A/B/C all met; constraints honored (no deps/Material Symbols, NAVY only sanctioned hex). 3 minors DEFER (random-offset overlap, unreachable !project guard, O(n·m) count — all match existing idioms / ponytail-commented). Commits already on main — nothing to merge.

# SDD Progress Ledger — Architecture Canvas Undo/Redo

Plan: docs/superpowers/plans/2026-07-09-architecture-canvas-undo.md
Base commit: 38d1d82

## Tasks
- [x] Task 1: complete (commits 38d1d82..3095edc, review clean — minor: restore of nonexistent id throws in mapper, inherited from update handlers, not a regression)
- [x] Task 2: complete (commits 3095edc..2ff017e, review clean)
- NOTE: pre-existing failing test index.test.tsx "renders connection mode toggle button" (/connect/i button never existed, only a hint span) — unrelated to undo; Task 6 touches this file, do not chase it.
- [x] Task 3: complete (commits 2ff017e..6d5dc90, review clean — minors: two setState calls per action, no-op/loadProject undo not unit-tested, interface field placement; all inherited from brief, non-blocking)
- [x] Task 4: complete (commits 6d5dc90..47bb52a, review clean — minor: child parentId assertion tautological, posX/posY give real coverage, non-blocking)
- [x] Task 5: complete (commits 47bb52a..f922313, review clean — no issues; prop/geometry key partition verified exhaustive against input types)
- [x] Task 6: complete (commits f922313..138dbeb, review clean — no issues)

## ALL TASKS COMPLETE — pending final whole-branch review
- FINAL REVIEW (opus): Ready=Yes, no Critical/Important. 3 minors: (1) ghost undo steps from no-op field blurs, (2) delete-undo partial failure leaves store stale, (3) keydown lacks e.repeat guard. Fixing all 3 in one pass.
- FINAL FIXES: commit 138dbeb..e4e522c — all 3 minors applied, store 30/30, typecheck clean. PLAN COMPLETE, branch ready to merge.

---

Plan: docs/superpowers/plans/2026-07-11-interfaces-module.md
Base commit: b3f38c5

## Tasks
- [x] Task 1: complete (commits b3f38c5..f538750, review clean — no findings)
- [x] Task 2: complete (commits f538750..0f324fe, review clean — no findings)
- [x] Task 3: complete (commits 0f324fe..88af0f0, review clean — 5/5, cosmetic nit only)
- [x] Task 4: complete (commits 88af0f0..81c2613, review clean — 37/37, no findings)
- [x] Task 5: complete (commits 81c2613..20e787a, review clean — 6/6, no findings)
- [x] Task 6: complete (commits 20e787a..8026b6f, review clean — renderer 205/205)

## ALL TASKS COMPLETE — pending live-verify + final whole-branch review
Minors (non-blocking, for final-review triage):
- Task 3: customFieldKeys uses O(n^2) includes (fine at scale); redundant `?? ''` on typeName false branch.
- Task 6: loadColumnVisibility called twice on mount (idempotent localStorage read); loadInterfaces double-fetch on first tab visit (spec-driven — register mount effect + App tab-switch effect).

## LIVE-VERIFY (controller, running app on SmokeTest) — ALL PASS
- Interfaces tab renders register; 4 connections listed with correct Interface IDs (ICN-000N) + From/To object IDs (SYS-*), mandatory + optional columns.
- Custom field: + Add Field on ICN-0001, key=Protocol value=CAN → Protocol column appears in register showing CAN.
- Column toggle: unchecking Protocol hides column, localStorage reqarch.interfaceRegister.columns.v1 = {...,"Protocol":false}.
- Relaunch: Protocol=CAN persists (DB); column visibility persists (localStorage).
- + New Interface: source/target selects → Create → ICN-0005 row added (4→5).
(SmokeTest scratch project now holds test ICN-0005 + Protocol field — acceptable, it's the dev scratch DB.)

## FINAL WHOLE-BRANCH REVIEW (opus) — Ready to merge: YES
No Critical/Important. Cross-boundary data flow, dual-state sync, canvas non-regression, edge cases all verified sound. Minors (all non-blocking, self-healing): removeConnection from drawer doesn't prune projectConnectionCustomFields (lingers empty until tab re-entry); customFieldKeys O(n^2); redundant ?? '' ; unmemoized row recompute. Orphaned connection_custom_fields on soft-delete excluded by deleted_at filter (harmless, mirrors requirement-custom-fields precedent). PLAN COMPLETE — feature on main (f538750..8026b6f).

---

Plan: docs/superpowers/plans/2026-07-11-multiple-architectures.md
Base commit: b0fdb2f

## Tasks
- [x] Task 1: complete (commits b0fdb2f..60700a2, review clean — 2 inherited minors: CreateArchitectureInput unused today; rename blind-reselect matches codebase convention)
- [x] Task 2: complete (commits 60700a2..c922269, review clean — no issues; INSERT column/value alignment verified both handlers)
- [x] Task 3: complete (commits c922269..1afd01b, review clean — no issues; fixture architectureId:null edits legit, both typechecks clean)
- [x] Task 4: complete (commits 1afd01b..af406c3, review clean — all 5 checks pass, genuine RED→GREEN, removeElement still DB re-syncs, loadInterfaces left unfiltered; trivial nit: removeArchitecture relies on server last-arch guard, non-blocking)
- [x] Task 5: complete (commits af406c3..6f7b402, review clean — all 7 checks pass, deviations benign (dropped unused describe import, additive App.test mock), 2/2 + 211 suite, typechecks clean)
- [x] Task 6: complete (commits 6f7b402..83b3121, review clean — spec PASS, loadInterfaces stays unfiltered, column wired end-to-end, 6/6 + 212 suite, both typechecks + build clean; all 5 live-verify checks confirmed w/ screenshots)

## ALL TASKS COMPLETE — pending final whole-branch review
Minors (non-blocking, for final-review triage):
- Task 1: CreateArchitectureInput exported but unused today (positional create args); renameArchitecture blind reselect (matches codebase convention).
- Task 4/5: removeArchitecture uses non-optional architectures[0].id, safe by server last-arch guard (asymmetric with loadArchitectures' ?. but not reachable-empty).
- Task 6 a11y (belongs to Task 5 tabs, not this diff): architecture sub-tabs are <div onClick> not <button>/role=tab — driver couldn't click by text; candidate for a batched a11y follow-up.
LIVE-VERIFY (Task 6 implementer, Playwright driver, 2 launches, screenshots): (a) sub-tab strip + Default, (b) independent diagrams Comms isolated, (c) rename + delete (last tab no ×), (d) relaunch restores last-active, (e) Architecture column in Interfaces Columns toggle showing Default for ICN rows — ALL confirmed.

## FINAL WHOLE-BRANCH REVIEW (opus) — Ready to merge: WITH FIXES → FIXES APPLIED
Two cross-task findings at the register↔canvas seam (both fixed, commit cbe4b4e):
- Important: register-created interface (Interfaces tab, Architecture never opened) stamped architectureId=null → orphan, swept to Default only on next migration. Root-cause fix in createConnection/createElement: derive non-null architecture (connection prefers source element's architecture, else getOrCreateDefaultArchitecture; element falls back to default). Live-verified with control — pre-fix build reproduced architecture_id=NULL, post-fix architecture_id=1 ("Default").
- Minor: undo/redo stack not cleared on architecture switch → undo mutated hidden diagram. Fixed: setActiveArchitecture clears undoStack/redoStack (+ test assertion). architectures.test 4/4, both typechecks clean.
Deferred (non-blocking): CreateArchitectureInput dead (could delete); renameArchitecture blind reselect (codebase convention); removeArchitecture non-optional architectures[0].id (safe by server guard); sub-tabs <div onClick> a11y → batched a11y follow-up ticket.
PLAN COMPLETE — feature on main (60700a2..cbe4b4e).

---

Plan: docs/superpowers/plans/2026-07-12-architecture-nav-and-per-architecture-interfaces.md
Base commit: 8077fd6

## Tasks
- [x] Task 1: complete (commits 8077fd6..6b858fe, review clean — spec PASS, all 6 checks; 2/2 + 43/43, typecheck clean; reset folded into loadProject set, no persistence)
- [x] Task 2: complete (commits 6b858fe..7c2c252, review clean — spec PASS all 7 checks; strip + test deleted no leftover refs; 3/3 + 215 suite, both typechecks clean; inherited minor: Escape-then-blur could re-commit rename, carried from old strip, non-blocking)
- [x] Task 3: complete (shelve Component Library + type-picker on + Object; both typechecks clean, renderer 215/215; index.test.tsx + Object assertion updated to include elementTypeId:null)
- [x] Task 4: complete (fromName/toName/architectureId on InterfaceRow; mandatory From Name/To Name columns Interface ID|From|From Name|To|To Name; colSpan 5; both typechecks clean, register 9/9)
- [x] Task 5: complete (InterfaceNav sidebar + client-side interfaceArchFilter + scoped create + scoped pickers; App.tsx panel-interfaces rewired; both typechecks clean, renderer 220/220 incl. 3 new InterfaceNav tests)

## ALL TASKS COMPLETE — build clean + live-verify PASS
Build: electron-vite clean (736 kB bundle). Live-verify (Playwright driver, scratch project "thermal", 3 architectures Default/test 1/test 2):
1. Architecture tab — left ArchitectureNav sidebar (no top strip); Default/test 1/test 2 rows; clicking test 1 vs Default swaps canvas (test 1 = SYS-001/002/003, Default = SYS-004), diagrams isolated; × delete shown (>1 arch).
2. Component Library gone — no left palette; toolbar has type Select (Untyped/System/Subsystem/Component/Function/External); pick System + `+ Object` → node header "SYSTEM" (SYS-004); untyped path still works.
3. Interfaces tab — left InterfaceNav "All architectures" + Default/test 1/test 2; All=2, Default=0 ("No interfaces yet."), test 1=2 → client-side filter works.
4. Object-name columns — headers exactly INTERFACE ID | FROM | FROM NAME | TO | TO NAME | …optional; blank names render "—"; after naming SYS-001 "Radio" on canvas, ICN-0002 To Name=Radio + ICN-0003 From Name=Radio populate.
5. Scoped create — test 1 selected: pickers list only SYS-001/002/003; created ICN-0003 SYS-001→SYS-003 shows Architecture=test 1, count 2→3, absent from Default filter.
Driver note: ArchitectureNav/InterfaceNav rows are <div onClick> (a11y deferred), so click-text can't reach them — clicked via eval; element name commit needs a real focusout event (synthetic 'blur' insufficient, matches prior ledger note).

## FINAL WHOLE-BRANCH REVIEW (controller, 8077fd6..HEAD) — Ready to merge: YES
Renderer-only as designed: no window.api/handler/preload/src/types edits. interfaceArchFilter session-only + reset in loadProject. InterfaceRow.architectureId consumed only by Task 5 filter. ComponentLibrary retained (unmounted), ArchitectureTabs deleted. Minors (non-blocking, deferred): nav rows <div onClick> a11y → batched a11y follow-up ticket (carried); visibleRows/pickElements recomputed per render (trivial at desktop scale). PLAN COMPLETE — feature on main (8077fd6..HEAD).

## Architecture Layers (plan 2026-07-13-architecture-layers.md) — base a2dc791
Task 1: complete (commit 6ace570, review clean — spec ✅, no Critical/Important)
  Minors (carry to final review): deleteLayer no existence-check (plan-provided, mirrors nothing—architectures throws); no CHECK constraint on state column (TS-only enforcement, codebase convention); row:any casts (codebase convention).
Task 2: complete (commit 870fe73, review clean — spec ✅, no Critical/Important)
  Minors (carry): toggle actions read membership pre-await (race only on rapid double-click, single-user desktop — plan pattern); no try/catch on api.layers.* calls (matches codebase; folds into known error-surfacing pass). Note: brief test import path 4→3 levels fixed correctly.
Task 3: complete (commit 777a6fb, review clean — spec ✅, no Critical/Important; truth table hand-traced correct, not inverted)
Task 4: complete (commit 2990c9d, review clean — spec ✅, no Critical/Important; hidden-set true transitive closure, endpoint-wins verified, faded stays selectable, all 8 buildNodes call sites updated)
  Minors (carry): layersById Map built twice (visById memo + edge effect — hoist to shared useMemo; trivial, not hot path); no index.tsx edge-integration test (in brief scope — nodes.test only). Plus 2 legit out-of-brief fixture fixes: BlockNode.test.tsx faded:false, index.test.tsx store mock.
Task 5: complete (commit 040b8d1, review clean — spec ✅, no Critical/Important; aria-labels exact, add/rename commit paths + Escape + confirm-gate all wired, 3/3 tests meaningful)
  Minor (carry): useStore() as any cast (brief-sanctioned) ripples to layers.map((l:any)) — l.state as LayerState untyped; type as (l: Layer) in follow-up.
Task 6: complete (commit dfb7b07, review clean — spec ✅, ZERO issues; true ConnectionPanel mirror w/ conn var, no crossed wires, mock ripple strictly additive across 3 files, renderer 241/241)
Task 7: complete (verification + live-verify). Full gate: both typechecks clean, renderer 241/241, electron-vite build clean.
  Live-verify (Playwright driver, thermal project / test-1 architecture, 3 blocks SYS-001/002/003 + 3 edges):
  1. Created Power + Comms layers via top-right panel; assigned SYS-001 + SYS-003 to Power via drawer checkboxes (SYS-002 left base/no-layer). ✓
  2. Cycle Power Visible→Faded→Hidden: members op 1→0.35→omitted; base SYS-002 stayed op=1 throughout; dot ●→◐→○. ✓
  3. Power=Hidden → all 3 connectors (endpoints on SYS-001/003) removed; Power=Faded → all 3 edges render op=0.3 (endpoint-wins). ✓
  4. Faded SYS-001 (op=0.35) still clickable — drawer opened (Properties, Power=true). ✓
  5. Switch to Default arch → SYS-004, zero layers ("No layers yet."); back to test 1 → Power(faded)/Comms restored; RELAUNCH → names+states+membership persisted (SYS-001 op=0.35, Power=true checkbox). ✓
  All 5 checks pass. Layers feature COMPLETE. (Left Power/Comms scratch layers on thermal dev project — harmless, consistent w/ prior scratch data.)

Final whole-branch review (opus, a2dc791..dfb7b07): "ready to merge WITH FIXES". No Critical. 1 Important (#1): connectors to a container-hidden CHILD resolved to hidden only via RF dropping missing-endpoint edges, not via the resolver — endpoint-wins invariant half-satisfied, untested, fragile.
Fix commit d0ae1b8: added pure `withHiddenCascade(elements, ownVisibilityMap)` in nodes.ts (folds transitive descendants of hidden elements to 'hidden' via existing descendantIds); index.tsx computes visById = withHiddenCascade(own) as ONE shared cascade-aware map consumed by both buildNodes AND the edge effect; hoisted layersById to a single useMemo (was built twice). Also guarded LayerPanel add/rename Enter+blur double-commit with committed-refs. New RED→GREEN test; renderer 243/243, both typechecks clean.
Fix re-review (sonnet, dfb7b07..d0ae1b8): Fixes Verified YES — cascade transitive, single source of truth (no divergence), node-omission not regressed, ref-guard correct, no deferred item touched. 1 minor: new test's edge assertion was trivial (container-own-hidden endpoint).
Test strengthen commit 7792f16: reroute the cascade-edge assertion from container→child to cascade-hidden-child→visible-sibling so only the cascade makes it hidden (real regression guard). nodes.test 17/17.
LAYERS FEATURE COMPLETE — HEAD 7792f16. All work on main.

## Connection Line Editing (plan 2026-07-14-connection-line-editing.md) — base cfeff64
Task 1: complete (commit 467d9e5, review clean — spec ✅, quality approved)
  Carry to final review (PLAN-MANDATED, needs human call): updateConnection's 3 new style args use `'k' in input ? input.k : existing.col` (plan Step 5 verbatim) without the `?? null` coalesce the sibling name/connectionTypeId/description args use. An explicit `{ lineStyle: undefined }` would bind undefined -> better-sqlite3 TypeError instead of falling back to existing. INERT today (Task 5 selects always pass a real value); reviewer confirmed non-blocking.
  Minor (carry): UpdateConnectionInput style fields are `?: LineStyle` (no `| null`) unlike `connectionTypeId?: number | null` — no typed way to reset a style to unset. Fine per brief; revisit only if a "reset to default" affordance lands.
  Note: 2 forced test-mock ripples (InterfaceRegister/rows.test.ts, store/index.test.ts) — 3 new required fields on ArchitectureConnection; reviewer judged minimum-necessary, not scope creep.
Task 2: complete (commit e1e14a5, review clean — spec ✅, no Critical/Important)
  Reviewer traced RED path: without the 3 keys, editKeys=[] -> changed=false -> undoStack stays 0, test fails for the stated reason. Not a false-positive.
  Correct brief deviation: test import path 4-up -> 3-up ('../../../types') matching every sibling in store/. Brief's path was wrong. (Same fix as the Layers Task 2 note.)
  Minor (carry): 2nd test asserts only undoStack.length for markerStart/markerEnd, not the captured prev values — generic code path already value-verified by the lineStyle case; one more toHaveBeenLastCalledWith would close it.

## Requirements File Structure — folders contain modules (item 21)
Plan: `docs/superpowers/plans/2026-07-14-requirements-file-structure.md`. Base `ae0b6ae`.
Task 1: complete (commits 5d1292e + fix 7edb9ae, review clean — spec ✅ PASS, no Critical/Important open)
  Brief file-list defect (correctly caught by implementer): 3 more main-process test files call createModule (requirements/connectionLinks/elementLinks.test.ts) — needed `kind: 'module'` for the binding tsconfig.node clean gate. Not scope creep.
  Important (fixed, 7edb9ae): NewModuleForm.tsx built CreateModuleInput without `kind` -> web typecheck + `npm run build` red. Brief's Step 5 predicted "test fixtures only" — wrong, this one was production. Form hard-requires a prefix so `kind: 'module'` preserves behavior exactly; Task 3 still rewrites the file.
  Controller-verified (fix subagent MISREPORTED tests as "6 failed, pre-existing env issues" — false): actual ModuleTree 10/10 pass, renderer suite 250 passed, tsc node clean, tsc web = 5 errors all in test fixtures (Task 5 Step 4 owns them). Do not trust that fix report's test line.
  Minor (carry to final-review triage):
    - `?? 'module'` fallbacks at modules.ts:13,19 + requirements.ts:37 are dead (column is NOT NULL DEFAULT 'module'; addColumnIfMissing runs on fresh+legacy DBs alike) and deviate from sibling enum reads (requirements.ts status, layers.ts state have no fallback). Brief-verbatim.
    - modules.test.ts:36 name "defaults a folder to no prefix" asserts no such thing; nothing enforces `id_prefix=''` for folders — `createModule({kind:'folder', idPrefix:'ABC'})` succeeds today. Constraint currently has no owner.
    - assertFolderParent's not-found branch is unreachable from moveModule (cycle guard throws first) — two messages for one condition. Live on the createModule path.
    - `kind` unvalidated at the IPC boundary (modules.ts:83) — same as existing status/priority/state convention, single-user desktop app.
  Sequencing note (reviewer): between Task 1 and Task 2's migration, every legacy row backfills to kind='module', so a real nested tree is un-editable (createModule/moveModule throw). Task 2 must land before any live-verify against real data.
Task 2: complete (commit 9defe73, review clean — spec ✅ PASS, quality PASS, no Critical/Important)
  Reviewer independently reproduced both typechecks and traced the migration against real code: idempotent (NOT version-gated — openDatabase re-runs runMigrations every launch, so it self-heals rather than latching); one pass handles multi-level nesting (snapshot captures every parent simultaneously, inserted modules are always childless); req IDs + counter continuity preserved (createRequirement reads prefix/padding/next_counter off the module row, which the new module inherits); soft-deleted reqs follow to the new module so listDeletedRequirements/restore lands on a module, not a folder.
  Minor (carry to final-review triage):
    - migrations.ts:268 `SELECT *` + `as any[]`; both sibling migrations (:216, :242) use narrow column lists with real row types.
    - migrations.ts:280 new module inserted at position 0 — where siblings have position > 0 it sorts FIRST (ORDER BY position, id), ahead of folders it used to sit above. `MAX(position)+1` (as headings.ts:31-33 does) would preserve visual order. Cosmetic; fix if Task 6 surfaces odd ordering.
    - modules.ts:78 (out of diff, Task 1 gap): restoreModule clears deleted_at with no assertFolderParent check — restoring a child under a kind='module' parent reintroduces the violation. Mitigated: session-scoped only, because the migration self-heals the tree at next launch.
  ⚠️ resolved by controller: reviewer's "legacy rows predating deleteModule's reparenting" query is now folded into the plan's Task 6 as Step 2b (expect COUNT = 0), instead of a note nobody runs.
Task 3: complete (commit 873ff1d, review clean — spec ✅ full compliance, quality no Critical/Important, zero ⚠️)
  Controller-verified test claim independently: renderer 253 passed / 37 files / 0 failed. Reviewer re-ran both tsc targets (node exit 0; web unchanged 5 errors, Task 5 Step 4 owns them).
  Reviewer verified: submit guards (`if (!name.trim()) return` then `if (!isFolder && !prefix.trim()) return`), `idPrefix: ''` for folders end-to-end, no state leak (form conditionally rendered = fresh mount per open), all 3 tests fail for the right reason, toggle matches Dashboard/index.tsx:325-334 pattern. `type="button"` flagged as correct deliberate deviation (buttons inside a real `<form>` would submit).
  Minor (carry to final-review triage):
    - `idPadding` still submitted for folders (harmless — backend ignores it for kind='folder').
    - Form inputs rely on placeholder as their only label — pre-existing project-wide pattern, folds into the batched a11y follow-up.
  Note: the Task 3 subagent ran without the opus safety classifier (unavailable); its conclusions match the controller's own verified test run.
Task 4: complete (commit c524997, review clean — spec ✅ PASS, quality no Critical/Important; zero deviations)
  Controller-verified test claim independently: renderer 255 passed / 37 files / 0 failed (up from 253 — rewritten index.test.tsx has 8 tests vs the old 6).
  Reviewer verified all 3 invariants by MUTATION testing, not by reading: folder click never reaches onSelect (only path is ModuleNode.tsx:48, isFolder-guarded); module is a leaf; move picker = folders only minus self/descendants plus (top level). 3 of 4 mutations caught by the tests — the `Payload` fixture row is what makes the moveTargets mutation fail. Tests are diagnostic, not vacuous.
  `act(...)` warning on ModuleNode's async submit: implementer's claim VERIFIED by reviewer against the base tree — identical `at ModuleNode` stack at 2f95eea, and both the addingChild block and NewModuleForm.handleSubmit are byte-identical to base. Pre-existing, stderr not failure, out of brief scope.
  Minor (carry to final-review triage):
    - The leaf guard (`const children = isFolder ? childrenOf(...) : []`) is UNTESTED — reverting it to unconditional childrenOf still passes 8/8 (no fixture has a module with children). Low risk: assertFolderParent (modules.ts:61) blocks a module becoming a parent on create + move, so the guard is belt-and-braces.
    - descendantIds computed for modules (ModuleNode.tsx:31) where children is always [] — dead work on leaves, trivial.
    - The two `<svg>` branches differ only in the `d` attribute; one `<svg>` with a ternary `d` would halve it. Brief-verbatim.
  Sequencing (reviewer, owner label corrected by controller): the selectedModuleId-never-a-folder invariant is still VIOLATABLE at runtime until search.ts is filtered — search.ts:28-32 has no kind filter and GlobalSearch/index.tsx:97 calls selectModule on the hit, so a folder search hit seats a folder in selectedModuleId. Reviewer said "Task 6 owns this" but its own line cites (631, 693-703) fall inside **Task 5** (625-732). Task 5 closes it. Live-verify (Task 6) therefore runs after the invariant is already closed — no sequencing problem.
Task 5: complete (commit 8cacaed, review clean — spec ✅ PASS, quality no Critical/Important; recommend accept)
  Controller-verified independently: renderer 256 passed / 37 files / 0 failed (255 baseline + 1 new test); web tsc exit 0; node tsc exit 0 — the 5 inherited fixture errors are GONE. Web typecheck is clean for the first time on this branch.
  **selectedModuleId-never-a-folder is now CLOSED.** Reviewer enumerated all 4 paths that can seat it and confirmed each is sealed: ModuleTree/index.tsx:32 -> ModuleNode:47 (isFolder ternary, Task 4); GlobalSearch:97 module hit (closed by THIS task's search.ts change); GlobalSearch:106 heading hit (headings only live on modules); store:190 openRequirement (createRequirement rejects folders).
  **Ripple verified complete by independent grep** (not just the brief's 4): every other `modules` consumer is legitimately unfiltered — RequirementsList:94 (resolves the selection, already folder-free), GlobalSearch:51 moduleName (resolves a requirement's owner, spec-exempt line 123), moduleTree.ts (kind-agnostic by design), ModuleNode:32 (already folder-filtered), store:201 (update-by-id map). No unfiltered consumer found.
  Test diagnosticity mutation-verified: reverting the stats filter yields exactly the brief-predicted `expected [ 1, 2 ] to deeply equal [ 2 ]`, and ONLY that test fails — the folder-holds-a-requirement fixture is what makes it bite.
  Implementer's 2 flags both adjudicated: (a) `req({id:1, moduleId:1})` adaptation to the file's object factory is benign, assertion byte-identical to brief; (b) NULL-kind-excluded-from-search concern is UNFOUNDED — reviewer proved empirically that SQLite backfills the default on `ADD COLUMN NOT NULL DEFAULT` (`1|a|module|0`), migrations.ts:210 runs every open, CREATE TABLE at :18 omits kind so fresh DBs take the same ALTER, and no INSERT passes kind NULL. NULL kind unreachable in any live DB.
  Note: intermediate 3-failed state during implementation — Dashboard/index.test.tsx + RequirementDetail/traceability.test.tsx type module fixtures as `any`, so tsc missed them but the runtime filter dropped them. Brief predicted them as typecheck errors under Step 4; they surfaced as test failures instead. Reviewer confirmed all 5 fixture fixes are at the definition, no assertion weakened.
  Minor (carry to final-review triage):
    - Dashboard/index.tsx:321 and RequirementDetail/index.tsx:329 duplicate the identical `flattenTree(modules).filter(({module: m}) => m.kind === 'module')`. Two occurrences don't earn a helper; hoist `moduleOptions(modules)` into moduleTree.ts if a third picker appears.
    - headings.ts:21 `createHeading` has NO folder guard, unlike requirements.ts:36-38 which rejects folders. Unreachable via UI (headings are only created from selectedModuleId, now folder-free) and the migration moves headings off converted parents — defense-in-depth asymmetry, not a live bug.
