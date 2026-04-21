import { autoUpdater } from 'electron-updater'
import { app, dialog, BrowserWindow } from 'electron'
import { logger } from './logger'

/**
 * Wire up electron-updater. Checks for updates in the background, downloads
 * automatically, and prompts the user once the download completes.
 *
 * No-op in development so running `npm run dev` never hits the update feed.
 */
export function initAutoUpdater(): void {
  if (!app.isPackaged) return // only in production builds

  autoUpdater.logger = {
    info: logger.info.bind(logger),
    warn: logger.warn.bind(logger),
    error: logger.error.bind(logger),
    debug: () => {},
  } as any

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  // Audit SR-5: explicitly refuse downgrades and prereleases so a
  // compromised update feed can't regress users to a vulnerable past
  // release or push them onto an unsigned prerelease channel. These
  // default to `false` in electron-updater today, but pinning the
  // values locks the behaviour in even if a future version flips the
  // default.
  autoUpdater.allowDowngrade = false
  autoUpdater.allowPrerelease = false

  autoUpdater.on('error', (err) => logger.error('[auto-updater] error', err))

  // Log the incoming update's version + SHA fingerprint before we
  // accept the bits. electron-updater verifies the code signature
  // transparently on Windows/macOS; surfacing the hash here gives us
  // an audit trail we can cross-reference against release artefacts
  // if an update later turns out to be compromised.
  autoUpdater.on('update-downloaded', async (info) => {
    const version = (info as { version?: string }).version ?? '?'
    const sha512 = (info as { sha512?: string }).sha512 ?? '?'
    logger.info(`[auto-updater] update-downloaded version=${version} sha512=${sha512}`)
    const win = BrowserWindow.getAllWindows()[0]
    const { response } = await dialog.showMessageBox(win ?? (undefined as any), {
      type: 'info',
      title: 'BoltBerry — Update verfügbar',
      message: 'Ein neues Update wurde heruntergeladen.',
      detail:
        'Die neue Version wird beim nächsten Start installiert. Möchtest du jetzt neu starten?',
      buttons: ['Später', 'Jetzt neu starten'],
      defaultId: 1,
      cancelId: 0,
    })
    if (response === 1) autoUpdater.quitAndInstall()
  })

  autoUpdater
    .checkForUpdatesAndNotify()
    .catch((err) => logger.error('[auto-updater] check failed', err))
}
