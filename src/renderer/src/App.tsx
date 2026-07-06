import { useEffect, useRef, useState } from 'react'
import { useStore } from './store'
import { Button, Input, Panel } from './components/ui'
import ModuleTree from './components/ModuleTree'
import RequirementsList from './components/RequirementsList'
import RequirementDetail from './components/RequirementDetail'
import ArchitectureCanvas from './components/ArchitectureCanvas'
import ElementPanel from './components/ElementPanel'
import ConnectionPanel from './components/ConnectionPanel'
import TraceabilityMatrix from './components/TraceabilityMatrix'

export default function App(): JSX.Element {
  const { project, activeTab, setActiveTab, loadProject, loadArchitecture, selectedElementId, selectedConnectionId, selectedRequirementId } = useStore()
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
    <div className="flex flex-col h-screen bg-workspace text-ink">
      <header className="flex items-center h-14 px-4 gap-6 bg-navy shrink-0">
        <span className="font-semibold text-lg tracking-tight text-white">ReqArch Suite</span>
        <nav className="flex h-full">
          {([['requirements', 'Requirements'], ['architecture', 'Architecture'], ['traceability', 'Traceability']] as const).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 h-full text-sm font-medium border-b-[3px] transition-colors
                ${activeTab === tab
                  ? 'border-action-tint text-white'
                  : 'border-transparent text-white/60 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {project && <span className="text-sm text-white/50">{project.name}</span>}
          <Button variant="secondary-on-navy" onClick={handleOpen}>Open</Button>
          <Button onClick={() => setShowNewDialog(true)}>New Project</Button>
        </div>
      </header>

      {showNewDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/40">
          <div className="bg-white rounded shadow-[0_4px_12px_rgba(0,0,0,0.08)] border border-line p-6 w-80 flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-ink">New Project</h2>
            <Input
              ref={inputRef}
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleNewProject(); if (e.key === 'Escape') { setShowNewDialog(false); setNewProjectName('') } }}
              placeholder="Project name"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setShowNewDialog(false); setNewProjectName('') }}>
                Cancel
              </Button>
              <Button onClick={handleNewProject} disabled={!newProjectName.trim()}>
                Create
              </Button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'requirements' ? (
        <div className="flex flex-1 overflow-hidden">
          <Panel data-testid="panel-modules" className="w-64 shrink-0 border-r overflow-y-auto">
            <ModuleTree />
          </Panel>
          <Panel data-testid="panel-list" className="flex-1 overflow-y-auto border-r">
            <RequirementsList />
          </Panel>
          {selectedRequirementId !== null && (
            <Panel data-testid="panel-detail" className="w-96 shrink-0 overflow-y-auto">
              <RequirementDetail />
            </Panel>
          )}
        </div>
      ) : activeTab === 'traceability' ? (
        <div data-testid="panel-traceability" className="flex-1 overflow-hidden">
          <TraceabilityMatrix />
        </div>
      ) : (
        <div data-testid="panel-architecture" className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <ArchitectureCanvas />
          </div>
          {(selectedElementId !== null || selectedConnectionId !== null) && (
            <Panel className="w-96 shrink-0 border-l overflow-y-auto">
              {selectedElementId !== null ? <ElementPanel /> : <ConnectionPanel />}
            </Panel>
          )}
        </div>
      )}
    </div>
  )
}
