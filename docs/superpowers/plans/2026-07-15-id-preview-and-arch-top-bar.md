# Plan — ID preview + digits default, drag whole sections, architecture top bar

Date: 2026-07-15. Follows the 2026-07-15 testing pass that produced backlog items 24-29
(24-27 shipped; 28-29 open). Item 21 was confirmed working by the user this session and is
now fully closed.

## Batch 1 — ID digits default + live preview (new backlog item 30)

**Why.** The unlabelled digit field read as a mystery box (fixed in item 24 with a "Digits"
label). Two follow-ons from the user: default it to **1**, not 4, and show what the minted ID
will actually look like *before* they hit Add.

**Decisions (from the user, this session):**

| Question | Answer |
|---|---|
| Field fate | Default 1, **keep it editable** — `SRS-001` stays reachable for big modules |
| Existing modules | **Leave alone.** No migration. Only new modules default to 1 |
| DB default | Stays `4` — see below |

**Scope — `src/renderer/src/components/ModuleTree/NewModuleForm.tsx` only.**

1. `useState(4)` → `useState(1)` (line 16).
2. Add a preview line under the prefix/digits row, visible only when `kind === 'module'`.

**The preview string must be derived exactly as the backend derives it**, or it lies. The
generator is `src/main/handlers/requirements.ts:37`:

```ts
const reqId = `${mod.id_prefix}-${String(mod.next_counter).padStart(mod.id_padding, '0')}`
```

So the preview is `` `${prefix.trim().toUpperCase()}-${String(1).padStart(padding, '0')}` ``.
Three details that are easy to get wrong:

- **Uppercase it.** `handleSubmit` (line 28) does `prefix.trim().toUpperCase()`. A preview
  showing lowercase `srs-1` would be wrong the instant they type lowercase.
- **Counter is always 1** for a new module (`createModule` inserts a literal `1`); the form
  does not expose `next_counter`.
- **The hyphen is hardcoded** in the template. A prefix that already ends in `-` yields a
  double hyphen — the live `thermal` project has exactly this (`SRS-TRS-` → `SRS-TRS--8`).
  The preview should show that honestly rather than paper over it; it makes a real
  data-entry trap visible for the first time.

Empty prefix → show nothing (or a muted hint). Do not fabricate a fake `SRS`, which would
imply an ID the module will not mint.

**Why the DB default stays 4:** `id_padding INTEGER NOT NULL DEFAULT 4`
(`migrations.ts:24`) backfills existing rows and serves any insert path that omits the
field. Changing it would alter behavior for existing modules, which the user explicitly
ruled out. The form default and the column default are independent; only the form changes.

**Tests:** extend `NewModuleForm.test.tsx` — default is 1; preview tracks prefix + digits;
preview uppercases; preview hidden for Folder.

## Batch 2 — Drag whole sections (backlog item 28)

**Why.** Users can drag a requirement into a section, but a section itself can only be moved
by ↑/↓ within its own parent. Reorganising an outline means moving items one at a time.

**The good news, verified:** descendants need **no** explicit move. Parentage is
`req_headings.parent_id` / `requirements.heading_id` FKs, so children follow their parent
automatically and `buildOutline` (`RequirementsList/outline.ts:15-16`) re-nests on the next
render. The inverse case proves it — `deleteHeading` (`headings.ts:70-82`) *must* touch
descendants explicitly precisely because it removes the parent they point at.

**The bad news:** this is missing at **every** layer.

| Layer | Today | Needed |
|---|---|---|
| UI | heading rows are drop targets only, no `draggable` | drag a heading, drop on another heading / top level |
| Store | `moveHeading(id, direction)` only | a re-parent action |
| IPC | `headings:move` (up/down) only | a re-parent channel + preload binding |
| DB | `updateHeading` writes `title` only; `moveHeading` swaps sibling `position` scoped by `parent_id IS ?` | set `parent_id` + `position`, cycle-guarded |

**Critical guard — cycles.** A heading must not become its own descendant. `moveModule` in
`src/main/handlers/modules.ts` already solves this exact problem for the folder tree
(`assertFolderParent` is called *after* its cycle guard) — **read it and follow it**, do not
invent a new approach. `buildOutline` is already cycle-guarded (`outline.ts:23`) but that is
a render-time safety net, not a substitute for rejecting the write.

**Reuse, do not rebuild:** drag state (`dragReqId`/`dragOverKey`), the native HTML5 DnD
handlers, and the `ring-2 ring-inset ring-action` drop feedback all already exist in
`RequirementsList/index.tsx:51-52, 214-217`. No DnD library — the codebase deliberately has
none (item 18).

**Known constraint:** Playwright cannot fire native HTML5 drag events, so this is
unit-testable only — same as item 18. Say so; do not claim live-drag verification.

## Batch 3 — Architecture top bar (backlog item 29) — DESIGN ONLY, NO CODE

**Why design-first.** The user selected all four sub-features *and* asked to "brainstorm
other useful tools to be in this panel that will help users." What belongs in a toolbar is a
product decision, and an agent guessing at it cold would produce exactly the speculative
scaffolding this codebase avoids. So this batch produces a **spec for the user to choose
from**, and ships no code.

Confirmed in scope: object label font; object fill colour; relocating existing controls
(colour, type, line style) into the top bar; connector styling in the top bar too. Plus
brainstormed candidates for the user to accept or reject.

Facts the design must respect:

- `color` today drives **borderColor + header only** (`BlockNode.tsx:21-27`); the body is
  hardcoded `bg-white`. "Fill colour" is therefore a *new* concept, not a re-use.
- Object label is a hardcoded `text-[11px]` with `truncate` (`BlockNode.tsx:43`).
- Item 25 already moved Layers into the top bar — that popover is the pattern to follow.
- The `layers` table has **no colour column**; the `● ◐ ○` dots are visibility glyphs.
- Item 26/27 both added element columns. Any further element columns follow
  `addColumnIfMissing` (`migrations.ts:204`).
- **Selection-dependent controls need a resolved story:** the top bar is global chrome, but
  colour/font/line-style act on a *selection*. Disabled-when-nothing-selected vs
  contextual-swap is the central design question — name a recommendation.

Output: `docs/superpowers/specs/2026-07-15-architecture-top-bar-design.md`.

## Execution

Three agents, three worktrees, in parallel. File overlap is nil: batch 1 is
`NewModuleForm.tsx`; batch 2 is `RequirementsList/index.tsx` + headings/store/preload/types;
batch 3 writes a doc.

## Verification

`npm run typecheck && npm run test` per worktree, then on the merged tree.

**Standing constraint — do not re-litigate:** 10 test files / 52 tests fail with
`ERR_DLOPEN_FAILED` (better-sqlite3 is an Electron-ABI-125 binary; the test runner's node is
127). Pre-existing, tracked as item 23, re-confirmed 2026-07-15 against a fresh Node 22.23.1.
`electron-rebuild` for node would fix the suite and **break the app**. Batch 2's DB layer is
therefore unit-testable at the pure-logic level only.

Then `npm run dev` and drive it:
- `+ New` → Module: digits defaults to 1, preview tracks typing, uppercases, hides for Folder.
- Drag a section with children onto another section; children follow; reload; try to drop a
  section onto its own descendant and confirm it is refused.
