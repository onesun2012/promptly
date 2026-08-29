import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface AppSettings {
  language: string
  autostart: boolean
  initialized: boolean
  ballPosition?: { x: number; y: number }
}

const DEFAULTS: AppSettings = { language: 'en', autostart: true, initialized: false }
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

/** SPEC D9: autostart defaults to ON at first run; user can turn it off. */
export function applyFirstRunAutostart(): void {
  const s = loadSettings()
  if (!s.initialized) {
    app.setLoginItemSettings({ openAtLogin: true })
    saveSettings({ autostart: true, initialized: true })
  }
}

export function setAutostart(enabled: boolean): void {
  app.setLoginItemSettings({ openAtLogin: enabled })
  saveSettings({ autostart: enabled })
}
