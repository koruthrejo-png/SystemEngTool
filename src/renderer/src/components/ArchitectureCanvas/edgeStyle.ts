import { MarkerType, type EdgeMarker as RFMarker } from '@xyflow/react'
import type { LineStyle, EdgeMarker } from '../../../../types'

// Stroke colors shared by the edge path (EdgeLabel) and its arrow markers (index.tsx) — they must agree.
export const EDGE_STROKE = '#94a3b8'
export const EDGE_STROKE_SELECTED = '#42682d'

// null/'solid' → undefined (a plain solid stroke). dashed/dotted → an SVG strokeDasharray.
export function dashArray(style: LineStyle | null): string | undefined {
  return style === 'dashed' ? '6 4' : style === 'dotted' ? '2 2' : undefined
}

// null/undefined/'none' → undefined (no arrowhead). Otherwise an RF marker object colored to match the stroke.
export function edgeMarker(marker: EdgeMarker | null | undefined, color: string): RFMarker | undefined {
  if (marker == null || marker === 'none') return undefined
  return { type: marker === 'arrow' ? MarkerType.Arrow : MarkerType.ArrowClosed, color }
}
