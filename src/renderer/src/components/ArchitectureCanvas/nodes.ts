import type { Node } from '@xyflow/react'
import type { ArchitectureElement } from '../../../../types'
import type { BlockNodeData } from './BlockNode'

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

// React Flow requires parents before children in the nodes array.
export function buildNodes(
  elements: ArchitectureElement[],
  selectedId: number | null,
  onResizeEnd: (id: number, width: number, height: number) => void
): Node[] {
  const byId = new Map(elements.map((e) => [e.id, e]))
  const ordered: ArchitectureElement[] = []
  const placed = new Set<number>()
  const hasParent = (el: ArchitectureElement): boolean =>
    el.parentId !== null && byId.has(el.parentId)

  let remaining = elements
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
      selected: el.id === selectedId,
      onResizeEnd: (w: number, h: number) => onResizeEnd(el.id, w, h)
    } satisfies BlockNodeData,
    style: { width: el.width, height: el.height }
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
