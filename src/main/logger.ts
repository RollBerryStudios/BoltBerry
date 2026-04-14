/**
 * Lightweight file-based logger for the main process.
 * Uses only Node.js built-ins — no external dependencies.
 * Writes to <app-logs>/boltberry.log and echoes to stderr/stdout.
 */

import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

function getLogPath(): string {
  try {
    return join(app.getPath('logs'), 'boltberry.log')
  } catch {
    // app may not be ready yet; fall back to userData
    try {
      return join(app.getPath('userData'), 'boltberry.log')
    } catch {
      return 'boltberry.log'
    }
  }
}

function ensureLogDir(): void {
  try {
    mkdirSync(app.getPath('logs'), { recursive: true })
  } catch {
    // best-effort
  }
}

function format(level: string, message: string, extra?: unknown): string {
  const ts = new Date().toISOString()
  const extraStr =
    extra != null
      ? ' ' + (extra instanceof Error ? (extra.stack ?? extra.message) : String(extra))
      : ''
  return `[${ts}] [${level}] ${message}${extraStr}\n`
}

function write(line: string, stream: NodeJS.WriteStream): void {
  stream.write(line)
  try {
    ensureLogDir()
    appendFileSync(getLogPath(), line)
  } catch {
    // never throw from logger
  }
}

export const logger = {
  info(message: string, extra?: unknown): void {
    write(format('INFO ', message, extra), process.stdout)
  },
  warn(message: string, extra?: unknown): void {
    write(format('WARN ', message, extra), process.stderr)
  },
  error(message: string, extra?: unknown): void {
    write(format('ERROR', message, extra), process.stderr)
  },
}
