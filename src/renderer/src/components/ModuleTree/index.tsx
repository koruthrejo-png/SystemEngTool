import { useState } from 'react'
import { useStore } from '../../store'
import ModuleNode from './ModuleNode'
import NewModuleForm from './NewModuleForm'

export default function ModuleTree(): JSX.Element {
  const { project, modules, selectedModuleId, selectModule, addModule, updateModule, removeModule } = useStore()
  const [showForm, setShowForm] = useState(false)
  const topLevel = modules.filter((m) => m.parentId === null)

  if (!project) {
    return <div className="p-4 text-sm text-gray-400">Open or create a project to begin.</div>
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100">
        Modules
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {topLevel.map((mod) => (
          <ModuleNode key={mod.id} module={mod} allModules={modules} depth={0}
            selectedModuleId={selectedModuleId} onSelect={selectModule}
            onDelete={removeModule}
            onRename={(id, name) => updateModule(id, { name })} />
        ))}
      </div>
      {showForm ? (
        <NewModuleForm projectId={project.id} parentId={null}
          onSubmit={async (input) => { await addModule(input); setShowForm(false) }}
          onCancel={() => setShowForm(false)} />
      ) : (
        <button onClick={() => setShowForm(true)}
          className="m-2 text-sm text-blue-600 hover:underline text-left">
          + Module
        </button>
      )}
    </div>
  )
}
