---
name: Industrial Precision
source: Stitch project "Integrated Requirements Architecture" (projects/9610086237141072081)
colors:
  # Core palette actually used for implementation (see spec for mapping)
  navy-primary: '#1a365d'      # top nav, structural headers (Stitch primary-container)
  navy-deep: '#002045'          # darkest navy (Stitch primary)
  green-primary: '#42682d'      # primary action buttons, active states (Stitch secondary)
  green-container: '#c3f0a5'    # active-item tint (Stitch secondary-container)
  workspace: '#f8fafc'          # app background behind panels
  content: '#ffffff'            # panel/card surfaces
  border: '#e2e8f0'             # 1px panel and table borders
  text-strong: '#0b1c30'        # on-surface
  text-muted: '#43474e'         # on-surface-variant
  neutral: '#64748b'            # slate for secondary text/icons
  error: '#ba1a1a'
typography:
  headline-lg: { fontFamily: Inter, fontSize: 24px, fontWeight: 600, lineHeight: 32px, letterSpacing: -0.02em }
  headline-md: { fontFamily: Inter, fontSize: 18px, fontWeight: 600, lineHeight: 24px, letterSpacing: -0.01em }
  body-lg: { fontFamily: Inter, fontSize: 16px, fontWeight: 400, lineHeight: 24px }
  body-md: { fontFamily: Inter, fontSize: 14px, fontWeight: 400, lineHeight: 20px }
  body-sm: { fontFamily: Inter, fontSize: 13px, fontWeight: 400, lineHeight: 18px }
  label-caps: { fontFamily: Inter, fontSize: 11px, fontWeight: 700, lineHeight: 16px, letterSpacing: 0.05em }
  code-sm: { fontFamily: JetBrains Mono, fontSize: 12px, fontWeight: 400, lineHeight: 16px }
rounded:
  DEFAULT: 0.25rem   # buttons, inputs, cards
  full: 9999px       # badges/pills
spacing:
  grid-unit: 4px
  gutter: 16px
  margin-page: 24px
  toolbar-height: 48px
  nav-height: 56px
---

## Brand & Style

Engineered for engineering. Prioritizes clarity, structural integrity, and
information density over decorative flair. Corporate/Modern leaning Industrial
Minimalism: rigid alignments, focused palette, utilitarian details.

## Key rules (condensed from the Stitch design system)

- **Navy** for global infrastructure: top nav bar, structural headers.
- **Forest Green** for primary actions ("+ New …" buttons), active nav/tree
  items, and success states.
- **Backgrounds:** workspace gray `#f8fafc` behind white `#ffffff` panels with
  1px `#e2e8f0` borders. Tonal layers + low-contrast outlines instead of heavy
  shadows; modals may use `0 4px 12px rgba(0,0,0,0.08)`.
- **Typography:** Inter for UI; JetBrains Mono for system identifiers
  (requirement IDs, element IDs). `label-caps` for table headers and section
  labels.
- **Tables:** sticky header with label-caps + 1px bottom border; zebra striping
  at 50% opacity of workspace color; body-sm cells; 12–16px vertical padding.
- **Buttons:** primary = solid green + white text; secondary = ghost with navy
  border/text. 4px radius.
- **Inputs:** 1px slate border, 8px horizontal padding, 2px green focus ring.
- **Diagram nodes:** solid colored header (label-caps, white), white body with
  1px border matching the header color, top-only 4px rounding; mono ID.
- **Badges:** pill-shaped, high-contrast tinted background with dark text.
- **Shell:** 56px global header, 48px sub-toolbar, ~320px side panels, strict
  4px baseline grid.
