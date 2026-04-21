/**
 * Global setup — runs once before all E2E tests.
 *
 * Responsibilities:
 *  - Verify the app is built (dist/ must exist).
 *  - Print helpful diagnostics if the build is missing.
 */

import { existsSync } from 'fs'
import { resolve } from 'path'

export default async function globalSetup() {
  const distMain = resolve(__dirname, '../dist/main/index.js')
  const distRenderer = resolve(__dirname, '../dist/renderer/index.html')
  const distPreloadDM = resolve(__dirname, '../dist/preload/preload-dm.js')
  const distPreloadPlayer = resolve(__dirname, '../dist/preload/preload-player.js')

  const missing = [distMain, distRenderer, distPreloadDM, distPreloadPlayer].filter(
    (p) => !existsSync(p),
  )

  if (missing.length > 0) {
    throw new Error(
      `\n\n❌ BoltBerry build artefacts not found.\n` +
      `   Run  npm run build  before executing E2E tests.\n` +
      `   Missing:\n` +
      missing.map((p) => `     ${p}`).join('\n') + '\n',
    )
  }

  console.log('✅ Build artefacts verified.')
}
