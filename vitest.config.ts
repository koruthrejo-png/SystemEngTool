import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environmentMatchGlobs: [
      ['src/renderer/**', 'jsdom'],
      ['src/main/**', 'node'],
      ['src/preload/**', 'node']
    ],
    setupFiles: ['src/renderer/test-setup.ts']
  }
})
