import { memo } from 'react'
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react'

export type BlockNodeData = {
  label: string
  blockId: string
  color: string | null
  selected: boolean
  nested: boolean
  childCount: number
  typeName: string | null
  connectionCount: number
  faded: boolean
  onResizeEnd: (x: number, y: number, width: number, height: number) => void
}

const NAVY = '#1a365d'

export default memo(function BlockNode({ data }: NodeProps) {
  const d = data as BlockNodeData
  const headerColor = d.color ?? NAVY
  const named = d.label.trim() !== ''
  return (
    <div
      style={{ borderColor: headerColor }}
      className={`bg-white border rounded-t text-sm select-none h-full w-full flex flex-col
        ${d.selected ? 'ring-2 ring-action/60' : ''}`}
    >
      <NodeResizer
        isVisible={d.selected}
        minWidth={140}
        minHeight={60}
        onResizeEnd={(_, params) => d.onResizeEnd(params.x, params.y, params.width, params.height)}
      />
      <div
        data-testid="object-header"
        style={{ background: headerColor }}
        className="px-3 py-1 text-[10px] font-bold uppercase tracking-[0.05em] text-white shrink-0 flex items-center justify-between gap-2"
      >
        {named ? (
          <span className="flex items-baseline gap-2 min-w-0 normal-case tracking-normal">
            {d.typeName && <span className="uppercase tracking-[0.05em] text-white/60 shrink-0">{d.typeName}</span>}
            <span className="text-[11px] truncate">{d.label}</span>
            <span className="font-mono font-medium text-white/70 shrink-0">{d.blockId}</span>
          </span>
        ) : (
          <span>{d.typeName ?? 'Object'}</span>
        )}
        <span className="flex items-center gap-2 font-medium normal-case tracking-normal text-white/75 shrink-0">
          {d.nested && <span className="border border-white/40 rounded px-1 leading-tight">Nested</span>}
          {d.childCount > 0 && <span>Contains {d.childCount}</span>}
          {d.connectionCount > 0 && (
            <span className="border border-white/40 rounded px-1 leading-tight">⇆ {d.connectionCount}</span>
          )}
        </span>
      </div>
      <div className={`px-3 py-2 flex-1 min-h-0 ${d.childCount > 0 ? 'm-1 rounded border border-dashed border-line bg-workspace/60' : ''}`}>
        {!named && (
          <>
            <div className="text-[11px] text-ink-faint font-mono mb-0.5">{d.blockId}</div>
            <div className="text-ink-faint/50 italic font-medium">Unnamed</div>
          </>
        )}
      </div>
      <Handle id="left" type="source" position={Position.Left} className="!w-2 !h-2 !bg-action" />
      <Handle id="right" type="source" position={Position.Right} className="!w-2 !h-2 !bg-action" />
      <Handle id="top" type="source" position={Position.Top} className="!w-2 !h-2 !bg-action" />
      <Handle id="bottom" type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-action" />
    </div>
  )
})
