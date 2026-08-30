import { BrowserWindow, Menu, ipcMain, screen, app } from 'electron'
import { join } from 'node:path'
import { loadSettings, saveSettings } from './settings-store'
import { toggleChatWindow } from './chat-window'

const BALL_SIZE = 44
// Hover glow headroom: window is slightly larger than the ball so the hover
// halo isn't clipped square. Keep in sync with body size in ball.html.
const GLOW_PAD = 10
const WINDOW_SIZE = BALL_SIZE + GLOW_PAD * 2

let ball: BrowserWindow | null = null

function persistIfChanged(): void {
  if (!ball || ball.isDestroyed()) return
  const [bx, by] = ball.getPosition()
  const display = screen.getDisplayNearestPoint({ x: bx, y: by })
  const wa = display.workArea
  const cx = Math.min(Math.max(bx, wa.x), wa.x + wa.width - WINDOW_SIZE)
  const cy = Math.min(Math.max(by, wa.y), wa.y + wa.height - WINDOW_SIZE)
  if (cx !== bx || cy !== by) {
    ball.setPosition(cx, cy)
    return
  }
  const s = loadSettings()
  if (!s.ballPosition || s.ballPosition.x !== cx || s.ballPosition.y !== cy) {
    saveSettings({ ballPosition: { x: cx, y: cy } })
  }
}
let menuLabels = { openChat: 'Open chat', settings: 'Settings', quit: 'Quit Promptly' }

const MENU_LABELS: Record<string, { openChat: string; settings: string; quit: string }> = {
  en: { openChat: 'Open chat', settings: 'Settings', quit: 'Quit Promptly' },
  fr: { openChat: 'Ouvrir le chat', settings: 'Paramètres', quit: 'Quitter Promptly' },
  de: { openChat: 'Chat öffnen', settings: 'Einstellungen', quit: 'Promptly beenden' },
  es: { openChat: 'Abrir chat', settings: 'Ajustes', quit: 'Salir de Promptly' },
  ja: { openChat: 'チャットを開く', settings: '設定', quit: 'Promptly を終了' },
  ko: { openChat: '채팅 열기', settings: '설정', quit: 'Promptly 종료' },
  'zh-CN': { openChat: '打开聊天', settings: '设置', quit: '退出 Promptly' },
  'zh-TW': { openChat: '開啟聊天', settings: '設定', quit: '結束 Promptly' },
  ru: { openChat: 'Открыть чат', settings: 'Настройки', quit: 'Выйти из Promptly' },
  ar: { openChat: 'فتح الدردشة', settings: 'الإعدادات', quit: 'إنهاء Promptly' }
}

export function labelsFor(locale: string): { openChat: string; settings: string; quit: string } {
  return MENU_LABELS[locale] ?? MENU_LABELS.en
}

export function setBallLabels(labels: { openChat: string; settings: string; quit: string }): void {
  menuLabels = labels
}

export function createBallWindow(): BrowserWindow {
  if (ball && !ball.isDestroyed()) return ball

  const saved = loadSettings().ballPosition
  const wa = screen.getPrimaryDisplay().workArea
  const x = saved?.x ?? wa.x + wa.width - WINDOW_SIZE - 8
  const y = saved?.y ?? wa.y + Math.round(wa.height / 2 - WINDOW_SIZE / 2)

  ball = new BrowserWindow({
    width: WINDOW_SIZE,
    height: WINDOW_SIZE,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })
  ball.setAlwaysOnTop(true, 'screen-saver')
  ball.setVisibleOnAllWorkspaces(true)

  // Persist ball position (SPEC: draggable, position survives restarts).
  // Belt and braces: 'move' events AND a periodic poll, plus clamping so the
  // ball never hangs half off the screen edge.
  ball.on('move', () => persistIfChanged())
  const poll = setInterval(persistIfChanged, 3000)
  ball.on('closed', () => clearInterval(poll))
  ball.on('closed', () => {
    ball = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void ball.loadURL(process.env.ELECTRON_RENDERER_URL + '/ball.html?locale=' + loadSettings().language)
  } else {
    void ball.loadFile(join(__dirname, '../renderer/ball.html'), {
      search: 'locale=' + loadSettings().language
    })
  }
  return ball
}

export function initBallIpc(): void {
  ipcMain.on('ball:open-chat', () => toggleChatWindow())

  // Manual drag, generalized: whichever renderer window sends drag-start
  // (floating ball or the frameless chat window titlebar) is the one that
  // moves. We track the cursor here (DIP coordinates from
  // screen.getCursorScreenPoint are reliable across DPI).
  let dragWindow: BrowserWindow | null = null
  let dragOffset: { x: number; y: number } | null = null
  let dragTimer: NodeJS.Timeout | null = null

  ipcMain.on('window:drag-start', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win || win.isDestroyed()) return
    dragWindow = win
    const cursor = screen.getCursorScreenPoint()
    const [bx, by] = win.getPosition()
    dragOffset = { x: cursor.x - bx, y: cursor.y - by }
    if (dragTimer) clearInterval(dragTimer)
    dragTimer = setInterval(() => {
      if (!dragWindow || dragWindow.isDestroyed() || !dragOffset) return
      const c = screen.getCursorScreenPoint()
      dragWindow.setPosition(c.x - dragOffset.x, c.y - dragOffset.y)
    }, 16)
  })

  ipcMain.on('window:drag-end', (e) => {
    if (dragTimer) {
      clearInterval(dragTimer)
      dragTimer = null
    }
    dragOffset = null
    dragWindow = null
    if (BrowserWindow.fromWebContents(e.sender) === ball) persistIfChanged()
  })

  ipcMain.on('ball:menu', (_e, position: { x: number; y: number }) => {
    const menu = Menu.buildFromTemplate([
      { label: menuLabels.openChat, click: () => toggleChatWindow() },
      { type: 'separator' },
      {
        label: menuLabels.settings,
        click: () => {
          const [main] = BrowserWindow.getAllWindows().filter((w) => w.getTitle() === 'Promptly' && !w.webContents.getURL().includes('chat.html'))
          if (main) {
            main.show()
            main.focus()
          }
        }
      },
      { type: 'separator' },
      { label: menuLabels.quit, click: () => app.quit() }
    ])
    menu.popup({ window: ball ?? undefined, x: position?.x, y: position?.y })
  })
}

export function relocateBallForDisplay(): void {
  // keep the ball inside the visible work area after display changes
  if (!ball || ball.isDestroyed()) return
  const [bx, by] = ball.getPosition()
  const display = screen.getDisplayNearestPoint({ x: bx, y: by })
  const wa = display.workArea
  const nx = Math.min(Math.max(bx, wa.x - WINDOW_SIZE + GLOW_PAD), wa.x + wa.width - GLOW_PAD)
  const ny = Math.min(Math.max(by, wa.y - WINDOW_SIZE + GLOW_PAD), wa.y + wa.height - GLOW_PAD)
  if (nx !== bx || ny !== by) ball.setPosition(nx, ny)
}

/** Un-hide the ball (tray safety net when the user "loses" it). */
export function showBall(): void {
  if (!ball || ball.isDestroyed()) {
    createBallWindow()
    return
  }
  if (!ball.isVisible()) ball.show()
}

/** Move the ball to an explicit position and persist it. */
export function placeBall(x: number, y: number): void {
  if (!ball || ball.isDestroyed()) return
  ball.setPosition(x, y)
  saveSettings({ ballPosition: { x, y } })
}
