import { useState, useEffect, useRef } from 'react'
import { useStore } from '../../store'

export default function RequirementDetail(): JSX.Element {
  const {
    selectedRequirementId, requirements, updateRequirement,
    customFields, loadCustomFields, addCustomField, updateCustomField, removeCustomField
  } = useStore()
  const req = requirements.find((r) => r.id === selectedRequirementId) ?? null

  const [text, setText] = useState('')
  const [ac, setAc] = useState('')
  const [source, setSource] = useState('')
  const [rationale, setRationale] = useState('')

  // Local edits for custom fields: keyed by field id
  const [localFields, setLocalFields] = useState<Record<number, { key: string; value: string }>>({})
  const newFieldRef = useRef<HTMLInputElement>(null)
  const focusNewField = useRef(false)

  useEffect(() => {
    if (!req) return
    setText(req.text)
    setAc(req.acceptanceCriteria ?? '')
    setSource(req.source ?? '')
    setRationale(req.rationale ?? '')
    focusNewField.current = false
    loadCustomFields(req.id)
  }, [req?.id])

  // Sync localFields when customFields change
  useEffect(() => {
    setLocalFields((prev) => {
      const next: Record<number, { key: string; value: string }> = {}
      for (const f of customFields) {
        next[f.id] = prev[f.id] ?? { key: f.key, value: f.value }
      }
      return next
    })
    // Focus label input only when the user just added a field
    if (focusNewField.current) {
      focusNewField.current = false
      setTimeout(() => newFieldRef.current?.focus(), 50)
    }
  }, [customFields])

  if (!req) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        Select a requirement to view details.
      </div>
    )
  }

  function save(): void {
    updateRequirement(req!.id, {
      text,
      acceptanceCriteria: ac || undefined,
      source: source || undefined,
      rationale: rationale || undefined
    })
  }

  function setLocalField(id: number, part: 'key' | 'value', val: string): void {
    setLocalFields((prev) => ({ ...prev, [id]: { ...prev[id], [part]: val } }))
  }

  async function handleAddField(): Promise<void> {
    focusNewField.current = true
    await addCustomField(req!.id)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b border-gray-100 shrink-0">
        <span className="text-xs font-mono text-gray-400">{req.reqId}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <Field label="Requirement">
          <textarea value={text} onChange={(e) => setText(e.target.value)} onBlur={save} rows={4}
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </Field>
        <Field label="Acceptance Criteria">
          <textarea value={ac} onChange={(e) => setAc(e.target.value)} onBlur={save} rows={3}
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </Field>
        <Field label="Source">
          <input value={source} onChange={(e) => setSource(e.target.value)} onBlur={save}
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </Field>
        <Field label="Rationale">
          <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} onBlur={save} rows={3}
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded resize-none focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </Field>

        {/* Custom fields */}
        <div className="space-y-2">
          <label className="block text-xs font-medium uppercase tracking-wide text-gray-400">Custom Fields</label>
          {customFields.map((field, i) => {
            const local = localFields[field.id] ?? { key: field.key, value: field.value }
            const isNewest = i === customFields.length - 1
            return (
              <div key={field.id} className="flex gap-2 items-center">
                <input
                  ref={isNewest ? newFieldRef : undefined}
                  value={local.key}
                  onChange={(e) => setLocalField(field.id, 'key', e.target.value)}
                  onBlur={() => updateCustomField(field.id, { key: local.key })}
                  placeholder="Field name"
                  className="w-2/5 text-sm px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <input
                  value={local.value}
                  onChange={(e) => setLocalField(field.id, 'value', e.target.value)}
                  onBlur={() => updateCustomField(field.id, { value: local.value })}
                  placeholder="Value"
                  className="flex-1 text-sm px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button
                  onClick={() => removeCustomField(field.id)}
                  className="text-gray-400 hover:text-red-500 text-lg leading-none px-1"
                  title="Remove field"
                >
                  ×
                </button>
              </div>
            )
          })}
          <button onClick={handleAddField}
            className="text-sm text-blue-600 hover:underline">
            + Add Field
          </button>
        </div>
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
