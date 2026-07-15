import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    // Nested worktrees carry their own copy of src/; collecting them double-runs
    // the suite and misses environmentMatchGlobs (which anchor at src/).
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/worktrees/**'],
    environmentMatchGlobs: [
      ['src/renderer/**', 'jsdom'],
      ['src/main/**', 'node'],
      ['src/preload/**', 'node']
    ],
    setupFiles: ['src/renderer/test-setup.ts']
  }
})
