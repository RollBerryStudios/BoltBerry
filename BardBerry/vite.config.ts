import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  base: './',
  build: {
    sourcemap: false,
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/renderer/index.html'),
      output: {
        manualChunks(id) {
          const p = id.replace(/\\/g, '/')
          if (p.includes('/node_modules/react-dom/') || p.includes('/node_modules/scheduler/')) return 'vendor-react'
          if (p.includes('/node_modules/react/')) return 'vendor-react'
          if (p.includes('/node_modules/zustand/')) return 'vendor-state'
        },
      },
    },
  },
  server: {
    port: 5174,
  },
})
