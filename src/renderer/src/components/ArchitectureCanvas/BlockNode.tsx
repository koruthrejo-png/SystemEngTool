import { memo } from 'react'
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react'

export type BlockNodeData = {
  label: string
  blockId: string
  color: string | null
  selected: boolean
  onResizeEnd: (width: number, height: number) => void
}

const NAVY = '#1a365d'

export default memo(function BlockNode({ data }: NodeProps) {
  const d = data as BlockNodeData
  const headerColor = d.color ?? NAVY
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
        onResizeEnd={(_, params) => d.onResizeEnd(params.width, params.height)}
      />
      <div
        style={{ background: headerColor }}
        className="px-3 py-1 text-[10px] font-bold uppercase tracking-[0.05em] text-white shrink-0"
      >
        Block
      </div>
      <div className="px-3 py-2 flex-1 min-h-0">
        <div className="text-[11px] text-ink-faint font-mono mb-0.5">{d.blockId}</div>
        <div className="font-medium text-ink truncate">
          {d.label || <span className="text-ink-faint/50 italic">Unnamed</span>}
        </div>
      </div>
      <Handle id="left" type="source" position={Position.Left} className="!w-2 !h-2 !bg-action" />
      <Handle id="right" type="source" position={Position.Right} className="!w-2 !h-2 !bg-action" />
      <Handle id="top" type="source" position={Position.Top} className="!w-2 !h-2 !bg-action" />
      <Handle id="bottom" type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-action" />
    </div>
  )
})
