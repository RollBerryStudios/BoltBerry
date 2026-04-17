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
    sourcemap: false,
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/renderer/index.html'),
        player: resolve(__dirname, 'src/renderer/player.html'),
      },
      output: {
        // manualChunks: isolate vendor packages into stable named chunks.
        //
        // IMPORTANT: Rollup passes Windows paths with backslashes on Windows
        // builds, so we normalise to forward slashes before matching.
        //
        // konva and react-konva are intentionally kept in SEPARATE chunks:
        // - vendor-konva   → the raw Konva library only
        // - vendor-react-konva → react-konva + react-konva-utils
        // This guarantees the module system fully initialises konva before
        // react-konva runs any of its 72 module-level const declarations that
        // extend Konva classes, preventing "Cannot access X before init" TDZ.
        manualChunks(id) {
          const p = id.replace(/\\/g, '/')
          if (p.includes('/node_modules/react-dom/') ||
              p.includes('/node_modules/scheduler/'))   return 'vendor-react'
          if (p.includes('/node_modules/react/'))       return 'vendor-react'
          if (p.includes('/node_modules/react-konva/') ||
              p.includes('/node_modules/react-konva-utils/')) return 'vendor-react-konva'
          if (p.includes('/node_modules/konva/'))       return 'vendor-konva'
          if (p.includes('/node_modules/react-i18next/') ||
              p.includes('/node_modules/i18next/'))     return 'vendor-i18n'
        },
      },
    },
  },
  server: {
    port: 5173,
  },
})

