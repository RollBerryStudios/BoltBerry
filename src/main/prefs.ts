import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { getCustomUserDataPath } from './db/database'
import { logger } from './logger'

export interface Prefs {
  menuLanguage?: 'de' | 'en'
}

function prefsPath(): string {
  const dir = getCustomUserDataPath() || app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'prefs.json')
}

export function loadPrefs(): Prefs {
  try {
    const p = prefsPath()
    if (!existsSync(p)) return {}
    const raw = readFileSync(p, 'utf-8')
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch (err) {
    logger.error('Failed to load prefs', err)
    return {}
  }
}

export function savePrefs(patch: Partial<Prefs>): void {
  try {
    const current = loadPrefs()
    const next = { ...current, ...patch }
    writeFileSync(prefsPath(), JSON.stringify(next, null, 2), 'utf-8')
  } catch (err) {
    logger.error('Failed to save prefs', err)
  }
}
