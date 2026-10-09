import type { Requirement } from '../../../../types'

export type LintSeverity = 'warning' | 'info'

/**
 * One heuristic. `check` returns the human-readable message when the rule fires, else null —
 * one function instead of the spec's separate `test`/`message` pair plumbing a match object.
 */
export interface LintRule {
  id: string
  severity: LintSeverity
  check: (r: Requirement) => string | null
}

export interface LintFinding {
  ruleId: string
  severity: LintSeverity
  message: string
}

/** Imperative keywords that make a statement a commitment. */
const KEYWORD = /\b(?:shall|must|will)\b/i

/** Words that undermine testability — a "should" is not a commitment. */
const WEAK = /\b(?:should|may|might|could|would|can|possibly|optionally|if possible|where appropriate)\b/i

/** Terms with no measurable threshold behind them. */
const VAGUE = /\b(?:fast|quickly|efficient|user-friendly|robust|minimal|TBD|as needed|etc\.?)\b/i

const MIN_CHARS = 15

/**
 * Rules in display order. Adding one is a single entry here plus a single test case —
 * the list is data, deliberately not a registry or a plugin surface.
 */
export const LINT_RULES: readonly LintRule[] = [
  {
    id: 'no-shall',
    severity: 'warning',
    check: (r) => (KEYWORD.test(r.text) ? null : "No requirement keyword — use 'shall'.")
  },
  {
    id: 'weak-word',
    severity: 'warning',
    check: (r) => {
      const m = r.text.match(WEAK)
      return m ? `Weak/ambiguous word: '${m[0]}'.` : null
    }
  },
  {
    id: 'compound',
    severity: 'info',
    // Two imperative keywords in one statement = two requirements wearing one ID. Counting
    // keywords (rather than also flagging " and " after a keyword, which the spec's prose
    // offered) is what keeps "The system shall log X and Y" — a single clause — quiet.
    check: (r) =>
      (r.text.match(/\b(?:shall|must|will)\b/gi) ?? []).length >= 2
        ? 'Possible compound requirement — consider splitting.'
        : null
  },
  {
    id: 'no-ac',
    severity: 'warning',
    check: (r) => (r.acceptanceCriteria?.trim() ? null : 'No acceptance criteria.')
  },
  {
    id: 'no-verification-method',
    severity: 'info',
    check: (r) => (r.verificationMethod == null ? 'No verification method assigned.' : null)
  },
  {
    id: 'vague-quantifier',
    severity: 'info',
    check: (r) => {
      const m = r.text.match(VAGUE)
      return m ? `Unmeasurable term: '${m[0]}'.` : null
    }
  },
  {
    id: 'too-short',
    severity: 'info',
    check: (r) =>
      r.text.replace(/\s/g, '').length < MIN_CHARS
        ? 'Requirement text looks too short to be testable.'
        : null
  }
]

/** Every rule that fires, in `LINT_RULES` order. Pure and total: same input, same output, never throws. */
export function lintRequirement(r: Requirement): LintFinding[] {
  const findings: LintFinding[] = []
  for (const rule of LINT_RULES) {
    const message = rule.check(r)
    if (message != null) findings.push({ ruleId: rule.id, severity: rule.severity, message })
  }
  return findings
}

/** Findings tallied by severity — the table dot only cares about `warnings`. */
export function lintCount(r: Requirement): { warnings: number; infos: number } {
  const findings = lintRequirement(r)
  return {
    warnings: findings.filter((f) => f.severity === 'warning').length,
    infos: findings.filter((f) => f.severity === 'info').length
  }
}
