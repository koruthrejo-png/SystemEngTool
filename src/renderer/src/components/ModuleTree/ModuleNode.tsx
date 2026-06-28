import { useState } from 'react'
import type { Module } from '../../../../../types'

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
        className={`flex items-center gap-1 pr-2 py-1 cursor-pointer text-sm rounded mx-1 my-0.5 select-none
          ${isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-100 text-gray-700'}`}
        onClick={() => onSelect(module.id)}
        onContextMenu={handleContextMenu}
      >
        <button className="w-4 shrink-0 text-gray-400 hover:text-gray-600"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}>
          {children.length > 0 ? (expanded ? '▼' : '▶') : ''}
        </button>
        {renaming ? (
          <form onSubmit={(e) => { e.preventDefault(); if (renameValue.trim()) onRename(module.id, renameValue.trim()); setRenaming(false) }}
            onClick={(e) => e.stopPropagation()}>
            <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => setRenaming(false)}
              className="text-sm border border-blue-400 rounded px-1 py-0 w-32 focus:outline-none" />
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
