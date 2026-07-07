import { describe, it, expect } from 'vitest'
import { summarize } from './acSummary'
import type { AcceptanceCriterion } from '../../../types'

function item(over: Partial<AcceptanceCriterion>): AcceptanceCriterion {
  return {
    id: 1, requirementId: 1, text: '', status: 'Unverified', position: 0,
    createdAt: '', updatedAt: '', ...over
  }
}

describe('summarize', () => {
  it('groups by requirement with passed count and first text by position', () => {
    const s = summarize([
      item({ id: 1, requirementId: 10, text: 'boots in 2s', status: 'Passed', position: 1 }),
      item({ id: 2, requirementId: 10, text: 'logs errors', status: 'Unverified', position: 0 }),
      item({ id: 3, requirementId: 20, text: 'x', status: 'Failed', position: 0 })
    ])
    expect(s[10]).toEqual({ passed: 1, total: 2, first: 'logs errors' })
    expect(s[20]).toEqual({ passed: 0, total: 1, first: 'x' })
  })

  it('empty input yields empty map', () => {
    expect(summarize([])).toEqual({})
  })
})
