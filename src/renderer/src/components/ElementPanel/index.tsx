import { useState, useEffect } from 'react'
import { useStore } from '../../store'

export default function ElementPanel(): JSX.Element {
  const {
    selectedElementId, elements, elementTypes, projectRequirements,
    updateElement, removeElement, addElementLink, removeElementLink
  } = useStore()
  const el = elements.find((e) => e.id === selectedElementId) ?? null

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('')
  const [elementTypeId, setElementTypeId] = useState<number | null>(null)
  const [linkedReqIds, setLinkedReqIds] = useState<number[]>([])
  const [reqSearch, setReqSearch] = useState('')

  useEffect(() => {
    if (!el) return
    setName(el.name)
    setDescription(el.description ?? '')
    setColor(el.color ?? '')
    setElementTypeId(el.elementTypeId)
    window.api.elementLinks.list(el.id).then((reqs) => setLinkedReqIds(reqs.map((r) => r.id)))
  }, [el?.id])

  if (!el) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        Select a block to view properties.
      </div>
    )
  }

  function save(): void {
    updateElement(el!.id, {
      name,
      description: description || null,
      color: color || null,
      elementTypeId
    })
  }

  async function toggleLink(reqId: number): Promise<void> {
    if (linkedReqIds.includes(reqId)) {
      await removeElementLink(el!.id, reqId)
      setLinkedReqIds((ids) => ids.filter((id) => id !== reqId))
    } else {
      await addElementLink(el!.id, reqId)
      setLinkedReqIds((ids) => [...ids, reqId])
    }
  }

  const filteredReqs = projectRequirements.filter((r) =>
    reqSearch === '' ||
    r.reqId.toLowerCase().includes(reqSearch.toLowerCase()) ||
    r.text.toLowerCase().includes(reqSearch.toLowerCase())
  )

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between shrink-0">
        <span className="text-xs font-mono text-gray-400">{el.blockId}</span>
        <button onClick={() => removeElement(el.id)}
          className="text-xs text-red-400 hover:text-red-600">Delete</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={save}
            className="w-full px-3 py-2 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </Field>
        <Field label="Type">
          <select
            value={elementTypeId ?? ''}
            onChange={(e) => { setElementTypeId(e.target.value ? Number(e.target.value) : null); save() }}
            className="w-full px-3 py-2 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">— None —</option>
            {elementTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} onBlur={save} rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </Field>
        <Field label="Color">
          <input type="color" value={color || '#ffffff'} onChange={(e) => setColor(e.target.value)} onBlur={save}
            className="h-9 w-full rounded border border-gray-200 cursor-pointer" />
        </Field>
        <Field label="Requirements">
          <input
            placeholder="Filter by ID or text…"
            value={reqSearch}
            onChange={(e) => setReqSearch(e.target.value)}
            className="w-full px-3 py-1.5 mb-2 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {filteredReqs.map((r) => {
              const linked = linkedReqIds.includes(r.id)
              return (
                <div key={r.id} onClick={() => toggleLink(r.id)}
                  className={`flex items-start gap-2 px-2 py-1.5 rounded cursor-pointer text-xs
                    ${linked ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}`}>
                  <span className="font-mono shrink-0">{r.reqId}</span>
                  <span className="line-clamp-1 text-gray-500">{r.text}</span>
                  {linked && <span className="ml-auto shrink-0">✓</span>}
                </div>
              )
            })}
            {filteredReqs.length === 0 && (
              <div className="text-gray-400 text-xs px-2">No requirements match.</div>
            )}
          </div>
        </Field>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</label>
      {children}
    </div>
  )
}
