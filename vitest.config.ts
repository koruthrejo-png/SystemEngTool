import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // item 23: `better-sqlite3` is built for Electron's ABI (125) by the postinstall
      // `electron-rebuild -f -w better-sqlite3` — that is WHY the app runs, and rebuilding
      // it for node's ABI (127) would break the app. One build cannot serve both runtimes.
      // `better-sqlite3-node` is an npm alias for the SAME version, left at its node-ABI
      // prebuild: electron-rebuild's `-w` only ever targets the `better-sqlite3` directory,
      // so this copy survives untouched. Tests get a real SQLite; the app keeps its own.
      // Keep the two versions identical, or tests stop exercising what ships.
      'better-sqlite3': 'better-sqlite3-node'
    }
  },
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
