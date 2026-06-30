import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

export type BlockNodeData = {
  label: string
  blockId: string
  color: string | null
  selected: boolean
}

export default memo(function BlockNode({ data }: NodeProps) {
  const d = data as BlockNodeData
  const bg = d.color ?? '#ffffff'
  return (
    <div
      style={{ background: bg, minWidth: 120 }}
      className={`px-3 py-2 rounded border text-sm select-none
        ${d.selected ? 'border-blue-500 ring-2 ring-blue-300' : 'border-gray-300'}`}
    >
      <div className="text-xs text-gray-400 font-mono mb-0.5">{d.blockId}</div>
      <div className="font-medium text-gray-800 truncate">{d.label || <span className="text-gray-300 italic">Unnamed</span>}</div>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-blue-400" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-blue-400" />
    </div>
  )
})
