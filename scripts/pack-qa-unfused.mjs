#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const isWindows = process.platform === 'win32'
const npmCmd = isWindows ? 'npm.cmd' : 'npm'
const builderPath = resolve('node_modules', '.bin', isWindows ? 'electron-builder.cmd' : 'electron-builder')

function run(command, args, env = process.env) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { stdio: 'inherit', env })
    child.on('error', rejectRun)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolveRun()
        return
      }
      rejectRun(new Error(`${command} ${args.join(' ')} failed with code=${code} signal=${signal ?? 'none'}`))
    })
  })
}

if (!existsSync(builderPath)) {
  console.error(`[pack-qa-unfused] electron-builder not found at ${builderPath}`)
  process.exit(1)
}

await run(npmCmd, ['run', 'build'])
await run(builderPath, ['--dir', '--config.directories.output=release/qa-unfused'], {
  ...process.env,
  BOLTBERRY_SKIP_FUSE_FLIP: '1',
})

console.log('[pack-qa-unfused] Built unfused QA package under release/qa-unfused/. Do not distribute this artifact.')
