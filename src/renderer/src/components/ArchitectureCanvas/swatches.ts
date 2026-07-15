// Paired palette: each hue carries a dark `border` shade (sits under the header's
// white text) and a pale `fill` shade (sits under the body's dark text). One list,
// two shades — so a teal-bordered block with a teal fill visibly matches.
// The contract is enforced in swatches.test.ts; keep new entries inside it.

export const NAVY = '#1a365d'

export type Swatch = { name: string; border: string; fill: string }

export const SWATCHES: Swatch[] = [
  { name: 'Navy', border: NAVY, fill: '#e8eef6' },
  { name: 'Slate', border: '#475569', fill: '#eef1f5' },
  { name: 'Teal', border: '#0f766e', fill: '#e3f3f1' },
  { name: 'Green', border: '#3f6212', fill: '#eef4e4' },
  { name: 'Amber', border: '#a16207', fill: '#fbf2e0' },
  { name: 'Red', border: '#9f1239', fill: '#fbe9ee' },
  { name: 'Purple', border: '#6b21a8', fill: '#f3e9fb' },
  { name: 'Grey', border: '#3f3f46', fill: '#f1f1f2' }
]
