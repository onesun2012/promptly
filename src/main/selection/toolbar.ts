import { BrowserWindow, clipboard, ipcMain, screen } from 'electron'
import { join } from 'node:path'
import type { PipelineEvent } from '../../shared'

const TOOLBAR_WIDTH = 360
const TOOLBAR_HEIGHT = 148
const AUTO_HIDE_MS = 8000

let toolbar: BrowserWindow | null = null
let pending: { env: PipelineEvent; text: string } | null = null
let autoHideTimer: NodeJS.Timeout | null = null
let onHideCallback: (() => void) | null = null

export function initToolbarIpc(onHide: () => void): void {
  onHideCallback = onHide

  ipcMain.on('toolbar:ready', (event) => {
    console.log('[toolbar] ready received, pending =', pending !== null)
    if (pending && !event.sender.isDestroyed()) {
      event.sender.send('toolbar:data', pending)
    }
  })
  ipcMain.on('toolbar:hide', () => hideToolbar())
  ipcMain.handle('toolbar:copy', (_event, text: unknown) => {
    if (typeof text === 'string' && text) clipboard.writeText(text)
    hideToolbar()
    return true
  })
}

/** SPEC A1 POSITION_TOOLBAR: place near cursor with edge/multi-display awareness. */
export function showToolbarForSelection(env: PipelineEvent): void {
  const payload = env.payload as { text?: unknown; cursor?: { x: number; y: number } }
  const text = typeof payload.text === 'string' ? payload.text : ''
  const cursor = payload.cursor ?? { x: 0, y: 0 }

  const dip = screen.screenToDipPoint({ x: cursor.x, y: cursor.y })
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
  void toolbar.loadFile(join(__dirname, '../renderer/toolbar.html'))
  return toolbar
}

function resetAutoHide(): void {
  if (autoHideTimer) clearTimeout(autoHideTimer)
  autoHideTimer = setTimeout(() => hideToolbar(), AUTO_HIDE_MS)
}
