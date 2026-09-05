import { app, globalShortcut, ipcMain, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import type { AppInfo } from '../shared'
import { HelperClient } from './selection/helper-client'
import { SelectionMachine } from './selection/state-machine'
import {
  getLastSelection,
  hideIfClickOutside,
  initToolbarIpc,
  sendToToolbar,
  setToolbarMode,
  showToolbarForSelection
} from './selection/toolbar'
import { initProviderIpc } from './providers/ipc'
import { initSqliteDb } from './db'
import { createChatService } from './chat-service'
import {
  forwardChatChunk,
  initChatIpc,
  openChatToConversation,
  openChatWindow,
  toggleChatWindow
} from './chat-window'
import * as secureStore from './secure-store'
import { applyFirstRunAutostart, loadSettings, saveSettings, setAutostart } from './settings-store'
import { createBallWindow, initBallIpc, labelsFor, setBallLabels } from './ball'
import { initTray, rebuildTrayMenu, resetBallPosition } from './tray'
import { appIconPath } from './app-icon'
import { initUpdater } from './updater'
import { pingInstallOnce, initInstallPingIpc } from './install-ping'

let mainWin: BrowserWindow | null = null

function createWindow(): void {
  const locale = loadSettings().language
  const win = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 720,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    title: 'Promptly',
    backgroundColor: '#ffffff',
    icon: appIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  mainWin = win
  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL + '/?locale=' + locale)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { search: 'locale=' + locale })
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
    applyFirstRunAutostart()
    createWindow()
    initBallIpc()
    initTray()
    initUpdater()
    initInstallPingIpc()
    pingInstallOnce()
    setBallLabels(labelsFor(loadSettings().language))
    createBallWindow()
    const db = initSqliteDb(app.getPath('userData'))
    const chat = createChatService({
      db,
      getActiveProvider: () => secureStore.getActive(),
      onChunk: (cid, chunk, surface) => {
        if (surface === 'toolbar') sendToToolbar('toolbar:stream', { conversationId: cid, chunk })
        else forwardChatChunk(cid, chunk)
      }
    })
    // Toolbar three-state run bookkeeping (action -> loading -> result).
    let toolbarRun: {
      actionId: string
      selection: string
      selectionSessionId: string
      conversationId: string | null
    } | null = null

    function runToolbarAction(actionId: string, selection: string, selectionSessionId: string): void {
      const requestId = 'req_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      toolbarRun = { actionId, selection, selectionSessionId, conversationId: null }
      setToolbarMode('loading')
      const active = secureStore.getActive()
      const modelLabel = (active?.model || active?.name || '').trim()
      sendToToolbar('toolbar:phase', { phase: 'loading', actionId, modelLabel })
      void chat
        .send({
          actionId,
          selection,
          selectionSessionId,
          requestId,
          surface: 'toolbar'
        })
        .then((r) => {
          if (toolbarRun) toolbarRun.conversationId = r.conversationId
        })
    }

    initToolbarIpc(
      () => machine.transition('IDLE', machine.activeSessionId),
      (actionId) => {
        const sel = getLastSelection()
        if (!sel || !sel.text) return
        if (actionId === 'copy') return
        machine.transition('TOOLBAR_VISIBLE', machine.activeSessionId)
        runToolbarAction(actionId, sel.text, machine.activeSessionId ?? 'sess_' + Date.now())
      }
    )
    initChatIpc(db, (opts) => chat.send(opts), (id) => chat.stop(id))
    initProviderIpc()

    ipcMain.on('toolbar:cancel', () => {
      if (toolbarRun?.conversationId) chat.stop(toolbarRun.conversationId)
      setToolbarMode('action')
      sendToToolbar('toolbar:phase', { phase: 'action' })
    })
    ipcMain.on('toolbar:retry', () => {
      if (!toolbarRun) return
      runToolbarAction(toolbarRun.actionId, toolbarRun.selection, toolbarRun.selectionSessionId)
    })
    ipcMain.on('toolbar:open-in-chat', () => {
      if (toolbarRun?.conversationId) openChatToConversation(toolbarRun.conversationId)
      else openChatWindow()
    })

    ipcMain.handle('settings:get', () => loadSettings())
    ipcMain.handle('settings:language', (_e, locale: string) => {
      saveSettings({ language: String(locale) })
      setBallLabels(labelsFor(String(locale)))
      rebuildTrayMenu()
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send('app:locale', String(locale))
      return { ok: true }
    })
    ipcMain.handle('settings:autostart', (_e, enabled: boolean) => {
      setAutostart(Boolean(enabled))
      return { ok: true }
    })
    ipcMain.on('chat:toggle', () => toggleChatWindow())
    ipcMain.handle('ball:reset', () => {
      resetBallPosition()
      return { ok: true }
    })
    ipcMain.on('main:hide', () => mainWin?.hide())
    ipcMain.on('main:show', () => {
      if (!mainWin || mainWin.isDestroyed()) createWindow()
      else { mainWin.show(); mainWin.focus() }
    })
    ipcMain.handle('app:feedback', () => {
      const nl = '\n'
      const subject = encodeURIComponent('Promptly feedback (v' + app.getVersion() + ')')
      const body = encodeURIComponent(
        'Feedback: ' + nl + nl + nl + '---' + nl +
        'Version: ' + app.getVersion() + nl +
        'Platform: ' + process.platform + ' / Electron ' + process.versions.electron + nl
      )
      void shell.openExternal('mailto:tonny2008@gmail.com?subject=' + subject + '&body=' + body)
      return { ok: true }
    })

    globalShortcut.register('Alt+Space', () => {
      toggleChatWindow()
    })

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
      } else if (env.type === 'state') {
        const sp = env.payload as { state?: unknown }
        if (sp.state === 'IDLE') hideIfClickOutside()
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
