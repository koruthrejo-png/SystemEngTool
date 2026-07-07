import { useState, useEffect, useRef } from 'react'
import { useStore } from '../../store'
import { Button, Input, Select, Textarea, SectionLabel, Chip } from '../ui'
import { REQUIREMENT_STATUSES, REQUIREMENT_PRIORITIES, REQUIREMENT_TYPES, AC_STATUSES } from '../../../../types'
import type { RequirementStatus, RequirementPriority, RequirementType, Requirement, AcStatus, ArchitectureElement } from '../../../../types'
import { buildOutline } from '../RequirementsList/outline'
import { flattenTree } from '../ModuleTree/moduleTree'

export default function RequirementDetail(): JSX.Element {
  const {
    selectedRequirementId, requirements, updateRequirement,
    customFields, loadCustomFields, addCustomField, updateCustomField, removeCustomField,
    headings,
    acItems, loadAcItems, addAcItem, updateAcItem, removeAcItem, moveAcItem
  } = useStore()
  const req = requirements.find((r) => r.id === selectedRequirementId) ?? null

  const [text, setText] = useState('')
  const [source, setSource] = useState('')
  const [rationale, setRationale] = useState('')

  // Local edits for custom fields: keyed by field id
  const [localFields, setLocalFields] = useState<Record<number, { key: string; value: string }>>({})
  const newFieldRef = useRef<HTMLInputElement>(null)
  const focusNewField = useRef(false)

  // Local edits for acceptance criteria text: keyed by item id
  const [localAcTexts, setLocalAcTexts] = useState<Record<number, string>>({})
  const newAcRef = useRef<HTMLInputElement>(null)
  const focusNewAc = useRef(false)

  useEffect(() => {
    if (!req) return
    setText(req.text)
    setSource(req.source ?? '')
    setRationale(req.rationale ?? '')
    focusNewField.current = false
    focusNewAc.current = false
    setLocalAcTexts({})
    loadCustomFields(req.id)
    loadAcItems(req.id)
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

  // Sync localAcTexts when acItems change
  useEffect(() => {
    setLocalAcTexts((prev) => {
      const next: Record<number, string> = {}
      for (const item of acItems) {
        next[item.id] = prev[item.id] ?? item.text
      }
      return next
    })
  }, [acItems])

  useEffect(() => {
    if (focusNewAc.current) {
      newAcRef.current?.focus()
      focusNewAc.current = false
    }
  }, [acItems.length])

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

  async function handleAddCriterion(): Promise<void> {
    focusNewAc.current = true
    await addAcItem(req!.id, '')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b border-line shrink-0">
        <div className="text-lg font-semibold tracking-tight text-ink">Requirement Details</div>
        <span className="text-xs font-mono text-ink-faint">{req.reqId}</span>
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
        <div data-testid="ac-section" className="space-y-2">
          <SectionLabel className="block">Acceptance Criteria</SectionLabel>
          {acItems.map((item, i) => {
            const localText = localAcTexts[item.id] ?? item.text
            const next: AcStatus = AC_STATUSES[(AC_STATUSES.indexOf(item.status) + 1) % AC_STATUSES.length]
            const isNewest = i === acItems.length - 1
            return (
              <div key={item.id} className="flex gap-2 items-center">
                <button
                  aria-label="Criterion status"
                  title={`Mark ${next}`}
                  onClick={() => updateAcItem(item.id, { status: next }, req.id)}
                  className="shrink-0"
                >
                  <Chip value={item.status} />
                </button>
                <Input
                  ref={isNewest ? newAcRef : undefined}
                  aria-label="Criterion text"
                  value={localText}
                  onChange={(e) => setLocalAcTexts((p) => ({ ...p, [item.id]: e.target.value }))}
                  onBlur={() => updateAcItem(item.id, { text: localText }, req.id)}
                  placeholder="Criterion"
                  className="flex-1 !py-1.5"
                />
                <button aria-label="Move criterion up" onClick={() => moveAcItem(item.id, 'up', req.id)}
                  className="text-ink-faint hover:text-ink">↑</button>
                <button aria-label="Move criterion down" onClick={() => moveAcItem(item.id, 'down', req.id)}
                  className="text-ink-faint hover:text-ink">↓</button>
                <button aria-label="Remove criterion" onClick={() => removeAcItem(item.id, req.id)}
                  className="text-ink-faint hover:text-error text-lg leading-none px-1">×</button>
              </div>
            )
          })}
          <Button variant="ghost" onClick={handleAddCriterion} className="!px-2">+ Add criterion</Button>
        </div>
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

function TraceabilitySection({ req }: { req: Requirement }): JSX.Element {
  const {
    modules, projectRequirements, reqLinks,
    loadTraceability, addReqLink, removeReqLink, openRequirement
  } = useStore()
  const [pickModuleId, setPickModuleId] = useState<string>('')
  const [pickReqId, setPickReqId] = useState<string>('')

  useEffect(() => { loadTraceability() }, [req.id])

  const byId = new Map(projectRequirements.map((r) => [r.id, r]))
  const parents = reqLinks.filter((l) => l.childReqId === req.id)
    .map((l) => byId.get(l.parentReqId)).filter((r): r is Requirement => r !== undefined)
  const children = reqLinks.filter((l) => l.parentReqId === req.id)
    .map((l) => byId.get(l.childReqId)).filter((r): r is Requirement => r !== undefined)
  const linkedIds = new Set([req.id, ...parents.map((r) => r.id), ...children.map((r) => r.id)])
  const candidates = pickModuleId === ''
    ? []
    : projectRequirements.filter((r) => r.moduleId === Number(pickModuleId) && !linkedIds.has(r.id))
  const picked = pickReqId === '' ? null : byId.get(Number(pickReqId)) ?? null

  function LinkList({ title, reqs, testId, removeAs }: {
    title: string
    reqs: Requirement[]
    testId: string
    removeAs: 'parent' | 'child'
  }): JSX.Element {
    return (
      <div data-testid={testId} className="space-y-1">
        <div className="text-xs font-medium text-ink-muted">{title}</div>
        {reqs.length === 0 && <div className="text-xs text-ink-faint">None.</div>}
        {reqs.map((r) => (
          <div key={r.id} className="flex items-center gap-2">
            <button onClick={() => openRequirement(r)}
              className="flex-1 min-w-0 text-left flex gap-2 items-baseline hover:bg-action-tint/20 rounded px-1 py-0.5">
              <span className="text-xs font-mono text-ink-faint shrink-0">{r.reqId}</span>
              <span className="text-xs text-ink truncate">{r.text || '—'}</span>
            </button>
            <button
              aria-label={`Remove link to ${r.reqId}`}
              onClick={() => removeAs === 'parent' ? removeReqLink(r.id, req.id) : removeReqLink(req.id, r.id)}
              className="text-ink-faint hover:text-error text-lg leading-none px-1"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div data-testid="traceability-section" className="space-y-3 pt-2 border-t border-line">
      <SectionLabel className="block pt-2">Traceability</SectionLabel>
      <LinkList title="Derives from" reqs={parents} testId="derives-from" removeAs="parent" />
      <LinkList title="Derived by" reqs={children} testId="derived-by" removeAs="child" />
      <div className="space-y-2">
        <div className="flex gap-2">
          <Select aria-label="Link module" value={pickModuleId}
            onChange={(e) => { setPickModuleId(e.target.value); setPickReqId('') }} className="flex-1">
            <option value="">Pick module…</option>
            {flattenTree(modules).map(({ module: m, depth }) => (
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
          <Button variant="ghost" className="!px-2 !py-1 !text-xs" disabled={!picked}
            onClick={() => { if (picked) { addReqLink(picked.id, req.id); setPickReqId('') } }}>
            Add as parent
          </Button>
          <Button variant="ghost" className="!px-2 !py-1 !text-xs" disabled={!picked}
            onClick={() => { if (picked) { addReqLink(req.id, picked.id); setPickReqId('') } }}>
            Add as child
          </Button>
        </div>
      </div>
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
