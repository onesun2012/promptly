import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'

export type UpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'up-to-date' }
  | { phase: 'available'; version: string }
  | { phase: 'downloading'; percent: number }
  | { phase: 'ready'; version: string }
  | { phase: 'error'; message: string }

let wired = false

function broadcast(state: UpdateState): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('update:state', state)
  }
}

/** Wire autoUpdater once. Disabled in dev (no feed); all failures are silent —
 * an update check must never nag or crash the app. */
export function initUpdater(): void {
  if (wired || !app.isPackaged) return
  wired = true

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => broadcast({ phase: 'checking' }))
  autoUpdater.on('update-available', (i) => broadcast({ phase: 'available', version: i?.version ?? '' }))
  autoUpdater.on('update-not-available', () => broadcast({ phase: 'up-to-date' }))
  autoUpdater.on('download-progress', (p) => broadcast({ phase: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (i) => broadcast({ phase: 'ready', version: i?.version ?? '' }))
  autoUpdater.on('error', () => broadcast({ phase: 'idle' }))

  ipcMain.handle('update:check', () => {
    autoUpdater.checkForUpdates().catch(() => {})
  })
  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall()
  })

  // quiet first check a few seconds after launch so it never competes with startup
  setTimeout(() => {
    checkForUpdateNow()
  }, 5000)
}

/** Manual check (tray menu). No-op in dev. */
export function checkForUpdateNow(): void {
  if (!wired) return
  autoUpdater.checkForUpdates().catch(() => {})
}
