/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#1a365d', deep: '#002045' },
        action: { DEFAULT: '#42682d', hover: '#365424', tint: '#dcefc8' },
        workspace: '#f8fafc',
        line: '#e2e8f0',
        ink: { DEFAULT: '#0b1c30', muted: '#43474e', faint: '#64748b' },
        error: '#ba1a1a'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace']
      }
    }
  },
  plugins: []
}
