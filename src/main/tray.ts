import { Menu, Tray, app, nativeImage, BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { toggleChatWindow } from './chat-window'
import { placeBall, showBall } from './ball'
import { loadSettings } from './settings-store'
import { checkForUpdateNow } from './updater'

const TRAY_LABELS: Record<string, { openChat: string; showBall: string; settings: string; support: string; checkUpdate: string; quit: string }> = {
  en: { openChat: 'Open chat', showBall: 'Bring back the floating ball', settings: 'Settings', support: 'Support Promptly', checkUpdate: 'Check for updates', quit: 'Quit Promptly' },
  fr: { openChat: 'Ouvrir le chat', showBall: 'Réafficher la bulle', settings: 'Paramètres', support: 'Soutenir Promptly', checkUpdate: 'Rechercher des mises à jour', quit: 'Quitter Promptly' },
  de: { openChat: 'Chat öffnen', showBall: 'Blase wieder anzeigen', settings: 'Einstellungen', support: 'Promptly unterstützen', checkUpdate: 'Nach Updates suchen', quit: 'Promptly beenden' },
  es: { openChat: 'Abrir chat', showBall: 'Mostrar la burbuja', settings: 'Ajustes', support: 'Apoyar Promptly', checkUpdate: 'Buscar actualizaciones', quit: 'Salir de Promptly' },
  ja: { openChat: 'チャットを開く', showBall: 'フローティングボールを表示', settings: '設定', support: 'Promptly を支援', checkUpdate: 'アップデートを確認', quit: 'Promptly を終了' },
  ko: { openChat: '채팅 열기', showBall: '플로팅 볼 다시 표시', settings: '설정', support: 'Promptly 지원', checkUpdate: '업데이트 확인', quit: 'Promptly 종료' },
  'zh-CN': { openChat: '打开聊天', showBall: '找回悬浮球', settings: '设置', support: '支持 Promptly', checkUpdate: '检查更新', quit: '退出 Promptly' },
  'zh-TW': { openChat: '開啟聊天', showBall: '重新顯示懸浮球', settings: '設定', support: '支持 Promptly', checkUpdate: '檢查更新', quit: '結束 Promptly' },
  ru: { openChat: 'Открыть чат', showBall: 'Вернуть плавающий шар', settings: 'Настройки', support: 'Поддержать Promptly', checkUpdate: 'Проверить обновления', quit: 'Выйти из Promptly' },
  ar: { openChat: 'فتح الدردشة', showBall: 'إظهار الكرة العائمة', settings: 'الإعدادات', support: 'دعم Promptly', checkUpdate: 'التحقق من التحديثات', quit: 'إنهاء Promptly' }
}

let tray: Tray | null = null
let helperLifecycle: 'ready' | 'restarting' | 'crashed' | 'degraded' = 'ready'
let onRetryHelper: (() => void) | null = null

type TrayExtra = { degraded: string; retryHelper: string; tooltipOk: string; tooltipDegraded: string }
const TRAY_EXTRA: Record<string, TrayExtra> = {
  en: { degraded: 'Selection unavailable (helper failed)', retryHelper: 'Retry selection helper', tooltipOk: 'Promptly', tooltipDegraded: 'Promptly — selection unavailable' },
  'zh-CN': { degraded: '划词暂不可用（辅助进程失败）', retryHelper: '重试划词辅助进程', tooltipOk: 'Promptly', tooltipDegraded: 'Promptly — 划词暂不可用' },
  'zh-TW': { degraded: '劃詞暫不可用（輔助程式失敗）', retryHelper: '重試劃詞輔助程式', tooltipOk: 'Promptly', tooltipDegraded: 'Promptly — 劃詞暫不可用' }
}

function trayExtra(): TrayExtra {
  const lang = loadSettings().language
  return TRAY_EXTRA[lang] ?? TRAY_EXTRA.en
}

export function setTrayHelperLifecycle(
  state: 'ready' | 'restarting' | 'crashed' | 'degraded',
  retry?: () => void
): void {
  helperLifecycle = state
  if (retry) onRetryHelper = retry
  rebuildTrayMenu()
}


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
  const extra = trayExtra()
  const degraded = helperLifecycle === 'degraded'
  tray.setToolTip(degraded ? extra.tooltipDegraded : extra.tooltipOk)
  const items: Electron.MenuItemConstructorOptions[] = [
    { label: t.openChat, click: () => toggleChatWindow() },
    { label: t.showBall, click: () => resetBallPosition() },
    { type: 'separator' }
  ]
  if (degraded) {
    items.push(
      { label: extra.degraded, enabled: false },
      { label: extra.retryHelper, click: () => { onRetryHelper?.() } },
      { type: 'separator' }
    )
  }
  items.push(
    { label: t.settings, click: showMainWindow },
    { label: t.support, click: openDonate },
    { label: t.checkUpdate, click: () => checkForUpdateNow() },
    { type: 'separator' },
    { label: t.quit, click: () => app.quit() }
  )
  tray.setContextMenu(Menu.buildFromTemplate(items))
}

/** Open the settings window on the donate dialog. */
function openDonate(): void {
  const w = BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'Promptly' && !w.webContents.getURL().includes('chat.html'))
  if (!w) return
  w.show()
  w.focus()
  w.webContents.send('donate:open')
}
