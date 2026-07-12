import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from './index'

beforeEach(() => {
  useStore.setState({ interfaceArchFilter: 'all' })
})

describe('interfaceArchFilter', () => {
  it('defaults to "all"', () => {
    expect(useStore.getState().interfaceArchFilter).toBe('all')
  })

  it('setInterfaceArchFilter updates the filter', () => {
    useStore.getState().setInterfaceArchFilter(7)
    expect(useStore.getState().interfaceArchFilter).toBe(7)
    useStore.getState().setInterfaceArchFilter('all')
    expect(useStore.getState().interfaceArchFilter).toBe('all')
  })
})
