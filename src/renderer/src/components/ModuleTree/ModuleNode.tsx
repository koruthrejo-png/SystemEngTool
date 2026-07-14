import { useState } from 'react'
import type { Module, CreateModuleInput } from '../../../../types'
import { childrenOf, descendantIds } from './moduleTree'
import NewModuleForm from './NewModuleForm'

interface Props {
  module: Module
  allModules: Module[]
  depth: number
  projectId: number
  selectedModuleId: number | null
  onSelect: (id: number) => void
  onDelete: (id: number) => void
  onRename: (id: number, name: string) => void
  onAddChild: (input: CreateModuleInput) => Promise<void>
  onMove: (id: number, newParentId: number | null) => void
}

export default function ModuleNode({
  module, allModules, depth, projectId, selectedModuleId,
  onSelect, onDelete, onRename, onAddChild, onMove
}: Props): JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(module.name)
  const [addingChild, setAddingChild] = useState(false)
  const [moving, setMoving] = useState(false)
  const isFolder = module.kind === 'folder'
  const children = isFolder ? childrenOf(allModules, module.id) : []
  const isSelected = !isFolder && selectedModuleId === module.id
  const excluded = descendantIds(allModules, module.id)
  // Only folders can hold anything, so only folders are move targets.
  const moveTargets = allModules.filter((m) => m.kind === 'folder' && m.id !== module.id && !excluded.has(m.id))

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
        className={`group flex items-center gap-1.5 pr-2 py-1.5 mx-2 my-0.5 cursor-pointer text-sm rounded select-none transition-colors
          ${isSelected ? 'bg-action-tint text-ink font-medium' : 'hover:bg-workspace text-ink-muted'}`}
        onClick={() => (isFolder ? setExpanded(!expanded) : onSelect(module.id))}
        onContextMenu={handleContextMenu}
      >
        {isFolder ? (
          <button className="w-4 shrink-0 text-ink-faint hover:text-ink-muted"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}>
            {children.length > 0 ? (expanded ? '▾' : '▸') : ''}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        {isFolder ? (
          <svg className="w-3.5 h-3.5 shrink-0 text-ink-faint" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M2 5.5A1.5 1.5 0 013.5 4h4.379a1.5 1.5 0 011.06.44l1.122 1.12a1.5 1.5 0 001.06.44H16.5A1.5 1.5 0 0118 7.5v7A1.5 1.5 0 0116.5 16h-13A1.5 1.5 0 012 14.5v-9z" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5 shrink-0 text-ink-faint" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm7 0v3h3l-3-3z" />
          </svg>
        )}
        {renaming ? (
          <form onSubmit={(e) => { e.preventDefault(); if (renameValue.trim()) onRename(module.id, renameValue.trim()); setRenaming(false) }}
            onClick={(e) => e.stopPropagation()}>
            <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => setRenaming(false)}
              className="text-sm border border-action rounded px-1 py-0 w-32 focus:outline-none" />
          </form>
        ) : (
          <span className="truncate flex-1">{module.name}</span>
        )}
        {!renaming && (
          <span className="hidden group-hover:flex items-center gap-0.5 shrink-0">
            {isFolder && (
              <button
                aria-label={`Add to ${module.name}`}
                title="New folder or module"
                className="px-1 text-ink-faint hover:text-action leading-none"
                onClick={(e) => { e.stopPropagation(); setAddingChild(true); setExpanded(true) }}
              >
                +
              </button>
            )}
            <button
              aria-label={`Move ${module.name}`}
              title="Move to…"
              className="px-1 text-ink-faint hover:text-action leading-none"
              onClick={(e) => { e.stopPropagation(); setMoving((v) => !v) }}
            >
              ⇄
            </button>
          </span>
        )}
      </div>
      {moving && (
        <div style={{ paddingLeft: `${(depth + 2) * 12}px` }} className="pr-3 py-1" onClick={(e) => e.stopPropagation()}>
          <select
            aria-label={`Move ${module.name} to`}
            autoFocus
            defaultValue={module.parentId === null ? '' : String(module.parentId)}
            onChange={(e) => {
              onMove(module.id, e.target.value === '' ? null : Number(e.target.value))
              setMoving(false)
            }}
            onBlur={() => setMoving(false)}
            className="w-full text-xs border border-line rounded px-1 py-1 bg-white text-ink focus:outline-none focus:border-action"
          >
            <option value="">(top level)</option>
            {moveTargets.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      )}
      {addingChild && (
        <div style={{ paddingLeft: `${(depth + 2) * 12}px` }} className="pr-3">
          <NewModuleForm projectId={projectId} parentId={module.id}
            onSubmit={async (input) => { await onAddChild(input); setAddingChild(false) }}
            onCancel={() => setAddingChild(false)} />
        </div>
      )}
      {expanded && children.map((child) => (
        <ModuleNode key={child.id} module={child} allModules={allModules} depth={depth + 1}
          projectId={projectId} selectedModuleId={selectedModuleId}
          onSelect={onSelect} onDelete={onDelete} onRename={onRename}
          onAddChild={onAddChild} onMove={onMove} />
      ))}
    </div>
  )
}
