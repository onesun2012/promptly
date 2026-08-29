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
  hideToolbar: (): void => ipcRenderer.send('toolbar:hide'),
  copySelection: (text: string): Promise<boolean> => ipcRenderer.invoke('toolbar:copy', text),
  listProviders: () => ipcRenderer.invoke('provider:list'),
  activeProvider: () => ipcRenderer.invoke('provider:active'),
  saveProvider: (profile: unknown) => ipcRenderer.invoke('provider:save', profile),
  deleteProvider: (id: string) => ipcRenderer.invoke('provider:delete', id),
  setActiveProvider: (id: string) => ipcRenderer.invoke('provider:setActive', id),
  testProvider: (profile: unknown) => ipcRenderer.invoke('provider:test', profile)
}

export type PromptlyAPI = typeof api

contextBridge.exposeInMainWorld('promptly', api)
