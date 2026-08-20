import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  entry: ['e2e/**/*.spec.ts', 'scripts/**/*.ts'],
  project: ['src/**/*.{ts,tsx}', 'e2e/**/*.ts', 'scripts/**/*.ts'],
  ignoreDependencies: [
    // Peer of @tailwindcss/vite, never imported directly.
    'tailwindcss',
  ],
  ignoreExportsUsedInFile: true,
}

export default config
