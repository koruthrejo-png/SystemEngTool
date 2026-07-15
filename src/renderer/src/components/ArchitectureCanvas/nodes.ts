import type { Node } from '@xyflow/react'
import type { ArchitectureElement, ElementType, ArchitectureConnection, UpdateElementInput } from '../../../../types'
import type { BlockNodeData } from './BlockNode'
import type { Visibility } from './layers'

export function absolutePosition(
  el: ArchitectureElement,
  byId: Map<number, ArchitectureElement>
): { x: number; y: number } {
  let x = el.posX
  let y = el.posY
  let parent = el.parentId !== null ? byId.get(el.parentId) : undefined
  while (parent) {
    x += parent.posX
    y += parent.posY
    parent = parent.parentId !== null ? byId.get(parent.parentId) : undefined
  }
  return { x, y }
}

function descendantIds(rootId: number, elements: ArchitectureElement[]): Set<number> {
  const ids = new Set<number>()
  let added = true
  while (added) {
    added = false
    for (const el of elements) {
      if (el.parentId !== null && !ids.has(el.id) && (el.parentId === rootId || ids.has(el.parentId))) {
        ids.add(el.id)
        added = true
      }
    }
  }
  return ids
}

// Single source of truth for "effective" visibility: folds each element's own
// visibility together with the hidden-descendant cascade (a child of a Hidden
// container is hidden too, even though its OWN layer membership says 'normal').
// Both the node builder and the connector-visibility effect must read through
// this map, so a connector to a container-hidden child resolves to 'hidden'
// via resolveConnectorVisibility instead of merely vanishing when React Flow
// drops an edge whose endpoint node was omitted.
export function withHiddenCascade(
  elements: ArchitectureElement[],
  ownVisibilityById: Map<number, Visibility>
): Map<number, Visibility> {
  const result = new Map(ownVisibilityById)
  for (const el of elements) {
    if (ownVisibilityById.get(el.id) === 'hidden') {
      for (const d of descendantIds(el.id, elements)) result.set(d, 'hidden')
    }
  }
  return result
}

export const NEST_PADDING = 12
export const HEADER_HEIGHT = 24

// Snug-fit a child inside its parent's content area (below the header band):
// clamp the child's position, and grow the parent when the child doesn't fit.
// All coordinates are the child's parent-relative frame.
export function fitChildInParent(
  parent: { width: number; height: number },
  child: { posX: number; posY: number; width: number; height: number }
): { childX: number; childY: number; parentWidth: number; parentHeight: number } {
  const parentWidth = Math.max(parent.width, child.width + 2 * NEST_PADDING)
  const parentHeight = Math.max(parent.height, HEADER_HEIGHT + child.height + 2 * NEST_PADDING)
  const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi)
  return {
    childX: clamp(child.posX, NEST_PADDING, parentWidth - child.width - NEST_PADDING),
    childY: clamp(child.posY, HEADER_HEIGHT + NEST_PADDING, parentHeight - child.height - NEST_PADDING),
    parentWidth,
    parentHeight
  }
}

// fitChildInParent only ever grows a container. These two keep the other half of
// the deal: remember the pre-drop size on the way in, restore it on the way out.
// The baseline is persisted (pre_nest_width/height) because it cannot be
// recomputed once the container has grown.

// Called BEFORE fitChildInParent grows the parent. childCount is the parent's
// child count *before* this drop, so a move within the same container (dragged
// element already counted) never re-baselines against an already-grown size.
export function nestBaseline(
  parent: { width: number; height: number; preNestWidth: number | null },
  childCount: number
): { preNestWidth: number; preNestHeight: number } | null {
  if (childCount > 0 || parent.preNestWidth !== null) return null
  return { preNestWidth: parent.width, preNestHeight: parent.height }
}

// Restore the pre-nest size once the LAST child leaves. Returns null (no revert)
// while other children remain, or when there is no baseline to restore.
export function revertToBaseline(
  parent: { preNestWidth: number | null; preNestHeight: number | null },
  remainingChildCount: number
): UpdateElementInput | null {
  if (remainingChildCount > 0 || parent.preNestWidth === null || parent.preNestHeight === null) return null
  return { width: parent.preNestWidth, height: parent.preNestHeight, preNestWidth: null, preNestHeight: null }
}

// ponytail: a manual resize of a container that holds children drops the
// baseline — the user's explicit size is now the intended size, so there is
// nothing meaningful to revert to and the last child leaving keeps it as-is.
export function clearBaselineOnManualResize(childCount: number): UpdateElementInput {
  return childCount > 0 ? { preNestWidth: null, preNestHeight: null } : {}
}

// React Flow requires parents before children in the nodes array.
export function buildNodes(
  elements: ArchitectureElement[],
  elementTypes: ElementType[],
  connections: ArchitectureConnection[],
  selectedId: number | null,
  onResizeEnd: (id: number, x: number, y: number, width: number, height: number) => void,
  visibilityById: Map<number, Visibility>
): Node[] {
  const typeName = new Map(elementTypes.map((t) => [t.id, t.name]))
  const byId = new Map(elements.map((e) => [e.id, e]))
  const ordered: ArchitectureElement[] = []
  const placed = new Set<number>()
  const hasParent = (el: ArchitectureElement): boolean =>
    el.parentId !== null && byId.has(el.parentId)

  const hidden = new Set<number>()
  for (const el of elements) {
    if (visibilityById.get(el.id) === 'hidden') {
      hidden.add(el.id)
      for (const d of descendantIds(el.id, elements)) hidden.add(d)
    }
  }

  let remaining = elements.filter((el) => !hidden.has(el.id))
  while (remaining.length > 0) {
    const ready = remaining.filter((el) => !hasParent(el) || placed.has(el.parentId!))
    if (ready.length === 0) break // parentId cycle in data — render the rest as-is
    for (const el of ready) {
      ordered.push(el)
      placed.add(el.id)
    }
    remaining = remaining.filter((el) => !placed.has(el.id))
  }
  ordered.push(...remaining)

  return ordered.map((el) => ({
    id: String(el.id),
    type: 'block',
    position: { x: el.posX, y: el.posY },
    ...(hasParent(el) ? { parentId: String(el.parentId) } : {}),
    data: {
      label: el.name,
      blockId: el.blockId,
      color: el.color,
      lineStyle: el.lineStyle,
      fillColor: el.fillColor,
      selected: el.id === selectedId,
      nested: hasParent(el),
      childCount: elements.filter((c) => c.parentId === el.id).length,
      typeName: el.elementTypeId != null ? typeName.get(el.elementTypeId) ?? null : null,
      // ponytail: O(elements×connections) count, fine at desktop canvas scale
      connectionCount: connections.filter((c) => c.sourceId === el.id || c.targetId === el.id).length,
      faded: visibilityById.get(el.id) === 'faded',
      onResizeEnd: (x: number, y: number, w: number, h: number) => onResizeEnd(el.id, x, y, w, h)
    } satisfies BlockNodeData,
    style: { width: el.width, height: el.height, ...(visibilityById.get(el.id) === 'faded' ? { opacity: 0.35 } : {}) }
  }))
}

// Decides the nesting outcome of a drag: dragged node's center point picks
// the innermost containing block; outside everything → root.
export function resolveDrop(
  draggedId: number,
  draggedAbs: { x: number; y: number },
  elements: ArchitectureElement[]
): { parentId: number | null; posX: number; posY: number } {
  const byId = new Map(elements.map((e) => [e.id, e]))
  const dragged = byId.get(draggedId)
  if (!dragged) return { parentId: null, posX: draggedAbs.x, posY: draggedAbs.y }

  const excluded = descendantIds(draggedId, elements)
  excluded.add(draggedId)

  const center = {
    x: draggedAbs.x + dragged.width / 2,
    y: draggedAbs.y + dragged.height / 2
  }

  let best: { el: ArchitectureElement; abs: { x: number; y: number }; area: number } | null = null
  for (const el of elements) {
    if (excluded.has(el.id)) continue
    const abs = absolutePosition(el, byId)
    const inside =
      center.x >= abs.x && center.x <= abs.x + el.width &&
      center.y >= abs.y && center.y <= abs.y + el.height
    if (!inside) continue
    const area = el.width * el.height
    if (best === null || area < best.area) best = { el, abs, area }
  }

  if (best === null) return { parentId: null, posX: draggedAbs.x, posY: draggedAbs.y }
  return {
    parentId: best.el.id,
    posX: draggedAbs.x - best.abs.x,
    posY: draggedAbs.y - best.abs.y
  }
}
