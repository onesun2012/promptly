import { BrowserWindow, clipboard, ipcMain, screen } from 'electron'
import { join } from 'node:path'
import type { PipelineEvent } from '../../shared'
import { loadSettings } from '../settings-store'

const TOOLBAR_WIDTH = 320
const TOOLBAR_HEIGHT = 132
const AUTO_HIDE_MS = 8000

let toolbar: BrowserWindow | null = null
let pending: { env: PipelineEvent; text: string } | null = null
let autoHideTimer: NodeJS.Timeout | null = null
let onHideCallback: (() => void) | null = null
let onActionCallback: ((actionId: string) => void) | null = null

export function getLastSelection(): { env: PipelineEvent; text: string } | null {
  return pending
}

/** Doubao-style: any click outside the toolbar dismisses it immediately
 * (helper already classifies non-selection clicks as state IDLE). */
export function hideIfClickOutside(): void {
  if (!toolbar || toolbar.isDestroyed() || !toolbar.isVisible()) return
  const c = screen.getCursorScreenPoint()
  const b = toolbar.getBounds()
  if (c.x < b.x || c.x > b.x + b.width || c.y < b.y || c.y > b.y + b.height) hideToolbar()
}

export function sendToToolbar(channel: string, data: unknown): void {
  if (toolbar && !toolbar.isDestroyed()) toolbar.webContents.send(channel, data)
}

/** Loading/result states suspend the 8s auto-hide so streams can finish. */
export function setToolbarMode(mode: 'action' | 'loading' | 'result'): void {
  if (mode === 'action') resetAutoHide()
  else if (autoHideTimer) {
    clearTimeout(autoHideTimer)
    autoHideTimer = null
  }
}

export function initToolbarIpc(onHide: () => void, onAction: (actionId: string) => void): void {
  onHideCallback = onHide
  onActionCallback = onAction

  ipcMain.on('toolbar:ready', (event) => {
    console.log('[toolbar] ready received, pending =', pending !== null)
    if (pending && !event.sender.isDestroyed()) {
      event.sender.send('toolbar:data', pending)
    }
  })
  ipcMain.on('toolbar:hide', () => hideToolbar())
  ipcMain.on('toolbar:action', (_e, actionId: unknown) => {
    if (typeof actionId === 'string' && onActionCallback) onActionCallback(actionId)
  })
  ipcMain.handle('toolbar:copy', (_event, text: unknown) => {
    if (typeof text === 'string' && text) clipboard.writeText(text)
    hideToolbar()
    return true
  })
}

/** SPEC A1 POSITION_TOOLBAR: place near cursor with edge/multi-display awareness.
 * Uses Electron's own cursor (DIP) — same coordinate space as setPosition —
 * instead of the helper's physical pixels, which mis-place the toolbar on
 * scaled displays. */
export function showToolbarForSelection(env: PipelineEvent): void {
  const payload = env.payload as { text?: unknown }
  const text = typeof payload.text === 'string' ? payload.text : ''

  const dip = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(dip)
  const wa = display.workArea

  let x = Math.round(dip.x + 14)
  const y = Math.round(dip.y + 18)
  if (x + TOOLBAR_WIDTH > wa.x + wa.width) x = Math.round(dip.x - TOOLBAR_WIDTH - 14)
  const yClamped = Math.min(Math.max(y, wa.y), wa.y + wa.height - TOOLBAR_HEIGHT)

  pending = { env, text }
  const win = ensureToolbar()
  if (!win) return
  win.setBounds({ x, y: yClamped, width: TOOLBAR_WIDTH, height: TOOLBAR_HEIGHT })
  win.showInactive()

  // First display: data is delivered on the renderer's toolbar:ready handshake.
  // Every later display must push the fresh session explicitly, otherwise the
  // toolbar keeps showing the previous selection (bug caught in E2E).
  console.log('[toolbar] show, isLoading =', win.webContents.isLoading())
  if (!win.webContents.isLoading()) {
    win.webContents.send('toolbar:data', pending)
  }
  win.webContents.on('console-message', (_e, level, message) => {
    console.log('[toolbar-renderer]', level, message)
  })

  resetAutoHide()
}

export function hideToolbar(): void {
  if (autoHideTimer) {
    clearTimeout(autoHideTimer)
    autoHideTimer = null
  }
  pending = null
  if (toolbar && !toolbar.isDestroyed()) {
    toolbar.hide()
  }
  if (onHideCallback) onHideCallback()
}

function ensureToolbar(): BrowserWindow | null {
  if (toolbar && !toolbar.isDestroyed()) return toolbar
  toolbar = new BrowserWindow({
    width: TOOLBAR_WIDTH,
    height: TOOLBAR_HEIGHT,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    autoHideMenuBar: true,
    title: 'Promptly',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })
  toolbar.setAlwaysOnTop(true, 'screen-saver')
  toolbar.on('blur', () => {
    // SPEC A1 TOOLBAR_VISIBLE exit: focus lost.
    hideToolbar()
  })
  toolbar.on('closed', () => {
    toolbar = null
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    void toolbar.loadURL(process.env.ELECTRON_RENDERER_URL + '/toolbar.html?locale=' + loadSettings().language)
  } else {
    void toolbar.loadFile(join(__dirname, '../renderer/toolbar.html'), { search: 'locale=' + loadSettings().language })
  }
  return toolbar
}

function resetAutoHide(): void {
  if (autoHideTimer) clearTimeout(autoHideTimer)
  autoHideTimer = setTimeout(() => hideToolbar(), AUTO_HIDE_MS)
}
