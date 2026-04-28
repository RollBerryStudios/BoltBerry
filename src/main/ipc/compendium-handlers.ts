import { ipcMain, app, dialog, BrowserWindow } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync, realpathSync, statSync } from 'fs'
import { readFile } from 'fs/promises'
import { join, sep } from 'path'
import { IPC } from '../../shared/ipc-types'
import { getCustomUserDataPath } from '../db/database'
import { logger } from '../logger'

/**
 * BB-027: structured record of the last token-variant seed attempt so the
 * DM window can surface "token library could not be seeded" errors via a
 * status-bar toast instead of silently showing an empty library. Read via
 * the `compendium:get-seed-status` IPC channel.
 */
interface TokenVariantSeedStatus {
  ok: boolean
  error: string | null
  copiedSlugs: number
  copiedFiles: number
}
let lastSeedStatus: TokenVariantSeedStatus = {
  ok: true,
  error: null,
  copiedSlugs: 0,
  copiedFiles: 0,
}

/**
 * Compendium + token-variants IPC. Extracted from the former
 * `app-handlers.ts` god file per audit AP-1.
 *
 * Two nearby domains live here:
 *  - Compendium: bundled + user-supplied PDFs, listed + served as
 *    base64 data URLs (the PDF viewer runs in the renderer).
 *  - Token variants: per-creature artwork (bundled + user uploads),
 *    listed + importable via native file picker.
 *
 * Both read from `<resources>/` for bundled assets and
 * `<userData>/` for user uploads. Slug validation is the sole guard
 * against path traversal from the renderer.
 */

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const VARIANT_EXTS = ['.webp', '.png', '.jpg', '.jpeg']
// Tightened from 200 MB to 50 MB per audit PB-3. Typical D&D rulebook
// PDFs are 3–30 MB; 50 MB handles the largest shipped rulebooks with
// headroom. 200 MB let a pathological PDF pin the main process for
// multi-second base64 encodes + blew the renderer's JS heap on the
// receiving end.
const COMPENDIUM_MAX_BYTES = 50 * 1024 * 1024

// ─── Compendium ────────────────────────────────────────────────────────

function getCompendiumDirs(): { bundled: string; user: string } {
  // In packaged builds resources live under process.resourcesPath; in
  // development (tsc + electron .) the build hasn't run so we fall back
  // to the repo-level resources folder.
  const resourcesBase = app.isPackaged
    ? process.resourcesPath
    : join(app.getAppPath(), 'resources')
  const bundled = join(resourcesBase, 'compendium')
  const userDataPath = getCustomUserDataPath() || app.getPath('userData')
  const user = join(userDataPath, 'compendium')
  if (!existsSync(user)) {
    try { mkdirSync(user, { recursive: true }) } catch { /* ignore — will show empty list */ }
  }
  return { bundled, user }
}

function listPdfsIn(dir: string, source: 'bundled' | 'user') {
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir)
      .filter((n) => n.toLowerCase().endsWith('.pdf'))
      .map((name) => {
        const full = join(dir, name)
        let size = 0
        try { size = statSync(full).size } catch { /* ignore */ }
        return { name, path: full, source, size }
      })
  } catch {
    return []
  }
}

// ─── Token variants ────────────────────────────────────────────────────

/**
 * Bundled art ships via electron-builder's extraResources rule. On
 * first run we copy it into the user folder so the existing
 * getImageAsBase64 reader (userData-scoped) can serve it without
 * special-casing bundled paths. The copy is idempotent: existing
 * files are never overwritten (user-added variants with the same
 * name win) and user deletions stay deleted across restarts.
 */
export function getTokenVariantDirs(): { bundled: string; user: string } {
  const resourcesBase = app.isPackaged
    ? process.resourcesPath
    : join(app.getAppPath(), 'resources')
  const bundled = join(resourcesBase, 'token-variants')
  const userDataPath = getCustomUserDataPath() || app.getPath('userData')
  const user = join(userDataPath, 'token-variants')
  if (!existsSync(user)) {
    try { mkdirSync(user, { recursive: true }) } catch { /* ignore */ }
  }
  return { bundled, user }
}

/**
 * Appends "(2)", "(3)", … before the extension until the name is
 * free inside `dir`. Shared with `app-handlers.ts` so both asset
 * imports and variant imports use the same collision-handling rules.
 */
export function uniqueFileName(dir: string, fileName: string): string {
  if (!existsSync(join(dir, fileName))) return fileName
  const dot = fileName.lastIndexOf('.')
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName
  const ext = dot > 0 ? fileName.slice(dot) : ''
  for (let i = 2; i < 1000; i++) {
    const candidate = `${stem} (${i})${ext}`
    if (!existsSync(join(dir, candidate))) return candidate
  }
  return `${stem}-${Date.now()}${ext}`
}

export function ensureTokenVariantsSeeded(): void {
  const { bundled, user } = getTokenVariantDirs()
  if (!existsSync(bundled)) {
    lastSeedStatus = { ok: true, error: null, copiedSlugs: 0, copiedFiles: 0 }
    return
  }
  let copiedSlugs = 0
  let copiedFiles = 0
  let firstHardError: Error | null = null
  try {
    for (const slugDir of readdirSync(bundled, { withFileTypes: true })) {
      if (!slugDir.isDirectory()) continue
      const src = join(bundled, slugDir.name)
      const dst = join(user, slugDir.name)
      try {
        if (!existsSync(dst)) {
          mkdirSync(dst, { recursive: true })
          copiedSlugs++
        }
      } catch (err) {
        // Read-only userData (BB-046): record + skip this slug. Other slugs
        // may still succeed if they already exist.
        if (!firstHardError) firstHardError = err as Error
        continue
      }
      for (const file of readdirSync(src)) {
        const srcPath = join(src, file)
        const dstPath = join(dst, file)
        if (existsSync(dstPath)) continue
        try {
          copyFileSync(srcPath, dstPath, 1 /* COPYFILE_EXCL */)
          copiedFiles++
        } catch (err) {
          // Either an EEXIST race (benign) or a real IO failure. EEXIST
          // shows up with code 'EEXIST'; everything else is recorded.
          const e = err as NodeJS.ErrnoException
          if (e?.code !== 'EEXIST' && !firstHardError) firstHardError = e
        }
      }
    }
  } catch (err) {
    firstHardError = err as Error
  }
  if (firstHardError) {
    logger.error(
      `[CompendiumHandlers] token variants seed failed (slugs=${copiedSlugs}, files=${copiedFiles}): ${firstHardError.message ?? String(firstHardError)}`,
    )
    lastSeedStatus = {
      ok: false,
      error: firstHardError.message ?? String(firstHardError),
      copiedSlugs,
      copiedFiles,
    }
  } else {
    lastSeedStatus = { ok: true, error: null, copiedSlugs, copiedFiles }
  }
}

export function getTokenVariantSeedStatus(): TokenVariantSeedStatus {
  return lastSeedStatus
}

export function registerCompendiumHandlers(): void {
  ensureTokenVariantsSeeded()

  // BB-027: expose the seed status so the renderer can surface an error
  // toast instead of silently showing an empty token library.
  ipcMain.handle(IPC.TOKEN_VARIANTS_SEED_STATUS, () => getTokenVariantSeedStatus())

  // ── Compendium ──

  ipcMain.handle(IPC.COMPENDIUM_LIST, () => {
    const { bundled, user } = getCompendiumDirs()
    const bundledFiles = listPdfsIn(bundled, 'bundled')
    const userFiles = listPdfsIn(user, 'user')
    const byName = new Map<string, ReturnType<typeof listPdfsIn>[number]>()
    for (const f of bundledFiles) byName.set(f.name, f)
    for (const f of userFiles) byName.set(f.name, f) // user overrides bundled
    return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name))
  })

  ipcMain.handle(IPC.COMPENDIUM_READ, async (_event, filePath: string) => {
    try {
      const { bundled, user } = getCompendiumDirs()
      const realBundled = existsSync(bundled) ? realpathSync(bundled) : null
      const realUser = existsSync(user) ? realpathSync(user) : null
      const real = realpathSync(filePath)
      const inBundled = realBundled && (real === realBundled || real.startsWith(realBundled + sep))
      const inUser = realUser && (real === realUser || real.startsWith(realUser + sep))
      if (!inBundled && !inUser) {
        console.warn('[CompendiumHandlers] COMPENDIUM_READ: path outside compendium dirs — rejecting', filePath)
        return null
      }
      if (!real.toLowerCase().endsWith('.pdf')) return null
      const stat = statSync(real)
      if (stat.size > COMPENDIUM_MAX_BYTES) {
        console.warn('[CompendiumHandlers] COMPENDIUM_READ: file too large, refusing', real)
        return null
      }
      const buf = await readFile(real)
      return `data:application/pdf;base64,${buf.toString('base64')}`
    } catch (err) {
      console.warn('[CompendiumHandlers] COMPENDIUM_READ failed:', err)
      return null
    }
  })

  ipcMain.handle(IPC.COMPENDIUM_IMPORT, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: 'no-window' as const }
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'PDF importieren',
      properties: ['openFile'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (canceled || filePaths.length === 0) return { success: false, error: 'cancelled' as const }
    const src = filePaths[0]
    const { user } = getCompendiumDirs()
    const fileName = src.split(/[\\/]/).pop() || 'imported.pdf'
    const dest = join(user, fileName)
    try {
      copyFileSync(src, dest)
      return { success: true, path: dest, name: fileName }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.COMPENDIUM_OPEN_FOLDER, async () => {
    const { shell } = await import('electron')
    const { user } = getCompendiumDirs()
    const err = await shell.openPath(user)
    if (err) throw new Error(`Open compendium folder failed: ${err}`)
  })

  // ── Token variants ──

  ipcMain.handle(IPC.TOKEN_VARIANTS_LIST, (_event, slug: string) => {
    if (typeof slug !== 'string' || !SLUG_RE.test(slug)) return []
    const { user } = getTokenVariantDirs()
    const dir = join(user, slug)
    if (!existsSync(dir)) return []
    try {
      return readdirSync(dir)
        .filter((n) => VARIANT_EXTS.some((e) => n.toLowerCase().endsWith(e)))
        .map((name) => {
          const full = join(dir, name)
          let size = 0
          try { size = statSync(full).size } catch { /* ignore */ }
          // Files with 2-digit numeric prefix (01.webp … 05.webp) are the
          // bundled seed — everything else is user-added. This lets us
          // show a subtle badge in the UI without tracking sources in DB.
          const source = /^\d{2}\.[a-z]+$/i.test(name) ? 'bundled' : 'user'
          // Path is userData-relative so the existing getImageAsBase64
          // reader can serve it with the same guard as any other asset.
          const relPath = `token-variants/${slug}/${name}`
          return { path: relPath, name, size, source }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    } catch {
      return []
    }
  })

  ipcMain.handle(IPC.TOKEN_VARIANTS_IMPORT, async (event, slug: string) => {
    if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
      return { success: false, error: 'invalid-slug' as const }
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: 'no-window' as const }
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Token-Varianten importieren',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Bilder', extensions: ['webp', 'png', 'jpg', 'jpeg'] }],
    })
    if (canceled || filePaths.length === 0) {
      return { success: false, error: 'cancelled' as const }
    }
    const { user } = getTokenVariantDirs()
    const dir = join(user, slug)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const copied: string[] = []
    for (const src of filePaths) {
      const fileName = src.split(/[\\/]/).pop() || 'token.webp'
      const finalName = uniqueFileName(dir, fileName)
      const dest = join(dir, finalName)
      try {
        copyFileSync(src, dest)
        copied.push(`token-variants/${slug}/${finalName}`)
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    }
    return { success: true, paths: copied }
  })

  ipcMain.handle(IPC.TOKEN_VARIANTS_OPEN_FOLDER, async (_event, slug?: string) => {
    const { shell } = await import('electron')
    const { user } = getTokenVariantDirs()
    let target = user
    if (typeof slug === 'string' && SLUG_RE.test(slug)) {
      const sub = join(user, slug)
      if (!existsSync(sub)) mkdirSync(sub, { recursive: true })
      target = sub
    }
    const err = await shell.openPath(target)
    if (err) throw new Error(`Open token-variants folder failed: ${err}`)
  })
}
