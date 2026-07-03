import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

export type BlockNodeData = {
  label: string
  blockId: string
  color: string | null
  selected: boolean
}

const NAVY = '#1a365d'

export default memo(function BlockNode({ data }: NodeProps) {
  const d = data as BlockNodeData
  const headerColor = d.color ?? NAVY
  return (
    <div
      style={{ borderColor: headerColor, minWidth: 140 }}
      className={`bg-white border rounded-t text-sm select-none overflow-hidden
        ${d.selected ? 'ring-2 ring-action/60' : ''}`}
    >
      <div
        style={{ background: headerColor }}
        className="px-3 py-1 text-[10px] font-bold uppercase tracking-[0.05em] text-white"
      >
        Block
      </div>
      <div className="px-3 py-2">
        <div className="text-[11px] text-ink-faint font-mono mb-0.5">{d.blockId}</div>
        <div className="font-medium text-ink truncate">
          {d.label || <span className="text-ink-faint/50 italic">Unnamed</span>}
        </div>
      </div>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-action" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-action" />
    </div>
  )
})
