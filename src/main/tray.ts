import { Menu, Tray, app, nativeImage, BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { toggleChatWindow } from './chat-window'
import { placeBall, showBall } from './ball'
import { loadSettings } from './settings-store'

const TRAY_LABELS: Record<string, { openChat: string; showBall: string; settings: string; quit: string }> = {
  en: { openChat: 'Open chat', showBall: 'Bring back the floating ball', settings: 'Settings', quit: 'Quit Promptly' },
  fr: { openChat: 'Ouvrir le chat', showBall: 'Réafficher la bulle', settings: 'Paramètres', quit: 'Quitter Promptly' },
  de: { openChat: 'Chat öffnen', showBall: 'Blase wieder anzeigen', settings: 'Einstellungen', quit: 'Promptly beenden' },
  es: { openChat: 'Abrir chat', showBall: 'Mostrar la burbuja', settings: 'Ajustes', quit: 'Salir de Promptly' },
  ja: { openChat: 'チャットを開く', showBall: 'フローティングボールを表示', settings: '設定', quit: 'Promptly を終了' },
  ko: { openChat: '채팅 열기', showBall: '플로팅 볼 다시 표시', settings: '설정', quit: 'Promptly 종료' },
  'zh-CN': { openChat: '打开聊天', showBall: '找回悬浮球', settings: '设置', quit: '退出 Promptly' },
  'zh-TW': { openChat: '開啟聊天', showBall: '重新顯示懸浮球', settings: '設定', quit: '結束 Promptly' },
  ru: { openChat: 'Открыть чат', showBall: 'Вернуть плавающий шар', settings: 'Настройки', quit: 'Выйти из Promptly' },
  ar: { openChat: 'فتح الدردشة', showBall: 'إظهار الكرة العائمة', settings: 'الإعدادات', quit: 'إنهاء Promptly' }
}

let tray: Tray | null = null

function showMainWindow(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.getTitle() === 'Promptly' && !w.webContents.getURL().includes('chat.html')) {
      w.show()
      w.focus()
    }
  }
}

/** Safety net: if the ball ever ends up somewhere the user cannot find
 * (dragged behind a fullscreen app, into a corner...), the tray brings it
 * back to the default spot on the primary display. */
export function resetBallPosition(): void {
  const wa = screen.getPrimaryDisplay().workArea
  showBall()
  placeBall(wa.x + wa.width - 44 - 8, wa.y + Math.round(wa.height / 2 - 22))
}

export function initTray(): void {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'tray.png')
    : join(app.getAppPath(), 'build', 'tray.png')
  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon)
  tray.setToolTip('Promptly')
  rebuildTrayMenu()
}

export function rebuildTrayMenu(): void {
  if (!tray) return
  const t = TRAY_LABELS[loadSettings().language] ?? TRAY_LABELS.en
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t.openChat, click: () => toggleChatWindow() },
      { label: t.showBall, click: () => resetBallPosition() },
      { type: 'separator' },
      { label: t.settings, click: showMainWindow },
      { type: 'separator' },
      { label: t.quit, click: () => app.quit() }
    ])
  )
}
