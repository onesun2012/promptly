import { app, ipcMain, net } from 'electron'
import { INSTALL_PING_URL } from '../shared/config'
import { loadSettings, saveSettings, setStatsEnabled } from './settings-store'

/**
 * Anonymous install counter: one GET per app version, params are only the
 * version string and OS. No user content, no identifiers, no machine
 * fingerprint; disclosed in PRIVACY.md and toggleable in Settings
 * (statsEnabled). Never runs in dev; failures are silent.
 */
export function pingInstallOnce(): void {
  if (!app.isPackaged) return
  const s = loadSettings()
  if (!s.statsEnabled) return
  if (s.pingedVersion === app.getVersion()) return
  try {
    const url = new URL(INSTALL_PING_URL)
    url.searchParams.set('v', app.getVersion())
    url.searchParams.set('os', process.platform)
    const req = net.request({ method: 'GET', url: url.toString() })
    const timer = setTimeout(() => req.abort(), 3000)
    req.on('close', () => clearTimeout(timer))
    req.end()
    // mark pinged optimistically: a lost ping is acceptable, a duplicate is not
    saveSettings({ pingedVersion: app.getVersion() })
  } catch {
    // unreachable URL etc — silent by design
  }
}

export function initInstallPingIpc(): void {
  ipcMain.handle('stats:set', (_e, enabled: unknown) => {
    if (typeof enabled === 'boolean') setStatsEnabled(enabled)
    return { ok: true }
  })
}
