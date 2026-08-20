import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

// Entry points follow electron-vite conventions:
//   main     -> src/main/index.ts
//   preload  -> src/preload/index.ts
//   renderer -> src/renderer/index.html
export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // Sandboxed preload scripts must be CommonJS — Electron cannot load an
        // ESM preload into a sandboxed renderer, and `type: module` would
        // otherwise make Vite emit index.mjs.
        output: { format: 'cjs', entryFileNames: 'index.js' },
      },
    },
  },
  renderer: { plugins: [react(), tailwindcss()] },
})
