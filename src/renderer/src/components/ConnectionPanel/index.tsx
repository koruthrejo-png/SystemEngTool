import { useState, useEffect } from 'react'
import { useStore } from '../../store'
import { Input, Textarea, Select, SectionLabel, Button } from '../ui'

export default function ConnectionPanel(): JSX.Element {
  const {
    selectedConnectionId, connections, connectionTypes, projectRequirements,
    updateConnection, removeConnection, addConnectionLink, removeConnectionLink,
    connectionCustomFields, loadConnectionCustomFields,
    addConnectionCustomField, updateConnectionCustomField, removeConnectionCustomField,
    layers, connectionLayers, toggleConnectionLayer
  } = useStore()
  const conn = connections.find((c) => c.id === selectedConnectionId) ?? null

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [connectionTypeId, setConnectionTypeId] = useState<number | null>(null)
  const [linkedReqIds, setLinkedReqIds] = useState<number[]>([])
  const [reqSearch, setReqSearch] = useState('')

  useEffect(() => {
    if (!conn) return
    setName(conn.name ?? '')
    setDescription(conn.description ?? '')
    setConnectionTypeId(conn.connectionTypeId)
    window.api.connectionLinks.list(conn.id).then((reqs) => setLinkedReqIds(reqs.map((r) => r.id)))
    loadConnectionCustomFields(conn.id)
  }, [conn?.id])

  if (!conn) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-ink-faint">
        Select a connection to view properties.
      </div>
    )
  }

  function save(): void {
    updateConnection(conn!.id, {
      name: name || null,
      description: description || null,
      connectionTypeId
    })
  }

  async function toggleLink(reqId: number): Promise<void> {
    if (linkedReqIds.includes(reqId)) {
      await removeConnectionLink(conn!.id, reqId)
      setLinkedReqIds((ids) => ids.filter((id) => id !== reqId))
    } else {
      await addConnectionLink(conn!.id, reqId)
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
          <span className="text-xs font-mono text-ink-faint">{conn.connId}</span>
        </div>
        <Button variant="danger-ghost" className="!px-1 !text-xs" onClick={() => removeConnection(conn.id)}>Delete</Button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={save} />
        </Field>
        <Field label="Type">
          <Select
            aria-label="Type"
            value={connectionTypeId ?? ''}
            onChange={(e) => {
              const newTypeId = e.target.value ? Number(e.target.value) : null
              setConnectionTypeId(newTypeId)
              updateConnection(conn!.id, { name: name || null, description: description || null, connectionTypeId: newTypeId })
            }}
          >
            <option value="">— None —</option>
            {connectionTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} onBlur={save} rows={3} />
        </Field>
        <div className="space-y-2 pt-2 border-t border-line">
          <SectionLabel className="block pt-2">Custom Fields</SectionLabel>
          {connectionCustomFields.map((field) => (
            <div key={field.id} className="flex gap-2 items-center">
              <Input
                defaultValue={field.key}
                onBlur={(e) => updateConnectionCustomField(field.id, { key: e.target.value })}
                placeholder="Field name"
                className="!w-2/5 !py-1.5"
              />
              <Input
                defaultValue={field.value}
                onBlur={(e) => updateConnectionCustomField(field.id, { value: e.target.value })}
                placeholder="Value"
                className="flex-1 !py-1.5"
              />
              <button
                onClick={() => removeConnectionCustomField(field.id)}
                className="text-ink-faint hover:text-error text-lg leading-none px-1"
                title="Remove field"
                aria-label="Remove field"
              >
                ×
              </button>
            </div>
          ))}
          <Button variant="ghost" onClick={() => addConnectionCustomField(conn.id)} className="!px-2">+ Add Field</Button>
        </div>
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
                const assigned = connectionLayers.some((m) => m.connectionId === conn!.id && m.layerId === l.id)
                return (
                  <label key={l.id} className="flex items-center gap-2 px-1 py-1 text-xs text-ink cursor-pointer">
                    <input type="checkbox" aria-label={l.name} checked={assigned} onChange={() => toggleConnectionLayer(conn!.id, l.id)} />
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
