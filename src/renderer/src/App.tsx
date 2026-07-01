import { useEffect, useRef, useState } from 'react'
import { useStore } from './store'
import ModuleTree from './components/ModuleTree'
import RequirementsList from './components/RequirementsList'
import RequirementDetail from './components/RequirementDetail'
import ArchitectureCanvas from './components/ArchitectureCanvas'
import ElementPanel from './components/ElementPanel'
import ConnectionPanel from './components/ConnectionPanel'

export default function App(): JSX.Element {
  const { project, activeTab, setActiveTab, loadProject, loadArchitecture, selectedElementId, selectedConnectionId } = useStore()
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadProject() }, [])

  useEffect(() => {
    if (activeTab === 'architecture' && project) loadArchitecture()
  }, [activeTab, project?.id])

  useEffect(() => {
    if (showNewDialog) setTimeout(() => inputRef.current?.focus(), 50)
  }, [showNewDialog])

  async function handleNewProject(): Promise<void> {
    const name = newProjectName.trim()
    if (!name) return
    setShowNewDialog(false)
    setNewProjectName('')
    console.log('[renderer] calling project:create with', name)
    const p = await window.api.project.create(name)
    console.log('[renderer] project:create returned', p)
    if (p) {
      console.log('[renderer] fetching modules for project id', p.id)
      const modules = await window.api.modules.list(p.id)
      console.log('[renderer] modules:', modules)
      useStore.setState({ project: p, modules })
      console.log('[renderer] store updated')
    } else {
      console.error('[renderer] project:create returned null/undefined — check main process terminal for error')
    }
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
          <button onClick={() => setShowNewDialog(true)}
            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">
            New Project
          </button>
        </div>
      </header>

      {showNewDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg shadow-xl p-6 w-80 flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-gray-800">New Project</h2>
            <input
              ref={inputRef}
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleNewProject(); if (e.key === 'Escape') { setShowNewDialog(false); setNewProjectName('') } }}
              placeholder="Project name"
              className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowNewDialog(false); setNewProjectName('') }}
                className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleNewProject}
                disabled={!newProjectName.trim()}
                className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex border-b border-gray-200 bg-white shrink-0 px-4">
        {(['requirements', 'architecture'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize transition-colors
              ${activeTab === tab
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {tab === 'requirements' ? 'Requirements' : 'Architecture'}
          </button>
        ))}
      </div>

      {activeTab === 'requirements' ? (
        <div className="flex flex-1 overflow-hidden">
          <aside data-testid="panel-modules"
            className="w-56 shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
            <ModuleTree />
          </aside>
          <main data-testid="panel-list"
            className="flex-1 overflow-y-auto border-r border-gray-200 bg-white">
            <RequirementsList />
          </main>
          <aside data-testid="panel-detail"
            className="w-80 shrink-0 overflow-y-auto bg-white border-l border-gray-100">
            <RequirementDetail />
          </aside>
        </div>
      ) : (
        <div data-testid="panel-architecture" className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <ArchitectureCanvas />
          </div>
          {(selectedElementId !== null || selectedConnectionId !== null) && (
            <aside className="w-80 shrink-0 border-l border-gray-200 bg-white overflow-y-auto">
              {selectedElementId !== null ? <ElementPanel /> : <ConnectionPanel />}
            </aside>
          )}
        </div>
      )}
    </div>
  )
}
