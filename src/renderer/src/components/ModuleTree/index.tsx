import { useState } from 'react'
import { useStore } from '../../store'
import ModuleNode from './ModuleNode'
import NewModuleForm from './NewModuleForm'
import { topLevelModules } from './moduleTree'
import { Button, SectionLabel } from '../ui'

export default function ModuleTree(): JSX.Element {
  const { project, modules, selectedModuleId, selectModule, addModule, updateModule, removeModule, moveModule } = useStore()
  const [showForm, setShowForm] = useState(false)
  const topLevel = topLevelModules(modules)

  if (!project) {
    return <div className="p-4 text-sm text-ink-faint">Open or create a project to begin.</div>
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2">
        <div className="text-sm font-semibold text-ink truncate">{project.name}</div>
      </div>
      <div className="px-4 py-2">
        <SectionLabel>Modules</SectionLabel>
      </div>
      <div className="flex-1 overflow-y-auto pb-2">
        {topLevel.length === 0 && (
          <div className="px-4 py-2 text-sm text-ink-faint">Nothing here yet.</div>
        )}
        {topLevel.map((mod) => (
          <ModuleNode key={mod.id} module={mod} allModules={modules} depth={0}
            projectId={project.id}
            selectedModuleId={selectedModuleId} onSelect={selectModule}
            onDelete={removeModule}
            onRename={(id, name) => updateModule(id, { name })}
            onAddChild={addModule}
            onMove={moveModule} />
        ))}
      </div>
      {showForm ? (
        <NewModuleForm projectId={project.id} parentId={null}
          onSubmit={async (input) => { await addModule(input); setShowForm(false) }}
          onCancel={() => setShowForm(false)} />
      ) : (
        <div className="p-3 border-t border-line">
          <Button className="w-full" onClick={() => setShowForm(true)}>+ New</Button>
        </div>
      )}
    </div>
  )
}
