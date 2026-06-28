import { useEffect } from 'react'
import { useStore } from './store'
import ModuleTree from './components/ModuleTree'

export default function App(): JSX.Element {
  const { project, loadProject } = useStore()

  useEffect(() => { loadProject() }, [])

  async function handleNewProject(): Promise<void> {
    const name = window.prompt('Project name:')
    if (!name?.trim()) return
    const p = await window.api.project.create(name.trim())
    if (p) loadProject()
  }

  async function handleOpen(): Promise<void> {
    const p = await window.api.project.open()
    if (p) loadProject()
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900">
      <header className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shrink-0">
        <span className="font-semibold text-sm tracking-wide text-gray-800">ReqArch Suite</span>
        {project && <span className="text-sm text-gray-400">{project.name}</span>}
        <div className="flex gap-2">
          <button onClick={handleOpen}
            className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-100">
            Open
          </button>
          <button onClick={handleNewProject}
            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">
            New Project
          </button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside data-testid="panel-modules"
          className="w-56 shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
          <ModuleTree />
        </aside>
        <main data-testid="panel-list"
          className="flex-1 overflow-y-auto border-r border-gray-200 bg-white" />
        <aside data-testid="panel-detail"
          className="w-80 shrink-0 overflow-y-auto bg-white" />
      </div>
    </div>
  )
}
