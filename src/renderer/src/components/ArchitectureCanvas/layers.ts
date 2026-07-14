import type { Layer } from '../../../../types'

export type Visibility = 'normal' | 'faded' | 'hidden'

const RANK: Record<Visibility, number> = { normal: 2, faded: 1, hidden: 0 }
const fromState = (s: Layer['state']): Visibility => (s === 'visible' ? 'normal' : s === 'faded' ? 'faded' : 'hidden')

// No member layers (or none resolvable) → base content, always visible.
// Otherwise the MOST visible member wins (any Visible → normal, else any Faded → faded, else hidden).
export function effectiveVisibility(memberLayerIds: number[], layersById: Map<number, Layer>): Visibility {
  let best: Visibility | null = null
  for (const id of memberLayerIds) {
    const layer = layersById.get(id)
    if (!layer) continue
    const v = fromState(layer.state)
    if (best === null || RANK[v] > RANK[best]) best = v
  }
  return best ?? 'normal'
}

// A connector is never more visible than its stricter endpoint (and never more than its own layers).
export function resolveConnectorVisibility(own: Visibility, source: Visibility, target: Visibility): Visibility {
  return [own, source, target].reduce((a, b) => (RANK[b] < RANK[a] ? b : a))
}
