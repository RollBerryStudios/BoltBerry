import { createWriteStream, mkdirSync, WriteStream } from 'fs'
import { join } from 'path'
import { app } from 'electron'

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
  flush(): void {
    logStream?.end()
    logStream = null
  },
}
