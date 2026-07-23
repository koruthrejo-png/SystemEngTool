import { describe, it, expect } from 'vitest'
import { planImport, resolveDerivedFrom } from './merge'
import type { ParsedRow } from './model'

const p = (over: Partial<ParsedRow> = {}): ParsedRow => ({
  reqId: '', section: '', text: 'shall', acceptanceCriteria: '', source: '', rationale: '', entryType: '',
  reqType: '', status: '', priority: '', verificationStatus: '', derivedFrom: [], custom: {}, ...over
})

describe('planImport', () => {
  it('updates when req_id matches an existing requirement', () => {
    const plan = planImport([p({ reqId: 'SRS-1', text: 'new' })], new Map([['SRS-1', 42]]))
    expect(plan.actions).toEqual([{ kind: 'update', targetId: 42, row: expect.objectContaining({ reqId: 'SRS-1' }) }])
  })
  it('creates when req_id is blank or unmatched', () => {
    const plan = planImport([p({ reqId: '' }), p({ reqId: 'SRS-9' })], new Map())
    expect(plan.actions.map((a) => a.kind)).toEqual(['create', 'create'])
    expect(plan.actions[0].targetId).toBeNull()
  })
  it('skips a create with empty text and reports it', () => {
    const plan = planImport([p({ reqId: '', text: '' })], new Map())
    expect(plan.actions).toHaveLength(0)
    expect(plan.skipped).toBe(1)
    expect(plan.errors[0]).toMatch(/text/i)
  })
  it('skips a row with an invalid enum and reports it', () => {
    const plan = planImport([p({ reqId: 'SRS-1', status: 'Bogus' })], new Map([['SRS-1', 1]]))
    expect(plan.actions).toHaveLength(0)
    expect(plan.skipped).toBe(1)
    expect(plan.errors[0]).toMatch(/status/i)
  })
  it('skips a row with invalid verification_status', () => {
    const rows = [{ reqId: '', section: '', text: 'T', acceptanceCriteria: '', source: '', rationale: '',
      entryType: '', reqType: 'Functional', status: 'Draft', priority: 'Medium',
      verificationStatus: 'Bogus', derivedFrom: [], custom: {} }]
    const plan = planImport(rows as any, new Map())
    expect(plan.skipped).toBe(1)
    expect(plan.errors[0]).toContain('verification_status')
  })
})

describe('resolveDerivedFrom', () => {
  it('separates known parents from reported unknowns', () => {
    const { resolved, errors } = resolveDerivedFrom(['SRS-2', 'SRS-X'], new Set(['SRS-2']))
    expect(resolved).toEqual(['SRS-2'])
    expect(errors[0]).toMatch(/SRS-X/)
  })
})
