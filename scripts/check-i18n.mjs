#!/usr/bin/env node
/**
 * i18n key lint — verifies every t('key') call in src/renderer has a
 * matching entry in both en.json and de.json.
 *
 * Exit code 0 = all keys present
 * Exit code 1 = missing keys found (CI will fail)
 *
 * Usage:  node scripts/check-i18n.mjs
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(fileURLToPath(import.meta.url), '../../')
const LOCALES_DIR = join(ROOT, 'src/renderer/i18n/locales')
const SRC_DIR = join(ROOT, 'src/renderer')

// ── Load locale files ────────────────────────────────────────────────────────

function loadLocale(filename) {
  const raw = readFileSync(join(LOCALES_DIR, filename), 'utf-8')
  return JSON.parse(raw)
}

/**
 * Flatten a nested JSON object into dot-notation keys.
 * e.g. { audio: { tabMusic: "Music" } } → { "audio.tabMusic": "Music" }
 * Handles mixed flat keys like "toolbar.tools.drawGroup" too.
 */
function flatten(obj, prefix = '') {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key))
    } else {
      out[key] = v
    }
  }
  return out
}

const en = flatten(loadLocale('en.json'))
const de = flatten(loadLocale('de.json'))

// ── Walk source files ────────────────────────────────────────────────────────

function walkDir(dir, exts, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walkDir(full, exts, files)
    } else if (exts.includes(extname(entry))) {
      files.push(full)
    }
  }
  return files
}

const sourceFiles = walkDir(SRC_DIR, ['.ts', '.tsx'])

// Match: t('some.key') or t("some.key")
// Also matches: t(`some.key`) for static template literals (no interpolation)
const T_CALL_RE = /\bt\(\s*['"`]([^'"`${}]+)['"`]/g

// Keys that use interpolation in the key itself (dynamic) — skip those
const DYNAMIC_CALL_RE = /\bt\(\s*`[^`]*\$\{/

const usedKeys = new Set()

for (const file of sourceFiles) {
  const src = readFileSync(file, 'utf-8')
  let match
  while ((match = T_CALL_RE.exec(src)) !== null) {
    usedKeys.add(match[1])
  }
}

// ── Check for missing keys ────────────────────────────────────────────────────

const missing = { en: [], de: [] }

for (const key of [...usedKeys].sort()) {
  if (!(key in en)) missing.en.push(key)
  if (!(key in de)) missing.de.push(key)
}

// ── Report ────────────────────────────────────────────────────────────────────

let exitCode = 0

if (missing.en.length === 0 && missing.de.length === 0) {
  console.log(`✓ i18n check passed — ${usedKeys.size} keys verified in en + de`)
} else {
  exitCode = 1
  if (missing.en.length > 0) {
    console.error(`\n✗ Missing in en.json (${missing.en.length}):`)
    for (const k of missing.en) console.error(`   ${k}`)
  }
  if (missing.de.length > 0) {
    console.error(`\n✗ Missing in de.json (${missing.de.length}):`)
    for (const k of missing.de) console.error(`   ${k}`)
  }
  console.error(`\nAdd the missing keys to the locale files and re-run.\n`)
}

process.exit(exitCode)
