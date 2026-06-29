import { useStore } from '../../store'

export default function RequirementsList(): JSX.Element {
  const { selectedModuleId, modules, requirements, selectedRequirementId, selectRequirement, addRequirement } = useStore()

  if (!selectedModuleId) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        Select a module to view its requirements.
      </div>
    )
  }

  const module = modules.find((m) => m.id === selectedModuleId)

  async function handleAdd(): Promise<void> {
    await addRequirement({ moduleId: selectedModuleId!, text: '' })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between shrink-0">
        <span className="text-sm font-semibold text-gray-700">{module?.name ?? 'Requirements'}</span>
        <span className="text-xs text-gray-400">{requirements.length} item{requirements.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {requirements.length === 0 && (
          <div className="p-4 text-sm text-gray-400">No requirements yet.</div>
        )}
        {requirements.map((req) => (
          <div key={req.id} onClick={() => selectRequirement(req.id)}
            className={`flex items-start gap-3 px-4 py-3 cursor-pointer border-b border-gray-50 hover:bg-gray-50
              ${selectedRequirementId === req.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}>
            <span className="text-xs font-mono text-gray-400 shrink-0 mt-0.5 w-20">{req.reqId}</span>
            <span className="text-sm text-gray-800 line-clamp-2">
              {req.text || <span className="text-gray-300 italic">No text yet</span>}
            </span>
          </div>
        ))}
      </div>
      <div className="p-2 border-t border-gray-100 shrink-0">
        <button onClick={handleAdd} className="text-sm text-blue-600 hover:underline">
          + Requirement
        </button>
      </div>
    </div>
  )
}
