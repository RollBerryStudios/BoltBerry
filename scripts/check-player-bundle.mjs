/**
 * Bundle Composition Check
 *
 * Asserts the player bundle does not contain DM-only code (stores, i18n).
 * A TDZ crash in the minified production build was caused by the player entry
 * pulling FogLayer's dependencies (zustand stores + i18n) into a shared chunk.
 *
 * Run after `npm run build:renderer`.
 */
import { readdirSync, readFileSync } from 'fs'
import { resolve, join } from 'path'

const RENDERER_DIST = resolve(process.cwd(), 'dist/renderer/assets')

// Symbols that should NEVER appear in the player bundle
const FORBIDDEN = [
  'useUIStore',         // DM state store
  'useCampaignStore',   // DM campaign data
  'useEncounterStore',  // DM encounter management
  'boltberry-lang',     // i18n locale key (from uiStore init)
  'i18next',            // i18n library
  'useTranslation',     // i18n hook (i18n not initialized in player window)
  'toggleBlackout',     // DM-only UI action
]

// Find the player-*.js chunk
const playerFile = readdirSync(RENDERER_DIST).find(f => f.startsWith('player-') && f.endsWith('.js'))
if (!playerFile) {
  console.error('[check-player-bundle] ERROR: no player-*.js chunk found in dist/renderer/assets')
  process.exit(1)
}

const content = readFileSync(join(RENDERER_DIST, playerFile), 'utf-8')
const found = FORBIDDEN.filter(sym => content.includes(sym))

if (found.length > 0) {
  console.error('[check-player-bundle] FAIL: player bundle contains DM-only symbols:')
  found.forEach(s => console.error(`  - ${s}`))
  console.error('\nThis indicates a cross-entry-point shared chunk that may cause TDZ crashes.')
  console.error('Check for imports from DM-only modules in PlayerApp.tsx or files it imports.')
  process.exit(1)
} else {
  console.log(`[check-player-bundle] OK — ${playerFile} (${(content.length / 1024).toFixed(0)} kB) contains no DM-only symbols`)
  process.exit(0)
}
