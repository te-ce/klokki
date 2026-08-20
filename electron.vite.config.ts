import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

// `electron` is a devDependency, so externalizeDepsPlugin leaves it alone and
// the bundler would inline the npm package's launcher shim — which requires
// child_process and so cannot load in a sandboxed preload at all.
const ELECTRON = ['electron']

// Entry points follow electron-vite conventions:
//   main     -> src/main/index.ts
//   preload  -> src/preload/index.ts
//   renderer -> src/renderer/index.html
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { external: ELECTRON } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ELECTRON,
        // Sandboxed preload scripts must be CommonJS — Electron cannot load an
        // ESM preload into a sandboxed renderer, and `type: module` would
        // otherwise make Vite emit index.mjs.
        output: { format: 'cjs', entryFileNames: 'index.js' },
      },
    },
  },
  renderer: { plugins: [react(), tailwindcss()] },
})
