import { useStore } from '../../store'

const NAVY = '#1a365d'

export default function ComponentLibrary(): JSX.Element {
  const { project, elementTypes, addElement } = useStore()

  function add(elementTypeId: number): void {
    if (!project) return
    addElement({
      projectId: project.id,
      elementTypeId,
      posX: 100 + Math.random() * 200,
      posY: 100 + Math.random() * 200
    })
  }

  return (
    <div className="w-52 shrink-0 bg-white border-r border-line flex flex-col">
      <div className="px-3 h-12 flex items-center text-[10px] font-bold uppercase tracking-[0.05em] text-ink-faint border-b border-line shrink-0">
        Component Library
      </div>
      <div className="flex-1 overflow-auto p-2 flex flex-col gap-1">
        {elementTypes.map((t) => (
          <button
            key={t.id}
            onClick={() => add(t.id)}
            aria-label={`Add ${t.name}`}
            className="flex items-center gap-2 px-2 py-2 rounded text-sm text-ink hover:bg-workspace text-left"
          >
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: t.color ?? NAVY }} />
            <span className="truncate">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
