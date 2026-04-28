import { createWriteStream, mkdirSync, WriteStream } from 'fs'
import { join } from 'path'
import { app } from 'electron'

/**
 * Main-process logger. Two output formats:
 *
 *   - Pretty (default): human-readable `[ts] [LEVEL] message extra`.
 *   - Structured JSON: opt in by setting BOLTBERRY_LOG_JSON=1. Each
 *     line is a JSON object with `ts`, `level`, `pid`, `msg`, `extra`,
 *     and (for errors) `stack`. Easier to ingest in observability tools
 *     and crash reporters. Principle #10.
 *
 * IPC trace: `BOLTBERRY_IPC_TRACE=1` enables `logger.ipc(channel, ...)`
 * which otherwise no-ops. Used by the registration-time IPC guard and
 * future hot-path channels to record invocation patterns without
 * paying the format cost in production.
 */

function getLogPath(): string {
  try {
    return join(app.getPath('logs'), 'boltberry.log')
  } catch {
    try {
      return join(app.getPath('userData'), 'boltberry.log')
    } catch {
      return 'boltberry.log'
    }
  }
}

let logStream: WriteStream | null = null
let logDirEnsured = false

function ensureLogStream(): WriteStream | null {
  if (logStream) return logStream
  try {
    if (!logDirEnsured) {
      mkdirSync(app.getPath('logs'), { recursive: true })
      logDirEnsured = true
    }
    logStream = createWriteStream(getLogPath(), { flags: 'a' })
    logStream.on('error', () => { logStream = null })
    return logStream
  } catch {
    return null
  }
}

const JSON_MODE = process.env.BOLTBERRY_LOG_JSON === '1'
const IPC_TRACE = process.env.BOLTBERRY_IPC_TRACE === '1'

function serialiseExtra(extra: unknown): unknown {
  if (extra == null) return undefined
  if (extra instanceof Error) {
    return { name: extra.name, message: extra.message, stack: extra.stack }
  }
  return extra
}

function formatPretty(level: string, message: string, extra?: unknown): string {
  const ts = new Date().toISOString()
  const extraStr =
    extra != null
      ? ' ' + (extra instanceof Error ? (extra.stack ?? extra.message) : String(extra))
      : ''
  return `[${ts}] [${level}] ${message}${extraStr}\n`
}

function formatJson(level: string, message: string, extra?: unknown): string {
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level: level.trim(),
    pid: process.pid,
    msg: message,
  }
  const ex = serialiseExtra(extra)
  if (ex !== undefined) payload.extra = ex
  // JSON.stringify is safe for circulars only via a replacer; in practice
  // the call sites pass plain primitives or Errors, so we don't wrap.
  try {
    return JSON.stringify(payload) + '\n'
  } catch {
    return formatPretty(level, message, extra)
  }
}

function format(level: string, message: string, extra?: unknown): string {
  return JSON_MODE ? formatJson(level, message, extra) : formatPretty(level, message, extra)
}

function write(line: string, stream: NodeJS.WriteStream): void {
  stream.write(line)
  ensureLogStream()?.write(line)
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
  /**
   * IPC trace logging. No-op unless BOLTBERRY_IPC_TRACE=1. Used by the
   * IPC guard wrapper and any handler that wants to record fan-out
   * patterns. Cost when disabled: a single boolean check.
   */
  ipc(channel: string, extra?: unknown): void {
    if (!IPC_TRACE) return
    write(format('IPC  ', channel, extra), process.stdout)
  },
  flush(): void {
    logStream?.end()
    logStream = null
  },
}

export const loggerConfig = {
  jsonMode: JSON_MODE,
  ipcTraceEnabled: IPC_TRACE,
}
