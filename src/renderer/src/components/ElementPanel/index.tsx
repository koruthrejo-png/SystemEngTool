import { useState, useEffect } from 'react'
import { useStore } from '../../store'
import { Input, Textarea, Select, SectionLabel, Button } from '../ui'
import type { LineStyle } from '../../../../types'

export default function ElementPanel(): JSX.Element {
  const {
    selectedElementId, elements, elementTypes, projectRequirements,
    updateElement, removeElement, addElementLink, removeElementLink,
    layers, elementLayers, toggleElementLayer
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
      <div className="flex items-center justify-center h-full text-sm text-ink-faint">
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
      <div className="px-5 py-3 border-b border-line flex items-center justify-between shrink-0">
        <div>
          <div className="text-lg font-semibold tracking-tight text-ink">Properties</div>
          <span className="text-xs font-mono text-ink-faint">{el.blockId}</span>
        </div>
        <Button variant="danger-ghost" className="!px-1 !text-xs" onClick={() => removeElement(el.id)}>Delete</Button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={save} />
        </Field>
        <Field label="Type">
          <Select
            aria-label="Type"
            value={elementTypeId ?? ''}
            onChange={(e) => {
              const newTypeId = e.target.value ? Number(e.target.value) : null
              setElementTypeId(newTypeId)
              updateElement(el!.id, { name, description: description || null, color: color || null, elementTypeId: newTypeId })
            }}
          >
            <option value="">— None —</option>
            {elementTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} onBlur={save} rows={3} />
        </Field>
        <Field label="Color">
          <input type="color" value={color || '#ffffff'} onChange={(e) => setColor(e.target.value)} onBlur={save}
            className="h-9 w-full rounded border border-line cursor-pointer" />
        </Field>
        <Field label="Line style">
          <Select
            aria-label="Line style"
            value={el.lineStyle ?? 'solid'}
            onChange={(e) => updateElement(el!.id, { lineStyle: e.target.value as LineStyle })}
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
          </Select>
        </Field>
        <Field label="Requirements">
          <Input placeholder="Filter by ID or text…" value={reqSearch} onChange={(e) => setReqSearch(e.target.value)} className="!py-1.5 !text-xs mb-2" />
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {filteredReqs.map((r) => {
              const linked = linkedReqIds.includes(r.id)
              return (
                <div key={r.id} onClick={() => toggleLink(r.id)}
                  className={`flex items-start gap-2 px-2 py-1.5 rounded border cursor-pointer text-xs transition-colors
                    ${linked ? 'bg-action-tint/40 border-action/40 text-ink' : 'border-line hover:bg-workspace text-ink-muted'}`}>
                  <span className="font-mono shrink-0">{r.reqId}</span>
                  <span className="line-clamp-1 text-ink-muted">{r.text}</span>
                  {linked && <span className="ml-auto shrink-0">✓</span>}
                </div>
              )
            })}
            {filteredReqs.length === 0 && (
              <div className="text-ink-faint text-xs px-2">No requirements match.</div>
            )}
          </div>
        </Field>
        {layers.length > 0 && (
          <Field label="Layers">
            <div className="space-y-1">
              {layers.map((l) => {
                const assigned = elementLayers.some((m) => m.elementId === el!.id && m.layerId === l.id)
                return (
                  <label key={l.id} className="flex items-center gap-2 px-1 py-1 text-xs text-ink cursor-pointer">
                    <input type="checkbox" aria-label={l.name} checked={assigned} onChange={() => toggleElementLayer(el!.id, l.id)} />
                    {l.name}
                  </label>
                )
              })}
            </div>
          </Field>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-1.5">
      <SectionLabel className="block">{label}</SectionLabel>
      {children}
    </div>
  )
}
