export type BarMode = 'none' | 'object' | 'connection'

// The top bar's contextual segment dispatches on selection type. selectElement/selectConnection
// null each other (store/index.ts), so the two ids are mutually exclusive and there are exactly
// three states. Element wins if that ever stops being true.
export function barMode(selectedElementId: number | null, selectedConnectionId: number | null): BarMode {
  if (selectedElementId != null) return 'object'
  if (selectedConnectionId != null) return 'connection'
  return 'none'
}
