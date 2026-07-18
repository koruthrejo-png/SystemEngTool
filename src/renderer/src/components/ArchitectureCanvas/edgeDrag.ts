export type End = 'source' | 'target'

// Which endpoint is closer to a point (squared distance — no sqrt needed).
// Midpoint tie resolves to 'source'.
export function nearerEnd(
  px: number, py: number,
  sx: number, sy: number,
  tx: number, ty: number
): End {
  const ds = (px - sx) ** 2 + (py - sy) ** 2
  const dt = (px - tx) ** 2 + (py - ty) ** 2
  return ds <= dt ? 'source' : 'target'
}
