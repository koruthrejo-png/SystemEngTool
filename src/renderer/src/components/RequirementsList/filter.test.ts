import { describe, it, expect } from 'vitest'
import { matchesRule, applyFilters, isInert, type FilterRule } from './filter'
import type { Requirement } from '../../../../types'

function req(partial: Partial<Requirement> & { id: number }): Requirement {
  return {
    moduleId: 1, reqId: `SRS-${partial.id}`, text: `R${partial.id}`,
    acceptanceCriteria: null, source: null, rationale: null,
    status: 'Draft', priority: 'Medium', reqType: 'Functional',
    headingId: null, position: 0, deletedAt: null, createdAt: '', updatedAt: '',
    createdBy: null, updatedBy: null, ...partial
  }
}

const rule = (partial: Partial<FilterRule> & { attr: FilterRule['attr']; op: FilterRule['op'] }): FilterRule => ({
  id: 'r1', value: '', ...partial
})

describe('matchesRule operators', () => {
  it('contains: matches / excludes', () => {
    expect(matchesRule(req({ id: 1, text: 'The brake system' }), rule({ attr: 'text', op: 'contains', value: 'brake' }))).toBe(true)
    expect(matchesRule(req({ id: 2, text: 'The brake system' }), rule({ attr: 'text', op: 'contains', value: 'engine' }))).toBe(false)
  })

  it('notContains: matches / excludes', () => {
    expect(matchesRule(req({ id: 1, text: 'The brake system' }), rule({ attr: 'text', op: 'notContains', value: 'engine' }))).toBe(true)
    expect(matchesRule(req({ id: 2, text: 'The brake system' }), rule({ attr: 'text', op: 'notContains', value: 'brake' }))).toBe(false)
  })

  it('equals: matches / excludes', () => {
    expect(matchesRule(req({ id: 1, status: 'Approved' }), rule({ attr: 'status', op: 'equals', value: 'Approved' }))).toBe(true)
    expect(matchesRule(req({ id: 2, status: 'Draft' }), rule({ attr: 'status', op: 'equals', value: 'Approved' }))).toBe(false)
  })

  it('startsWith: matches / excludes', () => {
    expect(matchesRule(req({ id: 1, reqId: 'SRS-100' }), rule({ attr: 'reqId', op: 'startsWith', value: 'SRS' }))).toBe(true)
    expect(matchesRule(req({ id: 2, reqId: 'SRS-100' }), rule({ attr: 'reqId', op: 'startsWith', value: 'ICD' }))).toBe(false)
  })

  it('isEmpty: null field and empty string are empty; non-empty is not', () => {
    expect(matchesRule(req({ id: 1, source: null }), rule({ attr: 'source', op: 'isEmpty' }))).toBe(true)
    expect(matchesRule(req({ id: 2, source: '  ' }), rule({ attr: 'source', op: 'isEmpty' }))).toBe(true)
    expect(matchesRule(req({ id: 3, source: 'spec' }), rule({ attr: 'source', op: 'isEmpty' }))).toBe(false)
  })

  it('isNotEmpty: negation of isEmpty over null and populated fields', () => {
    expect(matchesRule(req({ id: 1, source: null }), rule({ attr: 'source', op: 'isNotEmpty' }))).toBe(false)
    expect(matchesRule(req({ id: 2, source: 'spec' }), rule({ attr: 'source', op: 'isNotEmpty' }))).toBe(true)
  })
})

describe('matchesRule value semantics', () => {
  it('multi-word contains matches a req with either word, excludes one with neither', () => {
    const r = rule({ attr: 'text', op: 'contains', value: 'safety critical' })
    expect(matchesRule(req({ id: 1, text: 'A safety requirement' }), r)).toBe(true)
    expect(matchesRule(req({ id: 2, text: 'A critical path' }), r)).toBe(true)
    expect(matchesRule(req({ id: 3, text: 'An ordinary feature' }), r)).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(matchesRule(req({ id: 1, status: 'Approved' }), rule({ attr: 'status', op: 'equals', value: 'APPROVED' }))).toBe(true)
    expect(matchesRule(req({ id: 2, status: 'Approved' }), rule({ attr: 'status', op: 'contains', value: 'APPROVED' }))).toBe(true)
  })
})

describe('isInert', () => {
  it('a value op with empty value is inert; is(Not)Empty never is', () => {
    expect(isInert(rule({ attr: 'text', op: 'contains', value: '   ' }))).toBe(true)
    expect(isInert(rule({ attr: 'text', op: 'contains', value: 'x' }))).toBe(false)
    expect(isInert(rule({ attr: 'source', op: 'isEmpty' }))).toBe(false)
  })
})

describe('applyFilters', () => {
  const reqs = [
    req({ id: 1, text: 'safety brake', status: 'Approved' }),
    req({ id: 2, text: 'engine control', status: 'Draft' }),
    req({ id: 3, text: 'safety valve', status: 'Draft' })
  ]

  it('an inert rule passes everything', () => {
    expect(applyFilters(reqs, [rule({ attr: 'text', op: 'contains', value: '' })], 'AND')).toEqual(reqs)
  })

  it('no active rules returns all reqs', () => {
    expect(applyFilters(reqs, [], 'OR')).toEqual(reqs)
  })

  it('AND requires every rule; OR requires some — distinct result sets', () => {
    const rules: FilterRule[] = [
      rule({ id: 'a', attr: 'text', op: 'contains', value: 'safety' }),
      rule({ id: 'b', attr: 'status', op: 'equals', value: 'Approved' })
    ]
    expect(applyFilters(reqs, rules, 'AND').map((r) => r.id)).toEqual([1])
    expect(applyFilters(reqs, rules, 'OR').map((r) => r.id)).toEqual([1, 3])
  })
})
