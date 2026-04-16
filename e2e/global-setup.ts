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
  const distMain = resolve(__dirname, '../dist/main/main/index.js')
  const distRenderer = resolve(__dirname, '../dist/renderer/index.html')

  if (!existsSync(distMain) || !existsSync(distRenderer)) {
    throw new Error(
      `\n\n❌ BoltBerry build artefacts not found.\n` +
      `   Run  npm run build  before executing E2E tests.\n` +
      `   Expected:\n` +
      `     ${distMain}\n` +
      `     ${distRenderer}\n`
    )
  }

  console.log('✅ Build artefacts verified.')
}
