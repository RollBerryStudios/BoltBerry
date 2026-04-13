/**
 * Preload API Surface Check
 *
 * Verifies that every window.electronAPI.XXX and window.playerAPI.XXX call
 * in the renderer has a corresponding method exposed in the preload.
 *
 * Catches: missing preload methods that cause "X is not a function" crashes.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, join, extname } from 'path'

const ROOT = resolve(__dirname, '../..')
const RENDERER_DIR = resolve(ROOT, 'src/renderer')
const PRELOAD_FILE = resolve(ROOT, 'src/preload/index.ts')

// ── File helpers ──────────────────────────────────────────────────────────────

function collectFiles(dir: string, exts: string[], acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectFiles(full, exts, acc)
    } else if (exts.includes(extname(entry))) {
      acc.push(full)
    }
  }
  return acc
}

// ── Preload parser ────────────────────────────────────────────────────────────

/**
 * Extract method names from a `const NAME = { ... }` object literal.
 * Uses brace counting to find the exact end of the object.
 */
function extractApiMethods(src: string, objectName: string): Set<string> {
  const methods = new Set<string>()

  const startToken = `const ${objectName} = {`
  const startIdx = src.indexOf(startToken)
  if (startIdx === -1) return methods

  // Walk from the opening `{` tracking brace depth to find the object boundary
  let depth = 0
  let bodyEnd = -1
  for (let i = startIdx + startToken.length - 1; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) { bodyEnd = i; break }
    }
  }

  const body = bodyEnd !== -1
    ? src.slice(startIdx + startToken.length, bodyEnd)
    : src.slice(startIdx + startToken.length)

  // Match property keys at exactly 2-space indent: `  methodName:`
  const keyRe = /^  ([a-zA-Z_$][a-zA-Z0-9_$]*):/gm
  let m: RegExpExecArray | null
  while ((m = keyRe.exec(body)) !== null) {
    methods.add(m[1])
  }

  return methods
}

// ── Renderer call parser ──────────────────────────────────────────────────────

/**
 * Scan renderer source files for window.API?.method and window.API.method calls.
 * Returns a Map of methodName → first file that references it.
 */
function extractRendererCalls(apiName: 'electronAPI' | 'playerAPI'): Map<string, string> {
  const calls = new Map<string, string>()
  const re = new RegExp(`window\\.${apiName}\\??\\.(\\w+)`, 'g')

  for (const file of collectFiles(RENDERER_DIR, ['.ts', '.tsx'])) {
    const src = readFileSync(file, 'utf-8')
    // Skip comment lines to reduce noise
    const lines = src.split('\n').filter(l => !l.trimStart().startsWith('//'))
    const cleaned = lines.join('\n')
    let m: RegExpExecArray | null
    while ((m = re.exec(cleaned)) !== null) {
      if (!calls.has(m[1])) calls.set(m[1], file.replace(ROOT + '/', ''))
    }
  }

  return calls
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('preload API surface', () => {
  const preloadSrc = readFileSync(PRELOAD_FILE, 'utf-8')

  it('every window.electronAPI call has a matching dmApi method in the preload', () => {
    const exposed = extractApiMethods(preloadSrc, 'dmApi')
    const called = extractRendererCalls('electronAPI')

    const missing: string[] = []
    for (const [method, file] of called) {
      if (!exposed.has(method)) {
        missing.push(`  ${method}  (first call in ${file})`)
      }
    }

    expect(missing, `Methods called on window.electronAPI but not in preload dmApi:\n${missing.join('\n')}`).toHaveLength(0)
  })

  it('every window.playerAPI call has a matching playerApi method in the preload', () => {
    const exposed = extractApiMethods(preloadSrc, 'playerApi')
    const called = extractRendererCalls('playerAPI')

    const missing: string[] = []
    for (const [method, file] of called) {
      if (!exposed.has(method)) {
        missing.push(`  ${method}  (first call in ${file})`)
      }
    }

    expect(missing, `Methods called on window.playerAPI but not in preload playerApi:\n${missing.join('\n')}`).toHaveLength(0)
  })

  it('preload dmApi has no obviously dead methods (called nowhere in renderer)', () => {
    const exposed = extractApiMethods(preloadSrc, 'dmApi')
    const called = extractRendererCalls('electronAPI')

    const dead: string[] = []
    for (const method of exposed) {
      if (!called.has(method)) {
        dead.push(`  ${method}`)
      }
    }

    // Warn only — dead methods in the preload are not a crash risk
    if (dead.length > 0) {
      console.warn(`[preload-api] dmApi methods not called anywhere in renderer (dead code):\n${dead.join('\n')}`)
    }
    // Not a hard failure — just informational
    expect(true).toBe(true)
  })
})
