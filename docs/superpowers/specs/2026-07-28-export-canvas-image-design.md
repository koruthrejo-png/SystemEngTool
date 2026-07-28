# Design: Export Canvas as PNG / SVG (backlog item 41)

**Date:** 2026-07-28
**Status:** Draft — awaiting review
**Backlog:** item 41 (medium)

## Purpose

Export the architecture diagram as an image (PNG or SVG) — for slide decks, docs, review packages. Smaller than the item-14 "PDF from architecture" and likely more used. Captures the **whole graph** (all nodes, fit to their bounds), not just what's currently on screen.

## Key decision: add `html-to-image`

React Flow doesn't bundle image export; the community-standard approach renders the flow's viewport DOM to a raster/vector via `html-to-image` (`toPng` / `toSvg`). It's tiny, pure-JS, no native binding. The hand-rolled alternative (manually serialize nodes+edges to an SVG string) would re-implement node styling, fonts, and edge geometry — a lot of code that drifts from the real rendering. `html-to-image` captures exactly what React Flow paints.

## Architecture

Two halves, split on the process boundary that matches the app's file-I/O convention:

1. **Renderer — image generation** (`ArchitectureCanvas`): compute the full-graph bounds with React Flow's `getNodesBounds`, derive a viewport transform that frames all nodes (`getViewportForBounds`), render the `.react-flow__viewport` element to a data URL via `html-to-image` at that transform and a fixed pixel ratio (2× for crisp PNG). Produces a base64 PNG data URL or an SVG string.

2. **Main — file write** (`io.ts`): a new `io:exportImage(format, data, suggestedName)` handler runs the **native save dialog** (matching `io:exportCsv`/`io:exportReqif`) and writes the decoded bytes to disk. Keeping the write in main — rather than a renderer `<a download>` blob — is consistent with every other export in the app and gives a real OS save dialog with the right extension filter.

## UI

An **"Export ▾"** button in the architecture top bar with two items: **PNG** and **SVG**. (Named "Export" to parallel the requirements toolbar's export menu.) Click → generate (renderer) → `io:exportImage` (main dialog + write) → done. A transient toast/`lastError` surface on failure, matching the store `run()`/`lastError` convention.

Default filename: `<projectName> - <architectureName>.png` / `.svg`.

## Scope

- **Current architecture only** (the active `architecture_id`) — matches the canvas's single-architecture view.
- Whole graph, framed to node bounds with a small margin — independent of the user's current zoom/pan.
- Background: the canvas's dot-grid is a CSS background on the pane; v1 exports on a **solid workspace-colored background** (clean for docs) rather than the grid — the capture targets the viewport node layer, not the grid pane. (Grid-included export is a trivial follow-up if wanted.)

## Data flow

Click PNG → `getNodesBounds(nodes)` → `getViewportForBounds(...)` → `htmlToImage.toPng(viewportEl, { pixelRatio: 2, backgroundColor, width, height, style: transform })` → data URL → `io:exportImage('png', dataUrl, name)` → main strips the `data:` prefix, `Buffer.from(base64,'base64')`, save dialog, `writeFile`.

SVG path is the same with `toSvg` → the handler writes the SVG text directly (no base64 decode).

## Testing

The valuable, testable logic is the **bounds→viewport transform** and the **main-side decode/write**:
- Main handler: given a known PNG data URL, it decodes to the correct bytes and writes them (dialog stubbed, as with the CSV live-drive technique); SVG string written verbatim; cancelled dialog → no write, no throw.
- A pure helper for "compute export viewport from node bounds + target size" gets a unit test (correct scale + translation to fit bounds, margin applied).

The `html-to-image` call itself is thin third-party glue — smoke-verified live in the app (export a real diagram, open the file), not unit-tested (it needs a real DOM/canvas).

## Deferrals

- PDF export (item 14 — larger, separate spec).
- Multi-architecture / all-architectures export in one file.
- Grid-included background option; transparent-background PNG.
- Export selection only.
