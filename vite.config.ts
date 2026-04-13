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
        // Explicit vendor chunks prevent Rollup from creating hybrid shared
        // chunks that mix vendor and application code — the root cause of
        // "Cannot access X before initialization" TDZ crashes in production.
        manualChunks: {
          'vendor-react':  ['react', 'react-dom'],
          'vendor-konva':  ['konva', 'react-konva'],
          'vendor-i18n':   ['i18next', 'react-i18next'],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
})

