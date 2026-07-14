# Requirements File Structure — Folders Contain Modules

Backlog item 21 (`docs/superpowers/specs/2026-07-02-ui-overhaul-design.md` §6). Design date 2026-07-14.

## Problem

Today the requirements tree is *modules nested inside modules*: `modules.parent_id` is a self-reference, so any module can be both a container of other modules and an owner of requirements. That conflates two jobs. A module is the thing that owns requirements and mints their IDs (`id_prefix` + `next_counter`, e.g. `SRS-0004`); nesting it inside another module gives the parent a second, unrelated job as a folder.

The user wants **pure container files/folders that requirement modules live inside**: containers organize, modules own requirements.

## Target structure

```
Project
├── 📁 Vehicle
│   ├── 📁 Powertrain
│   │   └── 📄 Motor Control (MOT-0001…)
│   └── 📄 Chassis (CHS-0001…)
└── 📄 System (SYS-0001…)
```

Rules:

- A **folder** may contain folders and modules, to any depth.
- A **module** is a leaf. It may never contain a folder or another module.
- A module owns requirements. In-module hierarchy stays with the existing `req_headings` tree (`1`, `1.1`, `1.1.1`) — unchanged by this work.
- A folder owns nothing but its children. It has no ID prefix and no requirements.

## Data model

Add one column, via the existing `addColumnIfMissing` helper in `src/main/db/migrations.ts`:

```sql
ALTER TABLE modules ADD COLUMN kind TEXT NOT NULL DEFAULT 'module'  -- 'folder' | 'module'
```

`parent_id` keeps its meaning ("my container") and every existing foreign key is untouched. Folder rows carry `id_prefix = ''` and ignore `id_padding` / `next_counter`.

No DB `CHECK` constraint on `kind` — the codebase enforces enum columns in TypeScript (same call made for `layers.state`, `requirements.status`). Revisit only if write paths multiply.

Types (`src/types/index.ts`), following the `REQUIREMENT_STATUSES` / `LAYER_STATES` pattern:

```ts
export const MODULE_KINDS = ['folder', 'module'] as const
export type ModuleKind = (typeof MODULE_KINDS)[number]
```

`Module.kind: ModuleKind` and `CreateModuleInput.kind: ModuleKind`.

### Why one table and not a separate `folders` table

A separate self-nesting `folders` table plus `modules.folder_id` would make the invariants structural rather than guarded. It was rejected on cost: two handler sets, two store arrays, a tree UI that merges two lists, and a migration that rewires every module row. The single-table model keeps `moduleTree.ts`, the store's `modules` array, and every `module_id` foreign key exactly as they are.

### Invariants

Enforced in `src/main/handlers/modules.ts`, not by the schema:

1. Only a `kind='folder'` row may appear as another row's `parent_id`.
2. Only a `kind='module'` row may own requirements.

## Migration

One idempotent transaction, run after the `kind` column is added. For each live `kind='module'` row that has at least one live child:

- **If it owns requirements or headings** — split it:
  1. Insert a new module inside it: same `name`, copying `id_prefix`, `id_padding`, `next_counter`.
  2. Repoint that module's `requirements.module_id` and `req_headings.module_id` rows to the new module.
  3. Flip the original to `kind='folder'`, `id_prefix = ''`.
- **If it owns neither** — flip it to `kind='folder'`, `id_prefix = ''`. No split needed.

```
BEFORE                          AFTER
📄 Vehicle (VEH-0001, VEH-0002)  📁 Vehicle
└── 📄 Brakes (BRK-0001)         ├── 📄 Vehicle (VEH-0001, VEH-0002)
                                 └── 📄 Brakes (BRK-0001)
```

Requirement IDs never change: the new module inherits the prefix and counter, and requirement rows keep their `id` and `req_id`. Only two tables reference `modules(id)` — `requirements.module_id` and `req_headings.module_id` — so nothing else moves. `requirement_links`, `acceptance_criteria`, `requirement_custom_fields`, and `element_requirement_links` all key off requirement `id`, which is stable.

Idempotence falls out of the rule itself: after one run, no `kind='module'` row has children, so a second run matches nothing. No version flag needed.

## Handlers (`src/main/handlers/modules.ts`)

- `createModule` — accepts `kind` (default `'module'`). If `parentId != null`, load the parent and throw unless `kind='folder'`.
- `moveModule` — keeps the existing ancestor-walk cycle guard; adds the same folder-parent check for `newParentId`.
- `deleteModule` — unchanged. Its reparent-children-to-grandparent transaction is already kind-agnostic: deleting a folder lifts its children to the grandparent folder (or top level).
- `listModules` — unchanged, returns both kinds; the tree needs them.
- `createRequirement` (`src/main/handlers/requirements.ts`) — throw if the target module's `kind` is `'folder'`. This guard is the backstop for the UI rule, not the mechanism: the UI never offers it.

## Store (`src/renderer/src/store/index.ts`)

`addModule` passes `kind` through. Nothing else changes: `selectedModuleId` only ever holds a real module (see the UI rule below), so `selectModule`, `RequirementsList`, and every downstream consumer keep working on the assumption they already make.

## Tree UI (`src/renderer/src/components/ModuleTree/`)

`ModuleNode` branches on `module.kind`:

| | Folder | Module |
|---|---|---|
| Icon | folder (current icon) | document |
| Twisty | yes, when it has children | none |
| Click | toggles expand/collapse only — **never** selects | selects; requirements pane loads |
| Hover `+` | yes → new-child form | none |
| Hover `⇄` | yes | yes |

A folder click never blanks the requirements pane — the last-selected module stays put. This is what keeps `selectedModuleId` folder-free, which is what keeps the ripple (below) to filters instead of null-handling.

`NewModuleForm` gains a Folder | Module toggle. Choosing Folder hides the prefix and padding inputs and submits `kind: 'folder'`, `idPrefix: ''`, `idPadding: 4`. The tree's bottom button becomes `+ New` (it creates either kind now).

The `⇄` move picker lists **folders only**, excluding self and descendants (`descendantIds` already computes this), plus the existing `(top level)` option.

`moduleTree.ts` helpers (`topLevelModules`, `childrenOf`, `descendantIds`, `flattenTree`) need no changes — they key on `parentId` and stay kind-agnostic. Their orphan-safety guard still holds.

## Ripple: folders must not leak into module lists

Every place that treats `modules` as "the list of things that hold requirements" filters to `kind === 'module'`:

- `Dashboard/stats.ts` — `perModule` coverage bars.
- `Dashboard/index.tsx` — the Derivation Coverage module filter (`flattenTree(modules)` options).
- `RequirementDetail/index.tsx` — the link-picker module select (`flattenTree(modules)` options).
- `src/main/handlers/search.ts` — the module query gains `AND kind = 'module'`. Folders are excluded from global search: a folder hit would navigate via `selectModule`, and folders are not selectable. Searching folder names is a later nicety if it's ever missed.

`GlobalSearch/index.tsx`'s `moduleName(id)` lookup is unaffected — it resolves a requirement's owning module, always a real module.

## Testing

- **Migration**: the split case (parent with both requirements and children → folder + same-name module, prefix/counter preserved, requirements repointed), the empty case (flip only), and a second run proving idempotence.
- **Handlers**: `createModule` and `moveModule` reject a `kind='module'` parent; `createRequirement` rejects a folder.
- **Tree**: clicking a folder does not call `onSelect`; clicking a module does; a module row renders no `+` button.
- **Filters**: `perModule` and the two `flattenTree` pickers omit folders.

## Out of scope

- Rolled-up requirement views on folder select (folders show nothing; the pane keeps the last module).
- Folder-level ID prefixes or numbering.
- Drag-and-drop of modules between folders — the `⇄` picker stays the move mechanism (item 18's DnD covers requirements into sections only).
- Folders in global search.
- The batched a11y pass for `<div onClick>` tree rows — carried forward, unchanged by this work.
