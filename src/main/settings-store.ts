import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

export type SelectionMode = 'auto' | 'hotkey'

export interface AppSettings {
  language: string
  autostart: boolean
  initialized: boolean
  /** SPEC Q5: auto = select-to-show toolbar; hotkey = only Ctrl+Shift+A */
  selectionMode: SelectionMode
  ballPosition?: { x: number; y: number }
  /** anonymous install counter (one ping per version, no content). */
  statsEnabled: boolean
  pingedVersion?: string
}

/** SPEC appendix D: first-run / install default is ON; Settings can turn it off. */
const DEFAULTS: AppSettings = {
  language: 'en',
  autostart: true,
  initialized: false,
  selectionMode: 'auto',
  statsEnabled: true
}
let cache: AppSettings | null = null

function file(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): AppSettings {
  if (cache) return cache
  try {
    if (existsSync(file())) {
      const raw = JSON.parse(readFileSync(file(), 'utf8')) as Partial<AppSettings>
      const mode = raw.selectionMode === 'hotkey' ? 'hotkey' : 'auto'
      cache = { ...DEFAULTS, ...raw, selectionMode: mode }
      return cache
    }
  } catch (e) {
    console.error('[settings] load failed:', e)
  }
  cache = { ...DEFAULTS }
  return cache
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const merged = { ...loadSettings(), ...patch }
  if (merged.selectionMode !== 'auto' && merged.selectionMode !== 'hotkey') {
    merged.selectionMode = 'auto'
  }
  cache = merged
  writeFileSync(file(), JSON.stringify(merged, null, 2), 'utf8')
  return merged
}

/**
 * SPEC: installer / first-run defaults autostart ON; Settings checkbox can turn it off.
 * Existing profiles (initialized already) keep their saved choice and only sync the OS login item.
 */
export function applyFirstRunAutostart(): void {
  const s = loadSettings()
  if (!s.initialized) {
    setAutostart(true)
    saveSettings({ initialized: true })
    return
  }
  app.setLoginItemSettings({ openAtLogin: s.autostart })
}

export function setAutostart(enabled: boolean): void {
  app.setLoginItemSettings({ openAtLogin: enabled })
  // NSIS customInstall also writes HKCU Run "Promptly"; clear it when the user opts out
  // so Settings off really disables boot start (not only Electron's own login-item entry).
  if (process.platform === 'win32' && !enabled) {
    try {
      spawnSync(
        'reg',
        ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'Promptly', '/f'],
        { windowsHide: true }
      )
    } catch {
      // ignore: key may already be absent
    }
  }
  saveSettings({ autostart: enabled })
}

export function setSelectionMode(mode: SelectionMode): void {
  saveSettings({ selectionMode: mode === 'hotkey' ? 'hotkey' : 'auto' })
}

export function setStatsEnabled(enabled: boolean): void {
  saveSettings({ statsEnabled: enabled })
}