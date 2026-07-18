import { memo, useRef, useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from '@xyflow/react'
import { dashArray, EDGE_STROKE, EDGE_STROKE_SELECTED } from './edgeStyle'
import { nearerEnd, type End } from './edgeDrag'
import type { LineStyle } from '../../../../types'

// Drop reads the element id + side straight off the handle under the cursor.
export type BodyReconnect = (edgeId: string, end: End, nodeId: number, side: string | null) => void

const DRAG_THRESHOLD = 4 // screen px before a press becomes a reconnect drag (keeps click/dblclick alive)

export default memo(function EdgeLabel({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, data, selected, markerStart, markerEnd
}: EdgeProps) {
  const { screenToFlowPosition } = useReactFlow()
  const [drag, setDrag] = useState<{ end: End; x: number; y: number } | null>(null)
  // Press bookkeeping before the threshold is crossed — a ref, so it never re-renders.
  const press = useRef<{ end: End; downX: number; downY: number; pointerId: number } | null>(null)

  // While dragging, the moved end tracks the cursor so the path previews live.
  const sx = drag?.end === 'source' ? drag.x : sourceX
  const sy = drag?.end === 'source' ? drag.y : sourceY
  const tx = drag?.end === 'target' ? drag.x : targetX
  const ty = drag?.end === 'target' ? drag.y : targetY
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX: sx, sourceY: sy, sourcePosition, targetX: tx, targetY: ty, targetPosition })

  const label = (data as any)?.label as string | undefined
  const faded = (data as any)?.faded === true
  const lineStyle = ((data as any)?.lineStyle ?? null) as LineStyle | null
  const onBodyReconnect = (data as any)?.onBodyReconnect as BodyReconnect | undefined

  function onPointerDown(e: React.PointerEvent): void {
    if (!selected) return // first click selects; drag only arms once highlighted
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    press.current = { end: nearerEnd(p.x, p.y, sourceX, sourceY, targetX, targetY), downX: e.clientX, downY: e.clientY, pointerId: e.pointerId }
  }

  function onPointerMove(e: React.PointerEvent): void {
    if (drag) {
      const p = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      setDrag({ end: drag.end, x: p.x, y: p.y })
      return
    }
    const pr = press.current
    if (!pr) return
    if (Math.hypot(e.clientX - pr.downX, e.clientY - pr.downY) < DRAG_THRESHOLD) return
    ;(e.currentTarget as Element).setPointerCapture(pr.pointerId)
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    setDrag({ end: pr.end, x: p.x, y: p.y })
  }

  function onPointerUp(e: React.PointerEvent): void {
    const end = drag?.end
    press.current = null
    setDrag(null)
    if (!end) return // a plain click — leave it for React Flow's select/open handlers
    const handle = document.elementsFromPoint(e.clientX, e.clientY)
      .find((el) => el.classList.contains('react-flow__handle')) as HTMLElement | undefined
    if (!handle) return // dropped on nothing — snap back
    const nodeEl = handle.closest('.react-flow__node') as HTMLElement | null
    const nodeId = nodeEl?.dataset.id
    if (nodeId) onBodyReconnect?.(id, end, Number(nodeId), handle.dataset.handleid ?? null)
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerStart={markerStart}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? EDGE_STROKE_SELECTED : EDGE_STROKE,
          strokeWidth: selected ? 2 : 1.5,
          opacity: faded ? 0.3 : 1,
          strokeDasharray: dashArray(lineStyle)
        }}
      />
      {/* Fat invisible grab layer — active only when highlighted, so it never
          steals the first selecting click. nopan stops the canvas from panning. */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        className="nopan"
        style={{ pointerEvents: selected ? 'stroke' : 'none', cursor: selected ? 'grab' : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'all', opacity: faded ? 0.4 : 1 }}
            className="px-1.5 py-0.5 bg-white border border-line rounded text-xs text-ink-muted shadow-sm nodrag nopan"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})
