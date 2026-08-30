import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AppInfo, LifecycleInfo, PipelineEvent } from '../shared'

function subscriber<T>(channel: string) {
  return (callback: (data: T) => void) => {
    const handler = (_event: IpcRendererEvent, data: T): void => callback(data)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

const api = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:getInfo'),
  onPipelineEvent: subscriber<PipelineEvent>('pipeline:event'),
  onPipelineLifecycle: subscriber<LifecycleInfo>('pipeline:lifecycle'),
  onToolbarData: subscriber<{ env: PipelineEvent; text: string }>('toolbar:data'),
  toolbarReady: (): void => ipcRenderer.send('toolbar:ready'),
  toolbarResize: (h: number): void => ipcRenderer.send('toolbar:resize', h),
  hideToolbar: (): void => ipcRenderer.send('toolbar:hide'),
  copySelection: (text: string): Promise<boolean> => ipcRenderer.invoke('toolbar:copy', text),
  listProviders: () => ipcRenderer.invoke('provider:list'),
  activeProvider: () => ipcRenderer.invoke('provider:active'),
  saveProvider: (profile: unknown) => ipcRenderer.invoke('provider:save', profile),
  deleteProvider: (id: string) => ipcRenderer.invoke('provider:delete', id),
  setActiveProvider: (id: string) => ipcRenderer.invoke('provider:setActive', id),
  testProvider: (profile: unknown) => ipcRenderer.invoke('provider:test', profile),
  chatConversations: () => ipcRenderer.invoke('chat:conversations'),
  chatMessages: (id: string) => ipcRenderer.invoke('chat:messages', id),
  chatDelete: (id: string) => ipcRenderer.invoke('chat:delete', id),
  chatSend: (payload: unknown) => ipcRenderer.send('chat:send', payload),
  chatStop: (id: string) => ipcRenderer.send('chat:stop', id),
  chatPin: () => ipcRenderer.send('chat:pin'),
  chatClose: () => ipcRenderer.send('chat:hide'),
  runAction: (id: string) => ipcRenderer.send('toolbar:action', id),
  toolbarCancel: () => ipcRenderer.send('toolbar:cancel'),
  toolbarRetry: () => ipcRenderer.send('toolbar:retry'),
  toolbarOpenInChat: () => ipcRenderer.send('toolbar:open-in-chat'),
  onToolbarPhase: subscriber<{ phase: string; actionId?: string }>('toolbar:phase'),
  onToolbarStream: subscriber<{ conversationId: string; chunk: { type: string; content?: string } }>('toolbar:stream'),
  onChatOpenConversation: subscriber<{ conversationId: string }>('chat:open-conversation'),
  ballOpenChat: () => ipcRenderer.send('ball:open-chat'),
  windowDragStart: () => ipcRenderer.send('window:drag-start'),
  windowDragEnd: () => ipcRenderer.send('window:drag-end'),
  ballMenu: (pos: { x: number; y: number }) => ipcRenderer.send('ball:menu', pos),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setStats: (enabled: boolean) => ipcRenderer.invoke('stats:set', enabled),
  setLanguage: (locale: string) => ipcRenderer.invoke('settings:language', locale),
  setAutostart: (enabled: boolean) => ipcRenderer.invoke('settings:autostart', enabled),
  openChat: () => ipcRenderer.send('chat:toggle'),
  resetBall: () => ipcRenderer.invoke('ball:reset'),
  onAppLocale: subscriber<string>('app:locale'),
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  onUpdateState: subscriber<{ phase: string; version?: string; percent?: number }>('update:state'),
  onDonateOpen: subscriber<void>('donate:open'),
  hideMainWindow: () => ipcRenderer.send('main:hide'),
  showMainWindow: () => ipcRenderer.send('main:show'),
  openFeedback: () => ipcRenderer.invoke('app:feedback'),
  onChatChunk: subscriber<{ conversationId: string; chunk: { type: string; content?: string } }>('chat:chunk'),
  onChatPreloadAction: subscriber<{ actionId: string; selection: string }>('chat:preload-action'),
}

export type PromptlyAPI = typeof api

contextBridge.exposeInMainWorld('promptly', api)
