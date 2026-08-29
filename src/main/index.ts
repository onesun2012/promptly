import { app, globalShortcut, ipcMain, BrowserWindow } from 'electron'
import { join } from 'path'
import type { AppInfo } from '../shared'
import { HelperClient } from './selection/helper-client'
import { SelectionMachine } from './selection/state-machine'
import { initToolbarIpc, showToolbarForSelection } from './selection/toolbar'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 720,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    title: 'Promptly',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('app:getInfo', (): AppInfo => ({
  name: 'Promptly',
  version: app.getVersion(),
  electron: process.versions.electron,
  node: process.versions.node,
  platform: process.platform
}))

const helper = new HelperClient([])
const machine = new SelectionMachine((msg) => console.log(msg))

function broadcast(channel: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, data)
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    createWindow()
    initToolbarIpc(() => machine.transition('IDLE', machine.activeSessionId))

    // Q5 hotkey mode: capture the selection at the current cursor position.
    // The default hotkey is always registered; per-mode switch lands with the
    // settings page (M4).
    globalShortcut.register('Control+Shift+A', () => {
      helper.captureNow()
    })

    helper.on('lifecycle', (info) => {
      console.log('[helper-lifecycle]', JSON.stringify(info))
      broadcast('pipeline:lifecycle', info)
    })

    helper.on('event', (env) => {
      broadcast('pipeline:event', env)
      if (env.type === 'selectionCaptured') {
        if (machine.validate(env)) {
          const payload = env.payload as { app?: unknown }
          machine.transition('POSITION_TOOLBAR', env.sessionId, String(payload.app ?? ''))
          showToolbarForSelection(env)
          machine.transition('TOOLBAR_VISIBLE', env.sessionId)
        }
      } else if (env.type === 'captureFailed') {
        const payload = env.payload as { reason?: unknown }
        machine.transition('NO_ACTION', env.sessionId, String(payload.reason ?? ''))
      }
    })

    helper.start()
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    helper.shutdown()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}
