import { useState } from 'react'
import type { Module } from '../../../../types'

interface Props {
  module: Module
  allModules: Module[]
  depth: number
  selectedModuleId: number | null
  onSelect: (id: number) => void
  onDelete: (id: number) => void
  onRename: (id: number, name: string) => void
}

export default function ModuleNode({ module, allModules, depth, selectedModuleId, onSelect, onDelete, onRename }: Props): JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(module.name)
  const children = allModules.filter((m) => m.parentId === module.id)
  const isSelected = selectedModuleId === module.id

  function handleContextMenu(e: React.MouseEvent): void {
    e.preventDefault()
    const choice = window.confirm(`Rename "${module.name}"?\nOK = Rename   Cancel = Delete`)
    if (choice) { setRenameValue(module.name); setRenaming(true) }
    else if (window.confirm(`Delete "${module.name}"?`)) onDelete(module.id)
  }

  return (
    <div>
      <div
        style={{ paddingLeft: `${(depth + 1) * 12}px` }}
        className={`flex items-center gap-1.5 pr-2 py-1.5 mx-2 my-0.5 cursor-pointer text-sm rounded select-none transition-colors
          ${isSelected ? 'bg-action-tint text-ink font-medium' : 'hover:bg-workspace text-ink-muted'}`}
        onClick={() => onSelect(module.id)}
        onContextMenu={handleContextMenu}
      >
        <button className="w-4 shrink-0 text-ink-faint hover:text-ink-muted"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}>
          {children.length > 0 ? (expanded ? '▾' : '▸') : ''}
        </button>
        <svg className="w-3.5 h-3.5 shrink-0 text-ink-faint" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M2 5.5A1.5 1.5 0 013.5 4h4.379a1.5 1.5 0 011.06.44l1.122 1.12a1.5 1.5 0 001.06.44H16.5A1.5 1.5 0 0118 7.5v7A1.5 1.5 0 0116.5 16h-13A1.5 1.5 0 012 14.5v-9z" />
        </svg>
        {renaming ? (
          <form onSubmit={(e) => { e.preventDefault(); if (renameValue.trim()) onRename(module.id, renameValue.trim()); setRenaming(false) }}
            onClick={(e) => e.stopPropagation()}>
            <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => setRenaming(false)}
              className="text-sm border border-action rounded px-1 py-0 w-32 focus:outline-none" />
          </form>
        ) : (
          <span className="truncate">{module.name}</span>
        )}
      </div>
      {expanded && children.map((child) => (
        <ModuleNode key={child.id} module={child} allModules={allModules} depth={depth + 1}
          selectedModuleId={selectedModuleId} onSelect={onSelect} onDelete={onDelete} onRename={onRename} />
      ))}
    </div>
  )
}
