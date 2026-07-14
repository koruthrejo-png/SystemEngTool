import { useState } from 'react'
import { useStore } from '../../store'
import { SectionLabel } from '../ui'
import type { LayerState } from '../../../../types'

const DOT: Record<LayerState, string> = { visible: '●', faded: '◐', hidden: '○' }

export default function LayerPanel(): JSX.Element {
  const { layers, addLayer, renameLayer, cycleLayerState, removeLayer } = useStore() as any
  const [adding, setAdding] = useState(false)
  const [addValue, setAddValue] = useState('')
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')

  function commitAdd(): void {
    const v = addValue.trim()
    if (v) addLayer(v)
    setAdding(false); setAddValue('')
  }
  function commitRename(id: number): void {
    const v = renameValue.trim()
    if (v) renameLayer(id, v)
    setRenamingId(null)
  }

  return (
    <div className="bg-white/95 backdrop-blur border border-line rounded-lg shadow-md w-52 max-h-80 overflow-y-auto">
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <SectionLabel>Layers</SectionLabel>
        <button aria-label="New layer" onClick={() => setAdding(true)} className="text-ink-muted hover:text-ink leading-none text-base px-1">+</button>
      </div>
      {adding && (
        <div className="px-2 pb-2">
          <input
            autoFocus placeholder="Layer name" value={addValue}
            onChange={(e) => setAddValue(e.target.value)}
            onBlur={commitAdd}
            onKeyDown={(e) => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') { setAdding(false); setAddValue('') } }}
            className="w-full px-2 py-1 text-sm rounded border border-action bg-white text-ink"
          />
        </div>
      )}
      <div className="px-1.5 pb-2 space-y-0.5">
        {layers.length === 0 && !adding && <div className="px-2 py-1 text-xs text-ink-faint">No layers yet.</div>}
        {layers.map((l: any) => (
          renamingId === l.id ? (
            <input
              key={l.id} autoFocus value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => commitRename(l.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(l.id); if (e.key === 'Escape') setRenamingId(null) }}
              className="w-full px-2 py-1 text-sm rounded border border-action bg-white text-ink"
            />
          ) : (
            <div key={l.id} className="group flex items-center gap-2 px-2 py-1 rounded text-sm hover:bg-workspace">
              <button
                aria-label={`Cycle visibility of ${l.name}`}
                onClick={() => cycleLayerState(l.id)}
                title={l.state}
                className={`leading-none w-4 text-center ${l.state === 'hidden' ? 'text-ink-faint' : 'text-action'}`}
              >{DOT[l.state as LayerState]}</button>
              <span className="flex-1 truncate text-ink" onDoubleClick={() => { setRenamingId(l.id); setRenameValue(l.name) }}>{l.name}</span>
              <button
                aria-label={`Delete ${l.name}`}
                onClick={() => { if (window.confirm('Delete this layer? Objects stay, they just lose this layer.')) removeLayer(l.id) }}
                className="opacity-0 group-hover:opacity-100 text-ink-faint hover:text-error leading-none"
              >×</button>
            </div>
          )
        ))}
      </div>
    </div>
  )
}
