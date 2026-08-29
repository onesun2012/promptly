import { ipcMain } from 'electron'
import type { ProviderProfile, TestConnectionResult } from './types.ts'
import { getProvider } from './factory.ts'
import * as store from '../secure-store'

export function initProviderIpc(): void {
  ipcMain.handle('provider:list', () => store.listViews())

  ipcMain.handle('provider:active', () => store.getActive())

  ipcMain.handle('provider:save', (_e, profile: ProviderProfile) => {
    if (!profile?.id || !profile.baseUrl) return { ok: false, error: 'invalid profile' }
    store.upsert(profile)
    return { ok: true }
  })

  ipcMain.handle('provider:delete', (_e, id: string) => {
    store.remove(String(id))
    return { ok: true }
  })

  ipcMain.handle('provider:setActive', (_e, id: string) => {
    store.setActive(String(id))
    return { ok: true }
  })

  // Test Connection (SPEC §2B): probe models, then a tiny streamed chat.
  ipcMain.handle('provider:test', async (_e, profile: ProviderProfile): Promise<TestConnectionResult> => {
    if (!profile?.baseUrl) return { ok: false, error: 'Base URL is required.' }
    const provider = getProvider(profile.protocol)
    return provider.testConnection(profile)
  })
}
