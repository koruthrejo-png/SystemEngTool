import { describe, it, expect } from 'vitest'
import { effectiveVisibility, resolveConnectorVisibility } from './layers'
import type { Layer } from '../../../../types'

const L = (id: number, state: Layer['state']): Layer =>
  ({ id, architectureId: 1, name: 'L' + id, state, position: id, deletedAt: null, createdAt: '', updatedAt: '' })

const byId = (...ls: Layer[]): Map<number, Layer> => new Map(ls.map((l) => [l.id, l]))

describe('effectiveVisibility', () => {
  it('no member layers → normal (base content)', () => {
    expect(effectiveVisibility([], byId(L(1, 'hidden')))).toBe('normal')
  })
  it('any visible member → normal', () => {
    expect(effectiveVisibility([1, 2], byId(L(1, 'hidden'), L(2, 'visible')))).toBe('normal')
  })
  it('no visible but a faded member → faded', () => {
    expect(effectiveVisibility([1, 2], byId(L(1, 'hidden'), L(2, 'faded')))).toBe('faded')
  })
  it('all members hidden → hidden', () => {
    expect(effectiveVisibility([1, 2], byId(L(1, 'hidden'), L(2, 'hidden')))).toBe('hidden')
  })
  it('member layer missing from map is ignored → normal', () => {
    expect(effectiveVisibility([99], byId(L(1, 'hidden')))).toBe('normal')
  })
})

describe('resolveConnectorVisibility', () => {
  it('takes the strictest of own/source/target', () => {
    expect(resolveConnectorVisibility('normal', 'normal', 'normal')).toBe('normal')
    expect(resolveConnectorVisibility('normal', 'faded', 'normal')).toBe('faded')
    expect(resolveConnectorVisibility('normal', 'normal', 'hidden')).toBe('hidden')
    expect(resolveConnectorVisibility('faded', 'normal', 'normal')).toBe('faded')
    expect(resolveConnectorVisibility('hidden', 'faded', 'normal')).toBe('hidden')
  })
})
