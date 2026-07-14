// True when a Delete/Backspace keypress should remove the selected connection:
// a connection is selected, the user isn't typing in a form field, and it's not an autorepeat.
export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  if (!t) return false
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable
}

export function shouldDeleteConnection(e: KeyboardEvent, selectedConnectionId: number | null): boolean {
  if (e.repeat) return false
  if (e.key !== 'Delete' && e.key !== 'Backspace') return false
  if (selectedConnectionId == null) return false
  return !isTyping(e)
}
