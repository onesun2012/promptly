import { BrowserWindow, Menu, ipcMain, screen, app } from 'electron'
import { join } from 'node:path'
import { loadSettings, saveSettings } from './settings-store'
import { toggleChatWindow } from './chat-window'

const BALL_SIZE = 48

let ball: BrowserWindow | null = null
let menuLabels = { openChat: 'Open chat', settings: 'Settings', quit: 'Quit Promptly' }

const MENU_LABELS: Record<string, { openChat: string; settings: string; quit: string }> = {
  en: { openChat: 'Open chat', settings: 'Settings', quit: 'Quit Promptly' },
  fr: { openChat: 'Ouvrir le chat', settings: 'Paramètres', quit: 'Quitter Promptly' },
  de: { openChat: 'Chat öffnen', settings: 'Einstellungen', quit: 'Promptly beenden' },
  es: { openChat: 'Abrir chat', settings: 'Ajustes', quit: 'Salir de Promptly' },
  ja: { openChat: 'チャットを開く', settings: '設定', quit: 'Promptly を終了' },
  ko: { openChat: '채팅 열기', settings: '설정', quit: 'Promptly 종료' }
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
  const x = saved?.x ?? wa.x + wa.width - BALL_SIZE - 8
  const y = saved?.y ?? wa.y + Math.round(wa.height / 2 - BALL_SIZE / 2)

  ball = new BrowserWindow({
    width: BALL_SIZE,
    height: BALL_SIZE,
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
  // Belt and braces: listen for 'move' AND poll bounds — app-region dragging
  // has quirks where neither event may fire, but bounds never lie.
  // Clamp keeps the ball fully visible inside the work area (user request:
  // the icon must never hang half off the screen edge).
  let lastPos = { x, y }
  const persistIfChanged = (): void => {
    if (!ball || ball.isDestroyed()) return
    const [bx, by] = ball.getPosition()
    const display = screen.getDisplayNearestPoint({ x: bx, y: by })
    const wa = display.workArea
    const cx = Math.min(Math.max(bx, wa.x), wa.x + wa.width - BALL_SIZE)
    const cy = Math.min(Math.max(by, wa.y), wa.y + wa.height - BALL_SIZE)
    if (cx !== bx || cy !== by) {
      ball.setPosition(cx, cy)
      return // move event will re-trigger persist with the clamped position
    }
    if (cx !== lastPos.x || cy !== lastPos.y) {
      lastPos = { x: cx, y: cy }
      saveSettings({ ballPosition: lastPos })
    }
  }
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
  const nx = Math.min(Math.max(bx, wa.x - BALL_SIZE + 8), wa.x + wa.width - 8)
  const ny = Math.min(Math.max(by, wa.y - BALL_SIZE + 8), wa.y + wa.height - 8)
  if (nx !== bx || ny !== by) ball.setPosition(nx, ny)
}
