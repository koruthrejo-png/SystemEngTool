import { memo } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { dashArray } from './edgeStyle'
import type { LineStyle } from '../../../../types'

export default memo(function EdgeLabel({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, data, selected, markerStart, markerEnd
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  const label = (data as any)?.label as string | undefined
  const faded = (data as any)?.faded === true
  const lineStyle = ((data as any)?.lineStyle ?? null) as LineStyle | null
  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerStart={markerStart}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? '#42682d' : '#94a3b8',
          strokeWidth: selected ? 2 : 1.5,
          opacity: faded ? 0.3 : 1,
          strokeDasharray: dashArray(lineStyle)
        }}
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
