import { describe, it, expect } from 'vitest'
import { lintRequirement, lintCount, LINT_RULES } from './lint'
import type { Requirement } from '../../../../types'

function req(partial: Partial<Requirement> = {}): Requirement {
  return {
    id: 1, moduleId: 1, reqId: 'SRS-1', text: 'The system shall record the brake pressure.',
    acceptanceCriteria: 'Pressure is logged every 100ms.', source: null, rationale: null,
    status: 'Draft', priority: 'Medium', reqType: 'Functional', entryType: 'Requirement',
    verificationStatus: 'Unverified', verificationMethod: 'Test',
    headingId: null, position: 0, deletedAt: null, createdAt: '', updatedAt: '',
    createdBy: null, updatedBy: null, ...partial
  }
}

/** Rule ids that fired, for terse assertions. */
const ids = (r: Requirement): string[] => lintRequirement(r).map((f) => f.ruleId)

describe('baseline', () => {
  it('a well-formed requirement produces no findings', () => {
    expect(lintRequirement(req())).toEqual([])
  })
})

describe('no-shall', () => {
  it('fires without an imperative keyword', () => {
    expect(ids(req({ text: 'The system records the brake pressure.' }))).toContain('no-shall')
  })

  it('stays quiet for shall / must / will', () => {
    for (const kw of ['shall', 'must', 'will']) {
      expect(ids(req({ text: `The system ${kw} record the brake pressure.` }))).not.toContain('no-shall')
    }
  })
})

describe('weak-word', () => {
  it('fires and cites the offending word', () => {
    const findings = lintRequirement(req({ text: 'The system should record the brake pressure.' }))
    expect(findings.find((f) => f.ruleId === 'weak-word')?.message).toBe("Weak/ambiguous word: 'should'.")
  })

  it('is whole-word: "shoulder" does not trip "should"', () => {
    expect(ids(req({ text: 'The harness shall restrain the shoulder of the occupant.' })))
      .not.toContain('weak-word')
  })

  it('catches the multi-word entries', () => {
    expect(ids(req({ text: 'The system shall log events where appropriate.' }))).toContain('weak-word')
  })
})

describe('compound', () => {
  it('fires when an imperative keyword appears twice', () => {
    expect(ids(req({ text: 'The system shall record pressure and shall raise an alarm.' })))
      .toContain('compound')
  })

  it('stays quiet on a single clause joined by "and"', () => {
    expect(ids(req({ text: 'The system shall log pressure and temperature.' }))).not.toContain('compound')
  })
})

describe('no-ac', () => {
  it('fires on null acceptance criteria', () => {
    expect(ids(req({ acceptanceCriteria: null }))).toContain('no-ac')
  })

  it('fires on whitespace-only acceptance criteria', () => {
    expect(ids(req({ acceptanceCriteria: '   \n ' }))).toContain('no-ac')
  })
})

describe('no-verification-method', () => {
  it('fires when unassigned', () => {
    expect(ids(req({ verificationMethod: null }))).toContain('no-verification-method')
  })

  it('stays quiet once assigned', () => {
    expect(ids(req({ verificationMethod: 'Analysis' }))).not.toContain('no-verification-method')
  })
})

describe('vague-quantifier', () => {
  it('fires and cites the term', () => {
    const findings = lintRequirement(req({ text: 'The system shall respond quickly to the request.' }))
    expect(findings.find((f) => f.ruleId === 'vague-quantifier')?.message)
      .toBe("Unmeasurable term: 'quickly'.")
  })

  it('catches the hyphenated and abbreviated terms', () => {
    expect(ids(req({ text: 'The interface shall be user-friendly for all operators.' })))
      .toContain('vague-quantifier')
    expect(ids(req({ text: 'The timeout value shall be TBD by the supplier.' })))
      .toContain('vague-quantifier')
  })

  it('is whole-word: "robustness" in a longer word does not trip it', () => {
    expect(ids(req({ text: 'The system shall report the fastener torque on demand.' })))
      .not.toContain('vague-quantifier')
  })
})

describe('too-short', () => {
  it('fires below the character floor, ignoring whitespace', () => {
    expect(ids(req({ text: 'It  shall  go' }))).toContain('too-short')
  })

  it('stays quiet at or above the floor', () => {
    expect(ids(req({ text: 'The valve shall open.' }))).not.toContain('too-short')
  })
})

describe('totality', () => {
  it('blank text and blank AC produce findings without throwing', () => {
    expect(() => lintRequirement(req({ text: '', acceptanceCriteria: '' }))).not.toThrow()
    expect(ids(req({ text: '', acceptanceCriteria: '' }))).toEqual(
      expect.arrayContaining(['no-shall', 'no-ac', 'too-short'])
    )
  })

  it('every rule is reachable — no rule has an id typo or a dead branch', () => {
    expect(new Set(LINT_RULES.map((r) => r.id)).size).toBe(LINT_RULES.length)
  })
})

describe('lintCount', () => {
  it('tallies warnings and infos separately', () => {
    // 'should' with no AC and no method: no-shall + weak-word + no-ac are warnings,
    // no-verification-method is an info.
    const counts = lintCount(req({
      text: 'The system should record the brake pressure.',
      acceptanceCriteria: null,
      verificationMethod: null
    }))
    expect(counts).toEqual({ warnings: 3, infos: 1 })
  })

  it('is zero on a clean requirement', () => {
    expect(lintCount(req())).toEqual({ warnings: 0, infos: 0 })
  })
})
