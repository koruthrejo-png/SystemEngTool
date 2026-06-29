import { useState, useEffect } from 'react'
import { useStore } from '../../store'

export default function RequirementDetail(): JSX.Element {
  const { selectedRequirementId, requirements, updateRequirement } = useStore()
  const req = requirements.find((r) => r.id === selectedRequirementId) ?? null

  const [text, setText] = useState('')
  const [ac, setAc] = useState('')
  const [source, setSource] = useState('')
  const [rationale, setRationale] = useState('')

  useEffect(() => {
    if (!req) return
    setText(req.text)
    setAc(req.acceptanceCriteria ?? '')
    setSource(req.source ?? '')
    setRationale(req.rationale ?? '')
  }, [req?.id])

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
