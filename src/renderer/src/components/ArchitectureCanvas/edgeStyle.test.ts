import { describe, it, expect } from 'vitest'
import { MarkerType } from '@xyflow/react'
import { dashArray, edgeMarker } from './edgeStyle'

describe('dashArray', () => {
  it('solid / null → undefined (no dashes)', () => {
    expect(dashArray('solid')).toBeUndefined()
    expect(dashArray(null)).toBeUndefined()
  })
  it('dashed → "6 4", dotted → "2 2"', () => {
    expect(dashArray('dashed')).toBe('6 4')
    expect(dashArray('dotted')).toBe('2 2')
  })
})

describe('edgeMarker', () => {
  it('none / null / undefined → undefined (no marker)', () => {
    expect(edgeMarker('none', '#000')).toBeUndefined()
    expect(edgeMarker(null, '#000')).toBeUndefined()
    expect(edgeMarker(undefined, '#000')).toBeUndefined()
  })
  it('arrow → open arrowhead with color', () => {
    expect(edgeMarker('arrow', '#94a3b8')).toEqual({ type: MarkerType.Arrow, color: '#94a3b8' })
  })
  it('arrowclosed → filled arrowhead with color', () => {
    expect(edgeMarker('arrowclosed', '#42682d')).toEqual({ type: MarkerType.ArrowClosed, color: '#42682d' })
  })
})
