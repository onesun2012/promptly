import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'node:path'
import { loadSettings } from './settings-store'
import { appIconPath } from './app-icon'
import type { Db } from './db'
import type { ChatSendOptions } from './chat-service'
import type { ChatChunk } from '../shared/providers.ts'

const CHAT_WIDTH = 420
const CHAT_HEIGHT = 640

let chat: BrowserWindow | null = null

export function initChatIpc(db: Db, send: (opts: ChatSendOptions) => Promise<{ conversationId: string | null; error?: string }>, stop: (id: string) => void): void {
  ipcMain.handle('chat:conversations', () => db.listConversations())
  ipcMain.handle('chat:messages', (_e, id: string) => db.getMessages(String(id)))
  ipcMain.handle('chat:delete', (_e, id: string) => {
    db.deleteConversation(String(id))
    return { ok: true }
  })
  ipcMain.on('chat:stop', (_e, id: string) => stop(String(id)))
  ipcMain.on('chat:pin', () => {
    if (chat && !chat.isDestroyed()) chat.setAlwaysOnTop(!chat.isAlwaysOnTop())
  })
  ipcMain.on('chat:hide', () => {
    if (chat && !chat.isDestroyed()) chat.hide()
  })
  ipcMain.on('chat:send', (_e, payload: ChatSendOptions) => {
    void send(payload ?? {})
  })
}

export function sendToChat(channel: string, data: unknown): void {
  if (chat && !chat.isDestroyed()) chat.webContents.send(channel, data)
}

/** Open (or focus) the chat window and kick off an action on the selection. */
export function openChatWithAction(actionId: string, selection: string): void {
  const win = ensureChatWindow()
  win.show()
  win.focus()
  const deliver = (): void => {
    win.webContents.send('chat:preload-action', { actionId, selection })
  }
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', deliver)
  } else {
    deliver()
  }
}

/** Open the chat window directly on an existing conversation (toolbar result). */
export function openChatToConversation(conversationId: string): void {
  const win = ensureChatWindow()
  win.show()
  win.focus()
  const deliver = (): void => {
    win.webContents.send('chat:open-conversation', { conversationId })
  }
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', deliver)
  } else {
    deliver()
  }
}

export function openChatWindow(): void {
  const win = ensureChatWindow()
  win.show()
  win.focus()
}

export function toggleChatWindow(): void {
  if (chat && !chat.isDestroyed() && chat.isVisible()) {
    chat.hide()
    return
  }
  const win = ensureChatWindow()
  win.show()
  win.focus()
}

function ensureChatWindow(): BrowserWindow {
  if (chat && !chat.isDestroyed()) return chat

  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const wa = display.workArea
  const x = Math.min(Math.max(wa.x + wa.width - CHAT_WIDTH - 24, wa.x), wa.x + wa.width - CHAT_WIDTH)
  const y = wa.y + Math.round((wa.height - CHAT_HEIGHT) / 2)

  chat = new BrowserWindow({
    width: CHAT_WIDTH,
    height: CHAT_HEIGHT,
    x,
    y,
    minWidth: 340,
    minHeight: 460,
    frame: false,
    show: false,
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    title: 'Promptly',
    icon: appIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })
  chat.on('ready-to-show', () => chat?.show())
  chat.on('closed', () => {
    chat = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void chat.loadURL(process.env.ELECTRON_RENDERER_URL + '/chat.html?locale=' + loadSettings().language)
  } else {
    void chat.loadFile(join(__dirname, '../renderer/chat.html'), { search: 'locale=' + loadSettings().language })
  }
  return chat
}

export function forwardChatChunk(conversationId: string, chunk: ChatChunk): void {
  sendToChat('chat:chunk', { conversationId, chunk })
}
