import { describe, it, expect } from 'vitest'
import { shouldDeleteConnection, isTyping } from './deleteKey'

const ev = (key: string, tag = 'DIV', contentEditable = false): KeyboardEvent =>
  ({ key, repeat: false, target: { tagName: tag, isContentEditable: contentEditable } } as unknown as KeyboardEvent)

describe('shouldDeleteConnection', () => {
  it('Delete/Backspace with a selected connection and not typing → true', () => {
    expect(shouldDeleteConnection(ev('Delete'), 5)).toBe(true)
    expect(shouldDeleteConnection(ev('Backspace'), 5)).toBe(true)
  })
  it('no selected connection → false', () => {
    expect(shouldDeleteConnection(ev('Delete'), null)).toBe(false)
  })
  it('other keys → false', () => {
    expect(shouldDeleteConnection(ev('a'), 5)).toBe(false)
  })
  it('while typing in INPUT/TEXTAREA/SELECT/contenteditable → false', () => {
    expect(shouldDeleteConnection(ev('Delete', 'INPUT'), 5)).toBe(false)
    expect(shouldDeleteConnection(ev('Delete', 'TEXTAREA'), 5)).toBe(false)
    expect(shouldDeleteConnection(ev('Delete', 'SELECT'), 5)).toBe(false)
    expect(shouldDeleteConnection(ev('Delete', 'DIV', true), 5)).toBe(false)
  })
  it('key autorepeat → false', () => {
    const e = { key: 'Delete', repeat: true, target: { tagName: 'DIV', isContentEditable: false } } as unknown as KeyboardEvent
    expect(shouldDeleteConnection(e, 5)).toBe(false)
  })
})

describe('isTyping', () => {
  it('form fields and contenteditable → true; anything else → false', () => {
    expect(isTyping(ev('z', 'INPUT'))).toBe(true)
    expect(isTyping(ev('z', 'TEXTAREA'))).toBe(true)
    expect(isTyping(ev('z', 'SELECT'))).toBe(true)
    expect(isTyping(ev('z', 'DIV', true))).toBe(true)
    expect(isTyping(ev('z', 'DIV'))).toBe(false)
  })
})
