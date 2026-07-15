import { describe, it, expect } from 'vitest'
import { SWATCHES, NAVY } from './swatches'

// WCAG relative luminance + contrast ratio. Six lines, no dependency.
const lum = (hex: string): number => {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (hi + 0.05) / (lo + 0.05)
}

describe('SWATCHES legibility contract', () => {
  // The header always carries white bold text (BlockNode.tsx:40), so every border
  // shade must clear WCAG AA against white. This is the invariant a future hand
  // breaks by pasting in a pretty colour.
  it('every border shade clears AA (4.5:1) against white header text', () => {
    for (const s of SWATCHES) {
      expect.soft(contrast(s.border, '#ffffff'), `${s.name} border`).toBeGreaterThanOrEqual(4.5)
    }
  })

  // Deliberately NOT an AA assertion against text-ink-faint (#64748b): no fill can
  // pass it — plain white only reaches 4.76:1, so the token is marginal before any
  // fill exists (see spec §1.1). "Pale" is the property actually relied on.
  it('every fill shade is pale', () => {
    for (const s of SWATCHES) {
      expect.soft(lum(s.fill), `${s.name} fill`).toBeGreaterThan(0.8)
    }
  })

  it('leads with NAVY, the existing default border colour', () => {
    expect(SWATCHES[0].border).toBe(NAVY)
    expect(NAVY).toBe('#1a365d')
  })

  it('has unique hue names, so chips are addressable by label', () => {
    const names = SWATCHES.map((s) => s.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
