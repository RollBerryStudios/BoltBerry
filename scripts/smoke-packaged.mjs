#!/usr/bin/env node
import { spawn } from 'child_process'
import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const executable = process.argv[2] || process.env.BOLTBERRY_E2E_EXECUTABLE_PATH

if (!executable) {
  console.log('[smoke-packaged] Skipped: set BOLTBERRY_E2E_EXECUTABLE_PATH or pass the packaged executable path.')
  process.exit(0)
}

const executablePath = resolve(executable)
if (!existsSync(executablePath)) {
  console.error(`[smoke-packaged] Executable not found: ${executablePath}`)
  process.exit(1)
}

const smokeMs = Number(process.env.BOLTBERRY_PACKAGED_SMOKE_MS ?? 8000)
const userDataDir = mkdtempSync(join(tmpdir(), 'boltberry-packaged-smoke-'))
const args = [`--user-data-dir=${userDataDir}`]
if (process.platform === 'linux') args.push('--no-sandbox')

const child = spawn(executablePath, args, {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    ELECTRON_USER_DATA: userDataDir,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let stdout = ''
let stderr = ''
let exitInfo = null

child.stdout?.on('data', (chunk) => {
  stdout += chunk.toString()
})
child.stderr?.on('data', (chunk) => {
  stderr += chunk.toString()
})
child.on('exit', (code, signal) => {
  exitInfo = { code, signal }
})

const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms))
await wait(smokeMs)

if (exitInfo) {
  console.error(`[smoke-packaged] App exited before ${smokeMs}ms: code=${exitInfo.code} signal=${exitInfo.signal}`)
  if (stdout.trim()) console.error(`[smoke-packaged] stdout:\n${stdout.trim()}`)
  if (stderr.trim()) console.error(`[smoke-packaged] stderr:\n${stderr.trim()}`)
  rmSync(userDataDir, { recursive: true, force: true })
  process.exit(1)
}

child.kill('SIGTERM')
await Promise.race([
  new Promise((resolveExit) => child.once('exit', resolveExit)),
  wait(3000).then(() => {
    if (!exitInfo) child.kill('SIGKILL')
  }),
])

rmSync(userDataDir, { recursive: true, force: true })
console.log(`[smoke-packaged] OK: ${executablePath} stayed alive for ${smokeMs}ms and accepted a clean shutdown.`)
