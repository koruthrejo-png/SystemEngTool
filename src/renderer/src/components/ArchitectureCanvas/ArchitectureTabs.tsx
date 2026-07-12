import { useState } from 'react'
import { useStore } from '../../store'

export default function ArchitectureTabs(): JSX.Element {
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
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-line bg-workspace shrink-0 overflow-x-auto">
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
              className="px-2 py-1 text-sm rounded border border-action bg-white text-ink w-32"
            />
          )
        }
        return (
          <div
            key={a.id}
            onClick={() => !active && setActiveArchitecture(a.id)}
            onDoubleClick={() => { setRenamingId(a.id); setRenameValue(a.name) }}
            className={`group flex items-center gap-1 px-3 py-1 text-sm rounded cursor-pointer whitespace-nowrap
              ${active ? 'bg-white border border-line text-ink' : 'text-ink-muted hover:bg-white/60'}`}
          >
            <span>{a.name}</span>
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
      {adding ? (
        <input
          autoFocus
          placeholder="Architecture name"
          value={addValue}
          onChange={(e) => setAddValue(e.target.value)}
          onBlur={commitAdd}
          onKeyDown={(e) => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') { setAdding(false); setAddValue('') } }}
          className="px-2 py-1 text-sm rounded border border-action bg-white text-ink w-40"
        />
      ) : (
        <button aria-label="New architecture" onClick={() => setAdding(true)} className="px-2 py-1 text-sm text-ink-muted hover:text-ink hover:bg-white/60 rounded">+</button>
      )}
    </div>
  )
}
