import { contextBridge, ipcRenderer } from 'electron'
import type { AppInfo } from '../shared'

const api = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:getInfo')
}

export type PromptlyAPI = typeof api

contextBridge.exposeInMainWorld('promptly', api)
