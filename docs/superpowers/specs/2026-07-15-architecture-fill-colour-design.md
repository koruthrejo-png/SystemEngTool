# Architecture Top Bar — Phase 2: Object Fill Colour — Design

**Item 29, Phase 2.** Parent spec: `docs/superpowers/specs/2026-07-15-architecture-top-bar-design.md` (§5.1, §5.5, §9). Phase 1 shipped `72f95ad` + `3dcdb35`.

Ships the user's item 2: an object body can take a fill colour, chosen from a preset palette or a native picker, in the `Style ▾` popover Phase 1 built.

---

## 1. Ground truth (verified 2026-07-15 against this worktree)

Every claim below was read from the code, not carried over from the parent spec. The parent spec's headline finding turned out to be false (see its §1 correction), so nothing here is inherited on trust.

| Fact | Location | Status |
|---|---|---|
| Object body is hardcoded `bg-white` on the frame | `BlockNode.tsx:28` | ✅ as parent spec says |
| Header paints its own opaque `headerColor` over the frame | `BlockNode.tsx:39` | ✅ so fill reads as *body* |
| Container body overlays `bg-workspace/60` when `childCount > 0` | `BlockNode.tsx:59` | ✅ see §4 |
| `ELEMENT_PROP_KEYS` has no `fillColor` | `store/index.ts:22` | ✅ adding it buys undo free |
| `Style ▾` popover shell exists, writes on change | `index.tsx:123-147` | ✅ Phase 1 |
| `addColumnIfMissing` precedent for element columns | `migrations.ts:209-213` | ✅ item 22/27 shape |
| `updateElement` NULL-preserving idiom | `elements.ts:72-84` | ✅ see §3 — load-bearing |

### 1.1 — Two corrections to the parent spec

**§5.1's "naming reckoning" is already done.** It calls for renaming the UI label `Color` → `Border`. Phase 1 shipped the picker already labelled `Border` (`index.tsx:128`). No work remains. The `color` *column* keeps its name, as §5.1 says — that part stands.

**§5.5's stated rationale for the palette is wrong, and the palette survives anyway.** §5.5 claims the palette "is the answer to §5.1's legibility problem — pick the presets to be readable under the header, without a contrast algorithm." Two problems:

1. **Border and fill have opposite constraints.** Border paints the header, which carries **white bold text** (`:40`) → border must be *dark*. Fill paints the body, which carries **dark ink text** → fill must be *light*. One shared palette cannot serve both. §5.5 assumes it can.
2. **No usable fill clears AA against `text-ink-faint` anyway.** The token is `#64748b` (`tailwind.config.js:11`). Measured contrast against candidate pale fills: **4.05–4.28:1**, all below AA's 4.5. But **today's plain white body is already only 4.76:1** — the token is marginal on white before any fill exists. The palette cannot fix a problem that starts in the token.

**And the problem is narrower than §5.1 thinks.** The body text renders **only in the `!named` branch** (`:60-65`). A *named* block's body is empty — there is no text on the fill at all. Fill legibility bites only unnamed blocks, which are transient by construction (you name them).

**The palette is still RECOMMENDED**, on the two arguments that survive:
- **Border/white-header legibility** — real and permanent; white text is always on the header.
- **Consistency** — §5.5's own second argument: "a free-form picker across 40 blocks produces 40 near-identical blues." This is the stronger case and it was always the better one.

### 1.2 — A live bug in Phase 1, in the code this phase opens

`index.tsx:132` sets the border picker's `value={el.color ?? '#ffffff'}`. `BlockNode.tsx:23` renders `d.color ?? NAVY`. On an uncoloured object the swatch shows **white** while the block draws **navy** — the picker misreports the current colour. Fix to `?? NAVY` as part of this phase; it is three lines from the Fill field being added.

`NAVY` is currently declared in `BlockNode.tsx:19` and needed by the picker too. Export it once rather than writing `#1a365d` a third time. (It also duplicates `navy.DEFAULT` in `tailwind.config.js:7` — out of scope; noted only so nobody thinks it went unnoticed.)

---

## 2. Scope — settled by user decision

**Fill is per-object only.** No type inheritance in this phase.

The parent spec's B1 argues, correctly, that colour on an architecture diagram should encode a *category*: "A systems engineer does not want to hand-colour forty boxes. They want all sensors to look alike." That argument applies to fill at least as hard as to border — fill is the largest colour surface on a block.

It is nonetheless **deferred to Phase 3 (B1) on purpose**, so the inheritance question is answered **once, for border and fill together**, rather than half-answered now for fill alone. Phase 2 stays what §9 promised: *one column, no new concepts*. B1's real cost is no longer "one line" (see the parent spec's §1 correction — `element_types.color` is never populated and there is no type-colour editor), which is exactly why it deserves its own phase rather than being smuggled into this one.

**Consequence, accepted:** every fill set in Phase 2 is a literal hex that will win over any type colour B1 later introduces. §5 mitigates this for fill via the ✕/None swatch. It is **not** mitigated for border — see §7.

---

## 3. Data, types, store

**DB** (`migrations.ts`, alongside `:209-213`):
```ts
addColumnIfMissing(db, 'architecture_elements', 'fill_color', 'TEXT')
```
Nullable, no backfill. NULL renders white, so every existing block is byte-for-byte unchanged on screen. Exactly the item 26 shape.

**Handler** (`elements.ts`):
- `rowToElement`: `fillColor: row.fill_color ?? null` (mirrors `lineStyle` at `:13`).
- `updateElement`: add `fill_color = ?` to the `UPDATE`, bound as:
  ```ts
  'fillColor' in input ? (input.fillColor ?? null) : existing.fill_color
  ```

> **This idiom is load-bearing — do not simplify it to `input.fillColor ?? existing.fill_color`.** The `in` form is the only one that can write NULL; the `??` form (used for `name`, `posX` at `:73`, `:79`) treats an explicit `null` as "not supplied" and keeps the old value. The ✕/None swatch (§5) sends `{ fillColor: null }` and depends entirely on this. The parent design's item 22 hit the same seam.

- `createElement`: **no change.** New elements get NULL fill = white = today's appearance. No create-time fill parameter (`CreateElementInput` gains nothing) — a caller has never needed one, and the parent spec's §6 notes the equivalent gap on connections as a known, unexercised nit.

**Types** (`src/types/index.ts`):
- `ArchitectureElement.fillColor: string | null` (beside `lineStyle`, `:192`)
- `UpdateElementInput.fillColor?: string | null` (beside `:261`)

**Store** (`store/index.ts:22`): add `'fillColor'` to `ELEMENT_PROP_KEYS`.

```ts
const ELEMENT_PROP_KEYS = ['name', 'color', 'elementTypeId', 'description', 'blockId', 'lineStyle', 'fillColor'] as const
```

**Undo/redo then works with no further code** — `updateElement` filters `ELEMENT_PROP_KEYS` to build its capture (`:607`). This is precisely how item 26 got undo for `lineStyle`. No new IPC, no preload change.

---

## 4. Render

**`BlockNodeData`** gains `fillColor: string | null`. `nodes.ts` passes `el.fillColor` through when building node data (beside `lineStyle`).

**Frame** (`BlockNode.tsx:26-29`) — `bg-white` moves from `className` to the style object:
```tsx
style={{
  background: d.fillColor ?? '#ffffff',
  borderColor: headerColor,
  borderStyle: d.lineStyle ?? 'solid',
}}
```
The header keeps painting its own opaque `headerColor` over the frame, so the fill reads as the body only. Nothing bleeds through the header.

**Container overlay** (`BlockNode.tsx:59`) — **user decision: fill wins.**

Today the body paints `bg-workspace/60` whenever `childCount > 0`. Left alone, a fill would render two different ways: full strength on a leaf, washed to ~40% once the block contains a child — so nesting a child into a filled block visibly drains its colour, and with pale swatches drains it to nearly nothing. The drop zone stays legible on its dashed border alone, which reads fine over a pale fill:

```tsx
className={`px-3 py-2 flex-1 min-h-0 ${
  d.childCount > 0
    ? 'm-1 rounded border border-dashed border-line' + (d.fillColor ? '' : ' bg-workspace/60')
    : ''
}`}
```

A container's fill now looks the same as a leaf's. The overlay still applies to unfilled containers, so nothing changes for existing diagrams.

---

## 5. The palette

**New module `ArchitectureCanvas/swatches.ts`** — data only, no logic:

```ts
export const NAVY = '#1a365d'

export type Swatch = { name: string; border: string; fill: string }

export const SWATCHES: Swatch[] = [
  { name: 'Navy',   border: NAVY,      fill: '#e8eef6' },
  { name: 'Slate',  border: '#475569', fill: '#eef1f5' },
  { name: 'Teal',   border: '#0f766e', fill: '#e3f3f1' },
  { name: 'Green',  border: '#3f6212', fill: '#eef4e4' },
  { name: 'Amber',  border: '#a16207', fill: '#fbf2e0' },
  { name: 'Red',    border: '#9f1239', fill: '#fbe9ee' },
  { name: 'Purple', border: '#6b21a8', fill: '#f3e9fb' },
  { name: 'Grey',   border: '#3f3f46', fill: '#f1f1f2' },
]
```

Its own module because the codebase puts pure units in their own file with a test, however small — `barMode.ts` is 10 lines and has `barMode.test.ts`. `index.tsx` is already 441 lines with 11 components; the colour data does not belong buried in it. `NAVY` lives here because both `BlockNode` and the border picker need it (§1.2).

**One hue list, two shades.** Border renders the dark column, Fill the pale column of the same hue. Both legible by construction, and a teal-bordered block with a teal fill visibly matches — so the palette does §5.5's consistency job rather than its (unachievable) legibility one.

**Measured**, WCAG relative luminance, all 8 hues:

| | contrast | AA 4.5:1 |
|---|---|---|
| every `border` vs white header text | 4.92:1 – 12.14:1 | ✅ pass (Amber tightest) |
| every `fill` vs `ink-faint` body text | 4.05:1 – 4.28:1 | ❌ — as does white (4.76:1 is the ceiling; see §1.1) |

**UI** — in `ObjectStyleMenu`, a `Swatches` row above each existing picker. Inline in `index.tsx` (~40 lines); it has exactly one consumer, so a separate component file would be an abstraction for one caller.

One component serves both rows, differing only in which shade it reads and whether it offers the clear chip:

```tsx
function Swatches({ shade, label, clearable, onPick }: {
  shade: 'border' | 'fill'
  label: string
  clearable?: boolean
  onPick: (hex: string | null) => void
}): JSX.Element

// Border: <Swatches shade="border" label="Border" onPick={(c) => updateElement(el.id, { color: c })} />
// Fill:   <Swatches shade="fill" label="Fill" clearable onPick={(c) => updateElement(el.id, { fillColor: c })} />
```

`label` prefixes each chip's `aria-label` (`"Border Teal"`, `"Fill Teal"`). It is not decoration: both rows render the same hue names, so a bare `aria-label="Teal"` would appear twice and make `getByRole` ambiguous.

`onPick` passes `null` only from the ✕ chip, which is why its type is `string | null` and why `clearable` gates it. Deliberately **not** selection-aware: it takes no `value` and renders no "currently chosen" ring. The native picker beneath already shows the current colour, and a chip can't reliably indicate selection anyway once the native picker can set a hex no chip holds. Add a selected state only if the absence is felt.

```
Border   [■][■][■][■][■][■][■][■]        ← dark column, writes color
         [ native picker ]

Fill     [✕][□][□][□][□][□][□][□][□]     ← pale column, writes fillColor
         [ native picker ]
```

- A swatch chip writes on change, no local state — matching Phase 1's `ObjectStyleMenu` idiom (`:133`).
- The **✕ chip is Fill-only** and writes `{ fillColor: null }` (§7 records why Border does not get one).
- Chips carry `title` + `aria-label` of the hue name, so the palette is reachable by name in tests and by screen readers. They are `<button type="button">` — not the `<div onClick>` the tree/nav rows use, so this adds nothing to the batched a11y backlog.
- The native `<input type="color">` stays under both, for a colour the palette lacks. It already falls under the `isTyping` Cmd+Z carve-out (`index.tsx:69`); a `<button>` chip does not need one.

---

## 6. Testing

**Honest constraint first, per the parent spec's §8.** 10 test files / 52 tests fail with `ERR_DLOPEN_FAILED` — `better-sqlite3` is built for Electron's `NODE_MODULE_VERSION 125`, the runner's node is `127`. Pre-existing, tracked as **item 23**, re-confirmed 2026-07-15. **The `fill_color` migration, the `rowToElement` mapping and the `updateElement` passthrough therefore ship with zero automated coverage**, exactly as items 26 and 27 did. Do not write migration or handler tests: they fail on arrival and rot unread. Live-verify is how backend work is proven in this repo.

**What is genuinely testable, and worth testing:**

- **`swatches.test.ts` — the legibility contract.** For every swatch: `contrast(border, '#ffffff') >= 4.5`. This is the invariant that matters and the one a future hand will break by pasting in a pretty colour. A ~6-line WCAG luminance helper in the test file; no dependency. **Do not** assert `fill` against AA — §1.1 measured that no fill can pass, white included; asserting it would encode a falsehood and fail on arrival. Assert `fill` luminance `> 0.8` instead — "pale", the property actually being relied on.
- **`BlockNode.test.tsx`** — fill renders as the frame background; NULL fill renders white; a container (`childCount > 0`) with a fill keeps its fill and drops the overlay; a container without one keeps the overlay.
- **`nodes.test.ts`** — `fillColor` reaches `BlockNodeData`. `nodes.ts` has coverage already.
- **`index.test.tsx`** — clicking a Fill swatch calls `updateElement` with that hex; clicking ✕ calls it with `null` (the case the `in`-idiom of §3 exists for).
- **Store** — `fillColor` edit pushes one undo entry and undoes. `connectionStyle.test.ts` is the model.

**Regression to hold:** the parent spec's §5.3 decision — `Type ▾` stays in the bar (settled 2026-07-15, `ce42251`). Phase 2 adds a Fill field to the `Style ▾` popover, not the bar, so bar width is unaffected. The bar had 285px of slack at 1500px.

---

## 7. Out of scope

- **Type-inherited fill or border (B1)** — Phase 3, deliberately (§2). It is not a one-liner; the parent spec's §1 correction shows `element_types.color` is never populated and no type-colour editor exists.
- **A ✕/None clear on Border** — user decision: Fill only. **Known consequence:** `color` keeps having no NULL path, so B1 will meet hand-set border colours that refuse to inherit. That is B1's to solve, and the parent spec's §6 already says so out loud ("existing hand-set `el.color` values keep winning").
- **Renaming the `color` column** — parent §5.1, still no.
- **Auto-contrast / computed text colour on fill** — parent §5.1 says don't, and §1.1 shows the palette makes it moot: named blocks carry no body text at all.
- **Fixing `ink-faint`'s 4.76:1 on white** — a real, pre-existing token-level a11y issue this phase surfaced but did not cause. Belongs with the batched a11y pass, not here.
- **Fill on connections** — connections are lines; there is nothing to fill.
- **Font size (§5.6), snap (B2), duplicate (B3), align & distribute (B4), export** — later phases / own items.

## 8. Live-verify plan (item 23 — this is how the backend is proven)

Against the `thermal` dev project, via `.claude/skills/run-app/driver.mjs` at 1500px:

1. Select an object → `Style ▾` shows a Border row (8 chips + picker) and a Fill row (✕ + 8 chips + picker).
2. Click the Teal fill chip → body paints pale teal; the header keeps its own colour; `SELECT fill_color` shows `#e3f3f1`.
3. Cmd+Z → fill reverts, one step. Cmd+Shift+Z → returns.
4. Click ✕ → body returns to white; `SELECT fill_color` shows **NULL**, not `#ffffff`. (The §3 `in`-idiom check.)
5. Nest a child into a filled block → fill stays at full strength, dashed drop zone still legible over it.
6. Set a Border chip on an uncoloured object → picker swatch and rendered border now agree (the §1.2 bug).
7. Relaunch → fill persists; untouched legacy objects still render white.
