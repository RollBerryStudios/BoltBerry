/**
 * Bundles the DM and Player preload scripts into single self-contained files.
 *
 * We previously relied on tsc emitting the preload tree (preload-dm.js plus a
 * sibling index.js plus ../shared/ipc-types.js), and Electron's CommonJS
 * require resolved the graph at load time. That split landed in 58bceb7.
 *
 * Problem: any deployment where one of those three files is missing or
 * out-of-date (stale installer, CI that ran only build:renderer, sandboxed
 * preload quirks across Electron versions) produces a silent preload load
 * failure — `window.electronAPI` is undefined and the renderer shows the
 * vague "Datenbankverbindung nicht verfügbar" banner with no trail.
 *
 * Bundling fixes the root cause: each preload becomes a single .js file with
 * no runtime relative requires (only `electron` stays external).
 */
import { build, context } from 'esbuild'
import { resolve } from 'path'

const ROOT = resolve(process.cwd())
const watch = process.argv.includes('--watch')

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'es2022',
  // Electron provides `electron` at runtime. Everything else (including our
  // own `../shared/ipc-types`) must be inlined so the bundle has no relative
  // requires that could miss on disk.
  external: ['electron'],
  legalComments: 'none',
  logLevel: 'info',
}

const entries = [
  { in: 'src/preload/preload-dm.ts',     out: 'dist/preload/preload-dm.js' },
  { in: 'src/preload/preload-player.ts', out: 'dist/preload/preload-player.js' },
]

if (watch) {
  const contexts = await Promise.all(
    entries.map((e) => context({ ...common, entryPoints: [resolve(ROOT, e.in)], outfile: resolve(ROOT, e.out) }))
  )
  await Promise.all(contexts.map((ctx) => ctx.watch()))
  console.log('[build-preload] watching…')
} else {
  await Promise.all(
    entries.map((e) => build({ ...common, entryPoints: [resolve(ROOT, e.in)], outfile: resolve(ROOT, e.out) }))
  )
}
