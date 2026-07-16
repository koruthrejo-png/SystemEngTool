// Paired palette: each hue carries a dark `border` shade (sits under the header's
// white text) and a pale `fill` shade (sits under the body's dark text). One list,
// two shades — so a teal-bordered block with a teal fill visibly matches.
// The contract is enforced in swatches.test.ts; keep new entries inside it.

import { NAVY, TYPE_BORDER_COLORS } from '../../../../types'

export { NAVY }

export type Swatch = { name: string; border: string; fill: string }

export const SWATCHES: Swatch[] = [
  { name: 'Navy',   border: TYPE_BORDER_COLORS.Navy,   fill: '#e8eef6' },
  { name: 'Slate',  border: TYPE_BORDER_COLORS.Slate,  fill: '#eef1f5' },
  { name: 'Teal',   border: TYPE_BORDER_COLORS.Teal,   fill: '#e3f3f1' },
  { name: 'Green',  border: TYPE_BORDER_COLORS.Green,  fill: '#eef4e4' },
  { name: 'Amber',  border: TYPE_BORDER_COLORS.Amber,  fill: '#fbf2e0' },
  { name: 'Red',    border: TYPE_BORDER_COLORS.Red,    fill: '#fbe9ee' },
  { name: 'Purple', border: TYPE_BORDER_COLORS.Purple, fill: '#f3e9fb' },
  { name: 'Grey',   border: TYPE_BORDER_COLORS.Grey,   fill: '#f1f1f2' }
]
