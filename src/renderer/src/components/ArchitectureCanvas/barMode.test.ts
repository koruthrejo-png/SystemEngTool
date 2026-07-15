import { it, expect } from 'vitest'
import { barMode } from './barMode'

it('is none when nothing is selected', () => {
  expect(barMode(null, null)).toBe('none')
})

it('is object when an element is selected', () => {
  expect(barMode(100, null)).toBe('object')
})

it('is connection when a connection is selected', () => {
  expect(barMode(null, 5)).toBe('connection')
})
