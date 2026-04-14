/**
 * IPC Channel Coverage Check
 *
 * 1. Every ipcRenderer.invoke('channel') in the preload must have a
 *    corresponding ipcMain.handle(IPC.X) registered in the main process.
 *
 * 2. Every inline channel string in the preload must appear as a value
 *    in the IPC constants object (no orphan strings outside the constants).
 *
 * Catches: unregistered handlers that silently return undefined,
 *          and new channels added without a matching constant.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, join, extname } from 'path'

const ROOT = resolve(__dirname, '../..')
const PRELOAD_FILE = resolve(ROOT, 'src/preload/index.ts')
const IPC_TYPES_FILE = resolve(ROOT, 'src/shared/ipc-types.ts')
const MAIN_IPC_DIR = resolve(ROOT, 'src/main/ipc')
const MAIN_WINDOWS_FILE = resolve(ROOT, 'src/main/windows.ts')

// ── Helpers ───────────────────────────────────────────────────────────────────

function readMainIpcSources(): string {
  const files: string[] = []
  for (const entry of readdirSync(MAIN_IPC_DIR)) {
    if (extname(entry) === '.ts') files.push(join(MAIN_IPC_DIR, entry))
  }
  files.push(MAIN_WINDOWS_FILE)
  return files.map(f => readFileSync(f, 'utf-8')).join('\n')
}

/**
 * Parse `export const IPC = { KEY: 'value', ... }` and return a Map of
 * value → key and a Set of all values.
 */
function parseIpcConstants(): { byValue: Map<string, string>; values: Set<string> } {
  const src = readFileSync(IPC_TYPES_FILE, 'utf-8')
  const byValue = new Map<string, string>()
  const values = new Set<string>()

  const re = /([A-Z0-9_]+):\s*'([^']+)'/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    byValue.set(m[2], m[1])
    values.add(m[2])
  }

  return { byValue, values }
}

/**
 * Extract all channel strings from ipcRenderer.invoke('channel') calls.
 */
function extractPreloadInvokeChannels(): string[] {
  const src = readFileSync(PRELOAD_FILE, 'utf-8')
  const channels: string[] = []
  const re = /ipcRenderer\.invoke\(['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) channels.push(m[1])
  return channels
}

/**
 * Extract all channel strings from ipcRenderer.send('channel') calls in preload.
 * (These are one-way DM → Player messages; main forwards them to the player window.)
 */
function extractPreloadSendChannels(): string[] {
  const src = readFileSync(PRELOAD_FILE, 'utf-8')
  const channels: string[] = []
  const re = /ipcRenderer\.send\(['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) channels.push(m[1])
  return channels
}

/**
 * Extract all channel strings registered with ipcMain.handle(IPC.X)
 * by resolving the IPC constant references to their string values.
 */
function extractMainHandleChannels(ipcValues: Set<string>): Set<string> {
  const src = readMainIpcSources()
  const channels = new Set<string>()

  // Matches ipcMain.handle(IPC.SOME_KEY, ...) → look up value
  const refRe = /ipcMain\.handle\(\s*IPC\.([A-Z0-9_]+)/g
  const ipcSrc = readFileSync(IPC_TYPES_FILE, 'utf-8')
  const constRe = /([A-Z0-9_]+):\s*'([^']+)'/g

  const constMap = new Map<string, string>()
  let m: RegExpExecArray | null
  while ((m = constRe.exec(ipcSrc)) !== null) constMap.set(m[1], m[2])

  while ((m = refRe.exec(src)) !== null) {
    const val = constMap.get(m[1])
    if (val) channels.add(val)
  }

  return channels
}

/**
 * Extract all channel strings registered with ipcMain.on(IPC.X)
 * (one-way listeners — forwarded to player window).
 */
function extractMainOnChannels(): Set<string> {
  const src = readMainIpcSources()
  const channels = new Set<string>()

  const ipcSrc = readFileSync(IPC_TYPES_FILE, 'utf-8')
  const constRe = /([A-Z0-9_]+):\s*'([^']+)'/g
  const constMap = new Map<string, string>()
  let m: RegExpExecArray | null
  while ((m = constRe.exec(ipcSrc)) !== null) constMap.set(m[1], m[2])

  const refRe = /ipcMain\.on\(\s*IPC\.([A-Z0-9_]+)/g
  while ((m = refRe.exec(src)) !== null) {
    const val = constMap.get(m[1])
    if (val) channels.add(val)
  }

  // Also catch hardcoded strings: ipcMain.on('channel', ...)
  const litRe = /ipcMain\.on\(['"]([^'"]+)['"]/g
  while ((m = litRe.exec(src)) !== null) channels.add(m[1])

  return channels
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('IPC channel coverage', () => {
  const { byValue, values: ipcValues } = parseIpcConstants()

  it('every ipcRenderer.invoke channel in the preload has an ipcMain.handle in main', () => {
    const invokeChannels = extractPreloadInvokeChannels()
    const handleChannels = extractMainHandleChannels(ipcValues)

    const missing: string[] = []
    for (const ch of invokeChannels) {
      if (!handleChannels.has(ch)) {
        const constName = byValue.get(ch) ?? '(no constant)'
        missing.push(`  '${ch}'  (IPC.${constName})`)
      }
    }

    expect(
      missing,
      `Channels invoked in preload but no ipcMain.handle registered:\n${missing.join('\n')}`
    ).toHaveLength(0)
  })

  it('every ipcRenderer.invoke channel exists in the IPC constants object', () => {
    const invokeChannels = extractPreloadInvokeChannels()

    const missing: string[] = []
    for (const ch of invokeChannels) {
      if (!ipcValues.has(ch)) {
        missing.push(`  '${ch}'  — not in IPC constants`)
      }
    }

    expect(
      missing,
      `Channels invoked in preload but missing from IPC constants (ipc-types.ts):\n${missing.join('\n')}`
    ).toHaveLength(0)
  })

  it('every ipcRenderer.send (one-way) channel exists in the IPC constants object', () => {
    const sendChannels = extractPreloadSendChannels()

    // Internal handshake channels live in constants but are sent differently — skip check
    // for channels starting with 'player:request' (sent by playerApi, not IPC bridge)
    const missing: string[] = []
    for (const ch of sendChannels) {
      if (!ipcValues.has(ch)) {
        missing.push(`  '${ch}'  — not in IPC constants`)
      }
    }

    expect(
      missing,
      `One-way send channels in preload missing from IPC constants:\n${missing.join('\n')}`
    ).toHaveLength(0)
  })

  it('every ipcRenderer.send channel has an ipcMain.on handler', () => {
    const sendChannels = extractPreloadSendChannels()
    const onChannels = extractMainOnChannels()

    const missing: string[] = []
    for (const ch of sendChannels) {
      if (!onChannels.has(ch)) {
        const constName = byValue.get(ch) ?? '(no constant)'
        missing.push(`  '${ch}'  (IPC.${constName})`)
      }
    }

    expect(
      missing,
      `One-way channels sent from preload but no ipcMain.on registered:\n${missing.join('\n')}`
    ).toHaveLength(0)
  })
})
