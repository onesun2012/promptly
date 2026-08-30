import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface AppSettings {
  language: string
  autostart: boolean
  initialized: boolean
  ballPosition?: { x: number; y: number }
  /** anonymous install counter (one ping per version, no content). */
  statsEnabled: boolean
  pingedVersion?: string
}

const DEFAULTS: AppSettings = { language: 'en', autostart: false, initialized: false, statsEnabled: true }
let cache: AppSettings | null = null

function file(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): AppSettings {
  if (cache) return cache
  try {
    if (existsSync(file())) {
      cache = { ...DEFAULTS, ...(JSON.parse(readFileSync(file(), 'utf8')) as Partial<AppSettings>) }
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
  cache = merged
  writeFileSync(file(), JSON.stringify(merged, null, 2), 'utf8')
  return merged
}

/** Autostart defaults to OFF (UI spec v0.3: opt-in, not silent); the settings
 * checkbox turns it on. */
export function applyFirstRunAutostart(): void {
  const s = loadSettings()
  if (!s.initialized) {
    saveSettings({ initialized: true })
  }
}

export function setAutostart(enabled: boolean): void {
  app.setLoginItemSettings({ openAtLogin: enabled })
  saveSettings({ autostart: enabled })
}

export function setStatsEnabled(enabled: boolean): void {
  saveSettings({ statsEnabled: enabled })
}
