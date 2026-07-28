import { useState, useEffect, useRef } from 'react'
import { useStore } from '../../store'
import { Button, Input, Select, Textarea, SectionLabel } from '../ui'
import { REQUIREMENT_STATUSES, REQUIREMENT_PRIORITIES, REQUIREMENT_TYPES, VERIFICATION_STATUSES, VERIFICATION_METHODS } from '../../../../types'
import type { RequirementStatus, RequirementPriority, RequirementType, Requirement, VerificationStatus, VerificationMethod, ArchitectureElement } from '../../../../types'
import { buildOutline } from '../RequirementsList/outline'
import { flattenTree } from '../ModuleTree/moduleTree'
import { userName } from '../../attribution'

export default function RequirementDetail(): JSX.Element {
  const {
    selectedRequirementId, requirements, updateRequirement,
    customFields, loadCustomFields, addCustomField, updateCustomField, removeCustomField,
    loadHistory, headings, users
  } = useStore()
  const req = requirements.find((r) => r.id === selectedRequirementId) ?? null

  const [text, setText] = useState('')
  const [source, setSource] = useState('')
  const [rationale, setRationale] = useState('')
  const [ac, setAc] = useState('')

  // Local edits for custom fields: keyed by field id
  const [localFields, setLocalFields] = useState<Record<number, { key: string; value: string }>>({})
  const newFieldRef = useRef<HTMLInputElement>(null)
  const focusNewField = useRef(false)

  useEffect(() => {
    if (!req) return
    setText(req.text)
    setSource(req.source ?? '')
    setRationale(req.rationale ?? '')
    setAc(req.acceptanceCriteria ?? '')
    focusNewField.current = false
    loadCustomFields(req.id)
    loadHistory(req.id)
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
      <div className="flex items-center justify-center h-full text-sm text-ink-faint">
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
      <div className="px-5 py-3 border-b border-line shrink-0">
        <div className="text-lg font-semibold tracking-tight text-ink">Requirement Details</div>
        <span className="text-xs font-mono text-ink-faint">{req.reqId}</span>
        <div className="text-xs text-ink-faint mt-1">
          Last modified {new Date(req.updatedAt).toLocaleString()} by {userName(users, req.updatedBy)}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Type">
            <Select
              aria-label="Type"
              value={req.reqType}
              onChange={(e) => updateRequirement(req.id, { reqType: e.target.value as RequirementType })}
            >
              {REQUIREMENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select
              aria-label="Status"
              value={req.status}
              onChange={(e) => updateRequirement(req.id, { status: e.target.value as RequirementStatus })}
            >
              {REQUIREMENT_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select
              aria-label="Priority"
              value={req.priority}
              onChange={(e) => updateRequirement(req.id, { priority: e.target.value as RequirementPriority })}
            >
              {REQUIREMENT_PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Verification">
          <Select
            aria-label="Verification"
            value={req.verificationStatus}
            onChange={(e) => updateRequirement(req.id, { verificationStatus: e.target.value as VerificationStatus })}
          >
            {VERIFICATION_STATUSES.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </Select>
        </Field>
        <Field label="Verification Method">
          <Select
            aria-label="Verification Method"
            value={req.verificationMethod ?? ''}
            onChange={(e) =>
              updateRequirement(req.id, { verificationMethod: (e.target.value || undefined) as VerificationMethod | undefined })
            }
          >
            <option value="">— none —</option>
            {VERIFICATION_METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="Section">
          <Select
            aria-label="Section"
            value={req.headingId ?? ''}
            onChange={(e) => updateRequirement(req.id, { headingId: e.target.value === '' ? null : Number(e.target.value) })}
          >
            <option value="">(none)</option>
            {buildOutline(headings, []).map((row) =>
              row.kind === 'heading' ? (
                <option key={row.heading.id} value={row.heading.id}>
                  {row.number} {row.heading.title || 'Untitled section'}
                </option>
              ) : null
            )}
          </Select>
        </Field>
        <Field label="Requirement">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} onBlur={save} rows={4} />
        </Field>
        <Field label="Acceptance Criteria">
          <Textarea value={ac} onChange={(e) => setAc(e.target.value)} onBlur={save} rows={4} />
        </Field>
        <Field label="Source">
          <Input value={source} onChange={(e) => setSource(e.target.value)} onBlur={save} />
        </Field>
        <Field label="Rationale">
          <Textarea value={rationale} onChange={(e) => setRationale(e.target.value)} onBlur={save} rows={3} />
        </Field>

        {/* Custom fields */}
        <div className="space-y-2 pt-2 border-t border-line">
          <SectionLabel className="block pt-2">Custom Fields</SectionLabel>
          {customFields.map((field, i) => {
            const local = localFields[field.id] ?? { key: field.key, value: field.value }
            const isNewest = i === customFields.length - 1
            return (
              <div key={field.id} className="flex gap-2 items-center">
                <Input
                  ref={isNewest ? newFieldRef : undefined}
                  value={local.key}
                  onChange={(e) => setLocalField(field.id, 'key', e.target.value)}
                  onBlur={() => updateCustomField(field.id, { key: local.key })}
                  placeholder="Field name"
                  className="!w-2/5 !py-1.5"
                />
                <Input
                  value={local.value}
                  onChange={(e) => setLocalField(field.id, 'value', e.target.value)}
                  onBlur={() => updateCustomField(field.id, { value: local.value })}
                  placeholder="Value"
                  className="flex-1 !py-1.5"
                />
                <button
                  onClick={() => removeCustomField(field.id)}
                  className="text-ink-faint hover:text-error text-lg leading-none px-1"
                  title="Remove field"
                  aria-label="Remove field"
                >
                  ×
                </button>
              </div>
            )
          })}
          <Button variant="ghost" onClick={handleAddField} className="!px-2">+ Add Field</Button>
        </div>

        <TraceabilitySection req={req} />
        <ArchitectureSection req={req} />
        <HistorySection req={req} />
      </div>
    </div>
  )
}

const FIELD_LABELS: Record<string, string> = {
  text: 'Text', acceptance_criteria: 'Acceptance Criteria', source: 'Source',
  rationale: 'Rationale', status: 'Status', priority: 'Priority', req_type: 'Type',
  entry_type: 'Entry Type', verification_status: 'Verification', verification_method: 'Verification Method', heading_id: 'Section'
}

function HistorySection({ req: _req }: { req: Requirement }): JSX.Element {
  const { history, users, headings } = useStore()
  const [open, setOpen] = useState(false)

  // Rows arrive newest-first; group consecutive rows sharing changedAt (one updateRequirement
  // call = one edit event). The timestamp is the group key — no edit_id column needed.
  const events: { at: string; by: number | null; rows: typeof history }[] = []
  for (const h of history) {
    const last = events[events.length - 1]
    if (last && last.at === h.changedAt) last.rows.push(h)
    else events.push({ at: h.changedAt, by: h.changedBy, rows: [h] })
  }

  const sectionTitle = (raw: string | null): string => {
    if (raw == null) return '—'
    return headings.find((s) => String(s.id) === raw)?.title ?? raw
  }
  const display = (field: string, v: string | null): string => {
    if (field === 'heading_id') return sectionTitle(v)
    if (v == null || v === '') return '—'
    return v.length > 80 ? v.slice(0, 80) + '…' : v
  }

  return (
    <div>
      <SectionLabel className="block pt-2">
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-left">
          History {open ? '▾' : '▸'}
        </button>
      </SectionLabel>
      {open &&
        (history.length === 0 ? (
          <p className="text-sm text-slate-500">No changes recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {events.map((ev, i) => (
              <li key={i}>
                <div className="text-xs text-slate-500">
                  {userName(users, ev.by)} · {new Date(ev.at).toLocaleString()}
                </div>
                {ev.rows.map((h) => (
                  <div key={h.id} className="text-sm">
                    <strong>{FIELD_LABELS[h.field] ?? h.field}</strong>{' '}
                    {display(h.field, h.oldValue)} → {display(h.field, h.newValue)}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        ))}
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

function TraceabilitySection({ req }: { req: Requirement }): JSX.Element {
  const {
    modules, projectRequirements, reqLinks,
    loadTraceability, addReqLink, removeReqLink, openRequirement
  } = useStore()
  const [pickModuleId, setPickModuleId] = useState<string>('')
  const [pickReqId, setPickReqId] = useState<string>('')
  const [linking, setLinking] = useState(false)

  useEffect(() => { loadTraceability() }, [req.id])
  // reset the inline picker whenever the drawer switches requirement
  useEffect(() => { setLinking(false); setPickModuleId(''); setPickReqId('') }, [req.id])

  const byId = new Map(projectRequirements.map((r) => [r.id, r]))
  // merge both link directions into one flat list; isParent tells removeReqLink which arg order to use
  const linked = [
    ...reqLinks.filter((l) => l.childReqId === req.id)
      .map((l) => ({ r: byId.get(l.parentReqId), isParent: true })),
    ...reqLinks.filter((l) => l.parentReqId === req.id)
      .map((l) => ({ r: byId.get(l.childReqId), isParent: false }))
  ].filter((x): x is { r: Requirement; isParent: boolean } => x.r !== undefined)
  const linkedIds = new Set([req.id, ...linked.map((x) => x.r.id)])
  const candidates = pickModuleId === ''
    ? []
    : projectRequirements.filter((r) => r.moduleId === Number(pickModuleId) && !linkedIds.has(r.id))
  const picked = pickReqId === '' ? null : byId.get(Number(pickReqId)) ?? null

  function closePicker(): void {
    setLinking(false); setPickModuleId(''); setPickReqId('')
  }

  return (
    <div data-testid="traceability-section" className="space-y-2 pt-2 border-t border-line">
      <SectionLabel className="block pt-2">Linked Requirements</SectionLabel>
      <div data-testid="linked-requirements" className="space-y-1">
        {linked.length === 0 && <div className="text-xs text-ink-faint">None.</div>}
        {linked.map(({ r, isParent }) => (
          <div key={r.id} className="flex items-center gap-2">
            <button onClick={() => openRequirement(r)}
              className="flex-1 min-w-0 text-left flex gap-2 items-baseline hover:bg-action-tint/20 rounded px-1 py-0.5">
              <span className="text-xs font-mono text-ink-faint shrink-0">{r.reqId}</span>
              <span className="text-xs text-ink truncate">{r.text || '—'}</span>
            </button>
            <button
              aria-label={`Remove link to ${r.reqId}`}
              onClick={() => isParent ? removeReqLink(r.id, req.id) : removeReqLink(req.id, r.id)}
              className="text-ink-faint hover:text-error text-lg leading-none px-1"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {!linking ? (
        <Button variant="ghost" className="!px-2 !py-1 !text-xs"
          onClick={() => setLinking(true)}>
          + Link
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Select aria-label="Link module" value={pickModuleId}
              onChange={(e) => { setPickModuleId(e.target.value); setPickReqId('') }} className="flex-1">
              <option value="">Pick module…</option>
              {flattenTree(modules).filter(({ module: m }) => m.kind === 'module').map(({ module: m, depth }) => (
                <option key={m.id} value={m.id}>{' '.repeat(depth * 2)}{m.name}</option>
              ))}
            </Select>
            <Select aria-label="Link requirement" value={pickReqId}
              onChange={(e) => setPickReqId(e.target.value)} className="flex-1">
              <option value="">Pick requirement…</option>
              {candidates.map((r) => (
                <option key={r.id} value={r.id}>{r.reqId} {r.text.slice(0, 40)}</option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2">
            {/* ponytail: new links store current req as parent by convention; dashboard derivation card still reads direction */}
            <Button variant="ghost" className="!px-2 !py-1 !text-xs" disabled={!picked}
              onClick={() => { if (picked) { addReqLink(req.id, picked.id); closePicker() } }}>
              Add link
            </Button>
            <Button variant="ghost" className="!px-2 !py-1 !text-xs" onClick={closePicker}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ArchitectureSection({ req }: { req: Requirement }): JSX.Element {
  const { traceLinks, elements, loadTraceability, toggleTraceLink, selectElement, setActiveTab } = useStore()
  const [pickId, setPickId] = useState<string>('')

  useEffect(() => { loadTraceability() }, [req.id])

  const byId = new Map(elements.map((e) => [e.id, e]))
  const linked = traceLinks
    .filter((l) => l.requirementId === req.id)
    .map((l) => byId.get(l.elementId))
    .filter((e): e is ArchitectureElement => e !== undefined)
  const linkedIds = new Set(linked.map((e) => e.id))
  const candidates = elements.filter((e) => !linkedIds.has(e.id))

  return (
    <div data-testid="arch-section" className="space-y-2 pt-2 border-t border-line">
      <SectionLabel className="block pt-2">Architecture</SectionLabel>
      {linked.length === 0 && <div className="text-xs text-ink-faint">None.</div>}
      {linked.map((e) => (
        <div key={e.id} className="flex items-center gap-2">
          <button
            onClick={() => { setActiveTab('architecture'); selectElement(e.id) }}
            className="flex-1 min-w-0 text-left flex gap-2 items-baseline hover:bg-action-tint/20 rounded px-1 py-0.5"
          >
            <span className="text-xs font-mono text-ink-faint shrink-0">{e.blockId}</span>
            <span className="text-xs text-ink truncate">{e.name || '—'}</span>
          </button>
          <button
            aria-label={`Unlink ${e.blockId}`}
            title="Unlink"
            onClick={() => { toggleTraceLink(e.id, req.id) }}
            className="text-ink-faint hover:text-error text-lg leading-none px-1"
          >
            ×
          </button>
        </div>
      ))}
      <div className="flex gap-2 items-center">
        <Select
          aria-label="Link element"
          value={pickId}
          onChange={(e) => setPickId(e.target.value)}
          className="flex-1 !py-1.5"
        >
          <option value="">Select element…</option>
          {candidates.map((e) => (
            <option key={e.id} value={e.id}>{e.blockId} — {e.name || 'Unnamed'}</option>
          ))}
        </Select>
        <Button
          disabled={pickId === ''}
          onClick={() => { toggleTraceLink(Number(pickId), req.id); setPickId('') }}
          className="!py-1.5"
        >
          Link
        </Button>
      </div>
    </div>
  )
}
