import { useState } from 'react'
import { useStore } from '../../store'
import { SectionLabel } from '../ui'

export default function ArchitectureNav(): JSX.Element {
  const { architectures, activeArchitectureId, setActiveArchitecture, addArchitecture, renameArchitecture, removeArchitecture } = useStore()
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [adding, setAdding] = useState(false)
  const [addValue, setAddValue] = useState('')

  function commitRename(id: number): void {
    const v = renameValue.trim()
    if (v) renameArchitecture(id, v)
    setRenamingId(null)
  }
  function commitAdd(): void {
    const v = addValue.trim()
    if (v) addArchitecture(v)
    setAdding(false); setAddValue('')
  }

  return (
    <div className="flex flex-col h-full w-56 shrink-0 border-r border-line bg-workspace">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <SectionLabel>Architectures</SectionLabel>
        <button
          aria-label="New architecture"
          onClick={() => setAdding(true)}
          className="text-ink-muted hover:text-ink leading-none text-base px-1"
        >+</button>
      </div>
      {adding && (
        <div className="px-3 pb-2">
          <input
            autoFocus
            placeholder="Architecture name"
            value={addValue}
            onChange={(e) => setAddValue(e.target.value)}
            onBlur={commitAdd}
            onKeyDown={(e) => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') { setAdding(false); setAddValue('') } }}
            className="w-full px-2 py-1 text-sm rounded border border-action bg-white text-ink"
          />
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {architectures.map((a) => {
          const active = a.id === activeArchitectureId
          if (renamingId === a.id) {
            return (
              <input
                key={a.id}
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => commitRename(a.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitRename(a.id); if (e.key === 'Escape') setRenamingId(null) }}
                className="w-full px-2 py-1 text-sm rounded border border-action bg-white text-ink"
              />
            )
          }
          return (
            <div
              key={a.id}
              onClick={() => !active && setActiveArchitecture(a.id)}
              onDoubleClick={() => { setRenamingId(a.id); setRenameValue(a.name) }}
              className={`group flex items-center gap-1 px-3 py-1.5 text-sm rounded cursor-pointer
                ${active ? 'bg-white border border-line text-ink' : 'text-ink-muted hover:bg-white/60'}`}
            >
              <span className="truncate flex-1">{a.name}</span>
              {architectures.length > 1 && (
                <button
                  aria-label={`Delete ${a.name}`}
                  onClick={(e) => { e.stopPropagation(); if (window.confirm('Delete this architecture and all its blocks?')) removeArchitecture(a.id) }}
                  className="opacity-0 group-hover:opacity-100 text-ink-faint hover:text-error leading-none"
                >×</button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
