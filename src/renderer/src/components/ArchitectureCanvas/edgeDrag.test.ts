import { describe, it, expect } from 'vitest'
import { nearerEnd } from './edgeDrag'

describe('nearerEnd', () => {
  // source at (0,0), target at (10,0)
  it('picks source when nearer', () => {
    expect(nearerEnd(2, 0, 0, 0, 10, 0)).toBe('source')
  })
  it('picks target when nearer', () => {
    expect(nearerEnd(8, 0, 0, 0, 10, 0)).toBe('target')
  })
  it('ties to source at the midpoint', () => {
    expect(nearerEnd(5, 0, 0, 0, 10, 0)).toBe('source')
  })
  it('uses both axes', () => {
    expect(nearerEnd(1, 9, 0, 0, 0, 10)).toBe('target')
  })
})
