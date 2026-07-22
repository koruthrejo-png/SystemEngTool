import { describe, it, expect } from 'vitest'
import { escapeXml, buildSectionPath, findHeadingByPath } from './model'

describe('escapeXml', () => {
  it('escapes the five XML entities', () => {
    expect(escapeXml(`a & b < c > d " e ' f`)).toBe('a &amp; b &lt; c &gt; d &quot; e &apos; f')
  })
})

describe('buildSectionPath', () => {
  const byId = new Map([
    [1, { parentId: null, title: 'Power' }],
    [2, { parentId: 1, title: 'Thermal' }]
  ])
  it('walks parents into a > path', () => {
    expect(buildSectionPath(2, byId)).toBe('Power > Thermal')
  })
  it('returns empty string for no heading', () => {
    expect(buildSectionPath(null, byId)).toBe('')
  })
})

describe('findHeadingByPath', () => {
  const headings = [
    { id: 1, parentId: null, title: 'Power' },
    { id: 2, parentId: 1, title: 'Thermal' }
  ]
  it('matches an exact title-path', () => {
    expect(findHeadingByPath('Power > Thermal', headings)).toBe(2)
  })
  it('returns null for an unknown path', () => {
    expect(findHeadingByPath('Power > Nope', headings)).toBeNull()
    expect(findHeadingByPath('', headings)).toBeNull()
  })
})
