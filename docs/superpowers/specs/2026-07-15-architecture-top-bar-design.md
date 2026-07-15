# Architecture Top Bar — Design

**Backlog item 29** (`docs/superpowers/specs/2026-07-02-ui-overhaul-design.md` §6). Design date 2026-07-15. Batch 3 of `docs/superpowers/plans/2026-07-15-id-preview-and-arch-top-bar.md` — **design only, no code**.

The user's direction: *"have all features for the architecture section in the top bar where the object button is"*, plus *"we need to refine this section at a later date with more features like font changer colours etc."*

That second sentence is the more important one. It says the bar is not a fixed list of controls — it is a **container that will keep growing**. Every decision below is made against that, not against today's four items.

**This spec is a menu.** Each sub-feature in §5 is independently approvable. §6 phases them. §7 lists what this design recommends *against* building, including one item from the user's own list.

## 1. Ground truth (verified 2026-07-15, against this worktree)

Everything the brief for this design asserted was checked. Three corrections:

| Claim | Verdict |
|---|---|
| `color` drives borderColor + header only; body is hardcoded `bg-white` | **Confirmed.** `BlockNode.tsx:23` `headerColor = d.color ?? NAVY` (`NAVY = '#1a365d'`), applied at `:27` (`borderColor`) and `:39` (`background`). The frame's `bg-white` at `:28` is hardcoded. **Fill colour is a new concept, not a re-use of `color`.** |
| Label is a hardcoded `text-[11px]` with `truncate` | **Confirmed** — `BlockNode.tsx:45` (brief said `:43`). It sits in a `flex items-baseline gap-2 min-w-0` span alongside `typeName` and `blockId`, inside a header row that also carries the right-hand badge cluster. Truncation is real and a bigger font truncates sooner. |
| Top bar is a plain flex row outside the React Flow tree | **Confirmed** — `ArchitectureCanvas/index.tsx:261-282`. `<div className="relative z-10 flex items-center gap-2 px-4 h-12 bg-white border-b border-line shrink-0">`, a sibling of the `<ReactFlow>` container, not a RF `<Panel>`. |
| Item 25 put Layers in the bar as the pattern to follow | **Confirmed** — `LayersMenu` at `index.tsx:56-83`. **Correction:** the brief said Layers sits *after* the divider. It sits *before* it. Order is `+ Object` → `Layers ▾` → divider → undo/redo → `ml-auto` hint. |
| Items 26/27 added element columns via `addColumnIfMissing` | **Confirmed** — `migrations.ts:207` (`architecture_elements.line_style`), `:211-212` (`pre_nest_width` / `pre_nest_height`). |
| `layers` has no colour column; `● ◐ ○` are visibility glyphs | **Confirmed.** Not proposed here. |
| ElementPanel's colour control is a bare `<input type="color">` | **Confirmed** — `ElementPanel/index.tsx:96-97` (brief said `:93-95`). |

### The discovery: `element_types.color` already exists and is dead

`ElementType.color: string \| null` is in the schema and in `src/types/index.ts:164`. Across the whole renderer it is read in **exactly one place**: `ArchitectureCanvas/ComponentLibrary.tsx:31`, a swatch — and `ComponentLibrary` **is not mounted anywhere**. It is imported only by its own test.

`nodes.ts:119` builds a `Map` from `elementTypes` and takes `t.name` from it, never `t.color`. `nodes.ts:154` passes `color: el.color` straight through.

So the canvas already has a populated per-type colour column and throws it away. This changes the ranking in §5 — see **B1**.

## 2. The central problem: global chrome, per-selection controls

The bar is global. Colour, fill, font, line style and arrow markers all act on a **selection**. `selectedElementId` and `selectedConnectionId` are mutually exclusive (`store/index.ts:581`, `selectElement` nulls the other), so there are exactly three states: nothing, object, connection.

### Options considered

**(A) Always show everything, disable what doesn't apply.** Every control visible at all times, greyed when inapplicable. Rejected. With object border + fill + font + line style + arrow start + arrow end, that is six-plus controls permanently occupying the bar, and the majority of them are greyed in *every* state — an object selection greys both arrow controls forever, a connection selection greys fill and font. A permanently-greyed control does not teach; it just occupies. And §3 shows the room isn't there.

**(B) Contextual swap — the whole bar changes with selection type.** What Office/Figma/Visio do. Rejected in its pure form because it would take `+ Object` and undo/redo away when a connection is selected. Those are global actions and must never move.

**(C) Split — a fixed global segment, plus a contextual segment that appears with the selection.** **Recommended.**

### Recommendation: (C) Split

```
┌──────────────────────────────────────────────────────────────────────────┐
│ + Object   Layers ▾  │  ↶ ↷        [contextual]        <hint / ml-auto>  │
└──────────────────────────────────────────────────────────────────────────┘
   ─── global, never moves ───        ─── swaps ───      ─── never moves ───

  nothing selected  →  (contextual segment absent; hint reads as the empty state)
  object selected   →  Style ▾          (border, fill, line style, font)  Type ▾
  connection sel.   →  Style ▾          (line style, arrow start, arrow end)
```

**The reason this works is anchoring, and it is worth stating explicitly because it is what kills the usual objection to contextual bars.** The normal complaint is layout thrash — controls jumping under the cursor on every click. That cannot happen here: the global segment is left-anchored and the hint is already `ml-auto` right-anchored (`index.tsx:281`). The contextual segment grows and collapses in the slack *between* two things pinned to opposite ends. Nothing that was on screen before the click moves after it.

**Nothing-selected: collapse, do not reserve.** Reserving a fixed-width placeholder buys nothing here (nothing would move anyway — see above) and costs a strip of dead bar in the app's most common state. The existing hint (`"Drag from a block's edge to connect"`) already reads as the empty state and needs no change.

Selection-type dispatch is one pure function — `barMode(selectedElementId, selectedConnectionId): 'none' | 'object' | 'connection'` — which makes the central decision of this spec the one thing in it that is trivially unit-testable. See §8.

## 3. Real estate, and why the contextual segment is a popover

The bar is `h-12`, `px-4`, `gap-2`, and already holds five things. It is not empty and the app is not full-screen-only.

**Every contextual control lives inside a single `Style ▾` popover per selection type — not inline.** So the bar grows by exactly **one button** (two, if Type moves up — see §5.3), regardless of how many controls the popover ends up holding.

Three reasons, in order of weight:

1. **The user has already said the bar will keep growing** ("refine this section at a later date with more features"). Inline controls make each new feature a new negotiation over horizontal space. A popover makes the bar cost *constant* as the control list grows. This is the decisive argument: the requirement is a growing container, so pick the container that grows.
2. **The shell already exists and is proven.** `LayersMenu` (`index.tsx:56-83`) is trigger + anchor + dismiss and nothing else: `relative` wrapper, `absolute top-full left-0 mt-1 z-20`, outside-`mousedown` close, Escape close with the documented `HTMLInputElement` carve-out. A `Style ▾` popover is the same shell with different contents. Item 25 proved it against the canvas; `z-20` on the bar's `relative z-10` already clears React Flow.
3. **The controls being moved are already vertical `Field` + `Select` stacks** (`ElementPanel:99-109`, `ConnectionPanel:92-124`). In a popover they move nearly as-is. Inline in a 48px-tall bar they would each need a redesign into an icon control.

**Cost, stated honestly:** one extra click versus an inline swatch. Colour is the most-used control and it pays that click every time. This is a real regression against a hypothetical inline swatch — but not against today, where the control is in a drawer that only opens on selection anyway. The click count from "object selected" to "colour changed" is unchanged; the drawer stops being needed for it.

Escape inside the Style popover needs the same carve-out as `LayersMenu`, for the same reason: `<input type="color">` is an `HTMLInputElement`, and the existing guard already skips those targets. Reuse it verbatim; do not invent a second dismiss rule.

## 4. Where the bar/drawer line falls — and why

*(If all styling moves up, what is `ElementPanel` for? A half-migrated UI — some styling up top, some in a drawer — is worse than either extreme. So: a position.)*

**Position: the styling controls move up and are deleted from the drawer. The drawer survives, narrowed.** No mirroring, no duplication, no "also available in".

The tempting split rule is *"the bar is how it looks, the drawer is what it is."* Reject it — it breaks immediately on Type, which is semantics by that rule but which the user explicitly asked to move up. A rule that needs an exception on its first case is not a rule.

**The rule that actually predicts the whole set:**

> **The bar holds attributes you change repeatedly across many objects in one sitting. The drawer holds attributes you author once per object.**

| | Bar | Drawer |
|---|---|---|
| Border colour, fill, line style, font | ✓ swept across many objects while tidying a diagram | |
| Type | ✓ reclassify a run of blocks in one pass | |
| Name, Description | | authored once, per object, at the keyboard |
| Requirement links | | a search-and-pick task needing room to breathe |
| Layer membership | | per-object bookkeeping |
| Delete | | destructive; wants distance, not a toolbar |

This rule is falsifiable, it covers Type without special-casing, and it explains why Name stays down even though it is the most-edited field of all — editing a name is a keyboard task on one object, not a sweep across twenty.

**Resulting `ElementPanel`:** header (blockId + Delete), Name, Type*, Description, Requirements, Layers. It stops being a styling surface and becomes what it always mostly was — the deep-properties drawer. It loses two fields (Color, Line style) and is still the only home for the requirements picker, which is the single most systems-engineering-specific thing in the whole app and could never live in a popover.

*Type appears in both rows above because it is the one genuine judgement call; see §5.3.

**`ConnectionPanel`** loses Line style / Arrow start / Arrow end and keeps Name, Type, Description, Custom Fields, Requirements, Layers.

**Do not extract a shared `<StyleControls>` component for bar and drawer to share.** After the move there is exactly one consumer. An abstraction with one implementation is the thing this codebase deliberately does not do.

## 5. Sub-features — approve or reject each independently

### 5.1 — Object fill colour · **RECOMMEND**

The object body is hardcoded `bg-white` (`BlockNode.tsx:28`). Fill is genuinely new.

**Naming reckoning, unavoidable.** `color` today means *border + header*. Adding a fill makes the bare label `Color` ambiguous. Rename the UI label to **`Border`** (or `Accent`); **do not rename the `color` column** — a migration across handlers, types, store keys and tests for zero user-visible gain.

**DB:** `addColumnIfMissing(db, 'architecture_elements', 'fill_color', 'TEXT')` — nullable, no backfill. NULL renders as today's white. Exactly the item 26 shape.

**Types:** `ArchitectureElement.fillColor: string | null`, `UpdateElementInput.fillColor?: string | null`.

**Store:** add `'fillColor'` to `ELEMENT_PROP_KEYS` (`store/index.ts:22`) → **undo/redo for free**, the same way item 26 got it for `lineStyle`.

**Render:** `BlockNode.tsx:28`'s `bg-white` becomes `style={{ background: d.fillColor ?? '#ffffff' }}` on the frame. Note the container branch at `:59` paints its own `bg-workspace/60` inner region when `childCount > 0` — a container's fill will read through only at its margin. That is correct (the dashed drop zone must stay legible) but should be seen before it surprises someone.

**Legibility:** a dark fill under `text-ink-faint` unnamed-block text is unreadable. Do not build auto-contrast — offer a **small swatch palette plus the native picker**, which is what a preset palette is *for*. See §5.5.

### 5.2 — Move border colour + line style up · **RECOMMEND**

Pure relocation. `ElementPanel:95-109` → the Style popover. No DB, no types, no store. `lineStyle` already flows through `updateElement`; `color` already round-trips. The drawer's colour state (`useState` + `onBlur` save at `:96-97`) does not come with it — in the popover, write on change like the Type select at `:80-84` already does, matching the item 22 idiom.

### 5.3 — Move Type up · **RECOMMEND, with the reservation stated**

The one judgement call. Type is semantics, not appearance — but the §4 rule puts it in the bar on frequency, and the user asked for it.

Two things make it more defensible than it first looks: reclassifying a run of blocks is a real sweep task, and if **B1** ships, Type *becomes* a styling control in fact — picking a type would pick a colour.

**Reservation:** Type in the bar as its own `Type ▾` trigger is the bar's second new button, and it is the one to drop first if the bar feels crowded in the flesh. Alternative: put Type *inside* the Style popover — cheaper on space, but it puts a semantic field under a menu labelled "Style", which is the kind of small lie that costs a support question later. **Recommend its own trigger; drop it back to the drawer if the bar is tight.**

### 5.4 — Connector styling up · **RECOMMEND**

`ConnectionPanel:92-124` → the connection-mode Style popover. Three selects, no DB, no types, no store — `lineStyle`/`markerStart`/`markerEnd` are already in `CONNECTION_PROP_KEYS` (`store/index.ts:23`). This is the cheapest item on the list and it is what makes the split model *pay*: without it, selecting a connection would leave the contextual segment empty and the whole model would look like scaffolding.

### 5.5 — A preset swatch palette · **RECOMMEND (small, and it earns its keep twice)**

Not on the user's list; proposed because two other items need it.

Six-to-eight fixed swatches above the native `<input type="color">` in the Style popover. Why it is not decoration:

- It is the answer to §5.1's legibility problem — pick the presets to be readable under the header, without a contrast algorithm.
- A free-form picker across 40 blocks produces 40 near-identical blues. Consistency is the point of an architecture diagram, and a palette is the cheapest possible enforcement.
- Hardcoded array in the component. No DB, no config, no theming layer. Include `NAVY` (`#1a365d`) as the first swatch, since that is already the default.

### 5.6 — Object label font · **RECOMMEND AGAINST as specified — see §7.1**

The user selected this. It is the one item on their list this design pushes back on. Full reasoning in §7.1, because the reasoning is the deliverable. It remains independently approvable — if approved as-is:

- **Family: no.** §7.1.
- **Size:** `addColumnIfMissing(db, 'architecture_elements', 'label_font_size', 'INTEGER')`, nullable, NULL → today's `11`. `ArchitectureElement.labelFontSize: number | null`; add `'labelFontSize'` to `ELEMENT_PROP_KEYS`. `BlockNode.tsx:45`'s `text-[11px]` becomes `style={{ fontSize: d.labelFontSize ?? 11 }}`. Offer three discrete steps (11 / 13 / 16), not a free number — and know that at 16 the `truncate` at `:45` bites sooner, in a header that is already sharing a fixed row with `typeName`, `blockId` and the badge cluster. Bigger text, less text.

## 6. Brainstorm — what else belongs here

Ranked by value-to-effort against a *systems engineering* canvas, not a drawing tool. Four to build, and §7 has what not to.

### B1 — Colour defaults from element type · **build first**

Wire up the dead `element_types.color` (§1). `nodes.ts:119` already builds the type `Map` and takes only `.name` from it; take `.color` too and use it as the fallback: `el.color ?? type.color ?? NAVY`. Per-object colour still wins; it becomes an override rather than the only mechanism.

**Why it is first.** A systems engineer does not want to hand-colour forty boxes. They want *all sensors to look alike* — that is what colour is **for** on an architecture diagram: encoding a category, not decorating a box. Today the app has the category (Type), has the colour column, populates it, renders it in a component nobody mounted, and then makes the user re-derive the mapping by hand forty times.

**Cost:** one line in `nodes.ts`. Zero DB. Zero types. It is the highest value-to-effort item in this entire document by a wide margin, and it is a **precondition for the rest making sense** — per-object colour is an override, and an override needs something to override.

**Two riders, both cheap, both optional:** the type colour needs an editor somewhere (the Component Library UI is written and unmounted — `ComponentLibrary.tsx` — though its swatch is display-only); and existing hand-set `el.color` values keep winning, so nothing changes retroactively. Say that out loud rather than being surprised by it.

### B2 — Snap to grid · **build**

React Flow already does this: `snapToGrid` + `snapGrid={[16, 16]}` on the `<ReactFlow>` at `index.tsx:284`, matching the `Background` gap of 16 already set at `:301`. A toggle in the bar (global — it is a canvas mode, not a selection attribute, so it belongs in the *global* segment beside Layers).

Neat alignment is most of what makes an architecture diagram readable, and this is the cheapest alignment there is: two props and a `useState`. Persisting the toggle is not needed on day one. If it should persist later, it is a view preference, not element data.

### B3 — Duplicate object · **build**

`Cmd+D` and/or a contextual-segment button: copy the selected element's name/type/colour/fill/lineStyle to a new element offset by ~20px. Reuses `addElement`. Building a diagram means making the fifth thing that looks like the first four; today that is `+ Object` then re-set every field.

Fits the existing keyboard effect at `index.tsx:171-191`, which already owns the typing guard (`isTyping`, `deleteKey.ts`). One caveat worth knowing before starting: `addElement` mints a new `blockId` server-side, so a duplicate is a new object with a new ID — correct, but it means "duplicate" cannot round-trip an ID and should not be sold as a clone.

### B4 — Align & distribute · **highest raw value, biggest job — build last, if at all**

Select 2+ objects → align left/centre/right/top/middle/bottom, distribute horizontally/vertically. This is the control a systems engineer actually reaches for, and it is the honest answer to "what's missing from this canvas". It is also the only item here with real prerequisites, and they must be named before anyone starts:

1. **Multi-select does not exist.** `selectedElementId: number | null` (`store/index.ts:581`), and `App.tsx:150-152` keys the drawer off it. React Flow supports box/shift multi-select natively, but the *store* does not, and the §2 selection model assumes exactly three states. Align forces a fourth. This is not a toolbar feature with a store rider — **it is a selection-model change with a toolbar on top**, and it should be scoped as one.
2. **It would not be undoable.** Item 27 established, deliberately, that geometry (`posX/posY/width/height/parentId`) pushes **no undo entry** — that is why the baseline fields were kept out of `ELEMENT_PROP_KEYS`, so a plain drag doesn't create undo commands. Align is a bulk geometry write. A one-click bulk move of twenty blocks that `Cmd+Z` cannot take back is materially worse than no align button. So align needs an undoable-geometry story, which reopens a decision item 27 closed on purpose.
3. Nested children (`fitChildInParent`) would need thinking about — aligning a child inside a container is not the same operation as aligning two root blocks.

**Verdict: right feature, wrong batch.** Approve it as its own backlog item with the multi-select and undo work costed in, not as a line in the top-bar spec. Do not let it ride in on this one.

## 7. Recommended against

### 7.1 — Font family, and per-element font size · the pushback on the user's own list

**Family: no.** A font-family picker on a systems architecture canvas is a way to make a diagram worse. Every object in a different family is noise dressed as information — it encodes nothing, and on a diagram, anything that looks like a signal but isn't is a cost. It also drags in a stack the app doesn't have: a font list, per-platform availability, embedding for export. Serious modelling tools don't offer it; drawing tools do, because a drawing tool has no semantics to protect.

**Per-element size: probably no, and the reason matters.** The need behind "font changer" is almost certainly **legibility** — labels are hard to read, especially zoomed out. If that is the need, per-element size is the wrong instrument:

- It fixes the symptom one object at a time. Twenty unreadable labels is twenty trips to the popover.
- It makes diagrams inconsistent by default. Mixed label sizes read as *emphasis* — a false signal, same trap as family.
- It fights `truncate` (`BlockNode.tsx:45`): the bigger it gets, the less of it you see. A control whose main effect is legibility and whose side effect is truncation is at war with itself.
- It costs a DB column, a type, a store key, and a render change — for a control the user may never touch twice.

**The lazier and more correct instrument is a canvas-wide label size** — S/M/L in the global segment, one number applied to every label. Fixes all twenty labels at once, keeps the diagram consistent, needs **no per-element column** (a view preference; `localStorage`, or a column on `architectures` if it must be shared).

**But do not build that either — yet.** Nobody has hit the wall. Zoom is already there (`CanvasControls`, `index.tsx:25-52`), and zoom is what legibility problems on a canvas are usually solved by. Wait for the complaint, then build the version that matches it.

**If the user wants per-element font size anyway, §5.6 specifies it and it is a small piece of work.** This is a recommendation, not a veto — the user's read on their own workflow beats this document's inference from the code. The spec's job is to make sure the choice is made knowingly.

### 7.2 — Auto-layout (dagre/elk) · no

A new dependency that rearranges the user's diagram. It fights the manual nesting that items 4/27 built deliberately (`fitChildInParent`, `resolveDrop`, pre-nest baselines) — placement in this app is *meaningful*, and an auto-layout pass destroys that meaning in one click. Wrong tool for a canvas where position is authored.

### 7.3 — Shape picker (rounded/hexagon/cylinder…) · no

Type already carries semantics, and B1 gives Type a visual channel. Shape would be a **second, competing** semantic channel — now a hexagonal sensor and a blue sensor might disagree, and the reader has to decide which encoding to trust. One category channel, done well.

### 7.4 — Format painter / copy style · not yet

Only pays with lots of hand-styled objects. If B1 ships, most objects aren't hand-styled — they inherit from Type. Revisit only if B1 lands and people still hand-style everything, which would itself be the more interesting finding.

### 7.5 — Layer colours · no (and it is not small)

`layers` has no colour column and the `● ◐ ○` dots are visibility-state glyphs. Beyond the DB work, it collides head-on with B1: an element in two layers has two colours and a diagram that lies. Colour is already spoken for by Type.

### 7.6 — Canvas export (PNG/SVG) · defer, but note the path

Genuinely valuable — the diagram's destination is usually a review pack. Deferred because it is a feature in its own right, not a toolbar item, and it is out of scope here.

Worth recording before someone reaches for `html-to-image`: **this is an Electron app**, and `webContents.capturePage()` is native, already available, and needs no dependency. If export is ever specced, start from the rung above the library.

### 7.7 — Minimap · no

RF's `<MiniMap />` is a one-liner, which is exactly why it will get proposed. `CanvasControls` (zoom, %, fit-view) already covers navigation, and the minimap costs permanent canvas corner. A one-line feature is still a feature.

## 8. Testing

**Honest constraint first.** 10 test files / 52 tests fail with `ERR_DLOPEN_FAILED` — `better-sqlite3` is built for Electron's `NODE_MODULE_VERSION 125`, the test runner's node is `127`. Pre-existing, tracked as **item 23**, re-confirmed 2026-07-15. **Any new column proposed here (`fill_color`, `label_font_size`) ships with zero automated coverage**, exactly as items 26 and 27 did. Do not propose migration or handler tests: they would fail on arrival and rot unread.

This is a real argument for the phasing in §9 — Phase 1 and B1/B2/B3 add **no columns at all**, so they are the parts of this design that are fully testable today.

**Runs today (renderer/jsdom + pure helpers):**

- **`barMode(selectedElementId, selectedConnectionId)`** → `'none' | 'object' | 'connection'`. Pure, three cases, and it pins §2's central decision. The only new logic worth its own module.
- **Top-bar render tests**, following `ConnectionPanel/lineStyle.test.tsx` and the `LayersMenu` precedent: nothing selected → no `Style ▾`; object selected → `Style ▾` opens a popover with Border/Fill/Line style; connection selected → `Style ▾` opens Line style/Arrow start/Arrow end; each control fires `updateElement`/`updateConnection` with **only** the changed field; outside-`mousedown` and Escape close, with the `HTMLInputElement` carve-out.
- **Drawer tests, updated:** `ElementPanel` no longer renders Color or Line style; `ConnectionPanel` no longer renders the three style selects. This is the test that catches a half-migration (§4) — it is the whole point of writing it.
- **B1:** `nodes.ts` — `el.color` wins; NULL `el.color` falls back to the type's colour; both NULL → `NAVY`. Pure, and `nodes.ts` has test coverage already.

**Typecheck + live-verify only (item 23):** `fill_color` / `label_font_size` migration, `rowToElement` mapping, `updateElement` passthrough.

**Live-verify (`npm run dev`):**
1. Nothing selected → bar shows `+ Object`, `Layers ▾`, undo/redo, hint. No Style.
2. Select an object → `Style ▾` appears; the global segment and the hint **do not move** (this is §2's core claim — verify it, don't assume it).
3. Set fill → body paints; border/header keep the old `color`; relaunch → persists.
4. Select a connection → Style swaps to line/arrow controls; set dashed + filled end → renders.
5. Click empty canvas → contextual segment collapses; nothing else moves.
6. `Cmd+Z` after a fill change → reverts (via `ELEMENT_PROP_KEYS`).
7. Drawer no longer offers Color/Line style; Name/Description/Requirements/Layers still work.
8. B1: give a type a colour → every object of that type takes it; a hand-coloured object keeps its own.

## 9. Phasing

**Phase 1 — the move, no new columns.** §5.2 (border + line style up), §5.4 (connector styling up), §5.3 (Type up), the split model (§2), the `Style ▾` popover shell (§3), drawer narrowed (§4). Ships the user's items 3 and 4. **No DB, no types, no store changes** — pure relocation, fully testable today, and it validates the selection model before anything is built on top of it.

**Phase 2 — fill.** §5.1 + §5.5 (palette). One column. The user's item 2. Land it after Phase 1 proves the popover, so a new control drops into a shell that already works.

**Phase 3 — the cheap wins.** B1 (type colours — one line, no columns), B2 (snap — two props), B3 (duplicate). Arguably B1 should jump to Phase 1: it is one line and it is the change that makes colour mean something. It is listed here only because it is not on the user's list.

**Later / separate items.** §5.6 font (if approved after §7.1), B4 align & distribute (**own backlog item** — multi-select + undoable geometry), export (§7.6).

**Recommended first commit: Phase 1 alone.** It is the only part that answers the actual question — *where do the controls live?* — and everything else is easier to judge once the answer is on screen.

## 10. Out of scope

- Renaming the `color` column (label change only — §5.1).
- Multi-select, and undoable geometry (both gate B4 — §6).
- Auto-layout, shape picker, format painter, layer colours, minimap, canvas export (§7).
- Font family, in any form (§7.1).
- Mounting or reworking `ComponentLibrary` — noted as dead (§1), touched only if B1 needs a type-colour editor.
- Persisting canvas view preferences (snap toggle, any canvas-wide font size) — session-local until someone asks.
- Bar overflow handling — the popover model (§3) is the reason this isn't needed yet. Revisit if the global segment itself outgrows the bar.
