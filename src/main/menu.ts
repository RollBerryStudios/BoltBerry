import { Menu, MenuItemConstructorOptions, shell, BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc-types'
import { getDMWindow, getPlayerWindow, createPlayerWindow } from './windows'
import { savePrefs } from './prefs'

export type MenuLanguage = 'de' | 'en'

export type MenuAction =
  | 'new-campaign'
  | 'save-now'
  | 'export-campaign'
  | 'import-campaign'
  | 'undo'
  | 'redo'
  | 'fit-to-screen'
  | 'zoom-in'
  | 'zoom-out'
  | 'toggle-minimap'
  | 'toggle-left-sidebar'
  | 'toggle-right-sidebar'
  | 'toggle-theme'
  | 'toggle-language'
  | 'toggle-blackout'
  | 'start-session'
  | 'end-session'
  | 'share-camera-once'
  | 'toggle-camera-follow'
  | 'atmosphere-image'
  | 'show-shortcuts'
  | 'about'

let currentLanguage: MenuLanguage = 'de'

function send(action: MenuAction) {
  const dm = getDMWindow()
  if (dm && !dm.isDestroyed()) {
    dm.webContents.send(IPC.MENU_ACTION, action)
  }
}

interface MenuStrings {
  file: string
  newCampaign: string
  save: string
  exportCampaign: string
  importCampaign: string
  quit: string
  edit: string
  undo: string
  redo: string
  cut: string
  copy: string
  paste: string
  selectAll: string
  view: string
  zoomIn: string
  zoomOut: string
  fit: string
  minimap: string
  leftSidebar: string
  rightSidebar: string
  theme: string
  language: string
  fullscreen: string
  devTools: string
  session: string
  openPlayer: string
  closePlayer: string
  startSession: string
  endSession: string
  blackout: string
  shareCamera: string
  followCamera: string
  atmosphere: string
  help: string
  shortcuts: string
  github: string
  reportIssue: string
  about: string
  appMenu: string
  services: string
  hide: string
  hideOthers: string
  unhide: string
  quitApp: string
}

const STRINGS: Record<MenuLanguage, MenuStrings> = {
  de: {
    file: 'Datei',
    newCampaign: 'Neue Kampagne',
    save: 'Speichern',
    exportCampaign: 'Kampagne exportieren…',
    importCampaign: 'Kampagne importieren…',
    quit: 'Beenden',
    edit: 'Bearbeiten',
    undo: 'Rückgängig',
    redo: 'Wiederholen',
    cut: 'Ausschneiden',
    copy: 'Kopieren',
    paste: 'Einfügen',
    selectAll: 'Alles auswählen',
    view: 'Ansicht',
    zoomIn: 'Vergrößern',
    zoomOut: 'Verkleinern',
    fit: 'Einpassen',
    minimap: 'Minimap',
    leftSidebar: 'Linke Sidebar',
    rightSidebar: 'Rechte Sidebar',
    theme: 'Theme umschalten',
    language: 'Sprache umschalten',
    fullscreen: 'Vollbild',
    devTools: 'Entwicklerwerkzeuge',
    session: 'Session',
    openPlayer: 'Spielerfenster öffnen',
    closePlayer: 'Spielerfenster schließen',
    startSession: 'Session starten',
    endSession: 'Session beenden',
    blackout: 'Blackout umschalten',
    shareCamera: 'Kamera einmalig senden',
    followCamera: 'Kamera-Folgen umschalten',
    atmosphere: 'Atmosphäre-Bild wählen…',
    help: 'Hilfe',
    shortcuts: 'Tastaturkürzel',
    github: 'BoltBerry auf GitHub',
    reportIssue: 'Problem melden',
    about: 'Über BoltBerry',
    appMenu: 'BoltBerry',
    services: 'Dienste',
    hide: 'BoltBerry ausblenden',
    hideOthers: 'Andere ausblenden',
    unhide: 'Alle anzeigen',
    quitApp: 'BoltBerry beenden',
  },
  en: {
    file: 'File',
    newCampaign: 'New Campaign',
    save: 'Save',
    exportCampaign: 'Export Campaign…',
    importCampaign: 'Import Campaign…',
    quit: 'Quit',
    edit: 'Edit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    view: 'View',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    fit: 'Fit to Screen',
    minimap: 'Minimap',
    leftSidebar: 'Left Sidebar',
    rightSidebar: 'Right Sidebar',
    theme: 'Toggle Theme',
    language: 'Toggle Language',
    fullscreen: 'Fullscreen',
    devTools: 'Developer Tools',
    session: 'Session',
    openPlayer: 'Open Player Window',
    closePlayer: 'Close Player Window',
    startSession: 'Start Session',
    endSession: 'End Session',
    blackout: 'Toggle Blackout',
    shareCamera: 'Share Camera Once',
    followCamera: 'Toggle Follow Camera',
    atmosphere: 'Set Atmosphere Image…',
    help: 'Help',
    shortcuts: 'Keyboard Shortcuts',
    github: 'BoltBerry on GitHub',
    reportIssue: 'Report an Issue',
    about: 'About BoltBerry',
    appMenu: 'BoltBerry',
    services: 'Services',
    hide: 'Hide BoltBerry',
    hideOthers: 'Hide Others',
    unhide: 'Show All',
    quitApp: 'Quit BoltBerry',
  },
}

function buildTemplate(lang: MenuLanguage): MenuItemConstructorOptions[] {
  const s = STRINGS[lang]
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = []

  if (isMac) {
    template.push({
      label: s.appMenu,
      submenu: [
        { label: s.about, click: () => send('about') },
        { type: 'separator' },
        { label: s.services, role: 'services' },
        { type: 'separator' },
        { label: s.hide, role: 'hide' },
        { label: s.hideOthers, role: 'hideOthers' },
        { label: s.unhide, role: 'unhide' },
        { type: 'separator' },
        { label: s.quitApp, role: 'quit' },
      ],
    })
  }

  template.push({
    label: s.file,
    submenu: [
      { label: s.newCampaign, accelerator: 'CmdOrCtrl+N', click: () => send('new-campaign') },
      { type: 'separator' },
      { label: s.save, accelerator: 'CmdOrCtrl+S', click: () => send('save-now') },
      { type: 'separator' },
      { label: s.exportCampaign, click: () => send('export-campaign') },
      { label: s.importCampaign, click: () => send('import-campaign') },
      { type: 'separator' },
      isMac ? { role: 'close' } : { label: s.quit, role: 'quit' },
    ],
  })

  template.push({
    label: s.edit,
    submenu: [
      { label: s.undo, accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
      {
        label: s.redo,
        accelerator: isMac ? 'Shift+CmdOrCtrl+Z' : 'CmdOrCtrl+Y',
        click: () => send('redo'),
      },
      { type: 'separator' },
      { label: s.cut, role: 'cut' },
      { label: s.copy, role: 'copy' },
      { label: s.paste, role: 'paste' },
      { label: s.selectAll, role: 'selectAll' },
    ],
  })

  template.push({
    label: s.view,
    submenu: [
      // Accelerators intentionally omitted — the renderer's keyboard handler
      // owns =/-/0, and Chromium's built-in CmdOrCtrl+=/-/0 zoom also fires on
      // those keys. Binding them here would double-dispatch or collide.
      { label: s.zoomIn, click: () => send('zoom-in') },
      { label: s.zoomOut, click: () => send('zoom-out') },
      { label: s.fit, click: () => send('fit-to-screen') },
      { type: 'separator' },
      { label: s.minimap, click: () => send('toggle-minimap') },
      { label: s.leftSidebar, accelerator: 'CmdOrCtrl+\\', click: () => send('toggle-left-sidebar') },
      { label: s.rightSidebar, accelerator: 'CmdOrCtrl+Shift+\\', click: () => send('toggle-right-sidebar') },
      { type: 'separator' },
      { label: s.theme, click: () => send('toggle-theme') },
      { label: s.language, click: () => send('toggle-language') },
      { type: 'separator' },
      { label: s.fullscreen, role: 'togglefullscreen' },
      { label: s.devTools, role: 'toggleDevTools' },
    ],
  })

  template.push({
    label: s.session,
    submenu: [
      {
        label: s.openPlayer,
        accelerator: 'CmdOrCtrl+P',
        click: () => {
          const existing = getPlayerWindow()
          if (existing && !existing.isDestroyed()) {
            existing.focus()
            return
          }
          createPlayerWindow()
        },
      },
      {
        label: s.closePlayer,
        click: () => {
          const existing = getPlayerWindow()
          if (existing && !existing.isDestroyed()) existing.close()
        },
      },
      { type: 'separator' },
      { label: s.startSession, click: () => send('start-session') },
      { label: s.endSession, click: () => send('end-session') },
      { type: 'separator' },
      { label: s.blackout, accelerator: 'CmdOrCtrl+B', click: () => send('toggle-blackout') },
      { label: s.shareCamera, click: () => send('share-camera-once') },
      { label: s.followCamera, click: () => send('toggle-camera-follow') },
      { label: s.atmosphere, click: () => send('atmosphere-image') },
    ],
  })

  template.push({
    label: s.help,
    submenu: [
      { label: s.shortcuts, accelerator: 'F1', click: () => send('show-shortcuts') },
      { type: 'separator' },
      {
        label: s.github,
        click: () => { shell.openExternal('https://github.com/RollBerryStudios/BoltBerry') },
      },
      {
        label: s.reportIssue,
        click: () => { shell.openExternal('https://github.com/RollBerryStudios/BoltBerry/issues/new') },
      },
      ...(isMac ? [] : [{ type: 'separator' as const }, { label: s.about, click: () => send('about') }]),
    ],
  })

  return template
}

export function buildAppMenu(lang?: MenuLanguage) {
  if (lang) currentLanguage = lang
  const template = buildTemplate(currentLanguage)
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

export function setMenuLanguage(lang: MenuLanguage) {
  if (lang === currentLanguage) return
  currentLanguage = lang
  savePrefs({ menuLanguage: lang })
  buildAppMenu()
}
