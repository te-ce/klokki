import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    projects: [
      {
        // Phase machine, presets store, history — pure logic in the main process.
        test: {
          name: 'main',
          environment: 'node',
          include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'renderer',
          environment: 'jsdom',
          setupFiles: ['./src/renderer/src/test-setup.ts'],
          include: ['src/renderer/**/*.test.{ts,tsx}'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/main/**', 'src/renderer/src/**', 'src/shared/**'],
      exclude: ['**/*.test.*', 'src/renderer/src/test-setup.ts'],
    },
  },
})
