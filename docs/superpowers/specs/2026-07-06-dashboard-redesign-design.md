# Dashboard Redesign — Executive Style (Design)

Date: 2026-07-06
Status: awaiting user review
Source: user-supplied "Executive Project Dashboard" mockup (dark-navy chrome, white cards, donut chart, per-module bars, activity feed, critical-gaps panel).

## Goal

Restyle the Dashboard tab to the mockup's executive visual language while showing **only real data** — no fake users, no demo values. App chrome (top tab nav) is unchanged; this is a Dashboard-tab-content redesign.

## Decisions & assumptions (user was AFK; confirm before implementation)

1. **Real-data mapping** (chosen over building new backends or demo data):
   - Mockup "Verif. Coverage" → **Allocation Coverage** (existing coveragePct).
   - Mockup "Compliance Gaps / High Risk" → **Trace Gaps**: count of unallocated requirements with priority `High` (`REQUIREMENT_PRIORITIES` is `['High','Medium','Low']` — no Critical tier).
   - Mockup "Recent Activity" (users + actions) → recently created/updated requirements. Action badge: `CREATED` when `createdAt === updatedAt`, else `EDITED`. No user column (single-user desktop app, no audit log).
   - Mockup "+12 this week" → count of requirements with `createdAt` within the last 7 days.
   - Mockup "8 Subsystems" → count of top-level elements (`parentId === null`).
2. **Out of scope** (mockup elements deliberately not built): left sidebar "Project Explorer" chrome, breadcrumb, page footer, Export Report button, Sync Models button, avatars, verification data model, compliance data model, audit log. Any of these can be a follow-up plan.
3. No schema, IPC, or preload changes — everything derives from data the store already loads (`projectRequirements`, `elements`, `traceLinks`, `modules`).

## Layout (3 rows inside scrollable `bg-workspace` container)

**Row 1 — 4 KPI cards** (white, border-line, rounded, small inline-SVG icon top-right):
1. Total Requirements — big number; sub-line `+N this week` (green trend arrow) when N > 0, hidden when 0.
2. Objects — big number; sub-line `N subsystems`.
3. Allocation Coverage — `NN%` + slim progress bar (bg-action fill).
4. Trace Gaps — count in `text-error` when > 0; sub-line `High priority unallocated`. Red warning icon.

**Row 2 — 2 cards:**
- **Requirement Status** — SVG donut (stroke-dasharray segments, no chart lib), center shows non-deleted requirement total + "ACTIVE" label, legend below with per-status color dot, name, percent. Colors from a small status→token map consistent with existing CHIP_STYLES semantics; follow dataviz-skill guidance during implementation (categorical palette, accessible contrast, theme tokens only).
- **Traceability Coverage by Module** — one row per module: module name, `NN% linked` right-aligned, horizontal bar (linked fill = bg-action, remainder = muted track). Derived: for each module, reqs with ≥1 trace link ÷ module's req count. Modules with 0 requirements are omitted. Legend "Linked / Unlinked" top-right.

**Row 3 — 2 cards:**
- **Recent Activity** — up to 8 requirements sorted by `updatedAt` desc: `CREATED`/`EDITED` badge, `reqId` + truncated text, relative time ("2h ago"; from `updatedAt`, plain local diff, no library). Row click = existing `openRequirement`.
- **Critical Trace Gaps** — cards for up to 5 High-priority unallocated requirements: `reqId`, priority badge, requirement text (italic fallback em-dash when empty). Card click = `openRequirement`. Panel footer button "Open Traceability Matrix" → `setActiveTab('traceability')`. Empty state: "No high-priority requirements are unallocated."

## Components & data flow

- `src/renderer/src/components/Dashboard/stats.ts` — extend pure `computeStats(requirements, elements, links, modules)` (NOTE: signature gains `modules: Module[]`):
  - existing fields keep working (`totalRequirements`, `totalObjects`, `coveragePct`, `unallocated`, `byStatus`, `byPriority`, `byType`, `recent`)
  - new: `createdThisWeek: number` (needs `now` injectable for tests), `subsystemCount: number`, `perModule: { moduleId; name; total; linked; pct }[]`, `criticalGaps: Requirement[]`
- `src/renderer/src/components/Dashboard/index.tsx` — rewritten layout; small local components (KpiCard, DonutCard, ModuleBarsCard, ActivityCard, GapsCard). Store consumption unchanged plus `modules` and `setActiveTab`.
- No store changes (verified: `modules` is loaded into the store on project open — store/index.ts:110-111 — so Dashboard just reads it alongside `setActiveTab`).

## Testing

- TDD on `stats.ts` additions: createdThisWeek boundary (7 days, injectable now), perModule math incl. zero-req module omission, criticalGaps filter, subsystemCount.
- Component tests (mocked store, existing pattern): KPI values render, donut legend renders statuses, module bars render names+pct, gap card click calls `openRequirement`, traceability button calls `setActiveTab('traceability')`, empty states.
- Live check via Playwright driver after build: visual layout, click-throughs.

## Error handling / edge cases

- Empty project → keep existing "Open or create a project" state.
- 0 requirements → donut renders empty track with "0 ACTIVE"; coverage 0%; module card shows "No requirements yet."
- Division by zero guarded in perModule/donut math (same pattern as coveragePct).
