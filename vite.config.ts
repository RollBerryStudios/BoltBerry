import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer'),
    },
  },
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/renderer/index.html'),
        player: resolve(__dirname, 'src/renderer/player.html'),
      },
      output: {
        // Path-based manualChunks catches every sub-entry of each package
        // (e.g. react/jsx-runtime, konva/lib/...) — not just the main entry.
        //
        // The previous string-based form only pinned top-level entry points,
        // so react/jsx-runtime fell into the shared fogUtils chunk and Rollup
        // routed its React import through vendor-i18n instead of vendor-react.
        // That cross-chunk indirection was the root cause of every
        // "Cannot access X before initialization" TDZ crash in production.
        manualChunks(id) {
          // react-dom and scheduler must be matched before the 'react/' check
          // (react-dom path does NOT contain '/react/' so order doesn't matter,
          // but being explicit avoids surprises when packages rename internals)
          if (id.includes('/node_modules/react-dom/') ||
              id.includes('/node_modules/scheduler/')) return 'vendor-react'
          if (id.includes('/node_modules/react/'))      return 'vendor-react'
          if (id.includes('/node_modules/react-konva/') ||
              id.includes('/node_modules/konva/') ||
              id.includes('/node_modules/react-konva-utils/')) return 'vendor-konva'
          if (id.includes('/node_modules/react-i18next/') ||
              id.includes('/node_modules/i18next/'))    return 'vendor-i18n'
        },
      },
    },
  },
  server: {
    port: 5173,
  },
})

